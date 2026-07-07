# Architecture

## Components

```
┌──────────────────────────┐         ws://localhost:8765        ┌───────────────────────────┐
│  app/  (Node.js)          │◀──────────────────────────────────▶│  extension/  (Chrome MV3) │
│  - WebSocket SERVER       │   navigate cmd  ───────────────▶   │  - WebSocket CLIENT       │
│  - saves HTML to file     │   ◀── status / html / error         │  - drives the open tab    │
│  - LokiJS queue (db.ts)   │                                     │  - waits for load+data    │
└──────────────────────────┘                                     │  - scrapes outerHTML      │
                                                                  └───────────────────────────┘
                                                                              │
                                                                     chrome.scripting
                                                                              ▼
                                                                  ┌───────────────────────────┐
                                                                  │  the target web page      │
                                                                  │  (injected functions run) │
                                                                  └───────────────────────────┘
```

Important: the **server** is in the Node app. The **extension is only a client**.
Anything that "starts/stops" in the extension popup starts/stops the *client
connection*, not a server.

## Data flow (one scrape)

1. App starts, opens WebSocket server on `:8765`.
2. Extension's service worker connects (from an already-open Chrome).
3. On connection the app sends a `navigate` command with the target URL and
   settle-timing options.
4. Extension picks the target tab (active tab of the last focused window),
   navigates it, and waits for `chrome.tabs` status `complete`.
5. Extension injects `waitForPageSettle` into the page: it patches `fetch`/`XHR`
   and runs a `MutationObserver`, resolving only once there are **zero in-flight
   requests and no DOM mutations** for `idleMs`, capped at `maxMs`. This is what
   captures data loaded *after* the initial document.
6. Extension injects `scrapeHtml` and returns `document.documentElement.outerHTML`.
7. Extension sends an `html` message back.
8. App saves the HTML into the matching `webPages` row in the database.

Throughout steps 4–6 the extension emits `status` messages (`navigating`,
`loaded`, `settled`) for progress logging.

## Why "wait for settle"

Many pages fetch their real content via XHR/fetch after `DOMContentLoaded`.
Scraping at the `load` event would miss it. The settle logic waits for network
and DOM quiet so dynamically-rendered data is present in the scraped HTML.

## The database's role (queue)

`app/src/db.ts` maintains a `webPages` collection in LokiJS. Each row is a page.
`htmlPage === null` means "not scraped yet". `getNextPageToScrape()`-style logic
(inlined as `CheckToScrape` in `browser-server.ts`) returns the next such row.
The DB is seeded with `SEED_URL`, and `browser-server.ts` is wired to this queue
(see `state-and-tasks.md`).

## Directory map

```
scrap-html/
├── ai/                      ← this documentation
├── app/                     Node.js controller (separate TS project)
│   ├── src/
│   │   ├── browser-server.ts  WebSocket server + scrape orchestration + DB save
│   │   ├── db.ts            LokiJS connection, queue, seed, CRUD
│   │   └── types.d.ts       ambient wire-protocol + WebPage types
│   ├── dist/                compiled JS (tsc output)
│   ├── data/                LokiJS db file (created at runtime)
│   ├── tsconfig.json
│   └── package.json
└── extension/               Chrome extension (separate TS project)
    ├── manifest.json        MV3; points at dist/background.js + dist/popup.js
    ├── popup.html
    ├── src/
    │   ├── background.ts     service worker: client, tab control, scraping
    │   ├── popup.ts          Start/Stop UI + status
    │   └── types.d.ts        ambient wire-protocol + popup types
    ├── dist/                compiled JS (tsc output) — referenced by manifest
    ├── tsconfig.json
    └── package.json
```
