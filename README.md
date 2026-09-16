# InstaManager

InstaManager is a Manifest V3 Chrome extension that adds creator tools directly to Instagram Web.

## Included features

- Download and open controls for feed media, reels, and stories. Split MP4 audio/video sources are merged locally using bundled MP4Box.js; live verification of this new path is pending.
- Keyboard-accessible reel scrubbing.
- A local post assistant for media preview, captions, post/reel/story formats, and handoff to Instagram's native composer.
- Persistent scheduled drafts backed by `chrome.storage.local`, `chrome.alarms`, and desktop notifications.
- Ghost Mode controls for known DM-read and story-seen requests, with separate counters.
- Feed/story ad filtering for known Instagram GraphQL response shapes.
- Audience scans for non-followers, gained/lost followers, suspicious-account review, and user-confirmed removal actions.
- Responsive layouts and reduced-motion support.

## Build and load

```powershell
npm install
npm test
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select:

```text
C:\insta manager\dist
```

After rebuilding, use the extension page's reload button and refresh any open Instagram tabs.

## Publishing and scheduling behavior

**Prepare in Instagram** opens Instagram's composer, attaches the selected media when the file input is available, and copies the caption. Instagram's final Share action remains in the native review flow.

Scheduled drafts currently store the caption, format, due time, and media filename, not the file itself. Chrome displays a reminder at the due time. Reselect the media when a draft is due. Persisted media and automated publishing remain required work; reminders are not a substitute for the requested scheduler.

## Verification

`npm test` runs strict TypeScript checking, builds and validates the unpacked extension, and runs behavioral regressions. See [live verification status](docs/LIVE_VERIFICATION.md) and the [acceptance matrix](docs/ACCEPTANCE_MATRIX.md) for actual Instagram findings and outstanding work. The old UI harness is not end-to-end evidence.

The `offscreen` permission supports local MP4 Blob processing. Media is fetched only from Instagram CDN hosts. No media-processing server or native helper is required. Third-party licenses ship in `THIRD_PARTY_NOTICES.txt`.

Instagram changes private DOM and GraphQL details frequently. Recheck downloads, Ghost Mode, and ad filtering against a secondary Instagram account after Instagram updates. The copied `inssist-source` directory is retained as reference material and is not included in the built extension.
