/// <reference types="chrome" />

// Shared wire-protocol definitions for the Scrape HTML Bridge extension.
//
// These are declared globally (this file has no import/export, so its
// declarations are ambient) and are therefore visible to BOTH the service
// worker (background.ts) and the popup (popup.ts) without a runtime import.
// A .d.ts file emits no JavaScript, so there is nothing to load at runtime.
//
// Every object that crosses a function boundary — over the WebSocket, into an
// injected page function, or between the popup and the worker — has a named
// definition here.

// --- app -> extension --------------------------------------------------------

/** Page-settle tuning, sent by the app and forwarded into the page. */
interface SettleOpts {
  idleMs: number;
  maxMs: number;
  settleMs: number;
}

/** Command telling the extension to navigate and scrape. */
interface NavigateCommand extends Partial<SettleOpts> {
  action: "navigate";
  url: string;
}

/** Anything the app may send to the extension. */
type FromApp = NavigateCommand;

// --- produced inside the page (injected functions) ---------------------------

/** Result of waiting for the page to go quiet. */
interface SettleInfo {
  waitedMs: number;
  timedOut: boolean;
  readyState: DocumentReadyState;
}

/** Snapshot of the scraped page. */
interface ScrapedPage {
  finalUrl: string;
  title: string;
  html: string;
}

// --- extension -> app --------------------------------------------------------

/** Progress update; the optional fields carry phase-specific detail. */
interface StatusMessage {
  type: "status";
  phase: string;
  url?: string;
  tabId?: number;
  waitedMs?: number;
  timedOut?: boolean;
  readyState?: DocumentReadyState;
}

/** Delivers the scraped HTML back to the app. */
interface HtmlMessage {
  type: "html";
  url: string;
  finalUrl: string;
  title: string;
  html: string;
  bytes: number;
}

/** Reports a failure to the app. */
interface ErrorMessage {
  type: "error";
  message: string;
}

/** Anything the extension may send to the app. */
type ToApp = StatusMessage | HtmlMessage | ErrorMessage;

// --- popup <-> service worker ------------------------------------------------

/** Commands the popup can send to the service worker. */
type PopupRequest = "get-status" | "start-socket" | "stop-socket";

/** Reply to any popup request: the current socket state. */
interface StatusResponse {
  /** Whether the socket is *meant* to be running (Start pressed, not Stop). */
  enabled: boolean;
  /** Whether the socket is actually connected to the app right now. */
  connected: boolean;
}
