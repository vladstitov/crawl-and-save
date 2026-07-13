# Current state & next tasks

Snapshot for an AI agent picking up the work. Verify against the code before
relying on any point here.

## Implemented and working
- **Extension → app scrape pipeline** over WebSocket (navigate → wait for load +
  data settle → scrape `outerHTML` → send back). Typechecks and builds.
- **App WebSocket server** that drives the scrape and saves HTML into the
  matching `webPages` row via `saveScrapedHtml`.
- **Popup Start/Stop** control of the socket connection, persisted in
  `chrome.storage.local`.
- **LokiJS database** (`app/src/db.ts`): `webPages` collection, seeded with the
  seed URL, with queue + CRUD API. Runtime-verified (seed + next + save).
- **`scrape-pages.ts` is wired to the DB queue.** `CheckToScrape(ws)` pulls the next
  row with `scrapedAt === null` and a non-null `url`, requests a scrape for it,
  and remembers it as `pendingDoc`; the `html` reply saves back into that row
  via `saveScrapedHtml`. There is no more hardcoded `TARGET_URL` constant.
- **Auto-continue crawl loop:** the `html` handler calls `CheckToScrape(activeSocket)`
  again right after saving, so the app drains the whole queue unattended.
  `<Enter>` on stdin is kept as a manual re-trigger (e.g. if it stalls with no
  extension connected) but is no longer required between pages.
- **Link/input discovery, wired live:** every scrape parses the returned HTML
  with jsdom (`extractLinksAndInputs` in `parse-html-page.ts`) to populate
  `pageLinks`/`pageInputs`, then `enqueueLinksFromDoc` (`distrebute-links.ts`)
  resolves and enqueues every link as a new queue row tagged with `parent_id`.
  This is what lets the crawl grow the queue and cover a whole site rather than
  just the seed URL. `parse-html-page.ts`'s `parseHtml()` export is still kept
  as a standalone backfill script for rows scraped before this was wired in.
- **Types** consolidated in each project's `src/types.d.ts`.

## Not yet implemented
- **Error handling into the DB:** on `error` messages, the row's
  `status`/`statusMessage` is not yet updated (via `getCollection().update()`),
  so a failing page could be retried forever if `CheckToScrape` runs again
  before its `htmlPage` is set.
- **Crawl scope/domain filtering:** `enqueueLinksFromDoc` queues every http(s)
  link with no same-origin check, so a crawl can wander onto third-party sites
  (social media, help centers, etc.) discovered via outbound links. Add a
  same-origin (or allowlist) check in `distrebute-links.ts` if that's undesired.

## Other natural extensions
- **`pageKind` / `Workflow` / `Pipeline`:** currently free-form strings, unused
  by logic — define their semantics before relying on them.
- **Shared protocol types:** app and extension duplicate the protocol by hand.
  If drift becomes a risk, extract a shared file both consume.

## Invariants to preserve
- Protocol changes must be mirrored in **both** `types.d.ts` files and
  `ai/protocol.md`.
- Extension manifest references `dist/` — always rebuild before reload.
- `scrapedAt === null` is the queue predicate `CheckToScrape` uses — don't set it
  to a non-null value unless the page is truly scraped. `htmlPage === null` still
  tracks the same thing in practice (both are set/reset together by
  `saveScrapedHtml`/`editUrl`), but `getNextPageToScrape()` is the one exported
  helper still keyed off it.
