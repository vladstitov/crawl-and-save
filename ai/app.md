# App (`app/`) — Node.js controller

A TypeScript Node.js project (`"type": "module"`). Compiled with `tsc` to
`dist/`, run as `node dist/browser-server.js`.

## Files

| File | Role |
|---|---|
| `src/browser-server.ts` | WebSocket server, scrape orchestration — talks only to the extension |
| `src/db.ts` | LokiJS queue (see `database.md`) |
| `src/types.d.ts` | ambient wire-protocol + `WebPage` types |
| `package.json` | deps: `ws`, `lokijs`; dev: `typescript`, `tsx`, `@types/*` |
| `tsconfig.json` | target ES2022, `module: ESNext`, `moduleResolution: Bundler`, `strict`, `types: ["node"]` |

## `src/browser-server.ts`

### Constants
- `PORT = 8765`
- `OUTPUT_DIR = app/output` (resolved from `dist/..`)
- `SCRAPE_OPTS: ScrapeOpts = { idleMs: 1500, maxMs: 30000, settleMs: 500 }`

There is no hardcoded target URL anymore — the URL to scrape always comes from
the `webPages` database queue (see `database.md`).

### Behaviour
- `await initDb()` runs before the server starts listening.
- Starts a `WebSocketServer` on `:8765`.
- On each extension **connection**: immediately calls `CheckToScrape(ws)`.
- On **message** (`FromExtension`), switches on `msg.type`:
  - `status` → logs phase (`formatStatusExtra` appends url/waited/etc).
  - `html` → `mkdir -p output/`, writes to
    `output/<hostSlug>_<timestamp>.html`, logs the saved path, **and** if a
    `pendingDoc` is set, calls `saveScrapedHtml(pendingDoc, { htmlPage: msg.html,
    htmlPageLength: msg.bytes ?? msg.html.length })` to persist the HTML into
    the matching database row, then clears `pendingDoc`.
  - `error` → logs to stderr.
- **Re-trigger:** pressing `<Enter>` on stdin calls `CheckToScrape(activeSocket)`
  again (picks up the next queued row, not necessarily the same URL).
- **SIGINT** closes the server and exits.

### Helpers
- `ts()` — filesystem-safe timestamp `YYYY-MM-DD_HH-MM-SS`.
- `hostSlug(url)` — hostname sanitised for filenames; falls back to `"page"`.
- `formatStatusExtra(msg: StatusMessage)` — human-readable status suffix.
- `requestScrape(ws, url)` — sends a typed `NavigateCommand` for the given url;
  no-op if the socket is not OPEN.
- `CheckToScrape(ws)` — queries `getCollection().findOne({ url: { $ne: null },
  htmlPage: null })` for the next row still needing a scrape, stores it in the
  module-level `pendingDoc`, and calls `requestScrape(ws, doc.url)`. Logs and
  does nothing if every row has already been scraped.

### State
- `activeSocket: WebSocket | null` — the currently connected extension socket.
- `pendingDoc: WebPageDoc | null` — the database row currently out for
  scraping; set by `CheckToScrape`, consumed (and reset to `null`) when the
  `html` reply arrives.

### Types used (from `src/types.d.ts`)
`ScrapeOpts`, `NavigateCommand`, `StatusMessage`, `HtmlMessage`, `ErrorMessage`,
`FromExtension`. Also imports `WebPageDoc` from `db.ts`.

## npm scripts
- `npm run build` → `tsc`
- `npm start` → `tsc && node dist/browser-server.js`
- `npm run dev` → `tsx watch src/browser-server.ts` (no typecheck; fast reload)

## Extending the app
- **Error handling:** on `error` messages, consider updating the row's
  `status`/`statusMessage` (via `getCollection().update()`) so a failing page
  isn't retried forever — `pendingDoc` is still available at that point.
- The wire protocol is the integration seam — if you add message kinds, update
  **both** `types.d.ts` files and `protocol.md`.
