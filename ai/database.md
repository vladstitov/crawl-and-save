# Database (`app/src/db.ts`) — LokiJS

Embedded document DB (LokiJS) persisted to `app/data/scrape.db.json`
(auto-created; autosave every 2s). Holds the scrape queue.

## Collection: `webPages`

Indexes: `url` is a **unique** index; `status` and `htmlPage` are indexed.

### Row shape — `WebPage` (defined in `app/src/types.d.ts`)

| field | type | meaning |
|---|---|---|
| `_id` | `string` | app-generated UUID (`crypto.randomUUID()`) |
| `pageKind` | `string` | caller-defined page classification |
| `url` | `string` | page URL (unique) |
| `parentPageId` | `string \| null` | ID of the page that discovered or opened this page, if any |
| `htmlPage` | `string \| null` | scraped HTML; **null = not scraped yet** |
| `htmlPageLength` | `number \| null` | length of `htmlPage` |
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
- `htmlPage === null` is the queue predicate. Setting `htmlPage` to a string (even
  `""` via `saveScrapedHtml`) removes the row from the queue.
- The process stays alive while the Loki autosave timer is active — expected for
  a long-running server; a short script should exit explicitly.
- Field name `paredData` is kept exactly as specified (likely intended
  `parsedData`); rename in `types.d.ts` + `db.ts` if desired.
