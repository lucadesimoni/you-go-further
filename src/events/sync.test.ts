import { describe, expect, it } from "vitest";
import { eventById } from "./catalogue";
import type { SwissEvent } from "./events";
import {
  applyConfirmed,
  chooseCandidate,
  fetchEventCandidates,
  nameScore,
  parseIcs,
  parseJsonLdEvents,
  refreshEvent,
  tokens,
  type ConfirmedDate,
} from "./sync";

const JUNGFRAU = eventById("jungfrau-marathon") as SwissEvent;
const NOW = new Date("2026-08-10T08:00:00Z");

/** A page the way a race site actually ships it: markup around one JSON-LD blob. */
const page = (jsonLd: unknown) =>
  `<!doctype html><html><head><title>Race</title>
   <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
   </head><body><h1>Race</h1></body></html>`;

describe("reading schema.org markup", () => {
  it("finds the event a race site publishes for Google", () => {
    const html = page({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: "Jungfrau-Marathon 2026",
      startDate: "2026-09-12T09:00:00+02:00",
      url: "https://www.jungfrau-marathon.ch",
    });
    const [e] = parseJsonLdEvents(html);
    expect(e.name).toBe("Jungfrau-Marathon 2026");
    expect(e.startDate).toBe("2026-09-12");
  });

  it("takes the date off the string rather than through a timezone", () => {
    // "2026-09-12T23:30:00+02:00" is still the 12th where the race is. Parsing
    // it as a Date and reading the UTC day would move it to the 13th.
    const [e] = parseJsonLdEvents(page({ "@type": "Event", name: "X", startDate: "2026-09-12T23:30:00+02:00" }));
    expect(e.startDate).toBe("2026-09-12");
  });

  it("walks @graph and subEvent, which is how multi-distance races publish", () => {
    const html = page({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Eiger Ultra Trail" },
        {
          "@type": "SportsEvent",
          name: "Eiger Ultra Trail",
          startDate: "2026-07-17",
          subEvent: [
            { "@type": "SportsEvent", name: "Eiger Ultra Trail E101", startDate: "2026-07-17" },
            { "@type": "SportsEvent", name: "Eiger Ultra Trail E51", startDate: "2026-07-18" },
          ],
        },
      ],
    });
    const names = parseJsonLdEvents(html).map((e) => e.name);
    expect(names).toContain("Eiger Ultra Trail E101");
    expect(names).toContain("Eiger Ultra Trail E51");
  });

  it("survives one malformed block among good ones", () => {
    // Sites routinely ship a broken blob next to three valid ones, and losing
    // the page over it would report every race as unreachable.
    const html =
      `<script type="application/ld+json">{ not json </script>` +
      page({ "@type": "SportsEvent", name: "Sierre-Zinal", startDate: "2026-08-09" });
    expect(parseJsonLdEvents(html)).toHaveLength(1);
  });

  it("ignores events with no date and pages with no markup", () => {
    expect(parseJsonLdEvents(page({ "@type": "SportsEvent", name: "No date" }))).toEqual([]);
    expect(parseJsonLdEvents("<html><body>nothing here</body></html>")).toEqual([]);
  });
});

describe("reading an .ics feed", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "SUMMARY:Jungfrau-Marathon",
    "DTSTART;VALUE=DATE:20260912",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Jungfrau-Marathon Staffel",
    "DTSTART:20260912T070000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads both DTSTART forms", () => {
    const events = parseIcs(ics);
    expect(events.map((e) => e.startDate)).toEqual(["2026-09-12", "2026-09-12"]);
  });

  it("unfolds continuation lines", () => {
    // A folded SUMMARY is the normal way a long race name is transmitted, and
    // reading it line-by-line truncates the name the match depends on.
    const folded = ["BEGIN:VEVENT", "SUMMARY:Trail Verbier St-Bernard", " X-Alpine", "DTSTART;VALUE=DATE:20260711", "END:VEVENT"].join("\r\n");
    expect(parseIcs(folded)[0].name).toBe("Trail Verbier St-BernardX-Alpine");
  });

  it("skips an event with no start date rather than inventing one", () => {
    expect(parseIcs("BEGIN:VEVENT\r\nSUMMARY:No date\r\nEND:VEVENT")).toEqual([]);
  });
});

