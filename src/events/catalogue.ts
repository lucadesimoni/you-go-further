import type { SwissEvent } from "./events";
import { CONFIRMED_DATES } from "./confirmed";
import { applyConfirmed } from "./sync";

/**
 * Swiss endurance events, curated.
 *
 * **What this list is, and is not.** Course figures are the organisers'
 * published headline numbers, which are stable year to year — the Jungfrau-
 * Marathon has climbed roughly 1,800 m since 1993. The *dates* are the weekend
 * each race traditionally falls on, and they are marked approximate for exactly
 * that reason: Swiss races move by a week or two, and a list compiled in code
 * cannot ring them up to check.
 *
 * So this is a **starting point, not an authority**:
 *
 * - Every entry carries the organiser's URL, and the UI links to it.
 * - The athlete can override the date, and the UI says the date is approximate
 *   until they do.
 * - Importing the organiser's own GPX replaces the course figures entirely.
 *   That path already exists and is the one to trust.
 *
 * Aid-station data is given only where the organiser publishes it plainly. An
 * invented aid station is worse than none: an athlete who believes there is
 * water at km 30 and finds none is in real trouble, so an empty list means
 * "we do not know", and the advice then says to carry your own.
 */
const CURATED: SwissEvent[] = [
  {
    id: "jungfrau-marathon",
    name: "Jungfrau-Marathon",
    start: { lat: 46.6863, lng: 7.8632 }, // Interlaken
    discipline: "trail-run",
    distanceKm: 42.195,
    ascentM: 1823,
    maxAltM: 2205,
    date: "2026-09-12",
    dateApproximate: true,
    cutoffMin: 405,
    organiserUrl: "https://www.jungfrau-marathon.ch",
    note: "Interlaken to Kleine Scheidegg. Flat for 25 km, then everything at once.",
  },
  {
    id: "eiger-ultra-e101",
    name: "Eiger Ultra Trail E101",
    start: { lat: 46.6242, lng: 8.0342 }, // Grindelwald
    discipline: "ultra-trail",
    distanceKm: 101,
    ascentM: 6700,
    maxAltM: 2680,
    date: "2026-07-18",
    dateApproximate: true,
    organiserUrl: "https://www.eigerultratrail.ch",
    note: "A full day and night above Grindelwald.",
  },
  {
    id: "eiger-ultra-e51",
    name: "Eiger Ultra Trail E51",
    start: { lat: 46.6242, lng: 8.0342 },
    discipline: "ultra-trail",
    distanceKm: 51,
    ascentM: 3100,
    maxAltM: 2680,
    date: "2026-07-18",
    dateApproximate: true,
    organiserUrl: "https://www.eigerultratrail.ch",
    note: "The Eiger Trail proper, under the north face.",
  },
  {
    id: "eiger-ultra-e35",
    name: "Eiger Ultra Trail E35",
    start: { lat: 46.6242, lng: 8.0342 },
    discipline: "trail-run",
    distanceKm: 35,
    ascentM: 2500,
    maxAltM: 2320,
    date: "2026-07-18",
    dateApproximate: true,
    organiserUrl: "https://www.eigerultratrail.ch",
  },
  {
    id: "sierre-zinal",
    name: "Sierre-Zinal",
    start: { lat: 46.2919, lng: 7.5351 }, // Sierre
    discipline: "trail-run",
    distanceKm: 31,
    ascentM: 2200,
    maxAltM: 2425,
    date: "2026-08-09",
    dateApproximate: true,
    organiserUrl: "https://www.sierre-zinal.com",
    note: "The Race of Five 4000ers. 2,200 m up, 1,100 m down.",
  },
  {
    id: "zermatt-marathon",
    name: "Gornergrat Zermatt Marathon",
    start: { lat: 46.1783, lng: 7.8017 }, // St. Niklaus
    discipline: "trail-run",
    distanceKm: 42.195,
    ascentM: 1950,
    maxAltM: 2585,
    date: "2026-07-04",
    dateApproximate: true,
    organiserUrl: "https://www.zermattmarathon.ch",
    note: "St. Niklaus to Riffelberg. Finishes above 2,500 m.",
  },
  {
    id: "swiss-city-marathon",
    name: "Swiss City Marathon Lucerne",
    start: { lat: 47.0502, lng: 8.3093 },
    discipline: "road-run",
    distanceKm: 42.195,
    ascentM: 120,
    date: "2026-10-25",
    dateApproximate: true,
    organiserUrl: "https://www.swisscitymarathon.ch",
    note: "Flat, fast, around the lake.",
  },
  {
    id: "zurich-marathon",
    name: "Zürich Marathon",
    start: { lat: 47.3667, lng: 8.5411 },
    discipline: "road-run",
    distanceKm: 42.195,
    ascentM: 100,
    date: "2026-04-12",
    dateApproximate: true,
    organiserUrl: "https://www.zurichmarathon.ch",
  },
  {
    id: "lausanne-marathon",
    name: "Lausanne Marathon",
    start: { lat: 46.5197, lng: 6.6323 },
    discipline: "road-run",
    distanceKm: 42.195,
    ascentM: 350,
    date: "2026-10-25",
    dateApproximate: true,
    organiserUrl: "https://www.lausanne-marathon.com",
  },
  {
    id: "inferno-triathlon",
    name: "Inferno Triathlon",
    start: { lat: 46.7580, lng: 7.6280 }, // Thun
    discipline: "triathlon",
    distanceKm: 148,
    ascentM: 5500,
    maxAltM: 2970,
    date: "2026-08-22",
    dateApproximate: true,
    organiserUrl: "https://www.inferno-triathlon.ch",
    note: "Swim in Thun, ride to Grindelwald, run up the Schilthorn.",
  },
  {
    id: "trail-verbier-x-alpine",
    name: "Trail Verbier St-Bernard — X-Alpine",
    start: { lat: 46.0961, lng: 7.2286 },
    discipline: "ultra-trail",
    distanceKm: 111,
    ascentM: 8400,
    maxAltM: 2965,
    date: "2026-07-11",
    dateApproximate: true,
    organiserUrl: "https://www.trailvsb.com",
  },
  {
    id: "davos-swissalpine-k43",
    name: "Swissalpine Davos K43",
    start: { lat: 46.7975, lng: 9.8203 },
    discipline: "trail-run",
    distanceKm: 43,
    ascentM: 1900,
    maxAltM: 2632,
    date: "2026-07-25",
    dateApproximate: true,
    organiserUrl: "https://www.swissalpine.ch",
    note: "Over the Sertigpass, the highest point of any Swiss marathon-distance race.",
  },
];

/**
 * The list the app uses: curated, with any date the refresh script fetched from
 * the organiser applied on top. A confirmed entry loses `dateApproximate` and
 * gains the URL it came from — which is the only route by which a date here
 * stops being labelled a guess.
 */
export const SWISS_EVENTS: SwissEvent[] = applyConfirmed(CURATED, CONFIRMED_DATES);

/** Find a curated event by id. */
export function eventById(id: string): SwissEvent | undefined {
  return SWISS_EVENTS.find((e) => e.id === id);
}

/** The events still ahead, soonest first. */
export function upcomingEvents(now = new Date(), list: SwissEvent[] = SWISS_EVENTS): SwissEvent[] {
  const today = now.toISOString().slice(0, 10);
  return list.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}
