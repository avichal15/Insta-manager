# Technical Requirements Document (TRD)

## Project: InstaManager (Instagram Assistant & Growth Suite)
- **Document Version**: 1.0.0
- **Author**: Avichal Goyal (Mythos / Antigravity)
- **Status**: In development; not accepted. Build success is not end-to-end verification.
- **Target Runtime**: Google Chrome 123+ (Manifest V3)

---

## 1. System Overview & Technology Stack

InstaManager is engineered as a high-performance Chrome Extension complying with **Manifest V3**. It operates across 5 decoupled execution tiers to safely bridge browser capabilities with Instagram's web runtime.

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Service Worker** | Vanilla ES6+ TypeScript / JS | State synchronization, cookie monitoring, `chrome.downloads`, `chrome.alarms` scheduler. |
| **Content Script** | TypeScript / DOM Observers | Isolated world script detecting DOM nodes, injecting stylesheets, and managing UI overlays. |
| **Injected Page Script** | TypeScript / Main world content script | Patches fetch, XHR, and WebSockets and reads media details exposed through React Fiber. |
| **In-page Assistant** | TypeScript / scoped CSS | Media preview, captions, local schedule queue, Ghost Mode controls, and native composer handoff. |

---

## 2. Multi-Tier Execution Model & Security Architecture

Chrome Manifest V3 enforces strict boundary isolation. The system coordinates across these contexts:

```
+-----------------------------------------------------------------------------------+
| CHROME EXTENSION HOST                                                             |
|                                                                                   |
|  +-------------------------------------+                                          |
|  | Background Service Worker           |                                          |
|  | - chrome.cookies login status       |                                          |
|  | - chrome.downloads.download()       |                                          |
|  | - chrome.alarms + notifications     |                                          |
|  | - storage-backed draft queue        |                                          |
|  +-------------------------------------+                                          |
+-------------------^---------------------------------------------------------------+
                    | chrome.runtime.sendMessage()
+-------------------v---------------------------------------------------------------+
| CONTENT SCRIPT (cs.js - ISOLATED WORLD)                                           |
| - MutationObserver for Feed, Reels, and Stories                                    |
| - Mounts .im-media-bar & .im-reel-scrubber with Capture-phase Click Interceptors   |
| - Injects in-page styles via <style id="im-injected-styles">                       |
| - Hosts the Post Assistant UI Shell                                               |
+-------------------^---------------------------------------------------------------+
                    | window.postMessage()
+-------------------v---------------------------------------------------------------+
| WEBPAGE EXECUTION CONTEXT (MAIN WORLD)                                            |
| - Window context of https://www.instagram.com/                                     |
| - React Fiber Root Access (__reactFiber$...)                                       |
| - XML DASH Manifest (<MPD>) Parser -> 1080p MP4 BaseURL extraction                 |
| - WebSocket Prototype Patch (last_read_watermark_ts suppression)                   |
| - XMLHttpRequest Prototype Patch (GraphQL read receipts & Story Seen mutations)    |
+-----------------------------------------------------------------------------------+
```

---

## 3. Reverse-Engineered Instagram Interception Mechanics

### 3.1 HD Video Extraction via React Fiber & DASH Manifests

A playing Reel can expose an ephemeral `blob:https://www.instagram.com/...` source backed by MediaSource Extensions (MSE), which Chrome Downloads cannot consume directly. The MAIN-world resolver instead walks the media element's React Fiber ancestry for manifest-like values and parses each MPD.

For each manifest it:

1. Rejects `ContentProtection`, `SegmentTemplate`, and `SegmentList` media with an explicit unsupported reason rather than attempting a broken download.
2. Separates video representations from audio representations (a larger audio bandwidth never outranks video quality).
3. Selects the highest usable video rendition and, where present, its highest usable audio rendition.
4. Resolves the nearest representation/adaptation/period/MPD `BaseURL` hierarchy with `new URL(relativeBaseUrl, inheritedBaseUrl)` so both relative and inherited URLs work.
5. Returns video plus optional audio URLs to the isolated content script. The worker routes split tracks to the extension offscreen remuxer and downloads the resulting local Blob.

A normal direct `https:` source is only used when Fiber metadata did not yield any resolver result. The bridge returns an explicit `unsupportedReason` to prevent invalid blob/direct fallbacks.

