// Express server for browsing the scrape database in a web browser.
//
// Exposes read-only JSON endpoints over the `webPages` LokiJS collection
// (see db.ts) so you can inspect the scrape queue without opening the raw
// app/data/scrape.db.json file by hand.
//
// Usage:
//   npm run web
//   (then open http://localhost:8766/pages in a browser)

import express from "express";
import cors from "cors";
import { initDb, getCollection, enqueueUrl, editUrl, deleteUrl } from "./db.js";

const PORT = 8766;

await initDb();

const app = express();
app.use(cors());
app.use(express.json());

/** List every row in the `webPages` collection. */
app.get("/pages", (_req, res) => {
  res.json(getCollection().find());
});

/** Look up a single row by its `_id`. */
app.get("/pages/:id", (req, res) => {
  const doc = getCollection().findOne({ _id: req.params.id });
  if (!doc) {
    res.status(404).json({ error: `No page with _id ${req.params.id}` });
    return;
  }
  res.json(doc);
});

/** Enqueue a new URL to be scraped. */
app.post("/pages", (req, res) => {
  const { url, clickAction } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing or invalid 'url' in JSON body" });
    return;
  }
  
  // enqueueUrl returns existing if already present, ensuring deduplication.
  const doc = enqueueUrl(url, { clickAction });
  res.json(doc);
});

/** Update URL. */
app.put("/pages/:id", (req, res) => {
  const { url, clickAction } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing or invalid 'url' in JSON body" });
    return;
  }
  const id = req.params.id;
  
  const doc = editUrl(id, url, clickAction);
  if (!doc) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  res.json(doc);
});

/** Delete URL. */
app.delete("/pages/:id", (req, res) => {
  const id = req.params.id;
  const deleted = deleteUrl(id);
  if (!deleted) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`[web] Database browser listening on http://localhost:${PORT}`);
  console.log(`[web] GET /pages      -> list all rows`);
  console.log(`[web] GET /pages/:id  -> one row by _id`);
  console.log(`[web] POST /pages     -> auto-creates a new row { url }`);
  console.log(`[web] PUT /pages/:id  -> updates the url of an existing row by _id`);
  console.log(`[web] DELETE /pages/:id -> deletes a row by _id`);
});
