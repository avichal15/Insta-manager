# InstaManager implementation audit

Date: 2026-09-15

Correction: the implementation and coverage claims below came from an earlier limited pass. They are not a release sign-off. See `LIVE_VERIFICATION.md` for the current verification boundary and outstanding implementation work. The user requires full parity and has not authorized reducing the product to reminders and a composer handoff.

## Scope reviewed

- Product requirements, technical requirements, and application flow documents.
- Every TypeScript, TSX, CSS, HTML, manifest, and build configuration file in the new implementation.
- The unpacked INSSIST 39.5.3 package as behavioral reference only, including its manifest, English product description, and feature strings in the background, content, and page bundles.
- The generated `dist/` package and its Chrome execution model.

The production build does not copy or execute code from `inssist-source/`.

## Problems found in the inherited implementation

| Area | Finding | Resolution |
| --- | --- | --- |
| Build | Strict TypeScript failed in the worker, content script, CSS import, and popup. | Corrected types and added the Vite client declaration. |
| Chrome runtime | Rollup emitted shared ES-module imports in classic content scripts. Chrome would reject those files even though Vite built successfully. | Removed cross-entry runtime imports and added a distribution check that rejects module imports. |
| Page bridge | The main-world interceptor was injected with inline event/script text and could be blocked by Instagram's CSP. | Added a dedicated `page.js` content script with `world: MAIN`. |
| Scheduling | The assistant displayed a success alert without storing anything or creating an alarm. | Added persistent drafts, alarm restoration, due status, notification clicks, queue restore, and deletion. |
| Publishing | “Publish” only displayed an alert. | Added native Instagram composer handoff, multi-file attachment, and caption copy for final review. |
| Settings | Popup payload names and stored setting names did not match the worker. Ad filtering ignored its toggle. | Unified message payloads and state propagation across worker, isolated content script, and main world. |
| Ghost Mode | One total counter was stored while the UI showed two permanent zeroes. | Added separate DM and story counters with live storage synchronization. |
| Downloads | Arbitrary URLs were accepted, failures were shown as success, and no history was stored. | Restricted downloads to Instagram/CDN HTTPS hosts, sanitized filenames, handled errors, and stored status history. |
| Media controls | Feed detection could attach to profile avatars; controls lacked a reliable positioning host. | Selects substantial post media and scopes positioning to `.im-media-host`. |
| Accessibility | Reel scrubbing was pointer-only and motion had no reduced-motion behavior. | Added slider semantics, keyboard seeking, focusable controls, responsive layout, and reduced-motion CSS. |
| Audience tools | The PRD's analytics, non-follower, and bot-review features had no implementation. | Added authenticated scans, stored comparisons, transparent risk reasons, individual actions, and capped batch removal. |
| Dependencies | Vite/esbuild had known development-server advisories and the lockfile retained an unused plugin. | Upgraded to Vite 6.4.3, pruned the stale package, and reached a clean audit. |
| Documentation | The documents claimed production readiness, automatic publishing, offscreen transcoding, and license patches that were not in the new source. | Rewrote those sections to describe the independent implementation and current verification boundary. |

## Requirements coverage

| Requirement | Implementation | Verification |
| --- | --- | --- |
| FR-01 media actions and downloads | Feed, reel, modal, and story detection; DASH/source resolution; open and download actions; stored history | Typecheck, bundle validation; live CDN download still requires an Instagram session |
| FR-02 reel scrubber | Time updates, pointer seeking, keyboard seeking, ARIA slider state | Browser harness and clean console |
| FR-03 post assistant | Post/reel/story modes, up to 10 local assets, previews, caption limits and formatting, native composer handoff | Browser harness; final Instagram upload requires live session validation |
| FR-04 calendar and scheduler | Arbitrary future date/time, suggested slots, persistent queue, restored alarms, due notifications | Browser queue create/use/delete flow; alarm API bundle validation |
| FR-05 Ghost Mode | Known fetch/XHR/WebSocket read and story-seen patterns with separate counters | State/UI verified; two-account network behavior requires live validation |
| FR-06 ad filtering | Known feed/story ad shapes filtered in fetch and XHR JSON responses | Static and bundle verification; live feed network behavior requires validation |
| FR-07 audience tools | Up to 1,500 followers/following per scan, non-followers, gained/lost comparison, suspicious-account reasons, remove/unfollow and capped batch removal | Deterministic browser workflow; authenticated Instagram endpoints require live validation |

## Verification completed

- `npm test`: strict TypeScript, production build, and distribution validation pass.
- `npm audit`: zero known dependency vulnerabilities.
- Browser harness: assistant render, scheduling, queue restore, deletion, Ghost Mode, audience scan results, responsive layout structure, and zero console errors/warnings.
- Distribution check: required files exist, Manifest V3 wiring is correct, `MAIN` and isolated scripts are declared, and Chrome-loaded scripts contain no unsupported module imports.

## Live verification boundary

Instagram's DOM, private API paths, GraphQL shapes, and read-receipt protocols change without notice. A final logged-in Chrome pass must verify a real reel download, native composer attachment, an alarm notification, Ghost Mode with a second account, feed ad filtering, and an audience scan before publishing a release.
