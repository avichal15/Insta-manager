# Product Requirements Document (PRD)

## Project Name: InstaManager (Instagram Assistant & Growth Suite)
- **Document Version**: 1.0.0
- **Author**: Avichal Goyal (Mythos / Antigravity)
- **Status**: In development; not accepted. Full UI-to-result acceptance is tracked in `ACCEPTANCE_MATRIX.md`.
- **Platform**: Google Chrome Extension (Manifest V3)
- **Target Audience**: Instagram Creators, Social Media Managers, Marketers, Power Users

---

## 1. Executive Summary & Product Vision

**InstaManager** is an all-in-one Instagram workflow accelerator and creator companion built as a Chrome Extension. Unlike standard popup extensions that disconnect the user from Instagram, InstaManager embeds directly into the Instagram web interface (`instagram.com`), enhancing the native experience with professional creator tools:

- Direct 1-click HD media downloads for Reels, Posts, and Stories.
- In-player video scrubbers for Reels.
- A full-featured Post Assistant for crafting and scheduling Posts, Reels, and Stories.
- A complete content calendar with optimal posting time recommendations.
- Privacy-first Ghost Mode that hides DM read receipts and Story views.
- Ad-free browsing by filtering sponsored timeline and story units.
- Local draft scheduling and publishing reminders.

The extension is an independent local implementation with no subscriptions or license checks.

---

## 2. Problem Statement & Market Opportunity

| Instagram Desktop Limitation | User Pain Point | InstaManager Solution |
| :--- | :--- | :--- |
| **No Media Downloader** | Creators cannot download their own or inspirational high-res reels/posts without sketchy third-party websites with spam ads. | In-page circular action button on every video/photo providing 1-click lossless HD downloads. |
| **No Video Scrubber on Reels** | Users cannot seek forward or backward in Reels; if they miss a detail, they must watch the entire reel again. | Native interactive progress bar injected beneath the Reel with drag-to-seek support. |
| **Limited Desktop Publishing** | Scheduling Reels/Stories on desktop is fragmented across Meta Business Suite, which is slow and clunky. | In-page Post Assistant modal with multi-asset uploads, caption formatting, and automated scheduling. |
| **Forced Read Receipts** | Viewing a DM marks it as read immediately; viewing a story adds you to the viewer list. | Real-time WebSocket & GraphQL interception suppressing read receipts and seen marks (Ghost Mode). |
| **Aggressive Ads** | Timeline and Stories are saturated with sponsored units. | Seamless network response filtering removing sponsored nodes from GraphQL feed queries. |

---

## 3. User Personas

### Persona A: The Content Creator (Primary)
- **Goal**: Publish Reels and Stories on a consistent schedule, research viral formats, download inspiration media in HD.
- **Needs**: Fast media saving, scheduled publishing queue, calendar view, caption & hashtag helpers.

### Persona B: The Social Media Manager (Secondary)
- **Goal**: Manage multiple accounts, monitor engagement, remove ghost/bot followers, analyze follower growth.
- **Needs**: Unfollower tracking, audience cleanliness stats, bulk scheduling.

### Persona C: The Privacy-Conscious Power User (Tertiary)
- **Goal**: Browse Instagram without being tracked, read DMs without sending seen watermarks, watch stories anonymously.
- **Needs**: Uncompromising Ghost Mode that works seamlessly on both WebSockets and GraphQL.

---

## 4. Feature Specifications & Functional Requirements

### 4.1 In-Page Media Action Bar & Downloader (FR-01)
- **Description**: An unobtrusive floating action bar attached to supported Reel, Feed Post, Modal Post, and Story media.
- **Behavior**:
  - **Reels Tab**: A circular frosted-glass button appears in the media-sized player shell without changing native video geometry.
  - **Feed Posts & Stories**: The bar attaches to the current visible media host and follows a changed carousel slide without altering post aspect ratio.
  - **Click Action**: Resolves the best available unencrypted, single-file video rendition from React Fiber/DASH metadata before using a direct source fallback. Where DASH exposes separate audio, the extension downloads and locally remuxes both tracks before saving the file.
  - **Unsupported streams**: Protected, segmented, or otherwise unsupported DASH media is explicitly reported; a `blob:` or known-invalid fallback is never sent to Chrome Downloads.
  - **Visual Feedback**: The button remains pending after Chrome accepts the job. It changes to a green checkmark only after `chrome.downloads` reports terminal completion; interruption/error returns it to idle with an error toast.
  - **Secondary Actions**: Includes an "Open in New Tab" button only for a directly usable single-track media URL. Separate-audio media directs the user to Download so both tracks are preserved.

