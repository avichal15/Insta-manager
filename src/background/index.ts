import type {
  AudienceSnapshot,
  AudienceUser,
  DownloadItem,
  GhostState,
  PublishFormat,
  ScheduledPost,
  SettingsState,
} from '../shared/types';
import { AppStorage } from '../shared/storage';
import { SCHEDULE_ALARM_PREFIX, STORAGE_KEYS } from '../shared/constants';

const INSTAGRAM_URL = 'https://www.instagram.com/';
const defaultGhost: GhostState = { enabled: false, dmBlocked: 0, storyBlocked: 0 };
const defaultSettings: SettingsState = {
  adBlockEnabled: true,
  ghostModeEnabled: false,
  ghostModeAuto: false,
  theme: 'dark',
};

const MessageType = {
  RELOAD_EXTENSION: 'RELOAD_EXTENSION',
  GET_AUTH: 'GET_AUTH',
  AUTH_CHECK: 'AUTH_CHECK',
  AUTH_STATUS_CHANGED: 'AUTH_STATUS_CHANGED',
  GET_GHOST: 'GET_GHOST',
  SET_GHOST: 'SET_GHOST',
  ACTION_BLOCKED_EVENT: 'ACTION_BLOCKED_EVENT',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  DOWNLOAD_MEDIA: 'DOWNLOAD_MEDIA',
  GET_DOWNLOADS: 'GET_DOWNLOADS',
  GET_SCHEDULED_POSTS: 'GET_SCHEDULED_POSTS',
  SCHEDULE_POST: 'SCHEDULE_POST',
  DELETE_SCHEDULED_POST: 'DELETE_SCHEDULED_POST',
  GET_AUDIENCE_SNAPSHOT: 'GET_AUDIENCE_SNAPSHOT',
  SCAN_AUDIENCE: 'SCAN_AUDIENCE',
  REMOVE_FOLLOWER: 'REMOVE_FOLLOWER',
  UNFOLLOW_ACCOUNT: 'UNFOLLOW_ACCOUNT',
  BATCH_REMOVE_FOLLOWERS: 'BATCH_REMOVE_FOLLOWERS',
} as const;

type IncomingMessage = { type?: string; data?: unknown };
type DownloadRoute = { tabId: number; requestId: string; createdAt: number };
type DownloadRouteState = { version: 1; routes: Record<string, DownloadRoute> };
type ScheduleState = { version: 1; posts: ScheduledPost[] };
let creatingOffscreen: Promise<void> | undefined;
let downloadMutation = Promise.resolve();
let downloadRouteMutation = Promise.resolve();
let scheduleMutation = Promise.resolve();
const DOWNLOAD_ROUTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function mutateDownloads(operation: () => Promise<void>): Promise<void> {
  downloadMutation = downloadMutation.then(operation, operation);
  return downloadMutation;
}

function mutateDownloadRoutes<T>(operation: () => Promise<T>): Promise<T> {
  const result = downloadRouteMutation.then(operation, operation);
  downloadRouteMutation = result.then(() => undefined, () => undefined);
  return result;
}

function isDownloadRoute(value: unknown): value is DownloadRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<DownloadRoute>;
  return Number.isInteger(route.tabId)
    && typeof route.requestId === 'string'
    && route.requestId.length > 0
    && route.requestId.length <= 160
    && typeof route.createdAt === 'number'
    && Date.now() - route.createdAt <= DOWNLOAD_ROUTE_MAX_AGE_MS;
}

async function getDownloadRouteState(): Promise<DownloadRouteState> {
  const stored = await AppStorage.get<DownloadRouteState>(STORAGE_KEYS.DOWNLOAD_ROUTES);
  const routes = stored?.version === 1 && stored.routes && typeof stored.routes === 'object'
    ? Object.fromEntries(Object.entries(stored.routes).filter(([, route]) => isDownloadRoute(route)))
    : {};
  return { version: 1, routes };
}

