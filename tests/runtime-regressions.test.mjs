import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

const pageBundle = await readFile(new URL('../dist/page.js', import.meta.url), 'utf8');
const draftBundle = await readFile(new URL('../dist/drafts.js', import.meta.url), 'utf8');
const contentBundle = await readFile(new URL('../dist/content.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, path = '/') {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'https://www.instagram.com' + path,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(async () => { await tick(); dom.window.close(); });
  return dom.window;
}

function installPage(window, payload = {}) {
  Object.assign(window, { Response, Request, TextDecoder });
  // Fixtures use fixed alphanumeric ids; jsdom does not implement CSS.escape.
  window.CSS = { escape(value) { assert.match(value, /^[a-z-]+$/); return value; } };
  window.fetch = async () => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
  window.eval(pageBundle);
}

function bridge(window, data) {
  window.dispatchEvent(new window.MessageEvent('message', {
    source: window,
    origin: window.location.origin,
    data,
  }));
}

function settings(window, ghostModeEnabled, adBlockEnabled) {
  bridge(window, {
    source: 'insta-manager-content', type: 'UPDATE_SETTINGS',
    settings: { ghostModeEnabled, adBlockEnabled },
  });
}

let fixtureAccount = 0;
function installContent(window, accountId = `fixture-user-${++fixtureAccount}`) {
  const storageListeners = [];
  const runtimeListeners = [];
  const defaults = {
    GET_AUTH: { isLoggedIn: true, userId: accountId, username: 'fixture', avatarUrl: null, csrfToken: null, appId: null, dtsgToken: null },
    GET_SETTINGS: { adBlockEnabled: true, ghostModeEnabled: false, ghostModeAuto: false, theme: 'dark' },
    GET_GHOST: { enabled: false, dmBlocked: 0, storyBlocked: 0 },
    GET_SCHEDULED_POSTS: [],
    GET_AUDIENCE_SNAPSHOT: null,
  };
  Object.assign(window, { indexedDB, IDBKeyRange });
  window.chrome = {
    runtime: {
      getManifest() { return { version: '1.0.2' }; },
      onMessage: { addListener(listener) { runtimeListeners.push(listener); } },
      sendMessage(message, callback) { queueMicrotask(() => callback?.(defaults[message.type] ?? { success: true })); },
    },
    storage: { onChanged: { addListener(listener) { storageListeners.push(listener); } } },
  };
  let objectUrlCount = 0;
  window.URL.createObjectURL = () => 'blob:https://www.instagram.com/fixture-' + (++objectUrlCount);
  window.URL.revokeObjectURL = () => {};
  Object.defineProperty(window.document, 'readyState', { configurable: true, get: () => 'complete' });
  window.eval(draftBundle);
  window.eval(contentBundle);
  return { storageListeners, runtimeListeners };
}

test('actual page bundle removes feed and story ads while preserving organic content', async (t) => {
  const window = fixture(t);
  const organic = { node: { id: 'organic', caption: { text: 'Advertisement discussion, not an ad' } } };
  installPage(window, { data: {
    xdt_api__v1__feed__timeline__connection: { edges: [organic, { node: { id: 'sponsored', ad: { id: 'ad' } } }] },
    xdt_injected_story_units: { ad_media_items: [{ id: 'story-ad' }], organic: [{ id: 'story' }] },
  } });
  const result = await (await window.fetch('/graphql/query')).json();
  assert.deepEqual(result.data.xdt_api__v1__feed__timeline__connection.edges, [organic]);
  assert.deepEqual(result.data.xdt_injected_story_units.ad_media_items, []);
  assert.deepEqual(result.data.xdt_injected_story_units.organic, [{ id: 'story' }]);
});

test('disabling ad filtering leaves the response untouched', async (t) => {
  const window = fixture(t);
  const payload = { data: { xdt_api__v1__feed__timeline__connection: { edges: [{ node: { ad: true } }] } } };
  installPage(window, payload);
  settings(window, false, false);
  assert.deepEqual(await (await window.fetch('/graphql/query')).json(), payload);
});

test('DASH resolution selects video rather than the numerically larger audio bandwidth', (t) => {
  const window = fixture(t);
  installPage(window);
  const video = window.document.createElement('video');
  video.setAttribute('data-im-target', 'fixture-video');
  video.__reactFiber$fixture = { memoizedProps: { manifest:
    '<MPD><Period><AdaptationSet contentType="audio"><Representation bandwidth="128000"><BaseURL>https://cdninstagram.com/audio.mp4</BaseURL></Representation></AdaptationSet>' +
    '<AdaptationSet contentType="video"><Representation height="720" bandwidth="2000000"><BaseURL>https://cdninstagram.com/720.mp4</BaseURL></Representation>' +
    '<Representation height="1080" bandwidth="4000000"><BaseURL>https://cdninstagram.com/1080.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>' } };
  window.document.body.append(video);
  let response;
  window.postMessage = (message) => { response = message; };
  bridge(window, { source: 'insta-manager-resolve-request', requestId: 'test', targetVal: 'fixture-video' });
  assert.equal(response.url, 'https://cdninstagram.com/1080.mp4');
  assert.equal(response.audioUrl, 'https://cdninstagram.com/audio.mp4');
});

test('reused XHR returns real data after a blocked receipt', async (t) => {
  const window = fixture(t);
  class XHR extends window.EventTarget {
    static DONE = 4;
    state = 0;
    text = '';
    get readyState() { return this.state; }
    get status() { return this.state === 4 ? 200 : 0; }
    get responseText() { return this.text; }
    get response() { return this.text; }
    open() { this.state = 1; this.text = ''; }
    send() { this.state = 4; this.text = '{"real":true}'; this.dispatchEvent(new window.Event('readystatechange')); }
    abort() { this.state = 0; }
  }
  window.XMLHttpRequest = XHR;
  installPage(window);
  settings(window, true, true);
  const xhr = new window.XMLHttpRequest();
  xhr.open('POST', '/api/graphql');
  xhr.send('useIGDMarkThreadAsReadMutation');
  await tick();
  xhr.open('POST', '/api/graphql');
  xhr.send('ordinaryQuery');
  assert.equal(xhr.responseText, '{"real":true}');
});

test('photo resolution does not pick an unrelated ancestor video URL', (t) => {
  const window = fixture(t);
  installPage(window);
  const image = window.document.createElement('img');
  image.src = 'https://cdninstagram.com/photo-small.jpg';
  image.srcset = 'https://cdninstagram.com/photo-small.jpg 640w, https://cdninstagram.com/photo-hd.jpg 1080w';
  image.setAttribute('data-im-target', 'fixture-image');
  image.__reactFiber$fixture = { memoizedProps: { src: 'https://cdninstagram.com/unrelated.mp4' } };
  window.document.body.append(image);
  let response;
  window.postMessage = (message) => { response = message; };
  bridge(window, { source: 'insta-manager-resolve-request', requestId: 'photo', targetVal: 'fixture-image' });
  assert.equal(response.url, 'https://cdninstagram.com/photo-hd.jpg');
});

test('download errors are rendered as text instead of executable markup', async (t) => {
  const window = fixture(t, '/reels/');
  const video = window.document.createElement('video');
  video.src = 'https://cdninstagram.com/video.mp4';
  window.document.querySelector('main').append(video);
  installContent(window);
  window.postMessage = (message) => {
    if (message.source === 'insta-manager-resolve-request') {
      bridge(window, { source: 'insta-manager-resolve-response', requestId: message.requestId, url: video.src });
    }
  };
  window.chrome.runtime.sendMessage = (message, callback) => {
    if (message.type === 'DOWNLOAD_MEDIA') callback({ success: false, error: '<img src=x onerror=alert(1)>' });
  };
  window.document.querySelector('button[aria-label="Download reel"]').click();
  await tick();
  const toast = window.document.getElementById('im-toast-container');
  assert.equal(toast.querySelector('img'), null);
  assert.match(toast.textContent, /<img src=x onerror=alert\(1\)>/);
});

test('unrelated storage changes do not replace the focused creator caption editor', async (t) => {
  const window = fixture(t);
  const { storageListeners } = installContent(window);
  window.document.dispatchEvent(new window.CustomEvent('im-open-creator'));
  await tick();
  const editor = window.document.getElementById('im-caption-input');
  editor.value = 'An unfinished caption';
  editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  editor.focus();
  for (const listener of storageListeners) listener({ downloads: { newValue: [] } }, 'local');
  assert.equal(window.document.getElementById('im-caption-input'), editor);
  assert.equal(window.document.activeElement, editor);
});

test('reel progress can change despite the injected important CSS', (t) => {
  const window = fixture(t, '/reels/');
  const video = window.document.createElement('video');
  Object.defineProperties(video, { duration: { value: 100 }, currentTime: { value: 25, writable: true } });
  window.document.querySelector('main').append(video);
  installContent(window);
  video.dispatchEvent(new window.Event('timeupdate'));
  const progress = window.document.querySelector('.im-reel-progress');
  assert.equal(progress.style.getPropertyValue('--im-progress'), '25%');
  assert.match(window.document.getElementById('im-injected-styles').textContent, /width:\s*var\(--im-progress,\s*0%\)/);
});

test('reel controls mount outside the video-only stacking context and keep absolute positioning intact', (t) => {
  const window = fixture(t, '/reels/');
  const main = window.document.querySelector('main');
  main.innerHTML = '<div id="player" style="position:absolute"><div id="video-stack" style="position:relative;z-index:0"><div><video></video></div></div><div id="native-overlay" role="button"></div></div>';
  const rect = { x: 100, y: 20, left: 100, top: 20, right: 500, bottom: 720, width: 400, height: 700 };
  for (const element of main.querySelectorAll('*')) element.getBoundingClientRect = () => rect;
  installContent(window);
  const player = window.document.getElementById('player');
  assert.equal(window.document.querySelector('.im-media-bar-reel').parentElement, player);
  assert.equal(window.document.querySelector('.im-reel-scrubber').parentElement, player);
  assert.equal(window.getComputedStyle(player).position, 'absolute');
});

test('story creates one action bar and targets the largest visible story media, not an avatar', async (t) => {
  const window = fixture(t, '/stories/fixture/');
  const outer = window.document.createElement('section');
  const inner = window.document.createElement('section');
  const avatar = window.document.createElement('img');
  avatar.src = 'https://cdninstagram.com/avatar.jpg';
  avatar.alt = 'profile picture';
  const video = window.document.createElement('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://www.instagram.com/story' });
  video.__reactFiber$fixture = { memoizedProps: { manifest:
    '<MPD><Period><AdaptationSet contentType="video"><Representation height="1280"><BaseURL>https://cdninstagram.com/story-video.mp4</BaseURL></Representation></AdaptationSet>' +
    '<AdaptationSet contentType="audio"><Representation bandwidth="128000"><BaseURL>https://cdninstagram.com/story-audio.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>' } };
  const preview = window.document.createElement('img');
  preview.src = 'https://cdninstagram.com/preview.jpg';
  avatar.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 56, bottom: 56, width: 56, height: 56 });
  video.getBoundingClientRect = () => ({ x: 100, y: 20, left: 100, top: 20, right: 680, bottom: 1050, width: 580, height: 1030 });
  preview.getBoundingClientRect = () => ({ x: 700, y: 200, left: 700, top: 200, right: 930, bottom: 610, width: 230, height: 410 });
  inner.append(video, preview);
  outer.append(avatar, inner);
  window.document.body.append(outer);
  installPage(window);
  installContent(window);
  window.postMessage = (message) => {
    if (message.source === 'insta-manager-resolve-request') {
      assert.equal(window.document.querySelector(`[data-im-target="${message.targetVal}"]`), video);
      bridge(window, {
        source: 'insta-manager-resolve-response', requestId: message.requestId,
        url: 'https://cdninstagram.com/story-video.mp4', audioUrl: 'https://cdninstagram.com/story-audio.mp4',
      });
    }
  };
  const messages = [];
  window.chrome.runtime.sendMessage = (message, callback) => { messages.push(message); callback?.({ success: true }); };
  assert.equal(window.document.querySelectorAll('button[aria-label="Download story"]').length, 1);
  window.document.querySelector('button[aria-label="Download story"]').click();
  await tick();
  await tick();
  const download = messages.find((message) => message.type === 'DOWNLOAD_MEDIA');
  assert.equal(download.data.url, 'https://cdninstagram.com/story-video.mp4');
  assert.equal(download.data.audioUrl, 'https://cdninstagram.com/story-audio.mp4');
});

