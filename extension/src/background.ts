// Service worker: keeps a WebSocket open to the local Node.js app and drives
// the currently open browser on its behalf.
//
// Protocol (JSON over WebSocket):
//   app  -> ext : { action: "navigate", url, idleMs?, maxMs?, settleMs? }
//   ext  -> app : { type: "status",  phase, ... }
//   ext  -> app : { type: "html",    url, finalUrl, title, html, bytes }
//   ext  -> app : { type: "error",   message }

const WS_URL = "ws://localhost:8765";

// All wire-protocol types (NavigateCommand, SettleOpts, SettleInfo,
// ScrapedPage, StatusMessage, HtmlMessage, ErrorMessage, FromApp, ToApp,
// StatusResponse) are declared globally in src/types.d.ts and shared with
// popup.ts.

// --- connection --------------------------------------------------------------

const STORAGE_KEY = "socketEnabled";

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
// Whether the socket is *meant* to be running. Toggled by the popup's
// Start/Stop buttons and persisted so it survives service-worker restarts.
let enabled = false;

function log(...args: unknown[]): void {
  console.log("[scrape-bridge]", ...args);
}

function currentStatus(): StatusResponse {
  return {
    enabled,
    connected: !!(socket && socket.readyState === WebSocket.OPEN),
  };
}

function send(obj: ToApp): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

function connect(): void {
  clearTimeout(reconnectTimer);
  if (!enabled) return;
  // Don't stack connections if one is already open/connecting.
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  log("connecting to", WS_URL);

  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    log("connected to app");
    send({ type: "status", phase: "connected" });
  };

  socket.onmessage = async (event: MessageEvent) => {
    let msg: FromApp;
    try {
      msg = JSON.parse(event.data as string) as FromApp;
    } catch {
      send({ type: "error", message: "invalid JSON from app" });
      return;
    }

    if (msg.action === "navigate") {
      await handleNavigate(msg);
    }
  };

  socket.onclose = () => {
    log("socket closed");
    scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose fires right after; reconnect handled there.
  };
}

function scheduleReconnect(): void {
  clearTimeout(reconnectTimer);
  if (!enabled) return; // Stop was pressed — don't auto-reconnect.
  reconnectTimer = setTimeout(connect, 2000);
}

// --- start / stop (driven by the popup) --------------------------------------

async function startSocket(): Promise<void> {
  enabled = true;
  await chrome.storage.local.set({ [STORAGE_KEY]: true });
  log("start requested");
  connect();
}

async function stopSocket(): Promise<void> {
  enabled = false;
  await chrome.storage.local.set({ [STORAGE_KEY]: false });
  clearTimeout(reconnectTimer);
  log("stop requested");
  if (socket) {
    socket.close();
    socket = null;
  }
}

// --- core: navigate the active tab, wait for load + data, scrape HTML ---------

async function handleNavigate(cmd: NavigateCommand): Promise<void> {
  const { url, idleMs = 1500, maxMs = 30000, settleMs = 500 } = cmd;
  try {
    send({ type: "status", phase: "navigating", url });

    const tab = await getTargetTab();
    const tabId = tab.id;
    if (tabId == null) throw new Error("no usable tab id");

    await chrome.tabs.update(tabId, { url, active: true });

    // 1. Wait until the tab's own load lifecycle reports complete.
    await waitForTabComplete(tabId, maxMs);
    send({ type: "status", phase: "loaded", tabId });

    // 2. Wait inside the page until network/DOM activity settles, so that
    //    data fetched after load (XHR/fetch-rendered content) is present.
    const settleOpts: SettleOpts = { idleMs, maxMs, settleMs };
    const [settleResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: waitForPageSettle,
      args: [settleOpts],
    });
    const settleInfo = settleResult.result as SettleInfo;
    send({ type: "status", phase: "settled", ...settleInfo });

    // 3. Scrape the full HTML.
    const [scrapeResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeHtml,
    });
    const page = scrapeResult.result as ScrapedPage;

    send({
      type: "html",
      url,
      finalUrl: page.finalUrl,
      title: page.title,
      html: page.html,
      bytes: page.html.length,
    });
    log("scraped", page.html.length, "chars from", page.finalUrl);
  } catch (err) {
    log("navigate failed", err);
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", message });
  }
}

