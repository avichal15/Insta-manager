import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

const draftsUrl = new URL('../dist/drafts.js', import.meta.url).href;
const popupUrl = new URL('../dist/popup.js', import.meta.url).href;

async function popup(t, responses = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'chrome-extension://fixture/popup.html', pretendToBeVisual: true });
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '1.0.2' }),
      sendMessage(message, callback) {
        const fallback = message.type === 'GET_AUTH'
          ? { isLoggedIn: true, userId: '1001', username: 'avichal15', avatarUrl: null }
          : message.type === 'GET_SETTINGS'
            ? { adBlockEnabled: true, ghostModeEnabled: false, ghostModeAuto: false, theme: 'dark' }
            : message.type === 'GET_DOWNLOADS' || message.type === 'GET_SCHEDULED_POSTS'
              ? [] : message.type === 'GET_AUDIENCE_SNAPSHOT' ? null : { success: true };
        queueMicrotask(() => callback?.(responses[message.type] ?? fallback));
      },
    },
    tabs: { create() {}, query(_query, callback) { callback([{ id: 7 }]); }, sendMessage() {} },
  };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, chrome, indexedDB, IDBKeyRange, MutationObserver: dom.window.MutationObserver });
  await import(`${draftsUrl}?test=${Date.now()}-${Math.random()}`);
  await import(`${popupUrl}?test=${Date.now()}-${Math.random()}`);
  t.after(() => dom.window.close());
  return dom.window;
}

async function settle(window, predicate = () => window.document.body.textContent.length > 0) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function clickByTitle(window, title) {
  const button = [...window.document.querySelectorAll('button')].find((item) => item.title === title || item.textContent.trim() === title);
  assert.ok(button, `Expected ${title} navigation control`);
  button.click();
}

const options = { concurrency: false };
test('popup consumes the top-level authenticated username and exposes every management page', options, async (t) => {
  const window = await popup(t); await settle(window);
  assert.match(window.document.body.textContent, /avichal15/);
  for (const page of ['Downloads', 'Drafts', 'Calendar', 'Audience', 'Ghost Mode', 'Settings']) { clickByTitle(window, page); await settle(window); assert.match(window.document.body.textContent, new RegExp(page)); }
});

test('downloads page renders durable account download history', options, async (t) => {
  const window = await popup(t, { GET_DOWNLOADS: [{ id: 'download-1', url: 'https://cdninstagram.com/media.jpg', filename: 'saved-photo.jpg', type: 'image', status: 'done', createdAt: Date.now() }] });
  await settle(window); clickByTitle(window, 'Downloads'); await settle(window, () => /saved-photo\\.jpg/.test(window.document.body.textContent));
  assert.match(window.document.body.textContent, /saved-photo\.jpg/); assert.match(window.document.body.textContent, /done/i);
});

test('drafts page lists only the authenticated account records', options, async (t) => {
  const window = await popup(t); await settle(window);
  await globalThis.InstaManagerDrafts.saveDraft('1001', { id: 'owned', type: 'post', caption: 'owned caption', createdAt: 1, updatedAt: 2 }, []);
  await globalThis.InstaManagerDrafts.saveDraft('2002', { id: 'foreign', type: 'post', caption: 'foreign caption', createdAt: 1, updatedAt: 3 }, []);
  clickByTitle(window, 'Drafts'); await settle(window, () => /owned caption/.test(window.document.body.textContent));
  assert.match(window.document.body.textContent, /owned caption/); assert.doesNotMatch(window.document.body.textContent, /foreign caption/);
});


