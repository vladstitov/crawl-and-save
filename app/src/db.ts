// LokiJS database access for the scraper.
//
// Persists a single `webPages` collection to disk (app/data/scrape.db.json).
// A row whose `htmlPage` is null has not been scraped yet — `getNextPageToScrape`
// returns the next such row so the app knows which URL to hand to the browser.
//
// The collection is seeded with the first URL on an empty database.

import Loki from "lokijs";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Source lives in app/src, compiled output in app/dist — keep the db next to app/.
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "scrape.db.json");
const COLLECTION = "webPages";

/** The first URL the database is seeded with. */
export const SEED_URL = "https://secondarylink.com/seclink/news";

let db: Loki;
let webPages: Loki.Collection<WebPage>;

/** A stored row, including the fields LokiJS adds ($loki, meta). */
export type WebPageDoc = WebPage & LokiObj;

/**
 * Build a fresh WebPage with sensible defaults. `htmlPage` starts null, which
 * flags the row as "needs scraping".
 */
export function makeWebPage(url: string, extra: Partial<WebPage> = {}): WebPage {
  return {
    _id: randomUUID(),
    pageKind: "",
    url,
    htmlPage: null,
    htmlPageLength: null,
    paredData: null,
    pageButtons: [],
    pageLinks: [],
    status: "pending",
    statusMessage: "",
    Workflow: "",
    Pipeline: "",
    clickAction: "",
    ...extra,
  };
}

/** Open (or create) the on-disk database and return the `webPages` collection. */
export function initDb(): Promise<Loki.Collection<WebPage>> {
  mkdirSync(DATA_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    db = new Loki(DB_FILE, {
      autoload: true,
      autoloadCallback: (err: unknown) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }

        let col = db.getCollection<WebPage>(COLLECTION);
        if (!col) {
          col = db.addCollection<WebPage>(COLLECTION, {
            unique: ["url"],
            indices: ["status", "htmlPage"],
          });
        }
        webPages = col;

        // Seed the first URL on an empty database.
        if (webPages.count() === 0) {
          webPages.insertOne(makeWebPage(SEED_URL));
          db.saveDatabase();
        }

        resolve(col);
      },
      autosave: true,
      autosaveInterval: 2000,
    });
  });
}

/** The live `webPages` collection (throws if the db is not initialised yet). */
export function getCollection(): Loki.Collection<WebPage> {
  if (!webPages) throw new Error("DB not initialised — call initDb() first");
  return webPages;
}

/**
 * The next page still needing a scrape: the first row whose `htmlPage` is null.
 * Returns null when every page has been scraped.
 */
export function getNextPageToScrape(): WebPageDoc | null {
  return getCollection().findOne({ htmlPage: null }) as WebPageDoc | null;
}

/** Update the given URL with a new URL (and resets status to pending/null). Returns true if found and updated. */
export function editUrl(id: string, newUrl: string, clickAction: string = ""): WebPageDoc | null {
  const col = getCollection();
  const doc = col.findOne({ _id: id });
  if (doc) {
    doc.url = newUrl;
    if (clickAction !== undefined) doc.clickAction = clickAction;
    doc.htmlPage = null; // Re-scrape on url change
    doc.status = "pending";
    doc.statusMessage = "";
    col.update(doc);
    db.saveDatabase();
    return doc;
  }
  return null;
}

/** Delete a row by ID. Returns true if found and deleted. */
export function deleteUrl(id: string): boolean {
  const col = getCollection();
  const doc = col.findOne({ _id: id });
  if (doc) {
    col.remove(doc);
    db.saveDatabase();
    return true;
  }
  return false;
}

/** Look a row up by URL. */
export function findByUrl(url: string): WebPageDoc | null {
  return getCollection().findOne({ url }) as WebPageDoc | null;
}

/**
 * Add a URL to the queue if it isn't already present. Returns the existing or
 * newly created row. Useful for enqueuing links discovered while scraping.
 */
export function enqueueUrl(url: string, extra: Partial<WebPage> = {}): WebPageDoc {
  const existing = findByUrl(url);
  if (existing) return existing;
  return getCollection().insertOne(makeWebPage(url, extra)) as WebPageDoc;
}

/** Store the scraped HTML on a row, clearing its "needs scraping" flag. */
export function saveScrapedHtml(
  doc: WebPageDoc,
  fields: Pick<WebPage, "htmlPage"> & Partial<WebPage>
): WebPageDoc {
  const html = fields.htmlPage ?? "";
  doc.htmlPage = html;
  doc.htmlPageLength = fields.htmlPageLength ?? html.length;
  if (fields.pageKind !== undefined) doc.pageKind = fields.pageKind;
  if (fields.paredData !== undefined) doc.paredData = fields.paredData;
  if (fields.pageButtons !== undefined) doc.pageButtons = fields.pageButtons;
  if (fields.pageLinks !== undefined) doc.pageLinks = fields.pageLinks;
  doc.status = fields.status ?? "scraped";
  doc.statusMessage = fields.statusMessage ?? "";
  if (fields.Workflow !== undefined) doc.Workflow = fields.Workflow;
  if (fields.Pipeline !== undefined) doc.Pipeline = fields.Pipeline;
  if (fields.clickAction !== undefined) doc.clickAction = fields.clickAction;

  getCollection().update(doc);
  return doc;
}

/** Force a synchronous flush to disk (also happens automatically via autosave). */
export function flush(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.saveDatabase((err?: unknown) =>
      err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()
    );
  });
}
