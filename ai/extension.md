# Extension (`extension/`) — Chrome MV3

A TypeScript Manifest V3 extension. Compiled with `tsc` to `dist/`. The manifest
references the **compiled** output, so you must `npm run build` before loading /
reloading the extension in Chrome.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest |
| `popup.html` | popup UI (loads `dist/popup.js`) |
| `src/background.ts` | service worker: WS client, tab control, scraping |
| `src/popup.ts` | Start/Stop buttons + status polling |
| `src/types.d.ts` | ambient wire-protocol + popup types |
| `tsconfig.json` | ES2022, libs `DOM`+`ES2022`, `types: ["chrome"]` |

## manifest.json
- `manifest_version: 3`
- `permissions: ["tabs", "scripting", "storage"]`
- `host_permissions: ["<all_urls>"]`
- `background.service_worker: "dist/background.js"`
- `action.default_popup: "popup.html"`

## src/background.ts (service worker)

### Connection lifecycle
- `WS_URL = "ws://localhost:8765"`.
- `enabled` (boolean) — whether the socket is *meant* to run; persisted in
  `chrome.storage.local` key `socketEnabled` (default true).
- On worker startup: reads `socketEnabled`, and `connect()` if enabled.
- `connect()` — opens the WebSocket; **no-ops** if disabled or already
  open/connecting.
- `scheduleReconnect()` — reconnects after 2s, but **not** if `enabled` is false.
- `startSocket()` / `stopSocket()` — set + persist `enabled`, then connect /
  close. Driven by the popup.

### Scrape flow — `handleNavigate(cmd: NavigateCommand)`
1. `send status navigating`.
2. `getTargetTab()` — active tab of last focused window → active tab of current
   window → newly created tab.
3. `chrome.tabs.update(tabId, { url, active: true })`.
4. `waitForTabComplete(tabId, maxMs)` — resolves on `chrome.tabs.onUpdated`
   status `complete` (or timeout). `send status loaded`.
5. `chrome.scripting.executeScript({ func: waitForPageSettle, args: [settleOpts] })`
   → `SettleInfo`. `send status settled`.
6. `chrome.scripting.executeScript({ func: scrapeHtml })` → `ScrapedPage`.
7. `send html` with `finalUrl`, `title`, `html`, `bytes`.
8. On throw: `send error`.

### Injected page functions (run in page context, must be self-contained)
- `waitForPageSettle(opts: SettleOpts): Promise<SettleInfo>` — patches
  `window.fetch` and `XMLHttpRequest.prototype.send` to count in-flight
  requests, runs a `MutationObserver` for DOM changes, and resolves once
  `inFlight === 0 && quietFor >= idleMs` (or `elapsed >= maxMs`), plus a final
  `settleMs` grace. Guards against double-patching via `__scrapeFetchPatched` /
  `__scrapeXhrPatched` flags on `window`.
- `scrapeHtml(): ScrapedPage` — returns `{ finalUrl: location.href, title:
  document.title, html: "<!DOCTYPE html>\n" + document.documentElement.outerHTML }`.

### Popup bridge
`chrome.runtime.onMessage` handles `PopupRequest` (`get-status` |
`start-socket` | `stop-socket`) and replies with `StatusResponse`
(`{ enabled, connected }`). Start/Stop return async responses.

## src/popup.ts + popup.html
- Buttons `#start-btn` / `#stop-btn`, status `#status`.
- `query(req)` sends a `PopupRequest`, `render(res)` shows one of: `Connected`,
  `Connecting…`, `Stopped`, or `service worker not ready`.
- Only the sensible next action is enabled (`start` disabled while enabled,
  `stop` disabled while stopped).
- Polls `get-status` every 1s while the popup is open.

## Types used (from `src/types.d.ts`)
`SettleOpts`, `NavigateCommand`, `FromApp`, `SettleInfo`, `ScrapedPage`,
`StatusMessage`, `HtmlMessage`, `ErrorMessage`, `ToApp`, `PopupRequest`,
`StatusResponse`. Also `/// <reference types="chrome" />` at the top of
`types.d.ts` guarantees the `chrome` global resolves.

## Gotchas
- **Rebuild before reload:** manifest points at `dist/`. After editing `.ts`,
  run `npm run build` (or `npm run watch`) then hit reload on the extension card.
- **Service workers are ephemeral:** in-memory state resets when the worker is
  killed; that is why `enabled` is persisted in `chrome.storage.local`.
- **Injected functions cannot close over module values** — only over their
  arguments and page globals (they are serialised and run in the page).