test('story controls attach immediately after SPA navigation even when timers are throttled', async (t) => {
  const window = fixture(t, '/');
  installContent(window);
  const section = window.document.createElement('section');
  const image = window.document.createElement('img');
  image.src = 'https://cdninstagram.com/story.jpg';
  Object.defineProperty(image, 'naturalWidth', { value: 1080 });
  Object.defineProperty(image, 'naturalHeight', { value: 1920 });
  image.getBoundingClientRect = () => ({ x: 100, y: 20, left: 100, top: 20, right: 680, bottom: 1050, width: 580, height: 1030 });
  section.append(image);
  window.history.pushState({}, '', '/stories/fixture/');
  window.document.body.append(section);
  await tick();
  assert.equal(window.document.querySelectorAll('button[aria-label="Download story"]').length, 1);
});

test('story controls attach when Instagram changes the route after inserting media', async (t) => {
  const window = fixture(t, '/');
  installPage(window);
  installContent(window);
  const section = window.document.createElement('section');
  const image = window.document.createElement('img');
  image.src = 'https://cdninstagram.com/late-route-story.jpg';
  Object.defineProperty(image, 'naturalWidth', { value: 1080 });
  Object.defineProperty(image, 'naturalHeight', { value: 1920 });
  image.getBoundingClientRect = () => ({ x: 100, y: 20, left: 100, top: 20, right: 680, bottom: 1050, width: 580, height: 1030 });
  section.append(image);
  window.document.body.append(section);
  await tick();
  assert.equal(window.document.querySelectorAll('button[aria-label="Download story"]').length, 0);
  window.history.pushState({}, '', '/stories/fixture/');
  await tick();
  assert.equal(window.document.querySelectorAll('button[aria-label="Download story"]').length, 1);
});

