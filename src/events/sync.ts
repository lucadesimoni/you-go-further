import type { SwissEvent } from "./events";

/**
 * Keeping the race list current without maintaining it by hand.
 *
 * The curated catalogue carries the weekend each race traditionally falls on,
 * flagged approximate, because Swiss races move by a week or two and a list
 * compiled in code cannot ring them up. That flag is honest but it is not an
 * answer: an athlete tapering for the wrong Saturday has still been failed.
 *
 * Most organisers already publish the real date in a machine-readable form —
 * schema.org `SportsEvent` markup in the page (which is what puts a race in
 * Google's event results) or an `.ics` feed for the calendar button. This
 * module reads those, and `scripts/refresh-events.mjs` runs it across the
 * catalogue and writes what it finds into `confirmed.ts`.
 *
 * **The parsing is the easy half.** The half that matters is refusing bad
 * data, because an automatically-fetched wrong date is worse than a curated
 * approximate one: the approximate date is labelled and the athlete checks it,
 * the fetched one is presented as confirmed and they do not. So a candidate
 * has to survive:
 *
 * - a date that parses, is not in the past, and is inside eighteen months;
 * - a name that recognisably matches the race we asked about;
 * - and no *tie* — an organiser page listing E101, E51 and E35 must not
 *   confirm whichever happened to be parsed first.
 *
 * Anything that fails stays approximate, and the script says which and why.
 */

/** One event as an organiser's page or feed describes it. */
export interface EventCandidate {
  name?: string;
  /** ISO `YYYY-MM-DD`, normalised from whatever the source used. */
  startDate?: string;
  url?: string;
}

/** A date we fetched, kept with its provenance so it can be re-checked. */
export interface ConfirmedDate {
  id: string;
  date: string;
  /** The name the source used, so a wrong match is visible in review. */
  matchedName: string;
  source: "jsonld" | "ics";
  sourceUrl: string;
  fetchedAt: string;
}

/** How far ahead a published date is still plausible. */
export const MAX_LEAD_DAYS = 550;

// --- Parsing ---------------------------------------------------------------

/** Pull every `<script type="application/ld+json">` payload out of a page. */
function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // A single malformed block must not lose the rest of the page — sites
      // routinely ship one broken blob alongside three good ones.
    }
  }
  return out;
}

/** Walk a JSON-LD value, collecting anything that calls itself an Event. */
function collectEvents(node: unknown, into: EventCandidate[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectEvents(n, into);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if ("@graph" in o) collectEvents(o["@graph"], into);
  const type = o["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && /event$/i.test(t))) {
    const start = typeof o.startDate === "string" ? o.startDate : undefined;
    into.push({
      name: typeof o.name === "string" ? o.name : undefined,
      startDate: start ? isoDate(start) : undefined,
      url: typeof o.url === "string" ? o.url : undefined,
    });
  }
  // Sub-events are how a multi-distance race publishes its individual courses.
  if ("subEvent" in o) collectEvents(o.subEvent, into);
}

export function parseJsonLdEvents(html: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  for (const block of jsonLdBlocks(html)) collectEvents(block, out);
  return out.filter((c) => c.startDate);
}

/**
 * Parse an iCalendar feed.
 *
 * Handles the two things that break naive `.ics` parsing: folded lines (a
 * continuation begins with a space or tab) and the two `DTSTART` forms —
 * `VALUE=DATE:20260912` for an all-day event, `20260912T070000Z` for a timed
 * one.
 */
export function parseIcs(text: string): EventCandidate[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const out: EventCandidate[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const summary = /^SUMMARY(?:;[^:]*)?:(.*)$/m.exec(body)?.[1]?.trim();
    const dt = /^DTSTART(?:;[^:]*)?:\s*(\d{8})/m.exec(body)?.[1];
    if (!dt) continue;
    out.push({
      name: summary ? summary.replace(/\\,/g, ",").replace(/\\;/g, ";") : undefined,
      startDate: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
    });
  }
  return out;
}

/** Normalise any published date form to `YYYY-MM-DD`, or undefined. */
function isoDate(raw: string): string | undefined {
  const direct = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString().slice(0, 10);
}

// --- Matching --------------------------------------------------------------

/** Lowercase, strip accents and punctuation, split into comparable tokens. */
export function tokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length >= 2);
}

