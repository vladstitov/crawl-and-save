import { JSDOM } from "jsdom";
import { initDb, getCollection } from "./db.js";
import { WebPageDoc } from "./db.js";

/** Extract `<a>` links and form-ish inputs out of a raw HTML string. */
export function extractLinksAndInputs(html: string): {
  links: WebPageDoc["pageLinks"];
  inputs: WebPageDoc["pageInputs"];
} {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const links: WebPageDoc["pageLinks"] = [];
  document.querySelectorAll("a").forEach((a) => {
    let parent = a.parentElement;
    let belongsTo = "";
    while (parent) {
      if (parent.id) { belongsTo = parent.id; break; }
      if (parent.getAttribute("name")) { belongsTo = parent.getAttribute("name")!; break; }
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

  const inputs: WebPageDoc["pageInputs"] = [];
  document.querySelectorAll("input, textarea, select, button").forEach((el) => {
    let parent = el.parentElement;
    let belongsTo = "";
    while (parent) {
      if (parent.id) { belongsTo = parent.id; break; }
      if (parent.getAttribute("name")) { belongsTo = parent.getAttribute("name")!; break; }
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

export async function parseHtml() {
  await initDb();
  const coll = getCollection();

  // Find a record where htmlPage length > 300 and pageLinks is essentially empty/null
  const allDocs = coll.chain().find({ htmlPageLength: { $gt: 300 }, htmlPage: { $ne: null } }).data();
  console.log(`Found ${allDocs.length} docs with htmlPageLength > 300 and htmlPage not null.`);
  const doc = allDocs.find(d => !d.pageLinks || d.pageLinks.length === 0) as WebPageDoc | undefined;

  if (!doc) {
    console.log("No suitable row found.");
    return;
  }

  console.log(`Parsing page _id: ${doc._id}, url: ${doc.url}`);

  if (!doc.htmlPage) {
    console.log("Missing htmlPage");
    return;
  }

  const { links, inputs } = extractLinksAndInputs(doc.htmlPage);

  doc.pageLinks = links;
  doc.pageInputs = inputs;
  
  coll.update(doc);
  console.log(`Updated doc ${doc._id} with ${links.length} links and ${inputs.length} inputs.`);
}

// If run directly
import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  parseHtml().catch(console.error);
}