test('composer handoff targets Instagram input and closes the creator dock', async (t) => {
  const window = fixture(t);
  installContent(window);
  const create = window.document.createElement('a');
  create.href = '#';
  create.setAttribute('role', 'link');
  create.innerHTML = '<svg aria-label="New post"></svg><span>Create</span>';
  window.document.body.prepend(create);
  let deliveredFiles = [];
  let nativeChangeEvents = 0;
  create.addEventListener('click', (event) => {
    event.preventDefault();
    const nativeInput = window.document.createElement('input');
    nativeInput.type = 'file';
    nativeInput.multiple = true;
    Object.defineProperty(nativeInput, 'files', { get: () => deliveredFiles, set: (files) => { deliveredFiles = files; } });
    nativeInput.addEventListener('change', () => nativeChangeEvents++);
    window.document.body.append(nativeInput);
  });
  window.DataTransfer = class {
    files = [];
    items = { add: (file) => this.files.push(file) };
  };
  window.document.dispatchEvent(new window.CustomEvent('im-open-creator'));
  await tick();
  const chosen = [new window.File(['sample'], 'first.png', { type: 'image/png' }), new window.File(['sample'], 'second.png', { type: 'image/png' })];
  const assistantInput = window.document.getElementById('im-file-input');
  Object.defineProperty(assistantInput, 'files', { value: chosen });
  assistantInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  window.document.getElementById('im-btn-publish').click();
  await tick();
  assert.equal(nativeChangeEvents, 1);
  assert.deepEqual(deliveredFiles.map((file) => file.name), ['first.png', 'second.png']);
  assert.equal(window.document.getElementById('im-creator-dock').classList.contains('im-creator-dock-open'), false);
});