### 3.2 Ghost Mode: WebSocket & GraphQL Interception
Instagram notifies servers of user viewing activity through two concurrent protocols:

1. **WebSocket DM Watermark**:
   - Packets containing `last_read_watermark_ts` signal that a direct message was viewed.
   - The injected script monkey-patches `WebSocket.prototype.send`:
     ```javascript
     const originalSend = WebSocket.prototype.send;
     WebSocket.prototype.send = function(data) {
       if (isGhostEnabled && typeof data === 'string' && data.includes('last_read_watermark_ts')) {
         console.log('[GhostMode] Blocked DM read receipt watermark');
         return; // Drop packet
       }
       return originalSend.apply(this, arguments);
     };
     ```
2. **GraphQL Story Seen & DM Seen Mutations**:
   - `useIGDMarkThreadAsReadMutation`: Marks DM thread read.
   - `PolarisStoriesV3SeenMutation`: Registers story view.
   - Intercepted on `XMLHttpRequest.prototype.send`:
     ```javascript
     const originalXhrSend = XMLHttpRequest.prototype.send;
     XMLHttpRequest.prototype.send = function(body) {
       if (isGhostEnabled && this._method === 'POST' && typeof body === 'string') {
         if (body.includes('useIGDMarkThreadAsReadMutation') || 
             body.includes('PolarisStoriesV3SeenMutation') || 
             body.includes('viewSeenAt')) {
           // Fake HTTP 200 success to avoid UI breakage
           Object.defineProperty(this, 'readyState', { value: 4 });
           Object.defineProperty(this, 'status', { value: 200 });
           Object.defineProperty(this, 'responseText', { value: '{"data":{}}' });
           this.onload?.();
           return;
         }
       }
       return originalXhrSend.apply(this, arguments);
     };
     ```

### 3.3 Ad Blocker: Feed & Story Filtering
Sponsored items are pruned in-flight on `/graphql/query`:
- Story ads: `json.data.xdt_injected_story_units.ad_media_items = []`
- Feed ads: Filter `json.data.xdt_api__v1__feed__timeline__connection.edges` where `edge.node.ad` is present.

---

## 4. UI Layout Preservation & Click Interception

### 4.1 Zero Layout Side-Effects
To prevent the "squared reel" bug:
- **No dimension mutations**: InstaManager does not change media width, height, or aspect ratio.
- **Scoped positioning**: Media wrappers receive only the `.im-media-host` positioning class so controls anchor to the correct player.
- **Feed vs. Reel Separation**: The interactive video scrubber is strictly restricted to dedicated Reel players (`/reels/`, `/reel/<id>/`, modal view); feed posts remain untouched.

### 4.2 DOM Capture-Phase Event Binding
Instagram's video player overlays have click listeners that toggle play/pause and capture events. To guarantee button responsiveness:
- Buttons use `useCapture: true`:
  ```typescript
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    handleDownload();
  }, true); // Capture phase ensures execution before Instagram's listeners
  ```
- `.im-media-bar` sets `z-index: 99999 !important; pointer-events: auto !important;`.

---

## 5. Independent Implementation Boundary

The production bundle is generated only from `src/`, `manifest.json`, and the project icons. The copied `inssist-source/` directory is reference material and is not copied into `dist/`. InstaManager has no subscription, billing, or license-bypass code.

---

## 6. Manifest V3 Configuration

The root `manifest.json` is the source of truth. It declares separate isolated-world and `MAIN`-world content scripts, the background service worker, restricted Instagram/CDN host access, and only the permissions used by the current build.

---

## 7. Build, Verification & Testing Protocols

1. **Unpacked Loading Validation**:
   - Confirm `_metadata` directory is deleted.
   - Confirm `key` attribute is omitted to prevent extension ID collision.
   - Confirm `update_url` is removed to prevent Chrome Web Store overwrites.
2. **Download Execution Test**:
   - Test public single video Reel.
   - Test multi-slide Carousel post.
   - Test active Story.
   - Confirm Chrome saves `.mp4` / `.jpg` directly to `Downloads` with clean filenames (`instagram-reel-YYYY-MM-DD-xxxxx.mp4`).
3. **Ghost Mode Validation**:
   - View an incoming Direct Message; verify on sender's device that "Seen" watermark is NOT added.
   - View a user's Story; verify on poster's viewer list that the account does not appear.