// Pick the tab to drive: the active tab of the last focused normal window,
// falling back to any active tab, or a freshly created one.
async function getTargetTab(): Promise<chrome.tabs.Tab> {
  let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tabs[0]) return tabs[0];

  tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) return tabs[0];

  return chrome.tabs.create({ active: true });
}

// Resolve when the tab fires status "complete" (or maxMs elapses).
function waitForTabComplete(tabId: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };

    const listener = (
      updatedTabId: number,
      info: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);

    // In case the tab is already complete by the time we attach.
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab && tab.status === "complete") finish();
    });

    const timer = setTimeout(finish, maxMs);
  });
}

// --- functions injected into the page (must be self-contained) ---------------

// Waits until the page goes quiet: no new DOM mutations and no in-flight
// fetch/XHR for `idleMs`, capped at `maxMs`. This is what makes us wait for
// "all data loaded" rather than just the initial document.
function waitForPageSettle(opts: SettleOpts): Promise<SettleInfo> {
  const { idleMs, maxMs, settleMs } = opts;
  return new Promise((resolve) => {
    const start = Date.now();
    let lastActivity = Date.now();
    let inFlight = 0;

    const w = window as typeof window & {
      __scrapeFetchPatched?: boolean;
      __scrapeXhrPatched?: boolean;
    };

    // Track outstanding network requests.
    const origFetch = w.fetch;
    if (origFetch && !w.__scrapeFetchPatched) {
      w.__scrapeFetchPatched = true;
      w.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
        inFlight++;
        lastActivity = Date.now();
        return origFetch.apply(this, args).finally(() => {
          inFlight = Math.max(0, inFlight - 1);
          lastActivity = Date.now();
        });
      };
    }
    const OrigXHR = w.XMLHttpRequest;
    if (OrigXHR && !w.__scrapeXhrPatched) {
      w.__scrapeXhrPatched = true;
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.send = function (
        this: XMLHttpRequest,
        ...args: Parameters<XMLHttpRequest["send"]>
      ) {
        inFlight++;
        lastActivity = Date.now();
        this.addEventListener(
          "loadend",
          () => {
            inFlight = Math.max(0, inFlight - 1);
            lastActivity = Date.now();
          },
          { once: true }
        );
        return origSend.apply(this, args);
      };
    }

    // Track DOM changes.
    const observer = new MutationObserver(() => {
      lastActivity = Date.now();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    function check() {
      const now = Date.now();
      const quietFor = now - lastActivity;
      const elapsed = now - start;

      if ((inFlight === 0 && quietFor >= idleMs) || elapsed >= maxMs) {
        observer.disconnect();
        // Small extra settle so any final paint/render commits.
        setTimeout(() => {
          resolve({
            waitedMs: Date.now() - start,
            timedOut: elapsed >= maxMs,
            readyState: document.readyState,
          });
        }, settleMs);
      } else {
        setTimeout(check, 100);
      }
    }

    if (document.readyState === "complete") {
      check();
    } else {
      window.addEventListener("load", check, { once: true });
    }
  });
}

function scrapeHtml(): ScrapedPage {
  return {
    finalUrl: location.href,
    title: document.title,
    html: "<!DOCTYPE html>\n" + document.documentElement.outerHTML,
  };
}

// --- popup status bridge -----------------------------------------------------

chrome.runtime.onMessage.addListener(
  (req: PopupRequest, _sender, sendResponse: (r: StatusResponse) => void) => {
    switch (req) {
      case "get-status":
        sendResponse(currentStatus());
        return false;
      case "start-socket":
        startSocket().then(() => sendResponse(currentStatus()));
        return true; // async response
      case "stop-socket":
        stopSocket().then(() => sendResponse(currentStatus()));
        return true; // async response
      default:
        return false;
    }
  }
);

// Kick things off: fetch the current state for popup status display, but don't auto-connect
chrome.storage.local.get(STORAGE_KEY).then((data) => {
  enabled = data[STORAGE_KEY] === true; // default: disabled
});
