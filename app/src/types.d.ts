// Wire-protocol definitions for the Scrape HTML Bridge app.
//
// Declared globally (this file has no import/export, so its declarations are
// ambient) and therefore visible to scrape-pages.ts without a runtime
// import. A .d.ts emits no JavaScript, so there is nothing to load at
// runtime.
//
// These mirror the extension's own definitions in extension/src/types.d.ts —
// the two are separate TypeScript projects with no shared package, so the
// contract is kept in sync by hand.

// --- shared tuning -----------------------------------------------------------

/** Page-settle tuning sent to the extension and forwarded into the page. */
interface ScrapeOpts {
  idleMs: number;
  maxMs: number;
  settleMs: number;
}

// --- app -> extension --------------------------------------------------------

/** Command telling the extension to navigate and scrape. */
interface NavigateCommand extends ScrapeOpts {
  action: "navigate";
  url: string;
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
  readyState?: string;
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

/** Reports a failure from the extension. */
interface ErrorMessage {
  type: "error";
  message: string;
}

/** Anything the extension may send to the app. */
type FromExtension = StatusMessage | HtmlMessage | ErrorMessage;

// --- database ----------------------------------------------------------------

/** Any JSON-serialisable value. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * A row in the `webPages` LokiJS collection. `htmlPage === null` marks a page
 * that still needs scraping — that's how the app picks the next URL.
 */
interface WebPage {
  /** Unique identifier for the page record in the database. */
  _id: string;
  /** Classification or template type of the page. */
  pageKind: string;
  /** The target URL to be scraped or that has been scraped. */
  url: string;
  /** ID of the page that discovered or opened this page, if any. */
  parentPageId: string | null;
  /** The raw HTML content of the page. Null if not yet scraped. */
  htmlPage: string | null;
  /** Length of the HTML content in characters. Null if not yet scraped. */
  htmlPageLength: number | null;
  /** ISO 8601 timestamp of when the page was scraped. Null if not yet scraped. */
  scrapedAt: string | null;
  /** Extracted or parsed JSON data from the scraped HTML. */
  parsedData: JsonValue | null;
  /** Collection of clickable buttons found on the page. */

  pageInputs: { name: string, id: string, belongsTo: string,  querySelector: string }[];
  /** Collection of hyperlinks discovered on the page. */
  pageLinks: { url: string, title: string, text: string, belongsTo: string, querySelector: string, id: string }[];

  /** Current processing state (e.g., pending, in_progress, completed, failed). */
  status: string;
  /** Additional details or error messages related to the current status. */
  statusMessage: string;
  /** Identifier or name of the workflow this page is associated with. */
  Workflow: string;
  /** Identifier or name of the processing pipeline associated with this page. */
  Pipeline: string;
  /** Default or triggered action to perform when interacting with this page. */
  clickAction: string;
}