async function saveDownloadRoute(downloadId: number, route: Omit<DownloadRoute, 'createdAt'>): Promise<void> {
  await mutateDownloadRoutes(async () => {
    const state = await getDownloadRouteState();
    state.routes[String(downloadId)] = { ...route, createdAt: Date.now() };
    await AppStorage.set(STORAGE_KEYS.DOWNLOAD_ROUTES, state);
  });
}

async function takeDownloadRoute(downloadId: number): Promise<DownloadRoute | undefined> {
  return mutateDownloadRoutes(async () => {
    const state = await getDownloadRouteState();
    const route = state.routes[String(downloadId)];
    delete state.routes[String(downloadId)];
    await AppStorage.set(STORAGE_KEYS.DOWNLOAD_ROUTES, state);
    return route;
  });
}

async function ensureOffscreen(): Promise<void> {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Merge separate Instagram audio/video streams into a local MP4 download.',
    });
  })();
  try { await creatingOffscreen; } finally { creatingOffscreen = undefined; }
}

async function releaseMergedMedia(url: string): Promise<void> {
  if (!url.startsWith(`blob:${chrome.runtime.getURL('')}`)) return;
  try {
    await chrome.runtime.sendMessage({ target: 'instamanager-offscreen', type: 'RELEASE_MEDIA', url });
  } catch { /* The offscreen document may have closed during extension reload. */ }
}
type ScheduleRequest = {
  type?: PublishFormat;
  caption?: string;
  scheduledAt?: number;
  mediaName?: string | null;
  mediaType?: string | null;
};

async function broadcast(message: object): Promise<void> {
  const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  await Promise.all(tabs.map(async ({ id }) => {
    if (id === undefined) return;
    try {
      await chrome.tabs.sendMessage(id, message);
    } catch {
      // A matching tab can exist before its content script is ready.
    }
  }));
}

async function openInstagram(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return tab;
  }
  return chrome.tabs.create({ url: INSTAGRAM_URL, active: true });
}

async function getAuthState() {
  try {
    const [csrf, session, userId] = await Promise.all([
      chrome.cookies.get({ url: INSTAGRAM_URL, name: 'csrftoken' }),
      chrome.cookies.get({ url: INSTAGRAM_URL, name: 'sessionid' }),
      chrome.cookies.get({ url: INSTAGRAM_URL, name: 'ds_user_id' }),
    ]);
    return {
      isLoggedIn: Boolean(session?.value),
      userId: userId?.value ?? null,
      username: null,
      avatarUrl: null,
      csrfToken: csrf?.value ?? null,
    };
  } catch (error) {
    console.error('[InstaManager] Authentication check failed:', error);
    return { isLoggedIn: false, userId: null, username: null, avatarUrl: null, csrfToken: null };
  }
}

function isAllowedMediaUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    return protocol === 'https:' && ['instagram.com', 'cdninstagram.com', 'fbcdn.net']
      .some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function safeFilename(value: string): string {
  const filename = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\.{2,}/g, '.').trim();
  return filename.slice(0, 180) || `instagram-media-${Date.now()}`;
}

function isScheduledPost(value: unknown): value is ScheduledPost {
  if (!value || typeof value !== 'object') return false;
  const post = value as Partial<ScheduledPost>;
  return typeof post.id === 'string'
    && typeof post.accountId === 'string'
    && ['post', 'reel', 'story'].includes(post.type ?? '')
    && typeof post.caption === 'string'
    && typeof post.scheduledAt === 'number'
    && Number.isFinite(post.scheduledAt)
    && (post.mediaName === null || typeof post.mediaName === 'string')
    && (post.mediaType === null || typeof post.mediaType === 'string')
    && (post.status === 'scheduled' || post.status === 'due')
    && typeof post.createdAt === 'number';
}

async function activeAccountId(): Promise<string> {
  const auth = await getAuthState();
  if (!auth.isLoggedIn || !auth.userId) throw new Error('Log in to Instagram before managing scheduled reminders.');
  return auth.userId;
}

