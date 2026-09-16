import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { createFile } from 'mp4box';

const bundle = (await readFile(new URL('../dist/offscreen.js', import.meta.url), 'utf8'))
  .replace(/import\s*["'][^"']*modulepreload-polyfill[^"']*["'];?/, '');
const video = await readFile(new URL('fixtures/video-only.mp4', import.meta.url));
const audio = await readFile(new URL('fixtures/audio-only.mp4', import.meta.url));

function offscreen(t) {
  let listener;
  let calls = 0;
  let fetchError = false;
  const urls = new Map();
  const timers = new Set();
  class LocalURL extends URL {
    static createObjectURL(blob) { const url = `blob:chrome-extension://fixture/${urls.size}`; urls.set(url, blob); return url; }
    static revokeObjectURL(url) { urls.delete(url); }
  }
  const context = vm.createContext({
    console, URL: LocalURL, Blob, AbortController, TextDecoder, TextEncoder, ArrayBuffer, Uint8Array,
    setTimeout(fn, delay) { const timer = setTimeout(fn, delay); timer.unref(); timers.add(timer); return timer; },
    clearTimeout,
    chrome: { runtime: { id: 'fixture', onMessage: { addListener(fn) { listener = fn; } } } },
    fetch: async (url) => {
      calls++;
      if (fetchError) return new Response('', { status: 403 });
      return new Response(url.pathname.includes('audio') ? audio : video);
    },
  });
  try { vm.runInContext(bundle, context); }
  catch (error) { throw new Error(`Offscreen bundle could not initialize: ${error.message}`); }
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  return {
    urls, get calls() { return calls; }, failFetch() { fetchError = true; },
    send(message) { return new Promise((resolve) => listener({ target: 'instamanager-offscreen', ...message }, { id: 'fixture' }, resolve)); },
    listener,
  };
}

test('built offscreen bundle fetches both CDN streams, merges, and releases its Blob', async (t) => {
  const host = offscreen(t);
  const result = await host.send({ type: 'MUX_MEDIA', videoUrl: 'https://cdninstagram.com/video.mp4', audioUrl: 'https://cdninstagram.com/audio.mp4' });
  assert.equal(result.success, true, result.error);
  assert.equal(host.calls, 2);
  const file = createFile();
  let movie;
  file.onReady = (info) => { movie = info; };
  file.appendBuffer(Object.assign(await host.urls.get(result.url).arrayBuffer(), { fileStart: 0 }));
  file.flush();
  assert.equal(movie.videoTracks.length, 1);
  assert.equal(movie.audioTracks.length, 1);
  await host.send({ type: 'RELEASE_MEDIA', url: result.url });
  assert.equal(host.urls.size, 0);
});

test('built offscreen bundle rejects foreign senders and non-CDN URLs', async (t) => {
  const host = offscreen(t);
  assert.equal(host.listener({ target: 'instamanager-offscreen', type: 'MUX_MEDIA' }, { id: 'another-extension' }, () => assert.fail('foreign reply')), false);
  const result = await host.send({ type: 'MUX_MEDIA', videoUrl: 'https://example.com/video.mp4', audioUrl: 'https://example.com/audio.mp4' });
  assert.equal(result.success, false);
  assert.match(result.error, /Only Instagram CDN/);
  assert.equal(host.calls, 0);
});

test('built offscreen bundle reports a failed stream without producing a partial download', async (t) => {
  const host = offscreen(t);
  host.failFetch();
  const result = await host.send({ type: 'MUX_MEDIA', videoUrl: 'https://cdninstagram.com/video.mp4', audioUrl: 'https://cdninstagram.com/audio.mp4' });
  assert.equal(result.success, false);
  assert.match(result.error, /403/);
  assert.equal(host.urls.size, 0);
});
