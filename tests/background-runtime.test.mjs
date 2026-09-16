import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../dist/background.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function worker(initial = {}, options = {}) {
  const values = { ...initial };
  let listener;
  let downloadListener;
  let alarmListener;
  let cookieListener;
  let offscreenOpen = false;
  let runtimeLastError;
  const calls = { alarmsCreated: [], alarmsCleared: [], created: [], downloads: [], messages: [], reloadTabs: [], reloads: 0, timers: [] };
  const event = { addListener() {} };
  const withStorageError = (callback, value, message) => {
    runtimeLastError = message ? { message } : undefined;
    callback?.(value);
    runtimeLastError = undefined;
  };
  const chrome = {
    runtime: {
      id: 'fixture', getURL: (path) => 'chrome-extension://fixture/' + path,
      get lastError() { return runtimeLastError; },
      onInstalled: event, OnInstalledReason: { INSTALL: 'install' },
      onMessage: { addListener(fn) { listener = fn; } },
      reload() { calls.reloads++; },
      async sendMessage(message) { calls.messages.push(message); return { success: true, url: 'blob:chrome-extension://fixture/media' }; },
    },
    storage: { local: {
      get(key, callback) { const result = { [key]: values[key] }; if (callback) queueMicrotask(() => withStorageError(callback, result)); return Promise.resolve(result); },
      set(patch, callback) { if (!options.storageSetError) Object.assign(values, patch); withStorageError(callback, undefined, options.storageSetError); return Promise.resolve(); },
      remove(key, callback) { delete values[key]; withStorageError(callback); return Promise.resolve(); },
    } },
    alarms: {
      onAlarm: { addListener(fn) { alarmListener = fn; } },
      async create(name, config) { calls.alarmsCreated.push({ name, ...config }); if (options.alarmCreateError) throw new Error(options.alarmCreateError); },
      async clear(name) { calls.alarmsCleared.push(name); return true; },
      async getAll() { return options.alarms ?? []; },
    },
    notifications: { onClicked: event },
    cookies: {
      onChanged: { addListener(fn) { cookieListener = fn; } },
      async get({ name }) {
        if (name === 'sessionid') return options.userId === null ? null : { value: options.sessionId ?? 'fixture-session' };
        if (name === 'ds_user_id') return options.userId === null ? null : { value: options.userId ?? '1001' };
        if (name === 'csrftoken') return options.userId === null ? null : { value: 'fixture-csrf' };
        return null;
      },
    },
    action: { onClicked: event },
    tabs: {
      async query() { return []; },
      async get() { return { url: 'https://www.instagram.com/reels/' }; },
      async reload(id) { calls.reloadTabs.push(id); },
      async sendMessage(tabId, message) { calls.tabMessages ??= []; calls.tabMessages.push({ tabId, message }); },
    },
    offscreen: { Reason: { BLOBS: 'BLOBS' }, async hasDocument() { return offscreenOpen; }, async createDocument(options) { offscreenOpen = true; calls.created.push(options); } },
    downloads: {
      download(options, callback) { calls.downloads.push(options); callback(1); },
      onChanged: { addListener(fn) { downloadListener = fn; } },
      async search() { return [{ url: calls.downloads[0]?.url }]; },
    },
  };
  vm.runInNewContext(source, { chrome, URL, Headers, crypto, console, setTimeout(fn) { calls.timers.push(fn); } });
  return {
    calls, values, downloadListener, alarmListener, cookieListener,
    switchAccount(userId) { options.userId = userId; },
    send(message, sender = { id: 'fixture', tab: { id: 7 }, url: 'https://www.instagram.com/reels/' }) {
      return new Promise((resolve) => listener(message, sender, resolve));
    },
  };
}

