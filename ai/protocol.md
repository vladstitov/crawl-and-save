# WebSocket protocol

Transport: JSON text frames over `ws://localhost:8765`. App = server, extension
= client. Types are defined in **both** `app/src/types.d.ts` and
`extension/src/types.d.ts` (kept in sync by hand).

## App → Extension

### `navigate`

Tells the extension to navigate the active tab and scrape it.

```jsonc
{
  "action": "navigate",
  "url": "https://secondarylink.com/seclink/news",
  "idleMs": 1500,   // required network/DOM quiet before scraping
  "maxMs": 30000,   // hard cap on total settle wait
  "settleMs": 500   // extra grace after quiet, before snapshotting
}
```

App type: `NavigateCommand extends ScrapeOpts`. Extension type:
`NavigateCommand extends Partial<SettleOpts>` (treats timings as optional with
defaults `idleMs=1500, maxMs=30000, settleMs=500`).

## Extension → App

All three carry a `type` discriminator. Union: `FromExtension` /  `ToApp`.

### `status` — progress updates

```jsonc
{ "type": "status", "phase": "connected" }
{ "type": "status", "phase": "navigating", "url": "..." }
{ "type": "status", "phase": "loaded", "tabId": 123 }
{ "type": "status", "phase": "settled", "waitedMs": 2100, "timedOut": false, "readyState": "complete" }
```

Fields beyond `type`/`phase` are optional and phase-specific
(`url`, `tabId`, `waitedMs`, `timedOut`, `readyState`).

### `html` — the scrape result

```jsonc
{
  "type": "html",
  "url": "https://…",        // requested URL
  "finalUrl": "https://…",   // location.href after any redirects
  "title": "Page title",
  "html": "<!DOCTYPE html>…", // full document.documentElement.outerHTML
  "bytes": 48213             // html.length (chars)
}
```

### `error` — failure

```jsonc
{ "type": "error", "message": "no usable tab id" }
```

## Popup ↔ Service worker (intra-extension, not over WebSocket)

`chrome.runtime.sendMessage`. Request is a string `PopupRequest`; response is
`StatusResponse`.

```
request:  "get-status" | "start-socket" | "stop-socket"
response: { "enabled": boolean, "connected": boolean }
```

- `enabled` — whether the socket is *meant* to run (Start pressed, persisted in
  `chrome.storage.local` under key `socketEnabled`).
- `connected` — whether the WebSocket is actually OPEN right now.

## Sequence

```
app                         extension
 │  (server up on :8765)          │
 │◀───────── connect ─────────────│
 │── navigate ───────────────────▶│
 │◀── status: navigating ─────────│
 │◀── status: loaded ─────────────│
 │◀── status: settled ────────────│
 │◀── html ───────────────────────│
 │  (save to app/output/…)        │
```
