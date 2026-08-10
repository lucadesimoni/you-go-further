import type { ConfirmedDate } from "./sync";

/**
 * Race dates fetched from the organisers themselves.
 *
 * **Generated — do not edit by hand.** `npm run refresh:events` rewrites this
 * file from each organiser's schema.org markup or `.ics` feed; every entry
 * carries the URL it came from and when, so a stale or wrong confirmation can
 * be traced rather than argued about.
 *
 * It is empty here because this environment's network policy denies the
 * organiser hosts, and an empty list is the honest result of that: every race
 * keeps its curated approximate date and the UI keeps telling athletes to
 * check. Running the script anywhere with outbound access fills it in.
 */
export const CONFIRMED_DATES: ConfirmedDate[] = [];
