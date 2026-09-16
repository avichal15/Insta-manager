# Live verification status

The extension is not yet verified end to end on Instagram and is not at full INSSIST feature parity. Build success and DOM fixtures do not establish that private Instagram endpoints or account actions work.

## Current local regression evidence

`npm test` executes the actual generated worker/page/content/offscreen bundles and the media-merging module. **Twenty-eight** regression tests pass, including these media-control guarantees:

- Fiber/DASH resolution selects a video representation before a playable direct preview source and never lets a numerically larger audio bandwidth win.
- DASH `BaseURL` values can be inherited and relative; protected or segmented manifests surface a user-visible unsupported reason without issuing `DOWNLOAD_MEDIA`.
- A feed bar follows the currently visible carousel slide instead of retaining a stale media host.
- A download button remains pending after Chrome accepts the job and becomes successful only after its correlated terminal `DOWNLOAD_STATUS` message. The worker serializes its download-history writes, so a rapid terminal event cannot be overwritten by the initial `downloading` record.
- Feed/story ad filtering applies its filtered output and preserves organic fixture content; disabling it leaves the response unchanged.
- An XHR can be reused after a blocked receipt without retaining the synthetic response, and unrelated storage changes preserve the focused caption editor.
- Reel progress updates through the injected CSS; regression coverage keeps controls outside the video-only stacking context while preserving absolute positioning.
- Composer handoff targets the native upload input and transfers selected files. Error toasts render untrusted messages as text.
- Split-track MP4 merging preserves encoded sample hashes and timing in synthetic H.264/AAC fixtures, rejects malformed tracks, and the built offscreen bundle rejects foreign senders/non-CDN URLs without producing partial files.

Independent FFprobe inspection of `work/verification/merged-fixture.mp4` found H.264 video and AAC audio; FFmpeg decoded both without errors. These are synthetic fixtures, not a new live Instagram download through the installed extension.

The previous mock page only checked display and canned success responses. These regressions exercise implementation behavior but do not replace Chrome/Instagram verification.

The live Reel scrubber was verified through trusted input: clicking its center changed the current Reel's ARIA value from 0% to 50%, and a subsequent trusted drag changed it from 50% to 77%. Cua's post-action semantic snapshot confirmed both outcomes.

## Live access

### Latest verification and remaining mouse defect

The reloaded installed extension saved two genuine Instagram downloads through its keyboard-activated Download buttons:

- `Downloads/instagram-reel-2026-09-15-st5j0.mp4`: 24,888,743 bytes, 1080 × 1920 VP9 video + AAC audio, 74.045578 seconds. Full FFmpeg decode completed without errors.
- `Downloads/instagram-reel-2026-09-15-qtgi0.mp4`: 13,566,364 bytes, 1080 × 1920 VP9 video + AAC audio, 76.414708 seconds, from the dedicated Reels view. Both tracks confirmed with FFprobe.

This verifies the installed offscreen merge/download path for these two samples, not the mouse interaction. A live `elementFromPoint` check at the Download and Open buttons found Instagram's native player overlay above both. The controls were inside a nested `z-index: 0` video stack, so their large z-index could not escape it. This reproduces the user's report that the button itself does not work.

The source now mounts Reel controls and the scrubber in the outer media-sized player shell, above the native overlay. It preserves absolute/fixed positioning instead of forcing all hosts to relative positioning. A regression test failed before this fix and passes after it.

After the user's next extension reload and a page refresh, the live stylesheet contained `.im-media-host-static`, confirming the updated content script was active. Live hit-testing at both Reel Download and Open controls then returned the actual InstaManager buttons instead of Instagram's overlay. Playwright still delivered no input events while its approved tab was reported hidden. A separate, project-local Cua Driver 0.28.1 runtime was checksum- and Authenticode-verified, restricted with a deny-by-default manifest to the existing Chrome profile plus `https://www.instagram.com`, and run with telemetry disabled and no autostart. Its **trusted** `browser_click` activated the live in-viewport Reel Download button (not a synthetic DOM click). Two Cua-click results were validated: `jcpxb.mp4` is 2,776,959 bytes, 1080 × 1920 VP9 + AAC, 17.063810 seconds; `qw4k8.mp4` is 2,570,448 bytes, 720 × 1280 VP9 + AAC, 19.130385 seconds. Full FFmpeg decode completed without errors for both. This accepts the sampled dedicated-Reel mouse-download path, not every media surface.

