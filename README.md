# Scrape HTML — browser bridge

Drives the **currently open Chrome browser** (via an extension) from a local
**Node.js app** to navigate to a URL, wait for the page and all its async data
to finish loading, scrape the full HTML, and save it into a local database.

Written in **TypeScript** throughout (compiled with `tsc`).

```
scrap-html/
├── app/                 Node.js controller (WebSocket server)
│   ├── src/scrape-pages.ts     WebSocket server + scrape orchestration
│   ├── src/db.ts               LokiJS queue (webPages collection)
│   ├── src/distrebute-links.ts enqueues a scraped page's links as new rows
│   ├── src/parse-html-page.ts  jsdom link/input extraction
│   ├── dist/            compiled JS (npm run build)
│   ├── tsconfig.json
│   └── package.json
└── extension/           Chrome extension (Manifest V3)
    ├── manifest.json
    ├── popup.html       loads dist/popup.js
    ├── src/
    │   ├── background.ts  service worker: connects to the app, drives the tab
    │   └── popup.ts       shows connection status
    ├── dist/            compiled JS (npm run build) — referenced by the manifest
    ├── tsconfig.json
    └── package.json
```

## How it works

1. The app runs a WebSocket server on `ws://localhost:8765`.
2. The extension's service worker connects to it from inside your open Chrome.
3. On connect, the app sends `{ action: "navigate", url, ... }`.
4. The extension navigates the **active tab**, waits for:
   - the tab's load lifecycle to report `complete`, then
   - network (fetch/XHR) **and** DOM mutations to go quiet for `idleMs`
     (so data fetched after initial load is captured).
5. The extension scrapes `document.documentElement.outerHTML` and sends it back.
6. The app parses the HTML for links/inputs, saves everything into the matching
   row of the `webPages` database (`app/data/scrape.db.json`), and enqueues
   every discovered link as a new row (tagged with `parent_id`), so the queue
   grows as the crawl finds more pages.
7. The app automatically checks the queue for the next pending row and repeats
   — no manual step needed between pages.

The next URL to scrape always comes from the database queue — seeded with
`SEED_URL` in [`app/src/db.ts`](app/src/db.ts): `https://secondarylink.com/seclink/news`.
Link discovery/enqueueing lives in [`app/src/distrebute-links.ts`](app/src/distrebute-links.ts).

## Setup & run

**1. Start the app** (compiles TypeScript, then runs)

```bash
cd app
npm install
npm start          # = tsc && node dist/scrape-pages.js
# or, for live-reload during development:
npm run dev        # tsx watch src/scrape-pages.ts
```

**2. Build & load the extension** (one time)

```bash
cd extension
npm install
npm run build      # compiles src/*.ts -> dist/*.js
```

- Open Chrome → `chrome://extensions`
- Enable **Developer mode** (top right)
- Click **Load unpacked** → select the `extension/` folder

> The manifest points at `dist/background.js` and `dist/popup.js`, so the
> extension must be built before loading. Use `npm run watch` to rebuild on
> change (then hit the reload icon on the extension card).

Once both are running, the extension connects automatically and the first
scrape begins. The app logs progress, saves the HTML into the database row for
that URL, and automatically moves on to the next pending page (including any
new pages discovered from links on the one it just scraped) — it keeps going
on its own until the queue is empty. Press **Enter** in the app's terminal to
force a queue check (e.g. if it stalls waiting for the extension); **Ctrl+C**
to quit.

Click the extension's toolbar icon to see whether it's connected to the app.

## Tuning

In `app/src/scrape-pages.ts`, `SCRAPE_OPTS` controls the wait behaviour:

| option     | meaning                                                |
| ---------- | ------------------------------------------------------ |
| `idleMs`   | required network/DOM quiet before scraping (1500 ms)   |
| `maxMs`    | hard cap on total settle wait (30000 ms)               |
| `settleMs` | extra grace after quiet, before the snapshot (500 ms)  |
