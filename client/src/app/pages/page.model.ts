// Mirrors the `WebPage` / `WebPageDoc` shape from app/src/types.d.ts and
// app/src/db.ts. Kept here by hand since the client is a separate project.

export interface LokiMeta {
  created: number;
  revision: number;
  updated: number;
  version: number;
}

export interface WebPage {
  $loki: number;
  meta: LokiMeta;
  _id: string;
  pageKind: string;
  url: string;
  parentPageId?: string | null;
  htmlPage: string | null;
  htmlPageLength: number | null;
  scrapedAt: string | null;
  parsedData: unknown;
  // Optional: rows created before the field existed don't have it.
  pageInputs?: unknown[];
  pageLinks: unknown[];
  status: string;
  statusMessage: string;
  Workflow: string;
  Pipeline: string;
  clickAction: string;
}
