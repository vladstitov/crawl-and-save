import { JSDOM } from "jsdom";
import { initDb, getCollection, flush } from "./db.js";
/** Extract `<a>` links and form-ish inputs out of a raw HTML string. */
export function extractLinksAndInputs(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    try {
        return extractFromDocument(document);
    }
    finally {
        // JSDOM retains its window (timers, event loop refs) until explicitly
        // closed. Without this, parsing many pages in a loop leaks memory until
        // the heap is exhausted.
        dom.window.close();
    }
}
function extractFromDocument(document) {
    const links = [];
    document.querySelectorAll("a").forEach((a) => {
        let parent = a.parentElement;
        let belongsTo = "";
        while (parent) {
            if (parent.id) {
                belongsTo = parent.id;
                break;
            }
            if (parent.getAttribute("name")) {
                belongsTo = parent.getAttribute("name");
                break;
            }
            parent = parent.parentElement;
        }
        links.push({
            url: a.href || "",
            title: a.title || "",
            text: a.textContent?.trim() || "",
            belongsTo: belongsTo,
            querySelector: "a",
            id: a.id || ""
        });
    });
    const inputs = [];
    document.querySelectorAll("input, textarea, select, button").forEach((el) => {
        let parent = el.parentElement;
        let belongsTo = "";
        while (parent) {
            if (parent.id) {
                belongsTo = parent.id;
                break;
            }
            if (parent.getAttribute("name")) {
                belongsTo = parent.getAttribute("name");
                break;
            }
            parent = parent.parentElement;
        }
        inputs.push({
            name: el.getAttribute("name") || "",
            id: el.id || "",
            belongsTo: belongsTo,
            querySelector: el.tagName.toLowerCase()
        });
    });
    return { links, inputs };
}
/**
 * The next scraped-but-not-yet-parsed row, or undefined when none remain.
 * "Unparsed" = has HTML worth parsing (`htmlPageLength > 300`) and no
 * `parsedAt` marker. A row is "parsed" once `parsedAt` is set, so pages that
 * legitimately contain zero links are not re-parsed on every run. The
 * `!("parsedAt" in doc)` guard also catches legacy rows saved before the field
 * existed (LokiJS `{parsedAt: null}` only matches an explicit null).
 */
function nextUnparsedDoc() {
    return getCollection()
        .chain()
        .find({ htmlPageLength: { $gt: 300 }, htmlPage: { $ne: null } })
        .where((d) => d.parsedAt == null || !("parsedAt" in d))
        .limit(1)
        .data()[0];
}
export async function parseHtml() {
    await initDb();
    const coll = getCollection();
    let count = 0;
    // Fetch, parse, and mark one document at a time. Each iteration re-queries
    // for the next unparsed row, so we only ever hold a single page's HTML/DOM in
    // memory — parsing the whole backlog in one batch exhausts the heap and
    // re-serializes the (large) database on every autosave tick.
    for (let doc = nextUnparsedDoc(); doc; doc = nextUnparsedDoc()) {
        if (!doc.htmlPage) {
            // Defensive: no HTML to parse, but still mark it so we don't loop forever.
            doc.parsedAt = new Date().toISOString();
            coll.update(doc);
            continue;
        }
        const { links, inputs } = extractLinksAndInputs(doc.htmlPage);
        doc.pageLinks = links;
        doc.pageInputs = inputs;
        doc.parsedAt = new Date().toISOString();
        coll.update(doc);
        count++;
        console.log(`[${count}] Parsed ${doc._id} (${doc.url}) — ${links.length} links, ${inputs.length} inputs.`);
    }
    if (count === 0) {
        console.log("No unparsed pages found.");
    }
    else {
        console.log(`Done — parsed ${count} page(s).`);
    }
}
// If run directly
import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    parseHtml()
        .then(() => flush()) // ensure the final state is written to disk
        .catch(console.error)
        // LokiJS's autosave timer keeps the event loop alive, so exit explicitly.
        .finally(() => process.exit(0));
}
//# sourceMappingURL=parse-html-page.js.map