/**
 * Words that appear in half the race names in the country and identify none of
 * them. Sharing only these is not a match.
 */
const GENERIC = new Set([
  "marathon",
  "halbmarathon",
  "semi",
  "trail",
  "ultra",
  "run",
  "running",
  "lauf",
  "laufen",
  "race",
  "course",
  "corsa",
  "gara",
  "swiss",
  "suisse",
  "schweiz",
  "svizzera",
  "de",
  "du",
  "der",
  "die",
  "das",
  "la",
  "le",
  "el",
  "di",
  "et",
  "and",
  "und",
]);

/** A token that actually identifies a race: a place, a peak, a course code. */
const isDistinctive = (tok: string) => !GENERIC.has(tok) && !/^\d{4}$/.test(tok);

/**
 * How well two race names agree, 0–1.
 *
 * Weighted to the distinctive tokens: "Eiger Ultra Trail E101" and "E51" share
 * three words out of four, and the one they do not share is the entire point.
 * Rare tokens (a course code, a place name) therefore count for more than the
 * words every race on the page has in common.
 *
 * Sharing *only* generic words scores zero outright. "Jungfrau-Marathon" and
 * "Zürich Marathon" overlap on "marathon" and nothing else, which was enough to
 * clear the accept threshold — so a single page about an entirely different
 * race could have confirmed a date. The corpus weighting does not save that
 * case, because with one candidate there is no corpus.
 */
export function nameScore(a: string, b: string, corpus: string[] = []): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const sharedDistinctive = [...ta].filter((tok) => tb.has(tok) && isDistinctive(tok));
  if (sharedDistinctive.length === 0) return 0;
  // How many of the other names in the corpus also use this token.
  const frequency = (tok: string) =>
    1 + corpus.filter((c) => tokens(c).includes(tok)).length;
  let shared = 0;
  let total = 0;
  for (const tok of ta) {
    const weight = 1 / frequency(tok);
    total += weight;
    if (tb.has(tok)) shared += weight;
  }
  return total === 0 ? 0 : shared / total;
}

/** Below this the names are simply not the same race. */
export const MIN_NAME_SCORE = 0.34;

export interface ChoiceResult {
  candidate?: EventCandidate;
  /** Why nothing was chosen, for the refresh report. */
  reason?: "no-candidates" | "no-name-match" | "ambiguous" | "date-implausible";
  /** The runners-up, so an ambiguous result can be reviewed rather than guessed. */
  considered: { name: string; date: string; score: number }[];
}

/**
 * Choose the candidate that is actually this race, or refuse.
 *
 * Refusing is a first-class outcome. The catalogue's approximate date is a
 * known-imperfect number the UI already labels; replacing it with a confidently
 * wrong one is a downgrade, so anything short of a clear single match keeps
 * what we had.
 */