test('video resolution prefers the highest Fiber DASH rendition over a playable direct source', (t) => {
  const window = fixture(t);
  installPage(window);
  const video = window.document.createElement('video');
  video.src = 'https://cdninstagram.com/preview-480.mp4';
  video.setAttribute('data-im-target', 'fixture-video');
  video.__reactFiber$fixture = { memoizedProps: { manifest:
    '<MPD><Period><AdaptationSet contentType="video"><Representation height="1080" bandwidth="4000000"><BaseURL>https://cdninstagram.com/hd-1080.mp4</BaseURL></Representation></AdaptationSet>' +
    '<AdaptationSet contentType="audio"><Representation bandwidth="128000"><BaseURL>https://cdninstagram.com/audio.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>' } };
  window.document.body.append(video);
  let response;
  window.postMessage = (message) => { response = message; };
  bridge(window, { source: 'insta-manager-resolve-request', requestId: 'test', targetVal: 'fixture-video' });
  assert.equal(response.url, 'https://cdninstagram.com/hd-1080.mp4');
  assert.equal(response.audioUrl, 'https://cdninstagram.com/audio.mp4');
});

test('DASH resolution inherits and resolves relative BaseURL values', (t) => {
  const window = fixture(t);
  installPage(window);
  const video = window.document.createElement('video');
  video.setAttribute('data-im-target', 'fixture-video');
  video.__reactFiber$fixture = { memoizedProps: { manifest:
    '<MPD><BaseURL>https://cdninstagram.com/media/</BaseURL><Period><AdaptationSet contentType="video"><BaseURL>video/</BaseURL><Representation height="1080"><BaseURL>hd.mp4</BaseURL></Representation></AdaptationSet>' +
    '<AdaptationSet contentType="audio"><BaseURL>audio/</BaseURL><Representation bandwidth="128000"><BaseURL>track.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>' } };
  window.document.body.append(video);
  let response;
  window.postMessage = (message) => { response = message; };
  bridge(window, { source: 'insta-manager-resolve-request', requestId: 'test', targetVal: 'fixture-video' });
  assert.equal(response.url, 'https://cdninstagram.com/media/video/hd.mp4');
  assert.equal(response.audioUrl, 'https://cdninstagram.com/media/audio/track.mp4');
});

