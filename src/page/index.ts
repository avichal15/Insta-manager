type InterceptionSettings = {
  ghostModeEnabled: boolean;
  adBlockEnabled: boolean;
};

type XhrMeta = {
  method: string;
  url: string;
};

const bridgeWindow = window as Window & { __instaManagerPageLoaded?: boolean };

if (!bridgeWindow.__instaManagerPageLoaded) {
  bridgeWindow.__instaManagerPageLoaded = true;

  const settings: InterceptionSettings = {
    ghostModeEnabled: false,
    adBlockEnabled: true,
  };

  const isBridgeMessage = (event: MessageEvent): boolean =>
    event.source === window &&
    event.origin === window.location.origin &&
    typeof event.data === 'object' &&
    event.data !== null;

  const notifyBlocked = (kind: 'dm_read' | 'story_view') => {
    window.postMessage(
      { source: 'insta-manager-page', type: 'ACTION_BLOCKED', payload: { type: kind } },
      window.location.origin,
    );
  };

  window.addEventListener('message', (event) => {
    if (!isBridgeMessage(event) || event.data.source !== 'insta-manager-content') return;

    if (event.data.type === 'UPDATE_SETTINGS') {
      settings.ghostModeEnabled = Boolean(event.data.settings?.ghostModeEnabled);
      settings.adBlockEnabled = event.data.settings?.adBlockEnabled !== false;
    }
  });

  const notifyLocationChange = () => window.dispatchEvent(new Event('insta-manager-location-change'));
  const originalPushState = history.pushState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    const previous = location.href;
    originalPushState(data, unused, url);
    if (location.href !== previous) notifyLocationChange();
  };
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    const previous = location.href;
    originalReplaceState(data, unused, url);
    if (location.href !== previous) notifyLocationChange();
  };
  window.addEventListener('popstate', notifyLocationChange);

  const bodyToText = (body: unknown): string => {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
    return '';
  };

  const classifyBlockedRequest = (url: string, body: string): 'dm_read' | 'story_view' | null => {
    if (!settings.ghostModeEnabled || !url.includes('instagram.com')) return null;
    if (body.includes('useIGDMarkThreadAsReadMutation') || body.includes('last_read_watermark_ts')) {
      return 'dm_read';
    }
    if (body.includes('PolarisStoriesV3SeenMutation') || body.includes('viewSeenAt')) {
      return 'story_view';
    }
    return null;
  };

  const originalWebSocketSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    const blockedKind = classifyBlockedRequest(window.location.origin, bodyToText(data));
    if (blockedKind) {
      notifyBlocked(blockedKind);
      return;
    }
    return originalWebSocketSend.call(this, data);
  };

  const stripAds = (value: unknown): { changed: boolean; value: unknown } => {
    let changed = false;

    const visit = (candidate: unknown): unknown => {
      if (Array.isArray(candidate)) {
        const cleaned = candidate
          .filter((item) => {
            if (!item || typeof item !== 'object') return true;
            const record = item as Record<string, unknown>;
            const node = record.node as Record<string, unknown> | undefined;
            const media = record.media as Record<string, unknown> | undefined;
            const isAd = Boolean(record.ad || record.is_ad || node?.ad || node?.is_ad || media?.ad);
            if (isAd) changed = true;
            return !isAd;
          })
          .map(visit);
        return cleaned;
      }

      if (!candidate || typeof candidate !== 'object') return candidate;
      const source = candidate as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(source)) {
        if (key === 'ad_media_items' && Array.isArray(child) && child.length > 0) {
          result[key] = [];
          changed = true;
        } else {
          result[key] = visit(child);
        }
      }
      return result;
    };

    const filtered = visit(value);
    return { changed, value: filtered };
  };

  const sanitizeResponseText = (text: string): string => {
    if (!settings.adBlockEnabled || !text) return text;
    try {
      const parsed: unknown = JSON.parse(text);
      const sanitized = stripAds(parsed);
      return sanitized.changed ? JSON.stringify(sanitized.value) : text;
    } catch {
      return text;
    }
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const suppliedUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const requestUrl = new URL(suppliedUrl, window.location.href).href;
    let body = bodyToText(init?.body);
    if (!body && input instanceof Request && !input.bodyUsed) {
      try {
        body = await input.clone().text();
      } catch {
        body = '';
      }
    }
    const blockedKind = classifyBlockedRequest(requestUrl, body);
    if (blockedKind) {
      notifyBlocked(blockedKind);
      return new Response('{"data":{}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const response = await originalFetch(input, init);
    if (!settings.adBlockEnabled || !requestUrl.includes('instagram.com') || !requestUrl.includes('graphql')) {
      return response;
    }

    try {
      const originalText = await response.clone().text();
      const sanitizedText = sanitizeResponseText(originalText);
      if (sanitizedText === originalText) return response;
      return new Response(sanitizedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };

  const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();
  const patchedResponses = new WeakSet<XMLHttpRequest>();
  const observedXhrs = new WeakSet<XMLHttpRequest>();
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const callXhrOpen = originalXhrOpen as unknown as (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean,
    username?: string | null,
    password?: string | null,
  ) => void;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ) {
    if (patchedResponses.has(this)) {
      for (const property of ['readyState', 'status', 'responseText', 'response']) {
        Reflect.deleteProperty(this, property);
      }
      patchedResponses.delete(this);
    }
    xhrMeta.set(this, { method, url: new URL(String(url), window.location.href).href });
    if (username !== undefined) {
      return callXhrOpen.call(this, method, url, async, username, password ?? null);
    }
    return callXhrOpen.call(this, method, url, async);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = xhrMeta.get(this);
    const blockedKind = meta ? classifyBlockedRequest(meta.url, bodyToText(body)) : null;
    if (blockedKind) {
      notifyBlocked(blockedKind);
      try {
        Object.defineProperties(this, {
          readyState: { configurable: true, value: XMLHttpRequest.DONE },
          status: { configurable: true, value: 200 },
          responseText: { configurable: true, value: '{"data":{}}' },
          response: { configurable: true, value: '{"data":{}}' },
        });
        patchedResponses.add(this);
      } catch {
        this.abort();
      }
      queueMicrotask(() => {
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new ProgressEvent('load'));
        this.dispatchEvent(new ProgressEvent('loadend'));
      });
      return;
    }

    if (meta?.url.includes('graphql') && !observedXhrs.has(this)) {
      observedXhrs.add(this);
      this.addEventListener(
        'readystatechange',
        () => {
          if (this.readyState !== XMLHttpRequest.DONE || this.status !== 200 || !xhrMeta.get(this)?.url.includes('graphql')) return;
          try {
            const originalText = this.responseText;
            const sanitizedText = sanitizeResponseText(originalText);
            if (sanitizedText !== originalText) {
              Object.defineProperties(this, {
                responseText: { configurable: true, value: sanitizedText },
                response: { configurable: true, value: sanitizedText },
              });
              patchedResponses.add(this);
            }
          } catch {
            // Non-text XHR responses are left untouched.
          }
        },
        { capture: true },
      );
    }

    return originalXhrSend.call(this, body);
  };

  type FiberNode = {
    memoizedProps?: Record<string, unknown>;
    return?: FiberNode | null;
  };

  type ResolvedMedia = { url: string; audioUrl?: string };
  type MediaResolution = ResolvedMedia | { unsupportedReason: string };

  const baseUrlFor = (representation: Element): string | null => {
    const ancestry: Element[] = [];
    for (let node: Element | null = representation; node; node = node.parentElement) {
      ancestry.unshift(node);
      if (node.tagName === 'MPD') break;
    }
    let resolved: string | null = null;
    for (const node of ancestry) {
      const base = Array.from(node.children).find((child) => child.tagName === 'BaseURL')?.textContent?.trim();
      if (!base) continue;
      try {
        resolved = new URL(base, resolved ?? window.location.href).href;
      } catch {
        return null;
      }
    }
    return resolved?.startsWith('https://') ? resolved : null;
  };

  const getHighestQualityDashUrl = (manifest: string): MediaResolution | null => {
    try {
      const documentXml = new DOMParser().parseFromString(manifest, 'application/xml');
      if (documentXml.querySelector('parsererror')) return { unsupportedReason: 'This media manifest could not be read.' };
      // DRM-protected and multi-segment manifests need a different download path.
      if (documentXml.querySelector('ContentProtection, SegmentTemplate, SegmentList')) {
        return { unsupportedReason: 'This media uses protected or segmented streaming and cannot be downloaded.' };
      }
      const allRepresentations = Array.from(documentXml.querySelectorAll('Representation'));
      const mediaType = (representation: Element) => {
        const adaptation = representation.closest('AdaptationSet');
        return representation.getAttribute('mimeType') || adaptation?.getAttribute('mimeType') || adaptation?.getAttribute('contentType') || '';
      };
      const videos = allRepresentations
        .filter((representation) => mediaType(representation).includes('video') || Number(representation.getAttribute('height')) > 0)
        .map((representation) => ({
          baseUrl: baseUrlFor(representation),
          height: Number(representation.getAttribute('height') ?? 0),
          bandwidth: Number(representation.getAttribute('bandwidth') ?? 0),
        }))
        .filter((entry): entry is { baseUrl: string; height: number; bandwidth: number } => Boolean(entry.baseUrl))
        .sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
      const videoUrl = videos[0]?.baseUrl;
      if (!videoUrl) return null;
      const audioUrl = allRepresentations
        .filter((representation) => mediaType(representation).includes('audio'))
        .map((representation) => ({ baseUrl: baseUrlFor(representation), bandwidth: Number(representation.getAttribute('bandwidth') || 0) }))
        .filter((entry): entry is { baseUrl: string; bandwidth: number } => Boolean(entry.baseUrl))
        .sort((a, b) => b.bandwidth - a.bandwidth)[0]?.baseUrl;
      return { url: videoUrl, ...(audioUrl ? { audioUrl } : {}) };
    } catch {
      return { unsupportedReason: 'This media manifest could not be read.' };
    }
  };

  const getFiberMediaUrl = (element: Element): MediaResolution | null => {
    const fiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    if (!fiberKey) return null;

    let fiber: FiberNode | null | undefined = (element as unknown as Record<string, FiberNode | undefined>)[fiberKey];
    let directUrl: ResolvedMedia | null = null;
    for (let depth = 0; fiber && depth < 80; depth += 1) {
      const props = fiber.memoizedProps;
      const manifest = props?.manifest;
      if (typeof manifest === 'string' && manifest.includes('<MPD')) {
        const dash = getHighestQualityDashUrl(manifest);
        if (dash) return dash;
      }
      for (const key of ['videoUrl', 'video_url', 'src']) {
        const value = props?.[key];
        if (!directUrl && typeof value === 'string' && value.startsWith('https://')) directUrl = { url: value };
      }
      fiber = fiber.return ?? null;
    }
    return directUrl;
  };

  const getImageUrl = (image: HTMLImageElement): string | null => {
    const candidates = image.srcset
      .split(',')
      .map((part) => part.trim().split(/\s+/))
      .map(([url, descriptor]) => ({ url, score: Number.parseInt(descriptor ?? '0', 10) || 0 }))
      .filter(({ url }) => url.startsWith('https://'))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.url || image.currentSrc || image.src || null;
  };

  window.addEventListener('message', (event) => {
    if (!isBridgeMessage(event) || event.data.source !== 'insta-manager-resolve-request') return;

    const requestId = typeof event.data.requestId === 'string' ? event.data.requestId : '';
    const targetValue = typeof event.data.targetVal === 'string' ? event.data.targetVal : '';
    const target = targetValue
      ? document.querySelector(`[data-im-target="${CSS.escape(targetValue)}"]`)
      : null;
    const video = target instanceof HTMLVideoElement ? target : target?.querySelector('video');
    const image = target instanceof HTMLImageElement ? target : target?.querySelector('img');

    let resolved: MediaResolution | null = null;
    if (video) {
      const fiberResolution = getFiberMediaUrl(video);
      const directUrl = video.currentSrc || video.src || video.querySelector('source')?.src || '';
      resolved = fiberResolution ?? (directUrl.startsWith('https://') ? { url: directUrl } : null);
    } else if (image) {
      const url = getImageUrl(image);
      resolved = url ? { url } : null;
    }

    window.postMessage(
      {
        source: 'insta-manager-resolve-response',
        requestId,
        url: resolved && 'url' in resolved ? resolved.url : null,
        audioUrl: resolved && 'url' in resolved ? resolved.audioUrl : undefined,
        unsupportedReason: resolved && 'unsupportedReason' in resolved ? resolved.unsupportedReason : undefined,
      },
      window.location.origin,
    );
  });
}
