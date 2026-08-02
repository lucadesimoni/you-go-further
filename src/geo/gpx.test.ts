import { describe, it, expect } from "vitest";
import { parseGpx, routeDistanceKm, ascentM, estimateDurationMin, haversineM } from "./gpx";

const gpx = (body: string) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="test">${body}</gpx>`;

const trk = (pts: [number, number, number?][]) =>
  gpx(
    `<trk><name>Jungfrau Marathon</name><trkseg>${pts
      .map(([lat, lon, ele]) => `<trkpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ""}</trkpt>`)
      .join("")}</trkseg></trk>`,
  );

describe("parseGpx", () => {
  it("reads the track, its name and its elevation", () => {
    const r = parseGpx(trk([
      [46.686, 7.863, 570],
      [46.69, 7.87, 600],
      [46.7, 7.88, 900],
    ]))!;
    expect(r.name).toBe("Jungfrau Marathon");
    expect(r.points).toHaveLength(3);
    expect(r.hasElevation).toBe(true);
    expect(r.ascentM).toBe(330);
  });

  it("measures the route against a known distance", () => {
    // Interlaken → Lauterbrunnen is about 10 km as the crow flies.
    const r = parseGpx(trk([
      [46.6863, 7.8632],
      [46.5936, 7.9094],
    ]))!;
    expect(r.distanceKm).toBeGreaterThan(9);
    expect(r.distanceKm).toBeLessThan(12);
  });

  it("survives namespaces, self-closing points and CRLF — real files have all three", () => {
    const xml =
      '<?xml version="1.0"?>\r\n<gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1">\r\n' +
      '<gpx:trk><gpx:trkseg>\r\n' +
      '<gpx:trkpt lat="46.5" lon="7.6"/>\r\n' +
      '<gpx:trkpt lon="7.61" lat="46.51"/>\r\n' +
      "</gpx:trkseg></gpx:trk></gpx:gpx>";
    const r = parseGpx(xml)!;
    expect(r.points).toHaveLength(2);
    // Attribute order is not guaranteed by the spec, so lon-before-lat must work.
    expect(r.points[1]).toEqual([46.51, 7.61]);
  });

  it("falls back to route points when there is no track", () => {
    const r = parseGpx(gpx('<rte><rtept lat="46.9" lon="7.4"/><rtept lat="46.95" lon="7.45"/></rte>'))!;
    expect(r.points).toHaveLength(2);
  });

  it("returns nothing for a file with no route, rather than an empty map", () => {
    expect(parseGpx(gpx("<wpt lat='46.9' lon='7.4'/>"))).toBeNull();
    expect(parseGpx("not xml at all")).toBeNull();
    expect(parseGpx("")).toBeNull();
  });

  it("rejects impossible coordinates instead of drawing them", () => {
    const r = parseGpx(trk([
      [46.5, 7.6],
      [999, 7.61],
      [46.52, 7.62],
    ]))!;
    expect(r.points).toHaveLength(2);
  });

  it("does not claim an elevation profile when the file barely has one", () => {
    const pts: [number, number, number?][] = Array.from({ length: 20 }, (_, i) => [46.5 + i / 1000, 7.6, undefined]);
    pts[0] = [46.5, 7.6, 500];
    const r = parseGpx(trk(pts))!;
    expect(r.hasElevation).toBe(false);
    expect(r.ascentM).toBeUndefined();
  });

  it("unescapes the name", () => {
    const r = parseGpx(gpx('<trk><name>Sierre&#39;s &amp; Zinal</name><trkseg><trkpt lat="46.2" lon="7.5"/><trkpt lat="46.3" lon="7.6"/></trkseg></trk>'))!;
    expect(r.name).toBe("Sierre's & Zinal");
  });
});

describe("ascentM", () => {
  it("ignores metre-scale jitter that would invent climbing on a flat run", () => {
    const flat = [500, 501, 500, 502, 499, 501, 500];
    expect(ascentM(flat)).toBe(0);
  });

  it("counts a real climb once", () => {
    expect(ascentM([500, 600, 700, 600, 700])).toBe(300);
  });
});

describe("routeDistanceKm / haversineM", () => {
  it("matches a published distance: Bern → Zürich is about 95 km", () => {
    const d = haversineM([46.948, 7.4474], [47.3769, 8.5417]) / 1000;
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(100);
  });

  it("is zero for a single point", () => {
    expect(routeDistanceKm([[46.9, 7.4]])).toBe(0);
  });
});

describe("estimateDurationMin", () => {
  it("adds ten minutes per 600 m of climbing for a runner", () => {
    const flat = estimateDurationMin(10, 0, 5);
    const hilly = estimateDurationMin(10, 600, 5);
    expect(flat).toBe(50);
    expect(hilly - flat).toBe(10);
  });

  it("penalises climbing less on the bike", () => {
    const run = estimateDurationMin(40, 1000, 5, "run");
    const ride = estimateDurationMin(40, 1000, 5, "ride");
    expect(ride).toBeLessThan(run);
  });

  it("never returns a zero-minute session", () => {
    expect(estimateDurationMin(0, 0, 5)).toBe(1);
  });
});
