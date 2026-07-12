# Build, run, test

Two independent TypeScript projects. Build each separately.

## Prerequisites
- Node.js (ESM support; Node 18+).
- Google Chrome (or Chromium) for the extension.

## App

```bash
cd app
npm install
npm start          # = tsc && node dist/scrape-pages.js  → listens on ws://localhost:8765
# or:
npm run dev        # tsx watch src/scrape-pages.ts (fast reload, no typecheck)
npm run build      # tsc only → dist/
```

Runtime output goes to:
- `app/data/scrape.db.json` — LokiJS database (scraped HTML is saved here, not to a file)

## Extension

```bash
cd extension
npm install
npm run build      # tsc → dist/background.js, dist/popup.js  (REQUIRED before loading)
npm run watch      # rebuild on change
```

Load into Chrome (one time):
1. `chrome://extensions`
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select the `extension/` folder.

After any `.ts` change: `npm run build`, then click **reload** on the extension
card. Changing `manifest.json` permissions also requires a reload.

## End-to-end run
1. `cd app && npm start` (server comes up, waits for the extension).
2. Ensure the extension is built and loaded; open the popup and press **Start**
   if it shows Stopped.
3. The extension connects → app sends `navigate` → page loads & settles →
   HTML is saved to `app/output/`. The app prints the file path.
4. Press **Enter** in the app terminal to scrape the same URL again.

## Typecheck (either project)
```bash
npx tsc --noEmit
```

## Notes for automated/headless environments
- The extension needs a real Chrome with the unpacked extension loaded; it is
  not headless by itself. It drives whatever Chrome it is installed in.
- The DB smoke test: import `app/src/db.ts` via `tsx`, call `initDb()` then
  `getNextPageToScrape()`. The process will not exit on its own (Loki autosave
  timer) — kill it or add an explicit exit.