describe("matching a name to the right race", () => {
  it("scores the same race high and a different one at zero", () => {
    expect(nameScore("Jungfrau-Marathon", "Jungfrau-Marathon 2026")).toBeGreaterThan(0.6);
    // These two share "marathon" and nothing else. That used to score 0.5 —
    // above the accept threshold — so one page about the wrong race could have
    // confirmed a date. Sharing only generic words is not a match.
    expect(nameScore("Jungfrau-Marathon", "Zürich Marathon")).toBe(0);
    expect(nameScore("Eiger Ultra Trail E101", "Sierre Ultra Trail")).toBe(0);
  });

  it("weights the token that actually distinguishes siblings", () => {
    // Against a field of Eiger races, "E101" carries the meaning and the three
    // words they all share carry almost none.
    const corpus = ["Eiger Ultra Trail E101", "Eiger Ultra Trail E51", "Eiger Ultra Trail E35"];
    const right = nameScore("Eiger Ultra Trail E101", "Eiger Ultra Trail E101", corpus);
    const wrong = nameScore("Eiger Ultra Trail E101", "Eiger Ultra Trail E51", corpus);
    expect(right).toBeGreaterThan(wrong);
  });

  it("strips accents and punctuation before comparing", () => {
    expect(tokens("Zürich Marathon")).toEqual(["zurich", "marathon"]);
    expect(nameScore("Sierre-Zinal", "Sierre Zinal")).toBe(1);
  });
});

describe("choosing, and refusing", () => {
  const cand = (name: string, startDate: string) => ({ name, startDate });

  it("takes a clear single match", () => {
    const r = chooseCandidate(JUNGFRAU, [cand("Jungfrau-Marathon 2026", "2026-09-05")], NOW);
    expect(r.candidate?.startDate).toBe("2026-09-05");
  });

  it("refuses a tie rather than confirming a sibling's date", () => {
    // The failure this whole module exists to prevent: an organiser page listing
    // three distances, and E51's date silently becoming E101's.
    const eiger = eventById("eiger-ultra-e101") as SwissEvent;
    const r = chooseCandidate(
      eiger,
      [cand("Eiger Ultra Trail", "2026-07-17"), cand("Eiger Ultra Trail", "2026-07-19")],
      NOW,
    );
    expect(r.candidate).toBeUndefined();
    expect(r.reason).toBe("ambiguous");
    expect(r.considered).toHaveLength(2);
  });

  it("refuses a page about some other race", () => {
    const r = chooseCandidate(JUNGFRAU, [cand("Zürich Silvesterlauf", "2026-12-31")], NOW);
    expect(r.reason).toBe("no-name-match");
  });

  it("refuses a date in the past — a page still showing last year's edition", () => {
    const r = chooseCandidate(JUNGFRAU, [cand("Jungfrau-Marathon", "2025-09-13")], NOW);
    expect(r.reason).toBe("date-implausible");
  });

  it("refuses a date years out", () => {
    const r = chooseCandidate(JUNGFRAU, [cand("Jungfrau-Marathon", "2030-09-14")], NOW);
    expect(r.reason).toBe("date-implausible");
  });

  it("says so when there was nothing to choose from", () => {
    expect(chooseCandidate(JUNGFRAU, [], NOW).reason).toBe("no-candidates");
  });

  it("keeps the runners-up, so a refusal can be reviewed instead of guessed at", () => {
    const r = chooseCandidate(JUNGFRAU, [cand("Jungfrau-Marathon", "2026-09-05"), cand("Other race", "2026-09-06")], NOW);
    expect(r.considered.map((c) => c.name)).toContain("Other race");
  });
});