test('unsupported DASH media is surfaced explicitly instead of downloading a blob fallback', async (t) => {
  const window = fixture(t, '/reels/');
  const video = window.document.createElement('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://www.instagram.com/reel' });
  window.document.querySelector('main').append(video);
  installContent(window);
  window.postMessage = (message) => {
    if (message.source === 'insta-manager-resolve-request') {
      bridge(window, { source: 'insta-manager-resolve-response', requestId: message.requestId, url: null, unsupportedReason: 'This Reel uses protected or segmented media and cannot be downloaded.' });
    }
  };
  const messages = [];
  window.chrome.runtime.sendMessage = (message, callback) => { messages.push(message); callback?.({ success: true }); };
  window.document.querySelector('button[aria-label="Download reel"]').click();
  await tick();
  assert.equal(messages.some((message) => message.type === 'DOWNLOAD_MEDIA'), false);
  assert.match(window.document.getElementById('im-toast-container').textContent, /protected or segmented media/);
});

test('feed download control follows the active carousel media after the article changes', async (t) => {
  const window = fixture(t, '/');
  const article = window.document.createElement('article');
  const first = window.document.createElement('img');
  first.src = 'https://cdninstagram.com/slide-one.jpg';
  Object.defineProperty(first, 'naturalWidth', { value: 1080 });
  Object.defineProperty(first, 'clientWidth', { value: 400 });
  article.append(first);
  window.document.querySelector('main').append(article);
  installContent(window);
  window.postMessage = (message) => {
    if (message.source === 'insta-manager-resolve-request') {
      const target = window.document.querySelector(`[data-im-target="${message.targetVal}"]`);
      bridge(window, { source: 'insta-manager-resolve-response', requestId: message.requestId, url: target.src });
    }
  };
  const messages = [];
  window.chrome.runtime.sendMessage = (message, callback) => { messages.push(message); callback?.({ success: true, downloadId: 7 }); };
  first.remove();
  const second = window.document.createElement('img');
  second.src = 'https://cdninstagram.com/slide-two.jpg';
  Object.defineProperty(second, 'naturalWidth', { value: 1080 });
  Object.defineProperty(second, 'clientWidth', { value: 400 });
  article.prepend(second);
  await tick();
  await tick();
  window.document.querySelector('button[aria-label="Download post"]').click();
  await tick();
  assert.equal(messages.find((message) => message.type === 'DOWNLOAD_MEDIA').data.url, 'https://cdninstagram.com/slide-two.jpg');
});

