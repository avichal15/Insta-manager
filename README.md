# InstaManager

A Manifest V3 Chrome extension that adds creator-focused tools to Instagram Web.

## Highlights

- Media controls for feed posts, reels, and stories
- Keyboard-accessible reel scrubbing
- Caption and post-format assistance
- Scheduled draft reminders using Chrome storage and alarms
- Audience and follower analysis tools
- Responsive UI with reduced-motion support

## Stack

`TypeScript` `Chrome Extensions` `Manifest V3`

## Development

```bash
npm install
npm test
```

Then load the built `dist` directory from `chrome://extensions` with Developer mode enabled.

> Instagram's DOM and private GraphQL behavior changes frequently, so some integrations require re-verification after platform updates.
