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
  let offscreenOpen = false;
  let runtimeLastError;
  const calls = { created: [], downloads: [], messages: [], reloadTabs: [], reloads: 0, timers: [] };
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
    alarms: { onAlarm: event, async create() {} },
    notifications: { onClicked: event }, cookies: { onChanged: event }, action: { onClicked: event },
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
    calls, values, downloadListener,
    send(message, sender = { id: 'fixture', tab: { id: 7 }, url: 'https://www.instagram.com/reels/' }) {
      return new Promise((resolve) => listener(message, sender, resolve));
    },
  };
}

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
