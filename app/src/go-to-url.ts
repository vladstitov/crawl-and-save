// Queue a URL for scraping.
//
// Records a new `webPages` row for the given URL so the scraper (scrape-pages.ts)
// picks it up on its next queue check. The URL comes from an external source and
// is handed here by a calling controller:
//
//   import { goToUrl } from "./go-to-url.js";
//   const { doc, created } = await goToUrl(url);

// `WebPage` is an ambient global declared in src/types.d.ts — not a db.js export.
import { initDb, enqueueUrl, getCollection, type WebPageDoc } from "./db.js";

/**
 * Add `url` to the scrape queue and return the row.
 *
 * Deduplicates: if the URL is already in the database (queued or already
 * scraped), the existing row is returned untouched and `created` is false — no
 * duplicate is inserted and nothing is re-queued. A freshly inserted row starts
 * with `htmlPage`/`scrapedAt` null, which is what marks it as "needs scraping".
 *
 * `extra` lets callers stamp fields on new rows (e.g. `parent_id`, `pageKind`).
 */
export async function goToUrl(
  url: string,
  extra: Partial<WebPage> = {}
): Promise<{ doc: WebPageDoc; created: boolean }> {
  const trimmed = url?.trim();
  if (!trimmed) {
    throw new Error("goToUrl: a non-empty url is required");
  }

  // Validate it's a real absolute http(s) URL before storing it.
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`goToUrl: invalid URL: ${JSON.stringify(url)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`goToUrl: unsupported protocol: ${parsed.protocol}`);
  }

  await initDb();

  // enqueueUrl already dedupes; compare row counts to report whether this call
  // actually inserted a new row versus finding an existing one.
  const before = getCollection().count();
  const doc = enqueueUrl(parsed.href, extra);
  const created = getCollection().count() > before;

  return { doc, created };
}