async function getScheduleState(accountId: string): Promise<ScheduleState> {
  const stored = await AppStorage.get<unknown>(STORAGE_KEYS.SCHEDULED_POSTS);
  if (stored && typeof stored === 'object' && (stored as ScheduleState).version === 1 && Array.isArray((stored as ScheduleState).posts)) {
    return { version: 1, posts: (stored as ScheduleState).posts.filter(isScheduledPost) };
  }
  if (Array.isArray(stored)) {
    const posts = stored.filter((post): post is Omit<ScheduledPost, 'accountId'> => {
      if (!post || typeof post !== 'object') return false;
      const candidate = post as Partial<ScheduledPost>;
      return typeof candidate.id === 'string' && ['post', 'reel', 'story'].includes(candidate.type ?? '')
        && typeof candidate.caption === 'string' && typeof candidate.scheduledAt === 'number'
        && (candidate.status === 'scheduled' || candidate.status === 'due') && typeof candidate.createdAt === 'number';
    }).map((post) => ({ ...post, accountId }));
    const migrated = { version: 1 as const, posts };
    await AppStorage.set(STORAGE_KEYS.SCHEDULED_POSTS, migrated);
    return migrated;
  }
  return { version: 1, posts: [] };
}

async function getSchedules(accountId?: string): Promise<ScheduledPost[]> {
  const ownerId = accountId ?? await activeAccountId();
  return (await getScheduleState(ownerId)).posts.filter((post) => post.accountId === ownerId);
}

async function mutateSchedules<T>(accountId: string, operation: (posts: ScheduledPost[]) => Promise<T> | T): Promise<T> {
  const result = scheduleMutation.then(async () => {
    const state = await getScheduleState(accountId);
    const ownPosts = state.posts.filter((post) => post.accountId === accountId);
    const resultValue = await operation(ownPosts);
    state.posts = [...state.posts.filter((post) => post.accountId !== accountId), ...ownPosts];
    await AppStorage.set(STORAGE_KEYS.SCHEDULED_POSTS, state);
    return resultValue;
  }, async () => {
    const state = await getScheduleState(accountId);
    const ownPosts = state.posts.filter((post) => post.accountId === accountId);
    const resultValue = await operation(ownPosts);
    state.posts = [...state.posts.filter((post) => post.accountId !== accountId), ...ownPosts];
    await AppStorage.set(STORAGE_KEYS.SCHEDULED_POSTS, state);
    return resultValue;
  });
  scheduleMutation = result.then(() => undefined, () => undefined);
  return result;
}

async function schedulePost(request: ScheduleRequest): Promise<ScheduledPost> {
  const type = request.type;
  const scheduledAt = Number(request.scheduledAt);
  const caption = (request.caption ?? '').trim().slice(0, 2200);
  if (!type || !['post', 'reel', 'story'].includes(type)) throw new Error('Choose a valid post format.');
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) throw new Error('Choose a future date and time.');
  if (!caption && !request.mediaName) throw new Error('Add media or a caption before scheduling.');

  const accountId = await activeAccountId();
  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    accountId,
    type,
    caption,
    scheduledAt,
    mediaName: request.mediaName?.slice(0, 240) ?? null,
    mediaType: request.mediaType?.slice(0, 120) ?? null,
    status: 'scheduled',
    createdAt: Date.now(),
  };
  await mutateSchedules(accountId, (posts) => {
    posts.push(post);
    posts.sort((a, b) => a.scheduledAt - b.scheduledAt);
  });
  await chrome.alarms.create(`${SCHEDULE_ALARM_PREFIX}${post.id}`, { when: post.scheduledAt });
  return post;
}

