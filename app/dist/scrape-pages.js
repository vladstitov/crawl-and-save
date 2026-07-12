// Node.js controller for the "Scrape HTML Bridge" Chrome extension.
//
// Runs a WebSocket server that the extension's service worker connects to.
// When the extension connects, we ask the database for the next row still
// needing a scrape and tell the extension to navigate there. The extension
// waits for the page (and its async data) to finish loading, scrapes the
// full HTML, and sends it back here, where we save it into the matching
// database row.
//
// Usage:
//   npm install
//   npm start
//   (then make sure the extension is loaded in your open Chrome)
//
//   Press <Enter> in this terminal to check for another page to scrape.
import { WebSocketServer, WebSocket } from "ws";
import { initDb, getCollection, saveScrapedHtml } from "./db.js";
const PORT = 8765;
// Tuning passed to the extension's page-settle logic (all milliseconds).
// Wire-protocol types (ScrapeOpts, NavigateCommand, StatusMessage,
// HtmlMessage, ErrorMessage, FromExtension) are declared globally in
// src/types.d.ts.
const SCRAPE_OPTS = {
    idleMs: 1500, // require this much network/DOM quiet before scraping
    maxMs: 30000, // hard cap on how long to wait for the page to settle
    settleMs: 500, // extra grace after quiet, before snapshotting
};
// --- helpers -----------------------------------------------------------------
function formatStatusExtra(msg) {
    const bits = [];
    if (msg.url)
        bits.push(msg.url);
    if (msg.waitedMs != null)
        bits.push(`waited ${msg.waitedMs}ms`);
    if (msg.timedOut)
        bits.push("(timed out)");
    if (msg.readyState)
        bits.push(msg.readyState);
    return bits.length ? ` — ${bits.join(", ")}` : "";
}
// --- server ------------------------------------------------------------------
await initDb();
const wss = new WebSocketServer({ port: PORT });
console.log(`[app] WebSocket server listening on ws://localhost:${PORT}`);
console.log("[app] Waiting for the Chrome extension to connect...\n");
let activeSocket = null;
// The row currently out for scraping — set by checkToScrape(), consumed when
// the "html" result comes back so we know which record to update.
let pendingDoc = null;
function requestScrape(ws, url) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("[app] No extension connected — cannot start scrape.");
        return;
    }
    console.log(`[app] -> asking browser to navigate to: ${url}`);
    const command = { action: "navigate", url, ...SCRAPE_OPTS };
    ws.send(JSON.stringify(command));
}
/**
 * Look up one row from the database whose `url` is set and whose `scrapedAt`
 * is still null, then kick off a scrape for it. Does nothing if every row
 * has already been scraped.
 */
function CheckToScrape(ws) {
    const doc = getCollection().findOne({
        url: { $ne: null },
        scrapedAt: null,
    });
    if (!doc) {
        console.log("[app] No pending pages to scrape.");
        return;
    }
    pendingDoc = doc;
    requestScrape(ws, doc.url);
}
// Check the database for a pending page right away, in case an extension
// is already connected by the time the server finishes starting up.
CheckToScrape(activeSocket);
wss.on("connection", (ws) => {
    activeSocket = ws;
    console.log("[app] Extension connected.");
    // Drive the open browser as soon as the extension is available.
    CheckToScrape(ws);
    ws.on("message", async (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        }
        catch {
            console.log("[app] Received non-JSON message; ignoring.");
            return;
        }
        switch (msg.type) {
            case "status":
                console.log(`[app]    status: ${msg.phase}${formatStatusExtra(msg)}`);
                break;
            case "html": {
                console.log(`[app] <- received HTML (${msg.bytes ?? msg.html.length} chars) from ${msg.finalUrl}`);
                if (pendingDoc) {
                    saveScrapedHtml(pendingDoc, {
                        htmlPage: msg.html,
                        htmlPageLength: msg.bytes ?? msg.html.length,
                    });
                    console.log(`[app] Saved HTML to database row for ${pendingDoc.url}\n`);
                    pendingDoc = null;
                }
                console.log("[app] Press <Enter> to check for another page to scrape, or Ctrl+C to quit.");
                break;
            }
            case "error":
                console.error(`[app] Extension error: ${msg.message}`);
                break;
            default:
                console.log("[app] Unknown message:", msg);
        }
    });
    ws.on("close", () => {
        if (activeSocket === ws)
            activeSocket = null;
        console.log("[app] Extension disconnected.");
    });
    ws.on("error", (err) => {
        console.error("[app] Socket error:", err.message);
    });
});
// Let the operator re-trigger a scrape by pressing Enter.
process.stdin.on("data", () => {
    if (activeSocket) {
        CheckToScrape(activeSocket);
    }
    else {
        console.log("[app] No extension connected yet.");
    }
});
process.on("SIGINT", () => {
    console.log("\n[app] Shutting down.");
    wss.close(() => process.exit(0));
});
//# sourceMappingURL=scrape-pages.js.map