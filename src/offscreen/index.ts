import { muxMp4 } from './mp4-mux';

const MAX_BYTES = 128 * 1024 * 1024;
const blobs = new Map<string, ReturnType<typeof setTimeout>>();
let busy = false;

function release(url: string) {
  const timer = blobs.get(url);
  if (!timer) return;
  clearTimeout(timer);
  URL.revokeObjectURL(url);
  blobs.delete(url);
}

async function loadMedia(value: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      !['cdninstagram.com', 'fbcdn.net'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error('Only Instagram CDN streams can be merged.');
  }
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`Media download failed (${response.status}).`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('This stream exceeds the 128 MB local merging limit.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error('This stream exceeds the 128 MB local merging limit.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'instamanager-offscreen') return false;
  if (message.type === 'RELEASE_MEDIA' && typeof message.url === 'string') {
    release(message.url);
    sendResponse({ success: true });
    return false;
  }
  if (message.type !== 'MUX_MEDIA') return false;
  if (busy || blobs.size >= 2) {
    sendResponse({ success: false, error: 'Another reel is being saved. Wait for it to finish, then retry.' });
    return false;
  }
  busy = true;
  void (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      if (typeof message.videoUrl !== 'string' || typeof message.audioUrl !== 'string') throw new Error('Both media streams are required.');
      const [video, audio] = await Promise.all([loadMedia(message.videoUrl, controller.signal), loadMedia(message.audioUrl, controller.signal)]);
      const merged = muxMp4(video, audio);
      const url = URL.createObjectURL(new Blob([merged], { type: 'video/mp4' }));
      blobs.set(url, setTimeout(() => release(url), 10 * 60_000));
      sendResponse({ success: true, url });
    } catch (error) {
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Could not merge this reel.' });
    } finally {
      controller.abort();
      clearTimeout(timeout);
      busy = false;
    }
  })();
  return true;
});