test('built worker keeps download history isolated by Instagram account', async () => {
  const shared = {};
  const first = worker(shared, { userId: '1001' });
  assert.equal((await first.send({ type: 'DOWNLOAD_MEDIA', data: { url: 'https://cdninstagram.com/first.jpg', filename: 'first.jpg' } })).success, true);
  Object.assign(shared, first.values);

  const second = worker(shared, { userId: '2002' });
  assert.equal(JSON.stringify(await second.send({ type: 'GET_DOWNLOADS' })), '[]');
  assert.equal((await second.send({ type: 'DOWNLOAD_MEDIA', data: { url: 'https://cdninstagram.com/second.jpg', filename: 'second.jpg' } })).success, true);
  Object.assign(shared, second.values);

  const restored = worker(shared, { userId: '1001' });
  assert.equal(JSON.stringify((await restored.send({ type: 'GET_DOWNLOADS' })).map((item) => item.filename)), '["first.jpg"]');
});

test('built worker updates the initiating download after an Instagram account switch', async () => {
  const host = worker({}, { userId: '1001' });
  await host.send({ type: 'DOWNLOAD_MEDIA', data: { url: 'https://cdninstagram.com/first.jpg', filename: 'first.jpg' } });
  host.switchAccount('2002');
  host.downloadListener({ id: 1, state: { current: 'complete' } });
  await tick();

  host.switchAccount('1001');
  const downloads = await host.send({ type: 'GET_DOWNLOADS' });
  assert.equal(downloads[0].status, 'done');
});

test('built worker updates a pending download after Instagram logout', async () => {
  const host = worker({}, { userId: '1001' });
  await host.send({ type: 'DOWNLOAD_MEDIA', data: { url: 'https://cdninstagram.com/first.jpg', filename: 'first.jpg' } });
  host.switchAccount(null);
  host.downloadListener({ id: 1, state: { current: 'complete' } });
  await tick();

  host.switchAccount('1001');
  const downloads = await host.send({ type: 'GET_DOWNLOADS' });
  assert.equal(downloads[0].status, 'done');
});

test('built worker migrates legacy downloads into only the active account', async () => {
  const legacy = [{ id: 'old', url: 'https://cdninstagram.com/old.jpg', filename: 'old.jpg', type: 'image/jpeg', status: 'done', createdAt: 10, downloadId: 7 }];
  const first = worker({ downloads: legacy }, { userId: '1001' });
  assert.equal((await first.send({ type: 'GET_DOWNLOADS' }))[0].filename, 'old.jpg');
  const second = worker(first.values, { userId: '2002' });
  assert.equal(JSON.stringify(await second.send({ type: 'GET_DOWNLOADS' })), '[]');
});

test('built worker recovers safely from malformed account activity state', async () => {
  const host = worker({
    downloads: { version: 1, accounts: { '1001': [{ id: 7 }] } },
    audienceSnapshot: { version: 1, accounts: { '1001': { scannedAt: 'never' } } },
  }, { userId: '1001' });
  assert.equal(JSON.stringify(await host.send({ type: 'GET_DOWNLOADS' })), '[]');
  assert.equal(await host.send({ type: 'GET_AUDIENCE_SNAPSHOT' }), null);
});

test('built worker migrates a legacy audience snapshot into only the active account', async () => {
  const snapshot = {
    scannedAt: 123, followerCount: 1, followingCount: 0, scannedFollowers: 1, scannedFollowing: 0, limited: false,
    followers: [], following: [], nonFollowers: [], suspiciousFollowers: [], gainedFollowers: [], lostFollowers: [],
  };
  const first = worker({ audienceSnapshot: snapshot }, { userId: '1001' });
  assert.equal((await first.send({ type: 'GET_AUDIENCE_SNAPSHOT' })).scannedAt, 123);
  const second = worker(first.values, { userId: '2002' });
  assert.equal(await second.send({ type: 'GET_AUDIENCE_SNAPSHOT' }), null);
});

test('built worker keeps audience snapshots isolated by Instagram account', async () => {
  const snapshot = {
    scannedAt: 123,
    followerCount: 1,
    followingCount: 0,
    scannedFollowers: 1,
    scannedFollowing: 0,
    limited: false,
    followers: [], following: [], nonFollowers: [], suspiciousFollowers: [], gainedFollowers: [], lostFollowers: [],
  };
  const shared = { audienceSnapshot: { version: 1, accounts: { '1001': snapshot } } };
  const first = worker(shared, { userId: '1001' });
  assert.equal((await first.send({ type: 'GET_AUDIENCE_SNAPSHOT' })).scannedAt, 123);
  const second = worker(shared, { userId: '2002' });
  assert.equal(await second.send({ type: 'GET_AUDIENCE_SNAPSHOT' }), null);
});

