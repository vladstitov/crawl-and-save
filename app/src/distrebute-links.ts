// Turns a scraped page's discovered links (`pageLinks`) into new queue rows.
//
// Each link's URL is resolved to an absolute URL against the page it was
// found on and enqueued via `enqueueUrl`, tagging the new row's `parent_id`
// with the id of the page that linked to it — dedup against already-queued
// URLs is handled by `enqueueUrl` itself.

import { enqueueUrl, saveNow, type WebPageDoc } from "./db.js";
import { isSecondaryNewsLink } from "./ai-ollama-controller.js";

/** Resolve a link's URL against its page; return null if not a usable http(s) URL. */
function toAbsoluteHttpUrl(rawUrl: string, base: string): string | null {
  if (!rawUrl) return null;
  let absolute: string;
  try {
    absolute = new URL(rawUrl, base).toString();
  } catch {
    return null;
  }
  if (!absolute.startsWith("http://") && !absolute.startsWith("https://")) return null;
  return absolute;
}

/**
 * Enqueue every link on a scraped page's `pageLinks` as a new row. Skips
 * empty/invalid URLs and anything not http(s). Returns the number of links
 * processed (new or already-queued).
 */
export function enqueueLinksFromDoc(doc: WebPageDoc): number {
  let count = 0;
  for (const link of doc.pageLinks) {
    const absolute = toAbsoluteHttpUrl(link.url, doc.url);
    if (!absolute) continue;
    enqueueUrl(absolute, { parent_id: doc._id });
    count++;
  }
  saveNow();
  return count;
}

/**
 * Like `enqueueLinksFromDoc`, but asks Ollama about each link first and only
 * enqueues the ones classified as secondary-market news. Links are checked one
 * by one (the LLM call is slow, so this can take a while for link-heavy pages).
 * Returns the number of links enqueued.
 *
 * `onErrorEnqueue` is forwarded to the classifier: false (default) drops links
 * on an ambiguous/failed verdict; true keeps them (fail-open).
 */
export async function enqueueNewsLinksFromDoc(
  doc: WebPageDoc,
  onErrorEnqueue = false
): Promise<number> {
  let enqueued = 0;
  for (const link of doc.pageLinks) {
    const absolute = toAbsoluteHttpUrl(link.url, doc.url);
    if (!absolute) continue;

    const keep = await isSecondaryNewsLink({ url: absolute, text: link.text, title: link.title }, onErrorEnqueue);
    if (!keep) continue;

    enqueueUrl(absolute, { parent_id: doc._id });
    enqueued++;
  }
  saveNow();
  return enqueued;
}
