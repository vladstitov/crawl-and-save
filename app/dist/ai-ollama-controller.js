// Ollama controller — a thin client for classifying scrape data with a local LLM.
//
// Talks to an Ollama server's HTTP API (default http://192.168.5.32:11434) and
// exposes a small set of *preset prompts* for yes/no decisions the crawler
// needs. The flagship use is link triage: distrebute-links.ts asks
// `isSecondaryNewsLink(link)` for each discovered link and only enqueues the
// ones the model says are secondary-market news.
//
// Config via environment variables (all optional):
//   OLLAMA_URL       base URL of the server   (default http://192.168.5.32:11434)
//   OLLAMA_MODEL     model tag to use         (default qwen2.5:latest)
//   OLLAMA_TIMEOUT   per-request timeout, ms  (default 60000)
//
// Node 20+ provides a global `fetch`, so this module has no dependencies.
export const config = {
    baseUrl: (process.env.OLLAMA_URL ?? "http://192.168.5.32:11434").replace(/\/+$/, ""),
    model: process.env.OLLAMA_MODEL ?? "qwen2.5:latest",
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT ?? 60000),
};
// --- preset prompts ----------------------------------------------------------
//
// Each preset is a canned question the crawler can ask about a piece of data.
// Add new ones here rather than scattering prompt strings through the codebase.
export const PRESETS = {
    /**
     * Is a discovered link a secondary-market news article worth scraping?
     * Answered per link, YES/NO.
     */
    secondaryNewsLink: {
        system: "You classify hyperlinks found on a private-equity secondaries news " +
            "website. Consider the URL and the link text. A link qualifies only if " +
            "it points to a NEWS ARTICLE about private-equity secondaries — e.g. " +
            "continuation funds, LP-led or GP-led secondary transactions, CVs, " +
            "strip sales, or secondary-market fundraising/deals/people moves. " +
            "Navigation, categories, tags, logins, social links, privacy/terms, and " +
            "unrelated pages do NOT qualify. Answer with exactly one word: YES or NO.",
        build: (link) => `Is this link a news article about private-equity secondaries?\n` +
            `URL: ${link.url}\n` +
            `Link text: ${link.text?.trim() || "(none)"}\n` +
            `Answer YES or NO.`,
    },
};
// --- low-level API -----------------------------------------------------------
/**
 * Send a one-shot generation request to Ollama and return the raw response
 * text. Throws on network error, non-2xx, or timeout.
 */
export async function generate(prompt, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
        const res = await fetch(`${config.baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                model: opts.model ?? config.model,
                system: opts.system,
                prompt,
                stream: false,
                keep_alive: config.keepAlive,
                // Deterministic, and cap output — these presets only need a word.
                options: { temperature: 0, num_predict: opts.numPredict ?? 5 },
            }),
        });
        if (!res.ok) {
            throw new Error(`Ollama HTTP ${res.status}: ${await res.text().catch(() => "")}`);
        }
        const data = (await res.json());
        return (data.response ?? "").trim();
    }
    catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`Ollama request timed out after ${config.timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Ask a preset question and parse the reply as a yes/no answer.
 * Returns `true` for YES, `false` for NO, and `null` when the reply is neither
 * (so callers can decide how to treat an ambiguous/failed classification).
 */
export async function askPresetYesNo(preset, input) {
    const reply = await generate(preset.build(input), { system: preset.system });
    return parseYesNo(reply);
}
/** Interpret an LLM reply as YES (true), NO (false), or unknown (null). */
export function parseYesNo(reply) {
    const m = reply.toLowerCase().match(/\b(yes|no)\b/);
    if (!m)
        return null;
    return m[1] === "yes";
}
// --- high-level helpers ------------------------------------------------------
/**
 * Classify a single link as secondary-market news or not.
 *
 * Returns `true` only on an explicit YES. On NO the result is `false`. On an
 * ambiguous reply or an error talking to Ollama, the outcome is decided by
 * `onErrorEnqueue`:
 *   - false (default): treat as "not news" → link is ignored. Matches the
 *     strict "only enqueue on YES" rule, but a server outage silently drops
 *     every link, so failures are logged.
 *   - true: treat unknown/error as "news" (fail-open) so a flaky model doesn't
 *     stall the crawl.
 */
export async function isSecondaryNewsLink(link, onErrorEnqueue = false) {
    try {
        const verdict = await askPresetYesNo(PRESETS.secondaryNewsLink, link);
        if (verdict === null) {
            console.warn(`[ollama] ambiguous verdict for ${link.url} — ${onErrorEnqueue ? "keeping" : "skipping"}`);
            return onErrorEnqueue;
        }
        return verdict;
    }
    catch (err) {
        console.warn(`[ollama] classification failed for ${link.url}: ${err instanceof Error ? err.message : err}` +
            ` — ${onErrorEnqueue ? "keeping" : "skipping"}`);
        return onErrorEnqueue;
    }
}
/** Quick reachability check — true if the Ollama server responds. */
export async function ping() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
        const res = await fetch(`${config.baseUrl}/api/tags`, { signal: controller.signal });
        return res.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=ai-ollama-controller.js.map