test('feed download targets the centered carousel slide when adjacent slides remain rendered', async (t) => {
  const window = fixture(t, '/');
  Object.defineProperties(window, { innerWidth: { value: 1000 }, innerHeight: { value: 800 } });
  const article = window.document.createElement('article');
  article.getBoundingClientRect = () => ({ x: 100, y: 100, left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600 });
  const previous = window.document.createElement('img');
  const active = window.document.createElement('img');
  const next = window.document.createElement('img');
  for (const [image, name, left] of [[previous, 'previous', -250], [active, 'active', 200], [next, 'next', 850]]) {
    image.src = `https://cdninstagram.com/${name}.jpg`;
    Object.defineProperty(image, 'naturalWidth', { value: 1080 });
    Object.defineProperty(image, 'clientWidth', { value: 600 });
    image.getBoundingClientRect = () => ({ x: left, y: 100, left, top: 100, right: left + 600, bottom: 700, width: 600, height: 600 });
    article.append(image);
  }
  window.document.querySelector('main').append(article);
  installContent(window);
  window.postMessage = (message) => {
    if (message.source === 'insta-manager-resolve-request') {
      const target = window.document.querySelector(`[data-im-target="${message.targetVal}"]`);
      bridge(window, { source: 'insta-manager-resolve-response', requestId: message.requestId, url: target.src });
    }
  };
  const messages = [];
  window.chrome.runtime.sendMessage = (message, callback) => { messages.push(message); callback?.({ success: true, downloadId: 8 }); };
  window.document.querySelector('button[aria-label="Download post"]').click();
  await tick();
  assert.equal(messages.find((message) => message.type === 'DOWNLOAD_MEDIA').data.url, 'https://cdninstagram.com/active.jpg');
});

test('feed control is removed when a virtualized article no longer has media', async (t) => {
  const window = fixture(t, '/');
  const article = window.document.createElement('article');
  const image = window.document.createElement('img');
  image.src = 'https://cdninstagram.com/slide.jpg';
  Object.defineProperty(image, 'naturalWidth', { value: 1080 });
  Object.defineProperty(image, 'clientWidth', { value: 400 });
  article.append(image);
  window.document.querySelector('main').append(article);
  installContent(window);
  assert.equal(window.document.querySelectorAll('button[aria-label="Download post"]').length, 1);
  image.remove();
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  assert.equal(window.document.querySelectorAll('button[aria-label="Download post"]').length, 0);
});

