export interface InstagramUser {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  isPrivate: boolean;
  isVerified: boolean;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  bio: string;
  category: string | null;
  isBusiness: boolean;
  isProfessional: boolean;
}

export interface MediaVersion {
  url: string;
  width: number;
  height: number;
}

export interface InstagramPost {
  id: string;
  code: string;
  type: 'photo' | 'video' | 'carousel';
  caption: string;
  takenAt: number;
  likes: number;
  comments: number;
  views?: number;
  imageVersions: MediaVersion[];
  videoVersions?: MediaVersion[];
  isLiked: boolean;
}

export interface InstagramStory {
  id: string;
  code: string;
  takenAt: number;
  imageVersions: MediaVersion[];
  videoVersions?: MediaVersion[];
  expiringAt: number;
}

export interface InstagramReel {
  id: string;
  code: string;
  likes: number;
  comments: number;
  views: number;
  imageVersions: MediaVersion[];
  videoVersions?: MediaVersion[];
}

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  type: string;
  status: 'pending' | 'downloading' | 'done' | 'error';
  createdAt: number;
  downloadId?: number;
  error?: string;
}

export type PublishFormat = 'post' | 'reel' | 'story';

export interface ScheduledPost {
  id: string;
  type: PublishFormat;
  caption: string;
  scheduledAt: number;
  mediaName: string | null;
  mediaType: string | null;
  status: 'scheduled' | 'due';
  createdAt: number;
}

export interface AudienceUser {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  isPrivate: boolean;
  isVerified: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  riskReasons: string[];
}

export interface AudienceSnapshot {
  scannedAt: number;
  followerCount: number;
  followingCount: number;
  scannedFollowers: number;
  scannedFollowing: number;
  limited: boolean;
  followers: AudienceUser[];
  following: AudienceUser[];
  nonFollowers: AudienceUser[];
  suspiciousFollowers: AudienceUser[];
  gainedFollowers: AudienceUser[];
  lostFollowers: AudienceUser[];
}

export interface AuthState {
  isLoggedIn: boolean;
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  csrfToken: string | null;
  appId: string | null;
  dtsgToken: string | null;
}

export interface GhostState {
  enabled: boolean;
  dmBlocked: number;
  storyBlocked: number;
}

export interface SettingsState {
  adBlockEnabled: boolean;
  ghostModeEnabled: boolean;
  ghostModeAuto: boolean;
  theme: 'dark' | 'light';
}

export interface AppState {
  auth: AuthState;
  ghost: GhostState;
  settings: SettingsState;
}

export enum MessageType {
  GET_AUTH = 'GET_AUTH',
  AUTH_CHECK = 'AUTH_CHECK',
  AUTH_STATUS_CHANGED = 'AUTH_STATUS_CHANGED',
  SET_GHOST = 'SET_GHOST',
  GET_GHOST = 'GET_GHOST',
  DOWNLOAD_MEDIA = 'DOWNLOAD_MEDIA',
  GET_SETTINGS = 'GET_SETTINGS',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
  EXTRACT_MEDIA = 'EXTRACT_MEDIA',
  GET_PROFILE = 'GET_PROFILE',
  SYNC_STATE = 'SYNC_STATE',
  GET_SCHEDULED_POSTS = 'GET_SCHEDULED_POSTS',
  SCHEDULE_POST = 'SCHEDULE_POST',
  DELETE_SCHEDULED_POST = 'DELETE_SCHEDULED_POST',
  GET_DOWNLOADS = 'GET_DOWNLOADS',
  ACTION_BLOCKED_EVENT = 'ACTION_BLOCKED_EVENT',
  GET_AUDIENCE_SNAPSHOT = 'GET_AUDIENCE_SNAPSHOT',
  SCAN_AUDIENCE = 'SCAN_AUDIENCE',
  REMOVE_FOLLOWER = 'REMOVE_FOLLOWER',
  UNFOLLOW_ACCOUNT = 'UNFOLLOW_ACCOUNT',
  BATCH_REMOVE_FOLLOWERS = 'BATCH_REMOVE_FOLLOWERS',
}

export interface Message<T = any> {
  type: MessageType;
  data?: T;
}
