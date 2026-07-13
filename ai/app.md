# App (`app/`) — Node.js controller

A TypeScript Node.js project (`"type": "module"`). Compiled with `tsc` to
`dist/`, run as `node dist/scrape-pages.js`.

## Files

| File | Role |
|---|---|
| `src/scrape-pages.ts` | WebSocket server, scrape orchestration — talks only to the extension |
| `src/db.ts` | LokiJS queue (see `database.md`) |
| `src/distrebute-links.ts` | turns a scraped page's `pageLinks` into new queue rows |
| `src/parse-html-page.ts` | jsdom-based link/input extraction (`extractLinksAndInputs`); also a standalone backfill script |
| `src/web-server.ts` | read-only/CRUD Express API over the queue (see `database.md`) |
| `src/types.d.ts` | ambient wire-protocol + `WebPage` types |
| `package.json` | deps: `ws`, `lokijs`, `jsdom`, `express`, `cors`; dev: `typescript`, `tsx`, `@types/*` |
| `tsconfig.json` | target ES2022, `module: ESNext`, `moduleResolution: Bundler`, `strict`, `types: ["node"]` |

## `src/scrape-pages.ts`

### Constants
- `PORT = 8765`
- `SCRAPE_OPTS: ScrapeOpts = { idleMs: 1500, maxMs: 30000, settleMs: 500 }`

There is no hardcoded target URL anymore — the URL to scrape always comes from
the `webPages` database queue (see `database.md`).

### Behaviour
- `await initDb()` runs before the server starts listening.
- Starts a `WebSocketServer` on `:8765`.
- On each extension **connection**: immediately calls `CheckToScrape(ws)`.
- On **message** (`FromExtension`), switches on `msg.type`:
  - `status` → logs phase (`formatStatusExtra` appends url/waited/etc).
  - `html` → if a `pendingDoc` is set:
    1. `extractLinksAndInputs(msg.html)` (from `parse-html-page.ts`) parses the
       HTML with jsdom into `{ links, inputs }`.
    2. `saveScrapedHtml(pendingDoc, { htmlPage, htmlPageLength, pageLinks: links,
       pageInputs: inputs })` persists the HTML **and** the extracted links/inputs
       into the matching database row, clearing it out of the queue.
    3. `enqueueLinksFromDoc(pendingDoc)` (from `distrebute-links.ts`) resolves
       every link's URL against the page's own URL and enqueues it as a new row
       (deduped by URL), tagging each with `parent_id = pendingDoc._id`.
    4. `pendingDoc` is cleared, then `CheckToScrape(activeSocket)` is called
       again automatically to pull the next queued row — **the crawl now runs
       end-to-end without manual intervention**, draining the queue and growing
       it with newly-discovered links until nothing is left.
  - `error` → logs to stderr.
- **Manual re-trigger:** pressing `<Enter>` on stdin still calls
  `CheckToScrape(activeSocket)` — useful if the auto-continue stalled (e.g. no
  extension connected) or to force a check without waiting.
- **SIGINT** closes the server and exits.

### Helpers
- `formatStatusExtra(msg: StatusMessage)` — human-readable status suffix.
- `requestScrape(ws, url)` — sends a typed `NavigateCommand` for the given url;
  no-op if the socket is not OPEN.
- `CheckToScrape(ws)` — queries `getCollection().findOne({ url: { $ne: null },
  scrapedAt: null })` for the next row still needing a scrape, stores it in the
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

## `src/distrebute-links.ts`

Single export: `enqueueLinksFromDoc(doc: WebPageDoc): number`.

For every entry in `doc.pageLinks`, resolves `link.url` to an absolute URL
against `doc.url` (via `new URL(link.url, doc.url)`), skips it if empty,
unparseable, or not `http(s)`, then calls `enqueueUrl(absolute, { parent_id:
doc._id })`. `enqueueUrl` itself dedupes by URL, so re-running this against an
already-processed page is a no-op for links already queued. Calls `saveNow()`
(from `db.ts`) once at the end to flush the newly-inserted rows to disk
immediately rather than waiting for the 2s autosave tick. Returns the count of
links processed (not just newly-inserted ones).

**Caveat:** no domain/scope filtering — every http(s) link on a page gets
queued, including third-party links (social media, help centers, etc.), so a
crawl can wander far outside the original site. Add a same-origin check in
`enqueueLinksFromDoc` if that's not desired.

## npm scripts
- `npm run build` → `tsc`
- `npm start` → `tsc && node dist/scrape-pages.js`
- `npm run dev` → `tsx watch src/scrape-pages.ts` (no typecheck; fast reload)

## Extending the app
- **Error handling:** on `error` messages, consider updating the row's
  `status`/`statusMessage` (via `getCollection().update()`) so a failing page
  isn't retried forever — `pendingDoc` is still available at that point.
- The wire protocol is the integration seam — if you add message kinds, update
  **both** `types.d.ts` files and `protocol.md`.
