// src/content/in-page/media-bar.ts
// Robust, layout-neutral in-page action bars and HD downloads for Instagram Reels, Feed Posts, and Stories.

export function initMediaBar() {
  type ResolvedMedia = { url: string; audioUrl?: string };
  type ResolveResult = ResolvedMedia | { unsupportedReason: string };
  const processedElements = new WeakSet<Element>();
  const reelControls = new WeakMap<HTMLVideoElement, { bar: HTMLElement; scrubber: HTMLElement }>();
  const feedControls = new WeakMap<HTMLElement, { bar: HTMLElement; getActiveMedia: () => HTMLElement | null }>();
  const pendingDownloads = new Map<string, HTMLElement>();
  let storyBar: HTMLElement | null = null;
  let reqIdCounter = 0;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // Instagram puts its hit-testing overlay in a sibling of the video-only stack.
  // Use the outer media-sized shell, not the immediate parent of <video>.
  function mediaHost(media: HTMLElement): HTMLElement | null {
    const bounds = media.getBoundingClientRect();
    let host = media.parentElement;
    if (!bounds.width || !bounds.height) return host;
    for (let node = host, depth = 0; node && depth < 20; node = node.parentElement, depth++) {
      if (['MAIN', 'BODY', 'HTML', 'ARTICLE'].includes(node.tagName)) break;
      const rect = node.getBoundingClientRect();
      if (Math.abs(rect.x - bounds.x) > 3 || Math.abs(rect.y - bounds.y) > 3 ||
          Math.abs(rect.width - bounds.width) > 3 || Math.abs(rect.height - bounds.height) > 3) break;
      host = node;
    }
    return host;
  }

  function prepareHost(host: HTMLElement) {
    host.classList.add('im-media-host');
    // Never change absolute/fixed positioning: that changes Instagram's layout.
    if (getComputedStyle(host).position === 'static') host.classList.add('im-media-host-static');
  }

  function mountReelControls(video: HTMLVideoElement, controls: { bar: HTMLElement; scrubber: HTMLElement }) {
    const host = mediaHost(video);
    if (!host) return;
    prepareHost(host);
    if (controls.bar.parentElement !== host) host.appendChild(controls.bar);
    if (controls.scrubber.parentElement !== host) host.appendChild(controls.scrubber);
  }

  const getDirectUrl = (element: HTMLElement): string | null => {
    if (element instanceof HTMLVideoElement) return element.currentSrc || element.src || null;
    if (element instanceof HTMLImageElement) return element.currentSrc || element.src || null;
    return null;
  };

  // Show status toast
  function showToast(message: string, duration = 3200) {
    let toast = document.getElementById('im-toast-container');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'im-toast-container';
      toast.className = 'im-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <div style="width: 18px; height: 18px; border-radius: 50%; background: #22c55e; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
    const label = document.createElement('span');
    label.style.lineHeight = '1.3';
    label.textContent = message;
    toast.appendChild(label);
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast?.classList.remove('show');
    }, duration);
  }

  // Resolves media URL by querying the page script (which inspects React Fiber and DASH manifests)
  async function resolveMediaUrl(element: HTMLElement): Promise<ResolveResult | null> {
    return new Promise((resolve) => {
      const reqId = `im-req-${++reqIdCounter}`;
      const tempAttr = 'data-im-target';
      element.setAttribute(tempAttr, reqId);

      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        element.removeAttribute(tempAttr);
        const url = getDirectUrl(element);
        resolve(url ? { url } : null);
      }, 1500);

      function onMsg(ev: MessageEvent) {
        if (ev.source !== window || ev.origin !== window.location.origin || !ev.data ||
            ev.data.source !== 'insta-manager-resolve-response' || ev.data.requestId !== reqId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        element.removeAttribute(tempAttr);
        if (typeof ev.data.unsupportedReason === 'string') {
          resolve({ unsupportedReason: ev.data.unsupportedReason });
          return;
        }
        const url = typeof ev.data.url === 'string' ? ev.data.url : getDirectUrl(element);
        resolve(url ? { url, audioUrl: typeof ev.data.audioUrl === 'string' ? ev.data.audioUrl : undefined } : null);
      }

      window.addEventListener('message', onMsg);
      window.postMessage({ source: 'insta-manager-resolve-request', requestId: reqId, targetAttr: tempAttr, targetVal: reqId }, window.location.origin);
    });
  }

  function triggerDownload(media: ResolvedMedia, filename: string, btn: HTMLElement) {
    const requestId = `im-download-${crypto.randomUUID()}`;
    pendingDownloads.set(requestId, btn);
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_MEDIA', data: { ...media, filename, requestId } }, (res) => {
      if (chrome.runtime.lastError) {
        pendingDownloads.delete(requestId);
        setButtonState(btn, 'idle');
        showToast('The extension was reloaded. Refresh Instagram and try again.');
      } else if (res?.success && Number.isInteger(res.downloadId)) {
        // The terminal worker event contains both IDs. Retain both routes so a
        // response cannot strand the control when one identifier arrives first.
        pendingDownloads.set(String(res.downloadId), btn);
        showToast(`Download in progress: ${filename}`, 90_000);
      } else {
        pendingDownloads.delete(requestId);
        setButtonState(btn, 'idle');
        showToast(res?.error || 'Chrome could not start this download.');
      }
    });
  }

  chrome.runtime.onMessage.addListener((message: { type?: string; data?: { requestId?: string; downloadId?: number; status?: 'done' | 'error'; error?: string } }) => {
    if (message.type !== 'DOWNLOAD_STATUS' || !message.data) return;
    const requestKey = message.data.requestId;
    const downloadKey = Number.isInteger(message.data.downloadId) ? String(message.data.downloadId) : undefined;
    const button = (requestKey && pendingDownloads.get(requestKey)) ?? (downloadKey && pendingDownloads.get(downloadKey));
    if (!button) return;
    for (const [key, pendingButton] of pendingDownloads) {
      if (pendingButton === button) pendingDownloads.delete(key);
    }
    if (message.data.status === 'done') {
      setButtonState(button, 'success');
      showToast('Download completed.');
    } else {
      setButtonState(button, 'idle');
      showToast(message.data.error || 'The download was interrupted.');
    }
  });

  function setButtonState(btn: HTMLElement, state: 'idle' | 'loading' | 'success') {
    (btn as HTMLButtonElement).disabled = state === 'loading';
    if (state === 'loading') {
      btn.innerHTML = `<div class="im-spinner"></div>`;
    } else if (state === 'success') {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        setButtonState(btn, 'idle');
      }, 2200);
    } else {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      `;
    }
  }

  function createDownloadButton(getTarget: () => HTMLElement | null, type: 'reel' | 'post' | 'story'): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'im-btn-wrap';

    const btn = document.createElement('button');
    btn.className = 'im-btn';
    btn.setAttribute('aria-label', `Download ${type}`);
    setButtonState(btn, 'idle');

    const tooltip = document.createElement('div');
    tooltip.className = 'im-tooltip';
    tooltip.textContent = `Download HD ${type.toUpperCase()}`;

    wrap.appendChild(btn);
    wrap.appendChild(tooltip);

    // CRITICAL: useCapture = true to intercept click BEFORE Instagram's player pauses or handles it
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      const el = getTarget();
      if (!el) {
        showToast('Media element not found');
        return;
      }

      setButtonState(btn, 'loading');
      showToast(`Resolving high-definition ${type}...`);

      const resolved = await resolveMediaUrl(el);

      if (!resolved) {
        setButtonState(btn, 'idle');
        showToast(`Could not extract video stream for this ${type}`);
        return;
      }
      if ('unsupportedReason' in resolved) {
        setButtonState(btn, 'idle');
        showToast(resolved.unsupportedReason);
        return;
      }

      const isVideo = el.tagName === 'VIDEO';
      const ext = isVideo ? 'mp4' : 'jpg';
      const timestamp = new Date().toISOString().slice(0, 10);
      const rand = Math.random().toString(36).substring(2, 7);
      const filename = `instagram-${type}-${timestamp}-${rand}.${ext}`;

      if (resolved.audioUrl) showToast('Downloading and merging video with audio locally…', 90_000);
      triggerDownload(resolved, filename, btn);
    }, true);

    return wrap;
  }

  function createOpenButton(getTarget: () => HTMLElement | null): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'im-btn-wrap';

    const btn = document.createElement('button');
    btn.className = 'im-btn';
    btn.setAttribute('aria-label', 'Open HD Media');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    `;

    const tooltip = document.createElement('div');
    tooltip.className = 'im-tooltip';
    tooltip.textContent = 'Open in New Tab';

    wrap.appendChild(btn);
    wrap.appendChild(tooltip);

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      const el = getTarget();
      if (!el) return;

      const media = await resolveMediaUrl(el);
      if (media && 'unsupportedReason' in media) {
        showToast(media.unsupportedReason);
      } else if (media?.audioUrl) {
        showToast('This reel has separate audio. Use Download to save both tracks together.');
      } else if (media?.url && /^https:\/\//.test(media.url)) {
        window.open(media.url, '_blank', 'noopener,noreferrer');
      }
    }, true);

    return wrap;
  }

  function createReelScrubber(video: HTMLVideoElement): HTMLElement {
    const scrubber = document.createElement('div');
    scrubber.className = 'im-reel-scrubber';
    scrubber.tabIndex = 0;
    scrubber.setAttribute('role', 'slider');
    scrubber.setAttribute('aria-label', 'Reel playback position');
    scrubber.setAttribute('aria-valuemin', '0');
    scrubber.setAttribute('aria-valuemax', '100');
    scrubber.setAttribute('aria-valuenow', '0');

    const progress = document.createElement('div');
    progress.className = 'im-reel-progress';

    const thumb = document.createElement('div');
    thumb.className = 'im-reel-thumb';

    progress.appendChild(thumb);
    scrubber.appendChild(progress);

    let isDragging = false;

    video.addEventListener('timeupdate', () => {
      if (video.duration && !isDragging) {
        const pct = (video.currentTime / video.duration) * 100;
        progress.style.setProperty('--im-progress', `${pct}%`);
        scrubber.setAttribute('aria-valuenow', String(Math.round(pct)));
      }
    });

    const seek = (e: MouseEvent) => {
      const rect = scrubber.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (video.duration) {
        video.currentTime = pos * video.duration;
        progress.style.setProperty('--im-progress', `${pos * 100}%`);
        scrubber.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
      }
    };

    scrubber.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      isDragging = true;
      seek(e);

      const onMouseMove = (ev: MouseEvent) => {
        seek(ev);
      };
      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }, true);

    scrubber.addEventListener('keydown', (event) => {
      if (!video.duration || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') video.currentTime = 0;
      else if (event.key === 'End') video.currentTime = video.duration;
      else video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (event.key === 'ArrowRight' ? 5 : -5)));
    });

    return scrubber;
  }

  // --- 1. Dedicated Reels View (/reels/ or /reel/<id>/ or modal) ---
  function attachToReelClips() {
    const isReelsPage = window.location.pathname.includes('/reel') || window.location.pathname.includes('/reels');

    // On dedicated reels page, query video players
    const videos = document.querySelectorAll<HTMLVideoElement>('main video, div[role="dialog"] video');

    videos.forEach(video => {
      const existing = reelControls.get(video);
      if (existing) { mountReelControls(video, existing); return; }
      if (processedElements.has(video)) return;

      // Ensure we only attach to vertical reels, not square feed posts unless on reels page
      if (!isReelsPage && !video.closest('.PolarisClipsTabDesktopClip, .PolarisClipsDesktopVideoPlayer, div[data-reel-id]')) {
        return;
      }

      const parentContainer = mediaHost(video);
      if (!parentContainer) return;

      processedElements.add(video);

      // Create floating action bar for Reel
      const bar = document.createElement('div');
      bar.className = 'im-media-bar im-media-bar-reel';

      bar.appendChild(createDownloadButton(() => video, 'reel'));
      bar.appendChild(createOpenButton(() => video));

      // Append directly adjacent or into the video container without modifying layout
      // Append video scrubber
      const scrubber = createReelScrubber(video);
      const controls = { bar, scrubber };
      reelControls.set(video, controls);
      mountReelControls(video, controls);
      video.addEventListener('loadedmetadata', () => mountReelControls(video, controls));
    });
  }

  // --- 2. Feed Posts (Home feed articles) ---
  function attachToFeedPosts() {
    const articles = document.querySelectorAll<HTMLElement>('article[role="presentation"], article');
    const isUsableImage = (candidate: HTMLImageElement) => candidate.clientWidth >= 200 || candidate.naturalWidth >= 300;
    const getActiveMediaFor = (article: HTMLElement): HTMLElement | null => {
      const candidates = [
        ...Array.from(article.querySelectorAll<HTMLVideoElement>('video')),
        ...Array.from(article.querySelectorAll<HTMLImageElement>('img[srcset], img[src*="cdninstagram"], img[src*="fbcdn"]')).filter(isUsableImage),
      ].filter((candidate) => !candidate.closest('[aria-hidden="true"]'));
      const articleRect = article.getBoundingClientRect();
      const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const articleHasArea = articleRect.width > 0 && articleRect.height > 0;
      const articleCenterX = articleHasArea ? (articleRect.left + articleRect.right) / 2 : window.innerWidth / 2;
      const articleCenterY = articleHasArea ? (articleRect.top + articleRect.bottom) / 2 : window.innerHeight / 2;
      const scored = candidates.map((media) => {
        const rect = media.getBoundingClientRect();
        const area = rect.width * rect.height;
        const clip = articleHasArea ? {
          left: Math.max(viewport.left, articleRect.left),
          top: Math.max(viewport.top, articleRect.top),
          right: Math.min(viewport.right, articleRect.right),
          bottom: Math.min(viewport.bottom, articleRect.bottom),
        } : viewport;
        const visibleWidth = Math.max(0, Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top));
        const visibleRatio = area > 0 ? (visibleWidth * visibleHeight) / area : 0;
        const centerDistance = Math.hypot(
          (rect.left + rect.right) / 2 - articleCenterX,
          (rect.top + rect.bottom) / 2 - articleCenterY,
        );
        return { media, area, visibleRatio, centerDistance };
      }).filter(({ area, visibleRatio }) => area > 0 && visibleRatio > 0)
        .sort((left, right) => right.visibleRatio - left.visibleRatio || left.centerDistance - right.centerDistance || right.area - left.area);
      return scored[0]?.media ?? candidates[0] ?? null;
    };

    articles.forEach((article) => {
      const existing = feedControls.get(article);
      if (existing) {
        const activeMedia = existing.getActiveMedia();
        const host = activeMedia && mediaHost(activeMedia);
        if (!host) {
          existing.bar.remove();
          feedControls.delete(article);
          return;
        }
        prepareHost(host);
        if (existing.bar.parentElement !== host) host.appendChild(existing.bar);
        return;
      }

      const media = getActiveMediaFor(article);
      const mediaWrapper = media && mediaHost(media);
      if (!media || !mediaWrapper) return;
      prepareHost(mediaWrapper);
      processedElements.add(article);

      const bar = document.createElement('div');
      bar.className = 'im-media-bar';
      const getActiveMedia = () => getActiveMediaFor(article);
      bar.appendChild(createDownloadButton(getActiveMedia, media instanceof HTMLVideoElement ? 'reel' : 'post'));
      bar.appendChild(createOpenButton(getActiveMedia));
      mediaWrapper.appendChild(bar);
      feedControls.set(article, { bar, getActiveMedia });
    });
  }

  // --- 3. Stories View (/stories/) ---
  function attachToStories() {
    if (!window.location.pathname.includes('/stories/')) {
      storyBar?.remove();
      storyBar = null;
      return;
    }

    const activeStoryMedia = (): HTMLElement | null => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('video, img'))
        .filter((media) => !media.closest('.im-creator-dock, .im-media-bar, .im-toast'))
        .filter((media) => !(media instanceof HTMLImageElement) || media.naturalWidth >= 300)
        .map((media) => {
          const rect = media.getBoundingClientRect();
          const area = rect.width * rect.height;
          const intersectsViewport = rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
          const hidden = Boolean(media.closest('[aria-hidden="true"]'));
          const video = media instanceof HTMLVideoElement;
          const naturalArea = media instanceof HTMLImageElement ? media.naturalWidth * media.naturalHeight : 0;
          const score = hidden || !intersectsViewport || area < 40_000 ? -1
            : area * 1_000 + Number(video) + (video ? media.currentTime : 0) + naturalArea / 1_000_000_000;
          return { media, score };
        })
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score);
      return candidates[0]?.media ?? null;
    };

    const media = activeStoryMedia();
    if (!media) return;
    const host = mediaHost(media);
    if (!host) return;
    prepareHost(host);

    if (!storyBar) {
      storyBar = document.createElement('div');
      storyBar.className = 'im-media-bar im-media-bar-story';
      storyBar.appendChild(createDownloadButton(activeStoryMedia, 'story'));
      storyBar.appendChild(createOpenButton(activeStoryMedia));
    }
    if (storyBar.parentElement !== host) host.appendChild(storyBar);
  }

  function runSweep() {
    attachToReelClips();
    attachToFeedPosts();
    attachToStories();
  }

  runSweep();
  window.addEventListener('resize', runSweep);
  window.addEventListener('insta-manager-location-change', runSweep);
  document.addEventListener('visibilitychange', runSweep);
  document.addEventListener('loadeddata', runSweep, true);

  // Throttled observer for infinite scroll
  let throttleTimer: number | null = null;
  const observer = new MutationObserver(() => {
    if (!window.location) return;
    if (window.location.pathname.includes('/stories/')) {
      runSweep();
      return;
    }
    if (throttleTimer) return;
    throttleTimer = window.setTimeout(() => {
      throttleTimer = null;
      runSweep();
    }, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
