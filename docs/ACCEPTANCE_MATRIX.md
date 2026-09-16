# Product acceptance: not complete

The user requires working UI-to-result workflows, not a mock UI, source-code presence, or unit-test-only implementation. The PRD and independent INSSIST parity are the scope. Image generation is excluded. Billing and license checks are not product features to copy. No proprietary INSSIST code or paid backend is bundled.

## Acceptance rule

A feature is accepted only when its visible control works in the installed extension, produces the expected real result, handles failures truthfully, and preserves/reloads its state where applicable. A successful keyboard-only test does not prove a mouse button is clickable. A reminder is not automatic publishing. A predicted follower count is not actual growth. Each workflow needs concrete evidence and a repeatable test.

## Inventory researched on 2026-09-15

Sources: [INSSIST feature/plan comparison](https://inssist.com/), [desktop publishing](https://inssist.com/feature-guides/how-to-post-to-instagram-from-pc), [scheduling](https://inssist.com/feature-guides/how-to-schedule-instagram-posts), [growth workflow](https://inssist.com/feature-guides/how-to-grow-instagram-on-autopilot), [AI-agent capability inventory](https://inssist.com/feature-guides/inssist-mcp-server-for-ai-agents), [release history](https://inssist.com/releases). Stable reference: 39.5.3; the site also lists 39.5.4 beta. Vendor guarantees about ban risk, undetectability and follower numbers are not independently verified and will not become InstaManager promises.

| Workflow | Required result | Current acceptance state |
| --- | --- | --- |
| Feed photos | Click Download; correct full-resolution image saved | One live JPEG saved; mouse-path review remains |
| Feed videos and dedicated Reels | Click Download; matching video and sound in one playable file | Accepted for three sampled Reels: a trusted Cua mouse click saved `jcpxb.mp4` and keyboard activation saved two others; each is 1080×1920 with video+audio and decodes fully. Broader compatibility sampling remains |
| Story photos/videos and highlights | Visible download button on current media; correct image or video/audio saved | Not accepted; selectors and interaction need live verification |
| Carousel downloads | Current slide and whole-carousel actions save correct media, no avatars or stale slides | Incomplete |
| Bulk profile/saved downloads | Select account/content; job progress, cancellation, truthful item status | Missing |
| Open HD media | Usable preview of the resolved media, including separate-track audio | Partial; split-stream preview is not implemented |
| Reel scrubber | Mouse drag, click and keyboard seek actual playback; no aspect-ratio change | Trusted Cua click moved the live value to 50%; trusted drag moved it to 77%. Keyboard seeking and layout regression tests pass. Accepted for sampled Reels |
| Publish photos, videos, Reels, Stories | Select files, caption/options, preview, publish; real post exists on the test account | Incomplete; native composer handoff is not a publishing engine |
| Carousel publisher | Ordered collection, previews, per-item handling, publish up to 20 items where account/API permits | Current picker capped at 10; incomplete |
| Media editing | Crop/aspect ratio, covers, video format conversion and preview | Incomplete |
| Story/video music | Search available tracks or import owned audio; correctly rendered/published media | Missing |
| Story extras | Mentions, locations, links, stickers appear in published story | Missing |
| Durable drafts | Media and caption survive closing Instagram/browser and restore correctly | Missing media persistence |
| Automatic scheduling | Account-scoped persisted queue actually publishes when due, with retry/failure state and missed-run behavior | Reminder-only implementation is insufficient |
| Calendar and bulk editing | Month/week views, move/reorder posts, time slots, bulk captions/types/intervals/options | Partial calendar; most workflows missing |
| Repost/library | Save/pin, review and repost with explicit attribution | Missing |
| Saved DM replies/templates | Save/edit/use templates in the correct conversation | Missing |
| Direct-message workflows | Read/list/reply and requests; correct conversation, explicit send behavior | Native Instagram exists; extension workflows incomplete |
| Comments | Read/reply/like/delete with clear user control and verified outcome | Missing extension workflows |
| Hashtags | Assist, metrics, named collections, insertion into caption | Basic insertion only; missing collections/metrics |
| Account insights | Actual engagement history, posting-time analysis, audience quality and export | Missing; generic time suggestions are not analytics |
| Audience scan | Correct account, complete/partial distinction, pagination, robust comparisons | One live 7-follower/6-following scan; isolation and completeness defects remain |
| Unfollower history/export | Reliable gained/lost changes and valid CSV | Incomplete; CSV missing |
| Suspicious follower review/removal | Explainable evidence, explicit reviewed targets, verified action outcome | Untested actions; missing-data heuristics need correction |
| Growth autopilot | Configure targets/filters and limits; discover candidates; visible start/pause/stop; authorized engagement jobs and actual outcome log | Missing. Do not fabricate follower counts or guarantee that others follow back |
| Growth safety/filters | Honor restrictions, stop on challenge/rate limit, word filters, durable account-scoped progress | Missing; never bypass account protections |
| Story and DM Ghost Mode | Verify from a second controlled account that known seen receipts did not arrive | Local pattern tests only; two-account live test required |
| Ad filtering | Ads removed in actual feeds/stories; organic content and page functionality preserved | Local shape tests only; live compatibility not accepted |
| Multiple accounts | Switch safely; isolate drafts, history, actions and jobs per account | Missing robust isolation |
| Profile/engagement utilities | Account/profile reads, bio/Note edits, notifications, requests, block/unblock and story viewer tools with explicit user control | Missing extension workflows |
| Local agent integration | Optional authenticated local interface for the product capabilities, no credential export | Missing; official INSSIST MCP is a reference, not the implementation |
| Open-source delivery | License decision, third-party notices, reproducible build, complete setup/test documentation | Third-party notices included; overall release not accepted |

## Current repair order

1. Finish mouse-path media controls and test photo/video/story/Reels downloads and seeking against real content.
2. Build durable account-scoped drafts and a real publishing pipeline; test only explicit disposable test content.
3. Complete real scheduling/calendar/bulk editing and recovery behavior.
4. Complete content library, bulk downloads, templates/hashtags, account isolation, audience/insights and growth jobs.
5. Verify privacy/ad filtering with controlled fixtures and another test account; complete remaining parity and release gates.

Public posting, messages, likes, removals and other externally visible verification must use approved test content and targets. Missing test authority is reported, not bypassed. Browser security restrictions are not disabled. This matrix must not be reduced to match what happens to be implemented.
