# Current state & next tasks

Snapshot for an AI agent picking up the work. Verify against the code before
relying on any point here.

## Implemented and working
- **Extension → app scrape pipeline** over WebSocket (navigate → wait for load +
  data settle → scrape `outerHTML` → send back). Typechecks and builds.
- **App WebSocket server** that drives the scrape and saves HTML to
  `app/output/`, **and** to the matching `webPages` row via `saveScrapedHtml`.
  Re-trigger via `<Enter>`.
- **Popup Start/Stop** control of the socket connection, persisted in
  `chrome.storage.local`.
- **LokiJS database** (`app/src/db.ts`): `webPages` collection, seeded with the
  seed URL, with queue + CRUD API. Runtime-verified (seed + next + save).
- **`scrape-pages.ts` is wired to the DB queue.** `CheckToScrape(ws)` pulls the next
  row with `scrapedAt === null` and a non-null `url`, requests a scrape for it,
  and remembers it as `pendingDoc`; the `html` reply saves back into that row
  via `saveScrapedHtml`. There is no more hardcoded `TARGET_URL` constant.
- **Types** consolidated in each project's `src/types.d.ts`.

## Not yet implemented
- **Looping until the queue is empty:** currently `CheckToScrape` is called
  once per connection and once per `<Enter>` press — it does not automatically
  chain to the next row after an `html` reply. Consider calling
  `CheckToScrape(ws)` again at the end of the `html` case to drain the whole
  queue automatically.
- **Error handling into the DB:** on `error` messages, the row's
  `status`/`statusMessage` is not yet updated (via `getCollection().update()`),
  so a failing page could be retried forever if `CheckToScrape` runs again
  before its `htmlPage` is set.

## Other natural extensions
- **Link/input discovery:** populate `pageLinks` / `pageInputs` from the page
  (extend the injected `scrapeHtml`, add fields to the `html` message and the
  protocol), then `enqueueUrl()` each discovered link to grow the queue.
  `parse-html-page.ts` already does this offline from stored HTML via jsdom.
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