test('built worker routes split-track media through offscreen, downloads the Blob, and releases it', async () => {
  const host = worker();
  const result = await host.send({ type: 'DOWNLOAD_MEDIA', data: { url: 'https://cdninstagram.com/video.mp4', audioUrl: 'https://cdninstagram.com/audio.mp4', filename: 'reel.mp4' } });
  assert.equal(result.success, true);
  assert.equal(host.calls.created.length, 1);
  assert.equal(host.calls.created[0].url, 'src/offscreen/index.html');
  assert.equal(host.calls.messages[0].type, 'MUX_MEDIA');
  assert.equal(host.calls.downloads[0].url, 'blob:chrome-extension://fixture/media');
  host.downloadListener({ id: 1, state: { current: 'complete' } });
  await tick();
  assert.equal(host.calls.messages.at(-1).type, 'RELEASE_MEDIA');
});

test('built worker reports terminal download status to its initiating Instagram tab', async () => {
  const host = worker();
  const result = await host.send({
    type: 'DOWNLOAD_MEDIA',
    data: { url: 'https://cdninstagram.com/video.mp4', filename: 'reel.mp4', requestId: 'request-42' },
  });
  assert.equal(result.success, true);
  host.downloadListener({ id: 1, state: { current: 'complete' } });
  await tick();
  assert.equal(JSON.stringify(host.calls.tabMessages), JSON.stringify([{
    tabId: 7,
    message: { type: 'DOWNLOAD_STATUS', data: { requestId: 'request-42', downloadId: 1, status: 'done' } },
  }]));
});

test('built worker preserves terminal download routing across service-worker restart', async () => {
  const started = worker();
  const result = await started.send({
    type: 'DOWNLOAD_MEDIA',
    data: { url: 'https://cdninstagram.com/video.mp4', filename: 'reel.mp4', requestId: 'request-after-restart' },
  });
  assert.equal(result.success, true);
  assert.equal(started.values.downloadRoutes?.version, 1);

  const restarted = worker(started.values);
  restarted.downloadListener({ id: 1, state: { current: 'complete' } });
  await tick();
  await tick();
  assert.equal(JSON.stringify(restarted.calls.tabMessages), JSON.stringify([{
    tabId: 7,
    message: { type: 'DOWNLOAD_STATUS', data: { requestId: 'request-after-restart', downloadId: 1, status: 'done' } },
  }]));
  assert.equal(restarted.values.downloadRoutes.routes['1'], undefined);
});

test('built worker accepts self-reload only from the extension Instagram tab', async () => {
  const host = worker();
  await tick();
  const denied = await host.send({ type: 'RELOAD_EXTENSION' }, { id: 'foreign', tab: { id: 7 }, url: 'https://www.instagram.com/' });
  assert.equal(denied.success, false);
  assert.equal(host.values.reloadRequest, undefined);
  const accepted = await host.send({ type: 'RELOAD_EXTENSION' });
  assert.equal(accepted.success, true);
  assert.equal(host.values.reloadRequest.tabId, 7);
  assert.equal(host.calls.reloads, 0);
  host.calls.timers[0]();
  assert.equal(host.calls.reloads, 1);
  const restarted = worker(host.values);
  await tick();
  assert.deepEqual(restarted.calls.reloadTabs, [7]);
  assert.equal(restarted.values.reloadRequest, undefined);
});

test('built worker does not replay expired reload requests', async () => {
  const host = worker({ reloadRequest: { tabId: 7, requestedAt: Date.now() - 120_000 } });
  await tick();
  assert.equal(host.calls.reloadTabs.length, 0);
  assert.equal(host.values.reloadRequest, undefined);
});

test('built worker reports chrome storage write failures to callers', async () => {
  const host = worker({}, { storageSetError: 'Storage quota exceeded.' });
  const result = await host.send({ type: 'UPDATE_SETTINGS', data: { adBlockEnabled: false } });
  assert.equal(result.success, false);
  assert.match(result.error, /Storage quota exceeded/);
  assert.equal(host.values.settings, undefined);
});