async function restoreAlarms(): Promise<void> {
  const now = Date.now();
  const accountId = await activeAccountId();
  const posts = await getSchedules(accountId);
  const desired = new Map(posts
    .filter((post) => post.status === 'scheduled')
    .map((post) => [`${SCHEDULE_ALARM_PREFIX}${post.id}`, post]));
  const existing = await chrome.alarms.getAll();
  const existingNames = new Set(existing.map((alarm) => alarm.name));

  await Promise.all(existing
    .filter((alarm) => alarm.name.startsWith(SCHEDULE_ALARM_PREFIX) && !desired.has(alarm.name))
    .map((alarm) => chrome.alarms.clear(alarm.name)));
  await Promise.all([...desired]
    .filter(([name]) => !existingNames.has(name))
    .map(([name, post]) => chrome.alarms.create(name, {
      when: Math.max(post.scheduledAt, now + 500),
    })));
}

async function addDownload(item: DownloadItem): Promise<void> {
  await mutateDownloads(async () => {
    const history = (await AppStorage.get<DownloadItem[]>(STORAGE_KEYS.DOWNLOADS)) ?? [];
    await AppStorage.set(STORAGE_KEYS.DOWNLOADS, [item, ...history].slice(0, 50));
  });
}

async function updateDownload(id: number, patch: Partial<DownloadItem>): Promise<void> {
  await mutateDownloads(async () => {
    const history = (await AppStorage.get<DownloadItem[]>(STORAGE_KEYS.DOWNLOADS)) ?? [];
    await AppStorage.set(
      STORAGE_KEYS.DOWNLOADS,
      history.map((item) => item.downloadId === id ? { ...item, ...patch } : item),
    );
  });
}

type InstagramListUser = {
  pk?: string | number;
  id?: string | number;
  username?: string;
  full_name?: string;
  profile_pic_url?: string;
  is_private?: boolean;
  is_verified?: boolean;
  follower_count?: number;
  following_count?: number;
  media_count?: number;
  is_default_profile_pic?: boolean;
};

type FriendshipPage = {
  users?: InstagramListUser[];
  next_max_id?: string;
  big_list?: boolean;
};

async function instagramRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = await getAuthState();
  if (!auth.isLoggedIn || !auth.userId) throw new Error('Log in to Instagram before using Audience tools.');
  const headers = new Headers(init.headers);
  headers.set('accept', '*/*');
  headers.set('x-ig-app-id', '936619743392459');
  headers.set('x-requested-with', 'XMLHttpRequest');
  if (auth.csrfToken) headers.set('x-csrftoken', auth.csrfToken);
  const response = await fetch(new URL(path, INSTAGRAM_URL), { ...init, headers, credentials: 'include' });
  if (response.status === 429) throw new Error('Instagram rate-limited the scan. Wait a few minutes and try again.');
  if (!response.ok) throw new Error(`Instagram request failed (${response.status}).`);
  return response;
}

function audienceUser(user: InstagramListUser): AudienceUser {
  const username = user.username ?? 'unknown';
  const followerCount = user.follower_count ?? 0;
  const followingCount = user.following_count ?? 0;
  const postCount = user.media_count ?? 0;
  const digitCount = [...username].filter((character) => /\d/.test(character)).length;
  const riskReasons: string[] = [];
  if (user.is_default_profile_pic && postCount <= 1) riskReasons.push('Default photo and little content');
  if (followingCount > 500 && followingCount > Math.max(followerCount * 10, 1000)) riskReasons.push('Very high following ratio');
  if (username.length >= 6 && digitCount / username.length >= 0.5) riskReasons.push('Username is mostly digits');
  if (postCount === 0 && followerCount === 0 && followingCount > 100) riskReasons.push('Empty high-activity profile');
  return {
    id: String(user.pk ?? user.id ?? ''),
    username,
    fullName: user.full_name ?? '',
    avatarUrl: user.profile_pic_url ?? '',
    isPrivate: Boolean(user.is_private),
    isVerified: Boolean(user.is_verified),
    followerCount,
    followingCount,
    postCount,
    riskReasons,
  };
}

