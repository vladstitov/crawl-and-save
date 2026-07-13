// Turns a scraped page's discovered links (`pageLinks`) into new queue rows.
//
// Each link's URL is resolved to an absolute URL against the page it was
// found on and enqueued via `enqueueUrl`, tagging the new row's `parent_id`
// with the id of the page that linked to it — dedup against already-queued
// URLs is handled by `enqueueUrl` itself.

import { enqueueUrl, saveNow, type WebPageDoc } from "./db.js";

/**
 * Enqueue every link on a scraped page's `pageLinks` as a new row. Skips
 * empty/invalid URLs and anything not http(s). Returns the number of links
 * processed (new or already-queued).
 */
export function enqueueLinksFromDoc(doc: WebPageDoc): number {
  let count = 0;
  for (const link of doc.pageLinks) {
    if (!link.url) continue;
    let absolute: string;
    try {
      absolute = new URL(link.url, doc.url).toString();
    } catch {
      continue;
    }
    if (!absolute.startsWith("http://") && !absolute.startsWith("https://")) continue;
    enqueueUrl(absolute, { parent_id: doc._id });
    count++;
  }
  saveNow();
  return count;
}
