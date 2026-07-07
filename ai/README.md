# AI Orientation — scrap-html

This folder documents the `scrap-html` project for an AI agent that needs to
understand or extend it. Read the files in this order:

1. [`architecture.md`](architecture.md) — what the system is and how data flows
2. [`protocol.md`](protocol.md) — the exact WebSocket message contract (the seam
   between the two components)
3. [`app.md`](app.md) — the Node.js controller (`app/`)
4. [`extension.md`](extension.md) — the Chrome extension (`extension/`)
5. [`database.md`](database.md) — the LokiJS schema and API (`app/src/db.ts`)
6. [`build-run.md`](build-run.md) — how to build, run, and test
7. [`state-and-tasks.md`](state-and-tasks.md) — what is wired vs. not, and the
   natural next steps

## One-paragraph summary

A local **Node.js app** (`app/`) runs a WebSocket server. A **Chrome extension**
(`extension/`) connects to it as a client from an already-open browser. The app
tells the extension to navigate a tab to a URL; the extension waits for the page
*and its async data* to finish loading, scrapes the full HTML, and sends it back;
the app saves it to a file. A **LokiJS database** (`app/src/db.ts`) holds a queue
of pages to scrape (`webPages` collection); a row with `htmlPage === null` is one
that still needs scraping.

## Key facts

- **Language:** TypeScript everywhere, compiled with `tsc`.
- **Two separate TS projects:** `app/` and `extension/`, each with its own
  `package.json`, `tsconfig.json`, and `src/types.d.ts`.
- **Types live in `src/types.d.ts`** in each project as ambient global
  declarations (no runtime import; `.d.ts` emits no JS).
- **WebSocket:** `ws://localhost:8765`. App = server, extension = client.
- **Target URL (seed):** `https://secondarylink.com/seclink/news`.
- **Conventions:** the app and extension duplicate the wire-protocol types by
  hand (no shared package). Keep both `types.d.ts` in sync when changing the
  protocol.