async function loadFriendshipList(userId: string, direction: 'followers' | 'following', limit = 1500): Promise<{ users: AudienceUser[]; limited: boolean }> {
  const users: AudienceUser[] = [];
  let cursor = '';
  let hasMore = true;
  while (hasMore && users.length < limit) {
    const query = new URLSearchParams({ count: String(Math.min(100, limit - users.length)) });
    if (cursor) query.set('max_id', cursor);
    const response = await instagramRequest(`/api/v1/friendships/${userId}/${direction}/?${query}`);
    const page = await response.json() as FriendshipPage;
    users.push(...(page.users ?? []).map(audienceUser).filter((user) => user.id));
    cursor = page.next_max_id ?? '';
    hasMore = Boolean(cursor || page.big_list);
    if (hasMore && !cursor) break;
  }
  return { users, limited: hasMore && users.length >= limit };
}

async function scanAudience(): Promise<AudienceSnapshot> {
  const auth = await getAuthState();
  if (!auth.userId) throw new Error('Could not identify the logged-in Instagram account.');
  const previous = await AppStorage.get<AudienceSnapshot>(STORAGE_KEYS.AUDIENCE_SNAPSHOT);
  const [profileResponse, followersResult, followingResult] = await Promise.all([
    instagramRequest(`/api/v1/users/${auth.userId}/info/`),
    loadFriendshipList(auth.userId, 'followers'),
    loadFriendshipList(auth.userId, 'following'),
  ]);
  const profilePayload = await profileResponse.json() as { user?: InstagramListUser };
  const followerIds = new Set(followersResult.users.map((user) => user.id));
  const previousFollowerIds = new Set(previous?.followers.map((user) => user.id) ?? []);
  const profile = profilePayload.user;
  const snapshot: AudienceSnapshot = {
    scannedAt: Date.now(),
    followerCount: profile?.follower_count ?? followersResult.users.length,
    followingCount: profile?.following_count ?? followingResult.users.length,
    scannedFollowers: followersResult.users.length,
    scannedFollowing: followingResult.users.length,
    limited: followersResult.limited || followingResult.limited,
    followers: followersResult.users,
    following: followingResult.users,
    nonFollowers: followingResult.users.filter((user) => !followerIds.has(user.id)),
    suspiciousFollowers: followersResult.users.filter((user) => user.riskReasons.length > 0),
    gainedFollowers: followersResult.users.filter((user) => previous && !previousFollowerIds.has(user.id)),
    lostFollowers: previous?.followers.filter((user) => !followerIds.has(user.id)) ?? [],
  };
  await AppStorage.set(STORAGE_KEYS.AUDIENCE_SNAPSHOT, snapshot);
  return snapshot;
}

async function friendshipAction(userId: string, action: 'remove_follower' | 'unfollow'): Promise<void> {
  if (!/^\d+$/.test(userId)) throw new Error('Invalid Instagram account id.');
  const path = action === 'unfollow'
    ? `/api/v1/friendships/destroy/${userId}/`
    : `/api/v1/friendships/remove_follower/${userId}/`;
  const response = await instagramRequest(path, { method: 'POST' });
  const payload = await response.json() as { status?: string };
  if (payload.status && payload.status !== 'ok') throw new Error('Instagram did not accept the account action.');
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await Promise.all([
      AppStorage.set(STORAGE_KEYS.GHOST, defaultGhost),
      AppStorage.set(STORAGE_KEYS.SETTINGS, defaultSettings),
      AppStorage.set<ScheduleState>(STORAGE_KEYS.SCHEDULED_POSTS, { version: 1, posts: [] }),
      AppStorage.set<DownloadItem[]>(STORAGE_KEYS.DOWNLOADS, []),
    ]);
  }
  await restoreAlarms();
});

void restoreAlarms();

async function finishRequestedReload() {
  const { reloadRequest } = await chrome.storage.local.get('reloadRequest');
  if (!reloadRequest) return;
  await chrome.storage.local.remove('reloadRequest');
  if (!Number.isInteger(reloadRequest.tabId) || Date.now() - reloadRequest.requestedAt > 60_000) return;
  const tab = await chrome.tabs.get(reloadRequest.tabId);
  if (tab.url && new URL(tab.url).hostname === 'www.instagram.com') await chrome.tabs.reload(reloadRequest.tabId);
}
void finishRequestedReload().catch(() => { /* The requesting tab may have closed. */ });

