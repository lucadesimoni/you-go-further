import { describe, it, expect } from "vitest";
import { isInSwitzerland, layersForRoute, OSM_LAYER, SWISS_LAYERS } from "./basemap";
import type { LatLng } from "../model";

const ZURICH: LatLng = [47.3769, 8.5417];
const ZERMATT: LatLng = [46.0207, 7.7491];
const PARIS: LatLng = [48.8566, 2.3522];
const MILAN: LatLng = [45.4642, 9.19];

describe("isInSwitzerland", () => {
  it("recognises Swiss coordinates", () => {
    expect(isInSwitzerland(ZURICH)).toBe(true);
    expect(isInSwitzerland(ZERMATT)).toBe(true);
  });

  it("excludes places well outside the swisstopo coverage", () => {
    expect(isInSwitzerland(PARIS)).toBe(false);
    expect(isInSwitzerland(MILAN)).toBe(false);
  });
});

describe("layersForRoute", () => {
  it("offers the swisstopo national map for a Swiss route", () => {
    const { layers, swiss } = layersForRoute([ZURICH, ZURICH, ZERMATT]);
    expect(swiss).toBe(true);
    expect(layers[0].id).toBe("pixelkarte-farbe");
    // Every Swiss layer must credit swisstopo — it is a licence condition.
    for (const l of SWISS_LAYERS) expect(l.attribution).toMatch(/swisstopo/);
  });

  it("keeps OpenStreetMap available as a fallback on Swiss routes", () => {
    const { layers } = layersForRoute([ZURICH]);
    expect(layers.map((l) => l.id)).toContain(OSM_LAYER.id);
  });

  it("uses OpenStreetMap alone outside Switzerland — swisstopo has no tiles there", () => {
    const { layers, swiss } = layersForRoute([PARIS, PARIS]);
    expect(swiss).toBe(false);
    expect(layers).toEqual([OSM_LAYER]);
  });

  it("a single stray GPS point cannot demote a Swiss route", () => {
    const { swiss } = layersForRoute([ZURICH, ZURICH, ZURICH, PARIS]);
    expect(swiss).toBe(true);
  });

  it("handles an empty route without throwing", () => {
    expect(layersForRoute([]).layers).toEqual([OSM_LAYER]);
  });

  it("requests tiles in web mercator, which is what Leaflet renders in", () => {
    for (const l of SWISS_LAYERS) expect(l.url).toContain("/3857/");
  });
});
