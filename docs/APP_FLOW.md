# Application Flow & Architecture Document

## Project: InstaManager (Instagram Assistant & Growth Suite)
- **Document Version**: 1.0.0
- **Author**: Avichal Goyal (Mythos / Antigravity)

---

## 1. System Topology & Architecture

```mermaid
graph TD
    subgraph Browser ["User Browser Context"]
        User((User))
        ChromeToolbar["Chrome Extension Toolbar"]
    end

    subgraph InstagramTab ["Instagram Tab (https://www.instagram.com/)"]
        DOM["Instagram DOM (Comet / Polaris)"]
        Reels["Reel Players & Videos"]
        Feed["Feed Articles & Stories"]
        CS["Content Script (cs.js / Isolated World)"]
        MainWorld["Injected Engine (Main World / React Fiber)"]
        MediaBar["In-Page Media Action Bar (.im-media-bar)"]
        Scrubber["In-Player Video Scrubber"]
        AssistantUI["Post Assistant & Calendar Modal"]
    end

    subgraph ExtensionHost ["Extension Background Environment"]
        SW["Background Service Worker (bg.js)"]
        Alarms["chrome.alarms"]
        Downloads["chrome.downloads"]
        Storage["chrome.storage.local"]
    end

    User -->|Views / Browses| DOM
    ChromeToolbar -->|Clicks Icon| SW
    SW -->|Focuses or Creates Tab| InstagramTab
    CS -->|MutationObserver Watches| DOM
    CS -->|Injects Overlay| MediaBar
    CS -->|Injects on Reels| Scrubber
    CS -->|Injects Launcher & Modal| AssistantUI

    MediaBar -->|Capture Phase Click| CS
    CS -->|postMessage| MainWorld
    MainWorld -->|Inspects __reactFiber$| Reels
    MainWorld -->|Parses XML DASH <MPD>| MainWorld
    MainWorld -->|Returns 1080p MP4 URL| CS

    CS -->|sendMessage DOWNLOAD_MEDIA| SW
    SW -->|Downloads File| Downloads
    Downloads -->|Saves .mp4 / .jpg| User

    AssistantUI -->|Schedule Post| Storage
    Storage -->|Registers Time| Alarms
    Alarms -->|Fires Notification| SW
```

---

## 2. Core User Workflows & Sequence Diagrams

### 2.1 Workflow 1: In-Page Reel Browsing & 1-Click HD Download

When a user watches any Reel on Instagram, the floating download button appears seamlessly over the video.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Reel as Reel Video Player (DOM)
    participant Bar as MediaActionBar (.im-media-bar)
    participant CS as Content Script (cs.js)
    participant Page as Page Context (Main World)
    participant SW as Service Worker (bg.js)
    participant Chrome as Chrome Downloads API

    Reel->>CS: MutationObserver detects new video node
    CS->>Bar: Mounts circular download button (z-index: 99999)
    Note over Bar: Button fades in with subtle glassmorphism

    User->>Bar: Clicks Download Button (Capture Phase: true)
    Bar->>Bar: e.stopPropagation() (Prevents video pause)
    Bar->>Bar: Sets button state to animated spinner
    Bar->>CS: Requests media resolution for video element

    CS->>Page: window.postMessage("insta-manager-resolve-request")
    Note over Page: Inspects video.__reactFiber$...<br/>Walks fiber tree to find manifest props<br/>Locates XML DASH <MPD> string
    Page->>Page: Parses MPD; selects video/audio representations and resolves inherited BaseURLs
    alt supported single-file media
        Page-->>CS: { url: directMediaUrl }
    else supported split tracks
        Page-->>CS: { url: videoUrl, audioUrl: audioUrl }
    else protected or segmented media
        Page-->>CS: { unsupportedReason }
        CS->>Bar: Returns to Idle and displays truthful error toast
    end

    CS->>SW: chrome.runtime.sendMessage({ type: "DOWNLOAD_MEDIA", data: { url, audioUrl?, filename, requestId } })
    opt separate audio
        SW->>SW: Uses extension offscreen document to remux local video and audio tracks
    end
    SW->>Chrome: chrome.downloads.download({ url, filename, saveAs: false })
    Chrome-->>SW: onChanged terminal state
    SW-->>CS: DOWNLOAD_STATUS { requestId, status: done | error }
    alt completed
        CS->>Bar: Sets button state to green checkmark (✓)
        CS->>User: Displays "Download completed" toast
    else interrupted
        CS->>Bar: Returns button to Idle
        CS->>User: Displays error toast
    end