test('built worker isolates schedules by the active Instagram account', async () => {
  const shared = {};
  const first = worker(shared, { userId: '1001' });
  const scheduled = await first.send({
    type: 'SCHEDULE_POST',
    data: { type: 'post', caption: 'first account', scheduledAt: Date.now() + 60_000, draftId: ' scheduled-fixture ' },
  });
  assert.equal(scheduled.success, true);
  assert.equal(scheduled.post.draftId, 'scheduled-fixture');
  Object.assign(shared, first.values);

  const second = worker(shared, { userId: '2002' });
  assert.equal(JSON.stringify(await second.send({ type: 'GET_SCHEDULED_POSTS' })), '[]');
  const restored = worker(shared, { userId: '1001' });
  assert.equal((await restored.send({ type: 'GET_SCHEDULED_POSTS' }))[0].caption, 'first account');
  assert.equal((await restored.send({ type: 'GET_SCHEDULED_POSTS' }))[0].draftId, 'scheduled-fixture');
});

test('built worker reconciles schedule alarms across every stored account', async () => {
  const future = Date.now() + 60_000;
  const schedules = {
    version: 1,
    posts: [
      { id: 'active', accountId: '1001', type: 'post', caption: 'active', scheduledAt: future, mediaName: null, mediaType: null, status: 'scheduled', createdAt: Date.now() },
      { id: 'foreign', accountId: '2002', type: 'reel', caption: 'foreign', scheduledAt: future, mediaName: null, mediaType: null, status: 'scheduled', createdAt: Date.now() },
      { id: 'due', accountId: '1001', type: 'story', caption: 'due', scheduledAt: future, mediaName: null, mediaType: null, status: 'due', createdAt: Date.now() },
    ],
  };
  const host = worker({ scheduledPosts: schedules }, {
    userId: '1001',
    alarms: [
      { name: 'insta-manager-scheduled:foreign' },
      { name: 'insta-manager-scheduled:orphan' },
      { name: 'unrelated-extension-alarm' },
    ],
  });
  await tick();
  await tick();
  assert.deepEqual(host.calls.alarmsCreated, [{ name: 'insta-manager-scheduled:active', when: future }]);
  assert.deepEqual(host.calls.alarmsCleared, ['insta-manager-scheduled:orphan']);
});

test('built worker keeps all account alarms after an Instagram account switch', async () => {
  const future = Date.now() + 60_000;
  const host = worker({ scheduledPosts: {
    version: 1,
    posts: [
      { id: 'first', accountId: '1001', type: 'post', caption: 'first', scheduledAt: future, mediaName: null, mediaType: null, status: 'scheduled', createdAt: Date.now() },
      { id: 'second', accountId: '2002', type: 'post', caption: 'second', scheduledAt: future, mediaName: null, mediaType: null, status: 'scheduled', createdAt: Date.now() },
    ],
  } }, { userId: '1001', alarms: [{ name: 'insta-manager-scheduled:first' }] });
  await tick();
  host.switchAccount('2002');
  host.cookieListener({ cookie: { domain: '.instagram.com', name: 'sessionid', value: 'new-session' }, removed: false });
  await tick();
  await tick();
  assert.equal(host.calls.alarmsCleared.includes('insta-manager-scheduled:first'), false);
  assert.ok(host.calls.alarmsCreated.some(({ name }) => name === 'insta-manager-scheduled:second'));
});

test('built worker rolls back a schedule when alarm creation fails', async () => {
  const host = worker({}, { userId: '1001', alarmCreateError: 'Alarm service unavailable.' });
  const result = await host.send({
    type: 'SCHEDULE_POST',
    data: { type: 'post', caption: 'must roll back', scheduledAt: Date.now() + 60_000, draftId: 'scheduled-rollback' },
  });
  assert.equal(result.success, false);
  assert.match(result.error, /Alarm service unavailable/);
  assert.equal(host.values.scheduledPosts.posts.length, 0);
});
