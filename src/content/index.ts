import inPageCss from './in-page/in-page.css?raw';
import { initMediaBar } from './in-page/media-bar';
import { initCreatorDock } from './in-page/creator-dock';
import type { SettingsState } from '../shared/types';
import { MESSAGE_TYPES } from './message-types';

type ExtractedMedia = {
  type: 'image' | 'video';
  url: string;
  postId: string;
  timestamp: number;
};

const defaultSettings: SettingsState = {
  adBlockEnabled: true,
  ghostModeEnabled: false,
  ghostModeAuto: false,
  theme: 'dark',
};

let currentSettings = defaultSettings;

function syncSettingsToPage() {
  window.postMessage(
    {
      source: 'insta-manager-content',
      type: 'UPDATE_SETTINGS',
      settings: currentSettings,
    },
    window.location.origin,
  );
}

function loadInitialSettings() {
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS }, (settings: SettingsState | undefined) => {
    if (chrome.runtime.lastError) return;
    if (settings) currentSettings = { ...defaultSettings, ...settings };

    if (currentSettings.ghostModeAuto && !currentSettings.ghostModeEnabled) {
      currentSettings.ghostModeEnabled = true;
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SET_GHOST, data: { enabled: true } });
    }

    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_GHOST }, (ghost: { enabled?: boolean } | undefined) => {
      if (!chrome.runtime.lastError && ghost?.enabled !== undefined) {
        currentSettings.ghostModeEnabled = ghost.enabled;
      }
      syncSettingsToPage();
    });
  });
}

function findPostId(element: Element): string {
  const owner = element.closest<HTMLElement>('[data-post-id], [data-reel-id]');
  return owner?.dataset.postId ?? owner?.dataset.reelId ?? '';
}

function extractMediaFromPage(): ExtractedMedia[] {
  const media: ExtractedMedia[] = [];

  document.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
    const url = video.currentSrc || video.src || video.querySelector('source')?.src || '';
    if (!url) return;
    media.push({ type: 'video', url, postId: findPostId(video), timestamp: Date.now() });
  });

  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const url = image.currentSrc || image.src;
    if (!url || (!url.includes('cdninstagram.com') && !url.includes('fbcdn.net'))) return;
    media.push({ type: 'image', url, postId: findPostId(image), timestamp: Date.now() });
  });

  return Array.from(new Map(media.map((item) => [item.url, item])).values());
}

chrome.runtime.onMessage.addListener((message: { type?: string; data?: unknown }, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.SET_GHOST) {
    const data = message.data as { enabled?: boolean } | undefined;
    currentSettings.ghostModeEnabled = Boolean(data?.enabled);
    syncSettingsToPage();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
    const data = message.data as Partial<SettingsState> | undefined;
    currentSettings = { ...currentSettings, ...data };
    syncSettingsToPage();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === MESSAGE_TYPES.EXTRACT_MEDIA) {
    sendResponse({ success: true, media: extractMediaFromPage() });
    return false;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.settings?.newValue) {
    currentSettings = { ...currentSettings, ...(changes.settings.newValue as SettingsState) };
  }
  if (changes.ghost?.newValue) {
    const ghost = changes.ghost.newValue as { enabled?: boolean };
    if (ghost.enabled !== undefined) currentSettings.ghostModeEnabled = ghost.enabled;
  }
  syncSettingsToPage();
});

window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.source !== 'insta-manager-page' ||
    event.data?.type !== 'ACTION_BLOCKED'
  ) {
    return;
  }

  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.ACTION_BLOCKED_EVENT,
    data: event.data.payload,
  });
});

function injectStyles() {
  if (document.getElementById('im-injected-styles')) return;
  const style = document.createElement('style');
  style.id = 'im-injected-styles';
  style.textContent = inPageCss;
  (document.head || document.documentElement).appendChild(style);
}

function startInPageFeatures() {
  injectStyles();
  initMediaBar();
  initCreatorDock();
}

loadInitialSettings();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startInPageFeatures, { once: true });
} else {
  startInPageFeatures();
}
