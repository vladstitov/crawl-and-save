# Database (`app/src/db.ts`) — LokiJS

Embedded document DB (LokiJS) persisted to `app/data/scrape.db.json`
(auto-created; autosave every 2s). Holds the scrape queue.

## Collection: `webPages`

Indexes: `url` is a **unique** index; `status`, `htmlPage`, and `scrapedAt` are indexed.

### Row shape — `WebPage` (defined in `app/src/types.d.ts`)

| field | type | meaning |
|---|---|---|
| `_id` | `string` | app-generated UUID (`crypto.randomUUID()`) |
| `pageKind` | `string` | caller-defined page classification |
| `url` | `string` | page URL (unique) |
| `parentPageId` | `string \| null` | ID of the page that discovered or opened this page, if any |
| `htmlPage` | `string \| null` | scraped HTML; **null = not scraped yet** |
| `htmlPageLength` | `number \| null` | length of `htmlPage` |
| `scrapedAt` | `string \| null` | ISO 8601 timestamp of when the page was scraped; null if not yet scraped |
| `parsedData` | `JsonValue \| null` | parsed/extracted data |
| `pageInputs` | `{ name: string, id: string, belongsTo: string, querySelector: string }[]` | extracted input fields/forms |
| `pageLinks` | `{ url: string, title: string, text: string, belongsTo: string, querySelector: string, id: string }[]` | extracted links |
| `status` | `string` | e.g. `pending`, `scraped`, `error` |
| `statusMessage` | `string` | human note about status |
| `Workflow` | `string` | caller-defined (capital W) |
| `Pipeline` | `string` | caller-defined (capital P) |
| `clickAction` | `string` | default or triggered action to perform when interacting with this page |

LokiJS also adds `$loki` and `meta` at runtime; the stored/returned type is
`WebPageDoc = WebPage & LokiObj`.

### Seeding
On an empty database, one row is inserted:
`makeWebPage("https://secondarylink.com/seclink/news")` — `htmlPage: null`,
`status: "pending"`.

## API (exports)

| export | signature | purpose |
|---|---|---|
| `SEED_URL` | `string` | the seed URL constant |
| `initDb()` | `() => Promise<Collection<WebPage>>` | open/create db, seed, return collection. **Call once before anything else.** |
| `getCollection()` | `() => Collection<WebPage>` | the live collection (throws if not initialised) |
| `getNextPageToScrape()` | `() => WebPageDoc \| null` | first row with `htmlPage === null` |
| `findByUrl(url)` | `(string) => WebPageDoc \| null` | lookup by unique url |
| `enqueueUrl(url, extra?)` | `(string, Partial<WebPage>?) => WebPageDoc` | add if absent (dedup by url); returns existing/new row |
| `saveScrapedHtml(doc, fields)` | `(WebPageDoc, Pick<WebPage,"htmlPage"> & Partial<WebPage>) => WebPageDoc` | store HTML (+optional parsed fields), set `htmlPageLength`, default `status` to `scraped`, persist |
| `makeWebPage(url, extra?)` | `(string, Partial<WebPage>?) => WebPage` | build a row with defaults (`htmlPage: null`) |
| `flush()` | `() => Promise<void>` | force a save to disk |

## Typical usage

```ts
import { initDb, getNextPageToScrape, saveScrapedHtml, enqueueUrl } from "./db.ts";

await initDb();

const page = getNextPageToScrape();      // htmlPage === null
if (page) {
  const html = await scrapeSomehow(page.url);
  saveScrapedHtml(page, { htmlPage: html });   // flips it out of the queue
  // discovered links become new queue entries:
  for (const link of extractedLinks) enqueueUrl(link);
}
```

## Notes
- `scrapedAt === null` is the queue predicate the running app (`CheckToScrape` in
  `scrape-pages.ts`) uses to find the next page to scrape. `saveScrapedHtml` stamps
  `scrapedAt` with the current time on every save, removing the row from the queue.
- `editUrl(id, url, clickAction, rescrape)` always updates `url`/`clickAction`, but
  only clears `scrapedAt` when `rescrape` is `true` (wired to the "Re-scrape this
  page" checkbox in the client's edit dialog) — it never touches `htmlPage`,
  `htmlPageLength`, `status`, or `statusMessage`. Editing a URL no longer discards
  the previously scraped content by itself; the row keeps showing its old data
  until the explicit re-scrape completes and `saveScrapedHtml` overwrites it.
- `getNextPageToScrape()` (unused by the running app, kept as a convenience export)
  keys off `htmlPage === null` instead of `scrapedAt` — since `editUrl` no longer
  moves the two fields together, they can now diverge (e.g. `scrapedAt: null` with
  `htmlPage` still populated, mid-re-scrape). `CheckToScrape` is the source of truth
  for the running app's queue behavior.
- The process stays alive while the Loki autosave timer is active — expected for
  a long-running server; a short script should exit explicitly.