chrome.runtime.onMessage.addListener((message: IncomingMessage & { target?: string }, _sender, sendResponse) => {
  if (message.target === 'instamanager-offscreen') return false;
  void (async () => {
    try {
      switch (message.type) {
        case MessageType.RELOAD_EXTENSION: {
          if (_sender.id !== chrome.runtime.id || _sender.tab?.id === undefined ||
              !_sender.url?.startsWith('https://www.instagram.com/')) throw new Error('Reload must be requested from InstaManager on Instagram.');
          await chrome.storage.local.set({ reloadRequest: { tabId: _sender.tab.id, requestedAt: Date.now() } });
          sendResponse({ success: true });
          setTimeout(() => chrome.runtime.reload(), 100);
          break;
        }
        case MessageType.GET_AUTH:
          sendResponse(await getAuthState());
          break;
        case MessageType.AUTH_CHECK:
          sendResponse({ isLoggedIn: (await getAuthState()).isLoggedIn });
          break;
        case MessageType.GET_GHOST:
          sendResponse((await AppStorage.get<GhostState>(STORAGE_KEYS.GHOST)) ?? defaultGhost);
          break;
        case MessageType.SET_GHOST: {
          const enabled = Boolean((message.data as { enabled?: boolean } | undefined)?.enabled);
          const ghost = { ...((await AppStorage.get<GhostState>(STORAGE_KEYS.GHOST)) ?? defaultGhost), enabled };
          const settings = {
            ...((await AppStorage.get<SettingsState>(STORAGE_KEYS.SETTINGS)) ?? defaultSettings),
            ghostModeEnabled: enabled,
          };
          await Promise.all([
            AppStorage.set(STORAGE_KEYS.GHOST, ghost),
            AppStorage.set(STORAGE_KEYS.SETTINGS, settings),
          ]);
          await broadcast({ type: MessageType.SET_GHOST, data: { enabled } });
          sendResponse({ success: true, ghost });
          break;
        }
        case MessageType.ACTION_BLOCKED_EVENT: {
          const kind = (message.data as { type?: string } | undefined)?.type;
          const ghost = { ...((await AppStorage.get<GhostState>(STORAGE_KEYS.GHOST)) ?? defaultGhost) };
          if (kind === 'dm_read') ghost.dmBlocked += 1;
          if (kind === 'story_view') ghost.storyBlocked += 1;
          await AppStorage.set(STORAGE_KEYS.GHOST, ghost);
          sendResponse({ success: true });
          break;
        }
        case MessageType.GET_SETTINGS:
          sendResponse({
            ...defaultSettings,
            ...((await AppStorage.get<SettingsState>(STORAGE_KEYS.SETTINGS)) ?? {}),
          });
          break;
        case MessageType.UPDATE_SETTINGS: {
          const patch = (message.data ?? {}) as Partial<SettingsState>;
          const current = (await AppStorage.get<SettingsState>(STORAGE_KEYS.SETTINGS)) ?? defaultSettings;
          const settings: SettingsState = {
            ...current,
            ...(typeof patch.adBlockEnabled === 'boolean' ? { adBlockEnabled: patch.adBlockEnabled } : {}),
            ...(typeof patch.ghostModeEnabled === 'boolean' ? { ghostModeEnabled: patch.ghostModeEnabled } : {}),
            ...(typeof patch.ghostModeAuto === 'boolean' ? { ghostModeAuto: patch.ghostModeAuto } : {}),
            ...(patch.theme === 'dark' || patch.theme === 'light' ? { theme: patch.theme } : {}),
          };
          if (settings.ghostModeAuto) settings.ghostModeEnabled = true;
          await AppStorage.set(STORAGE_KEYS.SETTINGS, settings);
          if (settings.ghostModeAuto) {
            const ghost = (await AppStorage.get<GhostState>(STORAGE_KEYS.GHOST)) ?? defaultGhost;
            await AppStorage.set(STORAGE_KEYS.GHOST, { ...ghost, enabled: true });
          }
          await broadcast({ type: MessageType.UPDATE_SETTINGS, data: settings });
          sendResponse({ success: true, settings });
          break;
        }
        case MessageType.DOWNLOAD_MEDIA: {
          const data = message.data as { url?: string; audioUrl?: string; filename?: string; type?: string; requestId?: string } | undefined;
          if (!data?.url || !isAllowedMediaUrl(data.url)) throw new Error('Only Instagram media URLs can be downloaded.');
          let downloadUrl = data.url;
          if (data.audioUrl !== undefined) {
            if (typeof data.audioUrl !== 'string' || !isAllowedMediaUrl(data.audioUrl)) throw new Error('Invalid audio stream URL.');
            await ensureOffscreen();
            const result = await chrome.runtime.sendMessage({
              target: 'instamanager-offscreen', type: 'MUX_MEDIA', videoUrl: data.url, audioUrl: data.audioUrl,
            }) as { success?: boolean; url?: string; error?: string };
            if (!result?.success || !result.url?.startsWith(`blob:${chrome.runtime.getURL('')}`)) {
              throw new Error(result?.error || 'Could not merge the video and audio streams.');
            }
            downloadUrl = result.url;
          }
          const filename = safeFilename(data.filename ?? `instagram-media-${Date.now()}`);
          chrome.downloads.download({ url: downloadUrl, filename, saveAs: false }, (downloadId) => {
            void (async () => {
              if (chrome.runtime.lastError || downloadId === undefined) {
                await releaseMergedMedia(downloadUrl);
                sendResponse({ success: false, error: chrome.runtime.lastError?.message ?? 'Download failed.' });
                return;
              }
              await addDownload({
                id: crypto.randomUUID(),
                url: data.url as string,
                filename,
                type: data.type ?? 'media',
                status: 'downloading',
                createdAt: Date.now(),
                downloadId,
              });
              if (_sender.tab?.id !== undefined && typeof data.requestId === 'string') {
                await saveDownloadRoute(downloadId, { tabId: _sender.tab.id, requestId: data.requestId });
              }
              sendResponse({ success: true, downloadId });
            })();
          });
          return;
        }
        case MessageType.GET_DOWNLOADS:
          sendResponse((await AppStorage.get<DownloadItem[]>(STORAGE_KEYS.DOWNLOADS)) ?? []);
          break;
        case MessageType.GET_SCHEDULED_POSTS:
          sendResponse(await getSchedules());
          break;
        case MessageType.SCHEDULE_POST:
          sendResponse({ success: true, post: await schedulePost((message.data ?? {}) as ScheduleRequest) });
          break;
        case MessageType.DELETE_SCHEDULED_POST: {
          const id = (message.data as { id?: string } | undefined)?.id;
          if (!id) throw new Error('A scheduled post id is required.');
          const accountId = await activeAccountId();
          const removed = await mutateSchedules(accountId, (posts) => {
            const index = posts.findIndex((post) => post.id === id);
            if (index < 0) return false;
            posts.splice(index, 1);
            return true;
          });
          if (!removed) throw new Error('Scheduled reminder not found for this account.');
          await chrome.alarms.clear(`${SCHEDULE_ALARM_PREFIX}${id}`);
          sendResponse({ success: true });
          break;
        }
        case MessageType.GET_AUDIENCE_SNAPSHOT:
          sendResponse(await AppStorage.get<AudienceSnapshot>(STORAGE_KEYS.AUDIENCE_SNAPSHOT));
          break;
        case MessageType.SCAN_AUDIENCE:
          sendResponse({ success: true, snapshot: await scanAudience() });
          break;
        case MessageType.REMOVE_FOLLOWER: {
          const id = (message.data as { id?: string } | undefined)?.id;
          if (!id) throw new Error('An account id is required.');
          await friendshipAction(id, 'remove_follower');
          sendResponse({ success: true });
          break;
        }
        case MessageType.UNFOLLOW_ACCOUNT: {
          const id = (message.data as { id?: string } | undefined)?.id;
          if (!id) throw new Error('An account id is required.');
          await friendshipAction(id, 'unfollow');
          sendResponse({ success: true });
          break;
        }
        case MessageType.BATCH_REMOVE_FOLLOWERS: {
          const ids = (message.data as { ids?: unknown } | undefined)?.ids;
          if (!Array.isArray(ids) || ids.length === 0) throw new Error('Select at least one follower.');
          const safeIds = ids.filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)).slice(0, 10);
          if (safeIds.length === 0) throw new Error('No valid account ids were provided.');
          const removed: string[] = [];
          const failed: string[] = [];
          for (const id of safeIds) {
            try {
              await friendshipAction(id, 'remove_follower');
              removed.push(id);
            } catch {
              failed.push(id);
            }
            await new Promise((resolve) => setTimeout(resolve, 750));
          }
          sendResponse({ success: failed.length === 0, removed, failed });
          break;
        }
        default:
          sendResponse({ success: false, error: `Unknown message type: ${String(message.type)}` });
      }
    } catch (error) {
      console.error(`[InstaManager] ${String(message.type)} failed:`, error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state && !delta.error) return;
  const isTerminal = delta.state?.current === 'complete' || delta.state?.current === 'interrupted' || Boolean(delta.error);
  if (isTerminal) {
    void chrome.downloads.search({ id: delta.id }).then((downloads) => {
      const url = downloads[0]?.url;
      if (url) return releaseMergedMedia(url);
    });
  }
  const status: DownloadItem['status'] = delta.error || delta.state?.current === 'interrupted'
    ? 'error'
    : delta.state?.current === 'complete' ? 'done' : 'downloading';
  void updateDownload(delta.id, { status, error: delta.error?.current }).then(async () => {
    if (!isTerminal) return;
    const route = await takeDownloadRoute(delta.id);
    if (!route) return;
    try {
      await chrome.tabs.sendMessage(route.tabId, {
        type: 'DOWNLOAD_STATUS',
        data: { requestId: route.requestId, downloadId: delta.id, status, error: delta.error?.current },
      });
    } catch {
      // The initiating Instagram tab may have navigated or closed before completion.
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(SCHEDULE_ALARM_PREFIX)) return;
  const id = alarm.name.slice(SCHEDULE_ALARM_PREFIX.length);
  void (async () => {
    const accountId = await activeAccountId();
    const post = await mutateSchedules(accountId, (posts) => {
      const match = posts.find((item) => item.id === id);
      if (match) match.status = 'due';
      return match;
    });
    if (!post) return;
    await chrome.notifications.create(alarm.name, {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: `${post.type[0].toUpperCase()}${post.type.slice(1)} ready to publish`,
      message: post.mediaName
        ? `${post.mediaName} is due. Open Instagram to review and publish it.`
        : 'Your scheduled draft is due. Open Instagram to review and publish it.',
      priority: 2,
    });
  })().catch((error) => console.error('[InstaManager] Scheduled reminder failed:', error));
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith(SCHEDULE_ALARM_PREFIX)) return;
  void openInstagram().then(async (tab) => {
    if (tab.id === undefined) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SCHEDULED_POST' });
    } catch {
      // New Instagram tabs show due drafts when their content script loads.
    }
  });
  void chrome.notifications.clear(notificationId);
});

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if ((cookie.domain === '.instagram.com' || cookie.domain === 'www.instagram.com') && cookie.name === 'sessionid') {
    void broadcast({ type: MessageType.AUTH_STATUS_CHANGED, data: { isLoggedIn: !removed && Boolean(cookie.value) } });
  }
});

chrome.action.onClicked.addListener(() => {
  void openInstagram().then(async (tab) => {
    if (tab.id === undefined) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ASSISTANT' });
    } catch {
      // The floating launcher appears as soon as a new Instagram tab is ready.
    }
  });
});
