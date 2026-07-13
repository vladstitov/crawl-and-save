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
let db;
let webPages;
/**
 * Build a fresh WebPage with sensible defaults. `htmlPage` starts null, which
 * flags the row as "needs scraping".
 */
export function makeWebPage(url, extra = {}) {
    return {
        _id: randomUUID(),
        pageKind: "",
        url,
        parent_id: null,
        htmlPage: null,
        htmlPageLength: null,
        scrapedAt: null,
        parsedData: null,
        pageInputs: [],
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
export function initDb() {
    mkdirSync(DATA_DIR, { recursive: true });
    return new Promise((resolve, reject) => {
        db = new Loki(DB_FILE, {
            autoload: true,
            autoloadCallback: (err) => {
                if (err) {
                    reject(err instanceof Error ? err : new Error(String(err)));
                    return;
                }
                let col = db.getCollection(COLLECTION);
                if (!col) {
                    col = db.addCollection(COLLECTION, {
                        unique: ["url"],
                        indices: ["status", "htmlPage", "scrapedAt"],
                    });
                }
                webPages = col;
                // Seed the first URL on an empty database.
                if (webPages.count() === 0) {
                    webPages.insertOne(makeWebPage(SEED_URL));
                    db.saveDatabase();
                }
                // Backfill `scrapedAt` on rows saved before the field existed. LokiJS's
                // `{scrapedAt: null}` query only matches an explicit null — a row where
                // the key is entirely absent (legacy data) would never match and would
                // be invisible to CheckToScrape's queue query forever.
                const legacyDocs = webPages
                    .find()
                    .filter((doc) => !("scrapedAt" in doc));
                if (legacyDocs.length > 0) {
                    for (const doc of legacyDocs) {
                        doc.scrapedAt = doc.htmlPage != null ? new Date(doc.meta.updated).toISOString() : null;
                    }
                    webPages.update(legacyDocs);
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
export function getCollection() {
    if (!webPages)
        throw new Error("DB not initialised — call initDb() first");
    return webPages;
}
/** Trigger a fire-and-forget save (also happens automatically via autosave). */
export function saveNow() {
    db.saveDatabase();
}
/**
 * The next page still needing a scrape: the first row whose `htmlPage` is null.
 * Returns null when every page has been scraped.
 */
export function getNextPageToScrape() {
    return getCollection().findOne({ htmlPage: null });
}
/**
 * Update the given row's URL/click action. Existing scraped data (`htmlPage`,
 * `htmlPageLength`, `status`, `statusMessage`) is left untouched. Pass
 * `rescrape: true` to also clear `scrapedAt`, re-queuing the row for
 * `CheckToScrape` without discarding anything else. Returns the updated row,
 * or null if not found.
 */
export function editUrl(id, newUrl, clickAction = "", rescrape = false) {
    const col = getCollection();
    const doc = col.findOne({ _id: id });
    if (doc) {
        doc.url = newUrl;
        if (clickAction !== undefined)
            doc.clickAction = clickAction;
        if (rescrape)
            doc.scrapedAt = null;
        col.update(doc);
        db.saveDatabase();
        return doc;
    }
    return null;
}
/** Delete a row by ID. Returns true if found and deleted. */
export function deleteUrl(id) {
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
export function findByUrl(url) {
    return getCollection().findOne({ url });
}
/**
 * Add a URL to the queue if it isn't already present. Returns the existing or
 * newly created row. Useful for enqueuing links discovered while scraping.
 */
export function enqueueUrl(url, extra = {}) {
    const existing = findByUrl(url);
    if (existing)
        return existing;
    return getCollection().insertOne(makeWebPage(url, extra));
}
/** Force a synchronous flush to disk (also happens automatically via autosave). */
export function flush() {
    return new Promise((resolve, reject) => {
        db.saveDatabase((err) => err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve());
    });
}
/** Store the scraped HTML on a row, clearing its "needs scraping" flag. */
export function saveScrapedHtml(doc, fields) {
    const html = fields.htmlPage ?? "";
    doc.htmlPage = html;
    doc.htmlPageLength = fields.htmlPageLength ?? html.length;
    doc.scrapedAt = fields.scrapedAt ?? new Date().toISOString();
    if (fields.pageKind !== undefined)
        doc.pageKind = fields.pageKind;
    if (fields.parsedData !== undefined)
        doc.parsedData = fields.parsedData;
    if (fields.pageInputs !== undefined)
        doc.pageInputs = fields.pageInputs;
    if (fields.pageLinks !== undefined)
        doc.pageLinks = fields.pageLinks;
    doc.status = fields.status ?? "scraped";
    doc.statusMessage = fields.statusMessage ?? "";
    if (fields.Workflow !== undefined)
        doc.Workflow = fields.Workflow;
    if (fields.Pipeline !== undefined)
        doc.Pipeline = fields.Pipeline;
    if (fields.clickAction !== undefined)
        doc.clickAction = fields.clickAction;
    getCollection().update(doc);
    return doc;
}
//# sourceMappingURL=db.js.map