The new **Reload updated extension** button requests an ordinary extension self-reload after explicit confirmation, then refreshes only the requesting Instagram tab. Worker tests cover sender restrictions, post-restart tab refresh, and expired-request handling. This requires one initial manual extension reload before it is available. Chrome explicitly rejected low-level debugger access with `Not allowed`; that restriction was not bypassed.

See `ACCEPTANCE_MATRIX.md` for the full researched parity inventory and UI-to-result acceptance gates. Overall project status remains **not complete**.

Playwright's official extension connection is now approved for the Instagram tab in Chrome profile `dead`. Azure/Astra routing was not changed and no browser-access token was saved. The unified connector's earlier authentication blocker is no longer blocking this separate connection.

### Live observations on 2026-09-15

- The installed InstaManager launcher and assistant render on real Instagram. Keyboard activation works. Screenshots are in `work/playwright/`.
- The audience endpoint returned 7 followers and 6 followed accounts. No removal/unfollow action was performed. This does not verify complete-scan comparisons or account isolation.
- A photo downloaded to `Downloads/instagram-post-2026-09-15-we2z3.jpg`; it is a valid 1080 × 1080 JPEG.
- A reel downloaded to `Downloads/instagram-reel-2026-09-15-fiu1w.mp4`; FFprobe proved that it contains AAC audio only. This is a reproduced failure, not a successful reel download.
- The live player exposes separate video/mp4 (720 × 1280) and audio/mp4 DASH representations. The new implementation forwards both URLs and merges them locally using bundled MP4Box.js in an on-demand extension offscreen document. It does not re-encode media, execute downloaded code, or upload media to another service.
- The live Create control did not match the old selector. The source selector was fixed against the observed markup and regression-tested.
- The live page still showed older download text, confirming that the running content script predates the current source. Rebuilding files does not reload installed content scripts.
- Chrome reports the connected tab as `visibilityState=hidden`; pointer actions and file-picker operations time out. Keyboard inspection remains possible. No native composer upload success is claimed.
- Chrome denied automated navigation to its internal Extensions page. The user has been asked to reload InstaManager there, refresh Instagram, and restore the visible window. Do not bypass this Chrome restriction.
- The observed console error is an Instagram-owned unload permissions-policy warning from its CDN script; it is not attributed to InstaManager without evidence.

### Immediate next verification

After the user reloads the new controls build, verify that hit-testing at the Download button lands on our button and that a real mouse click saves a matching video-plus-audio file. Test the scrubber with mouse and keyboard, then story downloads. Next attach the two original `work/fixtures/instamanager-test-*.png` images to Instagram's native composer, stop before Share, and verify caption/media state. Use the new in-app reload control for subsequent builds if its live test succeeds.

The local merger currently accepts unencrypted, single-file MP4 DASH representations; multi-segment playlists and unsupported codecs fail instead of being presented as completed downloads. Each source stream is capped at 128 MB, transfer is bounded to 90 seconds, and object URLs are released after download completion/error (with a ten-minute fallback).

## Still requires implementation or live evidence

- Installed-extension startup and the actual Instagram selectors.
- Live verification of video-plus-audio downloads through the new offscreen merger, plus carousel active-slide selection, stories, saved and bulk downloads.
- Actual post/reel/story/carousel publishing. The current button prepares the native composer; it is not a complete publishing engine.
- Actual automated publishing and retained media. The current scheduler stores reminder metadata and does not publish or persist video files.
- Authenticated audience pagination, correct account isolation, reliable complete-scan comparisons, and account-action verification.
- Ghost Mode verification from another test account and verification of real ad request formats.
- Remaining full INSSIST parity workflows and open-source release packaging.

Do not mark the project complete or replace these requirements with a smaller MVP without the user's agreement.