describe("applying what was fetched", () => {
  const confirmed: ConfirmedDate = {
    id: "jungfrau-marathon",
    date: "2026-09-05",
    matchedName: "Jungfrau-Marathon 2026",
    source: "jsonld",
    sourceUrl: "https://www.jungfrau-marathon.ch",
    fetchedAt: "2026-08-10T08:00:00.000Z",
  };

  it("replaces the date and stops calling it approximate", () => {
    const [e] = applyConfirmed([JUNGFRAU], [confirmed]);
    expect(e.date).toBe("2026-09-05");
    expect(e.dateApproximate).toBeUndefined();
    expect(e.confirmedFrom).toBe("https://www.jungfrau-marathon.ch");
  });

  it("leaves every race it has nothing for exactly as curated", () => {
    const others = [eventById("sierre-zinal") as SwissEvent];
    expect(applyConfirmed(others, [confirmed])).toEqual(others);
  });

  it("ignores a malformed record instead of writing a broken date into the app", () => {
    const bad = { ...confirmed, date: "next September" };
    expect(applyConfirmed([JUNGFRAU], [bad])[0].date).toBe(JUNGFRAU.date);
  });
});

describe("refreshing one race end to end", () => {
  const respond = (body: string, contentType = "text/html", ok = true) =>
    (async () =>
      ({ ok, status: ok ? 200 : 500, text: async () => body, headers: { get: () => contentType } })) as unknown as typeof fetch;

  it("confirms a date that differs from the curated guess", async () => {
    const html = page({ "@type": "SportsEvent", name: "Jungfrau-Marathon 2026", startDate: "2026-09-05" });
    const r = await refreshEvent(JUNGFRAU, respond(html), NOW);
    expect(r.status).toBe("confirmed");
    expect(r.newDate).toBe("2026-09-05");
    expect(r.confirmed?.sourceUrl).toBe(JUNGFRAU.organiserUrl);
  });

  it("reports 'unchanged' when the curated guess was already right", async () => {
    const html = page({ "@type": "SportsEvent", name: "Jungfrau-Marathon", startDate: JUNGFRAU.date });
    expect((await refreshEvent(JUNGFRAU, respond(html), NOW)).status).toBe("unchanged");
  });

  it("reads a calendar feed as well as a page", async () => {
    const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Jungfrau-Marathon\r\nDTSTART;VALUE=DATE:20260905\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const r = await refreshEvent(JUNGFRAU, respond(ics, "text/calendar"), NOW);
    expect(r.confirmed?.source).toBe("ics");
    expect(r.newDate).toBe("2026-09-05");
  });

  it("reports unreachable rather than pretending, when the site is down", async () => {
    const r = await refreshEvent(JUNGFRAU, respond("", "text/html", false), NOW);
    expect(r.status).toBe("unreachable");
    expect(r.reason).toContain("500");
  });

  it("reports unreachable when a site publishes no structured data at all", async () => {
    const r = await refreshEvent(JUNGFRAU, respond("<html><body>Anmeldung</body></html>"), NOW);
    expect(r.status).toBe("unreachable");
    expect(r.reason).toMatch(/no schema.org/i);
  });

  it("refuses rather than confirming when the page is about another race", async () => {
    const html = page({ "@type": "SportsEvent", name: "Greifenseelauf", startDate: "2026-09-19" });
    const r = await refreshEvent(JUNGFRAU, respond(html), NOW);
    expect(r.status).toBe("refused");
    expect(r.confirmed).toBeUndefined();
  });

  it("never throws on a network error — the refresh must survive one dead host", async () => {
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await refreshEvent(JUNGFRAU, boom, NOW);
    expect(r.status).toBe("unreachable");
    expect(r.reason).toContain("ECONNREFUSED");
  });

  it("does not attempt a race with no organiser URL", async () => {
    const r = await refreshEvent({ ...JUNGFRAU, organiserUrl: undefined }, respond(""), NOW);
    expect(r.status).toBe("unreachable");
    expect(r.reason).toMatch(/no organiser/i);
  });
});

describe("fetchEventCandidates", () => {
  it("detects a calendar feed by its body when the content type lies", async () => {
    // Plenty of servers send .ics as text/plain or application/octet-stream.
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:X\r\nDTSTART;VALUE=DATE:20260912\r\nEND:VEVENT";
    const impl = (async () => ({ ok: true, status: 200, text: async () => ics, headers: { get: () => "text/plain" } })) as unknown as typeof fetch;
    const out = await fetchEventCandidates("https://example.ch/cal.ics", impl);
    expect("candidates" in out && out.source).toBe("ics");
  });
});