```

---

### 2.2 Workflow 2: Ghost Mode Privacy Shield (DMs & Stories)

Ghost Mode operates transparently in the background, suppressing read indicators while keeping the UI fully responsive.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant IG_UI as Instagram Web UI
    participant PageWS as Patched WebSocket (Page Context)
    participant PageXHR as Patched XMLHttpRequest (Page Context)
    participant IG_Server as Instagram GraphQL / Comet Backend

    Note over User, IG_UI: User opens Direct Message thread
    IG_UI->>PageWS: send(binaryPacket with 'last_read_watermark_ts')
    PageWS->>PageWS: Checks Ghost Mode: ACTIVE
    Note over PageWS: Drops packet silently<br/>Logs: [GhostMode] Blocked DM read receipt watermark
    PageWS--xIG_Server: Packet NEVER transmitted!

    Note over User, IG_UI: User views a Friend's Story
    IG_UI->>PageXHR: POST /api/graphql (PolarisStoriesV3SeenMutation)
    PageXHR->>PageXHR: Checks Ghost Mode: ACTIVE
    Note over PageXHR: Drops network dispatch<br/>Fakes readyState=4, status=200, response={"data":{}}
    PageXHR-->>IG_UI: Simulates successful response (Zero UI flicker)
    PageXHR--xIG_Server: Seen Mutation NEVER transmitted!

    Note over User, IG_UI: Result: Story viewed anonymously, DMs read without seen receipt!
```

---

### 2.3 Workflow 3: Post Assistant & Content Scheduling

Creators can craft and queue content directly from the in-page assistant without navigating away.

```mermaid
sequenceDiagram
    autonumber
    actor Creator
    participant Launcher as Floating IM Assistant Launcher
    participant Modal as Post Assistant Modal
    participant Storage as chrome.storage.local
    participant Alarms as chrome.alarms
    participant SW as Service Worker (bg.js)

    Creator->>Launcher: Clicks "IM Post Assistant" (or Extension Toolbar Icon)
    Launcher->>Modal: Opens with glassmorphism transition
    
    Creator->>Modal: Selects format: [Reel]
    Creator->>Modal: Drops MP4 video into preview dropzone
    Modal->>Modal: Renders real-time video player with preview download button
    
    Creator->>Modal: Selects "Schedule" pill
    Modal->>Modal: Displays current Month Calendar with optimal time highlights
    Creator->>Modal: Selects Target Date (e.g., 18th) & Time (e.g., 14:00)
    Creator->>Modal: Writes caption with #hashtags
    
    Creator->>Modal: Clicks "Schedule Post"
    Modal->>Storage: Appends post item to scheduledQueue
    Modal->>Alarms: Registers alarm for target timestamp
    Modal->>Creator: Shows the queued draft and due time

    Note over Alarms, SW: At scheduled timestamp:
    Alarms->>SW: Fires onAlarm event
    SW->>SW: Retrieves post draft from storage
    SW->>Creator: Displays Desktop System Notification: "Scheduled Reel ready to publish!"
```

---

### 2.4 Workflow 4: Interactive Reel Video Scrubber

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Scrubber as .im-reel-scrubber
    participant Progress as .im-reel-progress
    participant Video as HTMLVideoElement

    Video->>Progress: timeupdate event -> updates width % (currentTime / duration)
    
    User->>Scrubber: mousedown / drag along scrubber
    Scrubber->>Scrubber: e.stopPropagation() (Prevents pause/fullscreen)
    Scrubber->>Video: Calculates mouse pos % -> sets video.currentTime = pos * duration
    Video->>Video: Seeks immediately to selected frame
    
    User->>Scrubber: mouseup -> scrubber settles at new timestamp
```

---

## 3. Component Interaction Matrix

| Initiating Component | Target Component | Protocol / API | Data Exchanged |
| :--- | :--- | :--- | :--- |
| **Content Script (`cs.js`)** | Injected Page Script | `window.postMessage` | `{ source, requestId, targetAttr, targetVal }` |
| **Injected Page Script** | Content Script (`cs.js`) | `window.postMessage` | `{ source, requestId, url: "https://..." }` |
| **Content Script (`cs.js`)** | Service Worker (`bg.js`) | `chrome.runtime.sendMessage` | `{ type: "DOWNLOAD_MEDIA", data: { url, filename } }` |
| **Service Worker (`bg.js`)** | Content Script (`cs.js`) | `chrome.tabs.sendMessage` | `{ type: "TOGGLE_ASSISTANT" }` |
| **Service Worker (`bg.js`)** | Chrome Download Manager | `chrome.downloads.download` | `{ url, filename, saveAs: false }` |
| **Service Worker (`bg.js`)** | Chrome Cookie Jar | `chrome.cookies.get / getAll` | `sessionid`, `csrftoken`, `ds_user_id` |
| **Post Assistant UI** | Extension Storage | `chrome.storage.local` | `{ scheduledPosts: [...], ghostSettings: {...} }` |

---

## 4. State Transition Model: Media Downloader Button

```mermaid
stateDiagram-v2
    [*] --> Idle: Mounted on Media Element
    Idle --> Loading: User Clicks Download Button
    note right of Loading
        - Spawns animated spinner
        - Traverses React Fiber tree
        - Parses XML DASH manifest
        - Dispatches chrome.downloads
    end note
    Loading --> Success: Direct CDN stream acquired
    note right of Success
        - Green checkmark ✓ displays
        - Toast notification shows
        - File writing initiated
    end note
    Loading --> Error: Failed to locate stream
    note right of Error
        - Shows error toast
        - Reverts to Idle
    end note
    Success --> Idle: After 2200ms timeout
```