export function chooseCandidate(
  event: SwissEvent,
  candidates: EventCandidate[],
  now = new Date(),
): ChoiceResult {
  const dated = candidates.filter((c) => c.startDate);
  if (dated.length === 0) return { reason: "no-candidates", considered: [] };

  const corpus = dated.map((c) => c.name ?? "");
  const scored = dated
    .map((c) => ({ c, score: c.name ? nameScore(event.name, c.name, corpus) : 0 }))
    .sort((x, y) => y.score - x.score);
  const considered = scored.map((s) => ({
    name: s.c.name ?? "(unnamed)",
    date: s.c.startDate ?? "",
    score: Math.round(s.score * 100) / 100,
  }));

  const best = scored[0];
  if (!best || best.score < MIN_NAME_SCORE) return { reason: "no-name-match", considered };
  // A tie means the page lists sibling races and we cannot tell them apart.
  // Confirming the first one would silently give E51 the E101's date.
  if (scored[1] && scored[1].score >= best.score - 0.001) return { reason: "ambiguous", considered };

  const days = Math.round(
    (Date.parse(`${best.c.startDate}T00:00:00Z`) - Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
  if (!Number.isFinite(days) || days < 0 || days > MAX_LEAD_DAYS) {
    return { reason: "date-implausible", considered };
  }
  return { candidate: best.c, considered };
}

// --- Applying --------------------------------------------------------------

/**
 * Merge fetched dates into the catalogue.
 *
 * A confirmed date clears `dateApproximate`, which is the only thing that stops
 * the UI telling the athlete to check with the organiser — so it is set here
 * and nowhere else, and only from a record that carries its own provenance.
 */
export function applyConfirmed(events: SwissEvent[], confirmed: ConfirmedDate[]): SwissEvent[] {
  const byId = new Map(confirmed.map((c) => [c.id, c]));
  return events.map((e) => {
    const c = byId.get(e.id);
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return e;
    const { dateApproximate: _drop, ...rest } = e;
    return { ...rest, date: c.date, confirmedFrom: c.sourceUrl, confirmedAt: c.fetchedAt };
  });
}

// --- Fetching --------------------------------------------------------------

export interface FetchOutcome {
  candidates: EventCandidate[];
  source: "jsonld" | "ics";
}

/**
 * Read one organiser's page or calendar feed.
 *
 * `fetchImpl` is injectable so the parsing above is testable without a network,
 * which matters: this code cannot be exercised against the real sites from a
 * restricted environment, and a test that quietly skips is not a passing test.
 */
export async function fetchEventCandidates(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome | { error: string }> {
  try {
    const res = await fetchImpl(url, { headers: { accept: "text/html,text/calendar,*/*" } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.text();
    const contentType = res.headers?.get?.("content-type") ?? "";
    if (/calendar/i.test(contentType) || body.startsWith("BEGIN:VCALENDAR")) {
      return { candidates: parseIcs(body), source: "ics" };
    }
    const candidates = parseJsonLdEvents(body);
    if (candidates.length > 0) return { candidates, source: "jsonld" };
    return { error: "no schema.org event markup found" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** One race's refresh result, for the report the script prints. */
export interface RefreshResult {
  id: string;
  curatedDate: string;
  status: "confirmed" | "unchanged" | "refused" | "unreachable";
  newDate?: string;
  reason?: string;
  confirmed?: ConfirmedDate;
}

/** Refresh a single event: fetch, choose, and say plainly what happened. */
export async function refreshEvent(
  event: SwissEvent,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<RefreshResult> {
  const base = { id: event.id, curatedDate: event.date };
  if (!event.organiserUrl) return { ...base, status: "unreachable", reason: "no organiser URL" };

  const outcome = await fetchEventCandidates(event.organiserUrl, fetchImpl);
  if ("error" in outcome) return { ...base, status: "unreachable", reason: outcome.error };

  const choice = chooseCandidate(event, outcome.candidates, now);
  if (!choice.candidate?.startDate) {
    return {
      ...base,
      status: "refused",
      reason: `${choice.reason} (${choice.considered.length} candidate(s))`,
    };
  }

  const confirmed: ConfirmedDate = {
    id: event.id,
    date: choice.candidate.startDate,
    matchedName: choice.candidate.name ?? "(unnamed)",
    source: outcome.source,
    sourceUrl: event.organiserUrl,
    fetchedAt: now.toISOString(),
  };
  return {
    ...base,
    status: choice.candidate.startDate === event.date ? "unchanged" : "confirmed",
    newDate: choice.candidate.startDate,
    confirmed,
  };
}