test('download control remains pending until its terminal completion message arrives', async (t) => {
  const window = fixture(t, '/reels/');
  const video = window.document.createElement('video');
  video.src = 'https://cdninstagram.com/video.mp4';
  window.document.querySelector('main').append(video);
  const { runtimeListeners } = installContent(window);
  window.postMessage = (message) => {
    if (message.source === 'insta-manager-resolve-request') bridge(window, { source: 'insta-manager-resolve-response', requestId: message.requestId, url: video.src });
  };
  window.chrome.runtime.sendMessage = (message, callback) => {
    if (message.type === 'DOWNLOAD_MEDIA') callback?.({ success: true, downloadId: 9 });
  };
  const button = window.document.querySelector('button[aria-label="Download reel"]');
  button.click();
  await tick();
  assert.equal(button.disabled, true);
  for (const listener of runtimeListeners) listener({ type: 'DOWNLOAD_STATUS', data: { requestId: 'im-download-worker-route', downloadId: 9, status: 'done' } });
  await tick();
  assert.equal(button.disabled, false);
});

test('creator opens as a compact in-page dock without a fullscreen backdrop or developer controls', async (t) => {
  const window = fixture(t);
  installContent(window);
  const launcher = window.document.getElementById('im-floating-launcher');
  assert.equal(launcher, null);
  window.document.dispatchEvent(new window.CustomEvent('im-open-creator'));
  await tick();
  const dock = window.document.getElementById('im-creator-dock');
  assert.ok(dock);
  assert.equal(window.document.getElementById('im-assistant-overlay'), null);
  assert.equal(dock.classList.contains('im-creator-dock-open'), true);
  assert.equal(dock.textContent.includes('LOCAL'), false);
  assert.equal(dock.textContent.includes('Reload updated extension'), false);
});

test('creator accepts up to twenty files and labels selected media', async (t) => {
  const window = fixture(t);
  installContent(window);
  window.document.dispatchEvent(new window.CustomEvent('im-open-creator'));
  await tick();
  const input = window.document.getElementById('im-file-input');
  const chosen = Array.from({ length: 20 }, (_, index) => new window.File(['sample'], `image-${index}.png`, { type: 'image/png' }));
  Object.defineProperty(input, 'files', { value: chosen });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(window.document.querySelectorAll('[data-media-index]').length, 20);
  assert.match(window.document.getElementById('im-creator-dock').textContent, /20 selected/);
});

test('creator restores caption, format, and ordered media after its content context reloads', async (t) => {
  const first = fixture(t);
  installContent(first, 'reload-fixture');
  first.document.dispatchEvent(new first.CustomEvent('im-open-creator'));
  await tick();
  first.document.querySelector('[data-format="post"]').click();
  const caption = first.document.getElementById('im-caption-input');
  caption.value = 'Durable carousel';
  caption.dispatchEvent(new first.Event('input', { bubbles: true }));
  const input = first.document.getElementById('im-file-input');
  Object.defineProperty(input, 'files', { value: [
    new first.File(['one'], 'first.png', { type: 'image/png' }),
    new first.File(['two'], 'second.png', { type: 'image/png' }),
  ] });
  input.dispatchEvent(new first.Event('change', { bubbles: true }));
  await new Promise((resolve) => first.setTimeout(resolve, 350));

  const reloaded = fixture(t);
  installContent(reloaded, 'reload-fixture');
  reloaded.document.dispatchEvent(new reloaded.CustomEvent('im-open-creator'));
  await new Promise((resolve) => reloaded.setTimeout(resolve, 50));
  assert.equal(reloaded.document.getElementById('im-caption-input').value, 'Durable carousel');
  assert.equal(reloaded.document.querySelector('[data-format="post"]').classList.contains('is-active'), true);
  assert.deepEqual([...reloaded.document.querySelectorAll('[data-media-index] em')].map((item) => item.textContent), ['first.png', 'second.png']);
});