### 4.2 Interactive Reel Video Scrubber (FR-02)
- **Description**: A progress bar rendered at the bottom edge of the Reels player.
- **Behavior**:
  - Automatically updates as the video plays (`currentTime / duration`).
  - Supports clicking any point along the bar to jump directly to that timestamp.
  - Supports click-and-drag scrubbing with real-time frame seeking.
  - Expands slightly with a glowing thumb indicator on hover.

### 4.3 Compact Creator Dock & Multi-Format Handoff (FR-03)
- **Description**: A compact, keyboard-accessible in-page creator dock opened by the extension toolbar or a creator event—never a fullscreen overlay, backdrop, or persistent floating launcher.
- **Sub-Features**:
  - **Format selector**: Choose `Post`, `Reel`, or `Story` before native Instagram handoff.
  - **Media selection**: File-picker selection for JPEG, PNG, WebP, MP4, and WebM; accepts up to 20 files, subject to native Instagram composer support.
  - **Caption editor**: A 2,200-character caption editor with explicit spacing and hashtag-placement tools.
  - **Native handoff**: “Prepare in Instagram” opens Instagram’s own Create workflow, transfers currently selected files where the native input is detected, and attempts to copy the caption for user paste and final review. It never claims autonomous publishing.
  - **No misleading product states**: The dock contains no fake analytics, suggested “optimal” times, developer labels, or simulated success state.

### 4.4 Local Reminder Queue (FR-04)
- **Description**: A local reminder queue for post preparation, not an autonomous scheduler or persisted media library.
- **Behavior**:
  - Stores caption, intended format, reminder timestamp, and media descriptors in `chrome.storage.local`.
  - Registers `chrome.alarms` to deliver due-time notifications and reopen the queue for review.
  - The UI explicitly labels queued media as **reselect required** because file bytes are held only in the current page session and are not persisted after it closes or reloads.
  - A queued reminder can be opened or deleted. Editing, rescheduling, and reordering remain unaccepted roadmap work.

### 4.5 Ghost Mode (FR-05)
- **Description**: Complete invisibility shield preventing Instagram from recording user activity.
- **Coverage**:
  - **Direct Messages**: Suppresses WebSocket packets matching `last_read_watermark_ts` and blocks GraphQL mutations (`useIGDMarkThreadAsReadMutation`).
  - **Stories**: Suppresses `PolarisStoriesV3SeenMutation` and `/graphql/query` requests containing `viewSeenAt`.
  - **User Feedback**: Tracks and displays live counters of blocked DM receipts and hidden story views.

### 4.6 Feed Ad Blocker (FR-06)
- **Description**: Filters sponsored promotions and ads from Instagram feeds.
- **Behavior**:
  - Intercepts timeline feed queries (`xdt_api__v1__feed__timeline__connection.edges`) and removes all nodes marked `edge.node.ad`.
  - Intercepts story queries and empties `xdt_injected_story_units.ad_media_items`.
  - Leaves organic content 100% untouched without layout gaps.

### 4.7 Growth & Audience Tools (FR-07)
- **Description**: Local audience-health tooling backed by the logged-in Instagram web session.
- **Capabilities**:
  - Scans up to 1,500 followers and followed accounts per run.
  - Compares scans to report gained and lost followers.
  - Identifies accounts that do not follow back.
  - Flags suspicious followers using visible, explainable account heuristics.
  - Supports individual actions and a user-confirmed batch removal of up to 10 flagged followers per run.

---

## 5. Non-Functional Requirements (NFR)

1. **Performance & Latency**:
   - In-page button injection must take `< 50ms` on DOM mutation.
   - Zero measurable frame drops during 60 FPS video playback.
   - Injected script footprint must be optimized (< 50KB gzip).
2. **Layout Integrity**:
   - Zero modification of Instagram's native aspect ratios (prevent square cropping of 9:16 vertical reels).
   - Scoped CSS classes (`im-*`) to eliminate stylesheet collision with Instagram Comet/Polaris.
3. **Reliability**:
   - Media resolution uses the highest-scored React Fiber DASH representation, then source/currentSrc fallbacks.
4. **Security & Privacy**:
   - 100% client-side execution; credentials, cookies, and tokens never leave the user's browser.
   - No tracking beacons or analytics phoning home to external servers.

---

## 6. Planned Success Metrics & KPIs

These are targets for live Instagram testing, not measured claims from the current local harness.

| Metric | Target | Verification Method |
| :--- | :--- | :--- |
| **Download Success Rate** | > 99.5% on public Reels & Posts | Manual & automated link validation |
| **Ghost Mode Efficiency** | No known read-receipt request escapes | Verify in secondary test accounts |
| **Ad Removal Rate** | Known feed/story ad shapes removed | Network request inspection |
| **Layout Distortion Rate** | 0% aspect ratio distortion | Visual regression across feed view |
