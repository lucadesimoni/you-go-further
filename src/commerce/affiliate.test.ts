import { describe, it, expect } from "vitest";
import {
  byPartner,
  estimatedCommissionChf,
  normalizeProgram,
  outboundLinks,
  outboundUrl,
  programFor,
  summarise,
  type AffiliateClick,
  type PartnerProgram,
} from "./affiliate";
import type { CartLine } from "./cart";
import type { Product } from "../engine";

const product = (over: Partial<Product> = {}): Product => ({
  id: "sponser-liquid-energy",
  name: "Liquid Energy",
  brand: "Sponser",
  category: "gel",
  phases: ["during"],
  carbsG: 25,
  sodiumMg: 20,
  servingLabel: "1 gel",
  priceChf: 2.5,
  shopUrl: "https://sponser.com/liquid-energy",
  ...over,
});

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "sponser-liquid-energy",
  name: "Liquid Energy",
  brand: "Sponser",
  qty: 4,
  unitPriceChf: 2.5,
  lineTotalChf: 10,
  ...over,
});

const program = (over: Partial<PartnerProgram> = {}): PartnerProgram => ({
  brand: "Sponser",
  shopUrl: "https://sponser.com",
  refParam: "ref",
  refValue: "fuellabs",
  commissionRate: 0.08,
  cookieDays: 30,
  ...over,
});

describe("outboundUrl", () => {
  it("attaches attribution and our own click id", () => {
    const url = outboundUrl(product(), program(), "click-42")!;
    expect(url).toContain("https://sponser.com/liquid-energy?");
    expect(url).toContain("ref=fuellabs");
    expect(url).toContain("subid=click-42");
  });

  it("keeps query parameters the product URL already had", () => {
    const url = outboundUrl(product({ shopUrl: "https://sponser.com/p?size=500g" }), program())!;
    expect(url).toBe("https://sponser.com/p?size=500g&ref=fuellabs");
  });

  it("still sends the athlete to the shop when no partner is signed", () => {
    const url = outboundUrl(product(), undefined);
    // Useful without being paid for it — and with no invented tracking.
    expect(url).toBe("https://sponser.com/liquid-energy");
  });

  it("falls back to the partner's shop for a product with no page of its own", () => {
    expect(outboundUrl(product({ shopUrl: undefined }), program())).toContain("https://sponser.com?ref=");
  });

  it("gives no link at all when nothing knows where to buy it", () => {
    expect(outboundUrl(product({ shopUrl: undefined }), undefined)).toBeUndefined();
  });
});

describe("outboundLinks", () => {
  const byId = new Map([
    ["sponser-liquid-energy", product()],
    ["winforce-carbo", product({ id: "winforce-carbo", brand: "Winforce", name: "Carbo Load", shopUrl: "https://winforce.ch/carbo" })],
  ]);

  it("marks lines with no signed partner as untracked, not as revenue", () => {
    const links = outboundLinks(
      [line(), line({ productId: "winforce-carbo", brand: "Winforce", name: "Carbo Load", lineTotalChf: 20 })],
      byId,
      [program()],
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ tracked: true, commissionChf: 0.8 });
    expect(links[1].tracked).toBe(false);
    expect(links[1].commissionChf).toBeUndefined();
    // The whole basket is 30 CHF, but only the signed brand can earn.
    expect(estimatedCommissionChf(links)).toBe(0.8);
  });

  it("skips products the catalog no longer has", () => {
    expect(outboundLinks([line({ productId: "gone" })], byId, [program()])).toEqual([]);
  });

  it("groups by shop, because an athlete checks out once per brand", () => {
    const links = outboundLinks(
      [line(), line({ productId: "winforce-carbo", brand: "Winforce", name: "Carbo Load" })],
      byId,
      [program()],
    );
    const groups = byPartner(links);
    expect(groups.map((g) => g.brand)).toEqual(["Sponser", "Winforce"]);
    expect(groups[0].tracked).toBe(true);
    expect(groups[1].tracked).toBe(false);
  });
});

describe("programFor", () => {
  it("matches the brand however it is cased or spaced", () => {
    expect(programFor(" sponser ", [program()])).toBeDefined();
    expect(programFor("Winforce", [program()])).toBeUndefined();
  });
});

describe("summarise", () => {
  const click = (over: Partial<AffiliateClick> = {}): AffiliateClick => ({
    id: "c1",
    userId: "u1",
    productId: "sponser-liquid-energy",
    brand: "Sponser",
    tracked: true,
    valueChf: 10,
    at: "2026-08-01T10:00:00.000Z",
    ...over,
  });

  it("reports potential commission, never revenue we have not been paid", () => {
    const s = summarise([click(), click({ id: "c2", valueChf: 20 })], [program()]);
    expect(s.clicks).toBe(2);
    expect(s.trackedValueChf).toBe(30);
    expect(s.potentialCommissionChf).toBe(2.4);
  });

  it("counts untracked clicks but never lets them earn", () => {
    const s = summarise([click({ tracked: false, brand: "Winforce" })], [program()]);
    expect(s.clicks).toBe(1);
    expect(s.trackedClicks).toBe(0);
    expect(s.potentialCommissionChf).toBe(0);
    expect(s.byBrand[0]).toMatchObject({ brand: "Winforce", clicks: 1 });
  });

  it("is empty, not broken, before anything has been clicked", () => {
    expect(summarise([], [])).toMatchObject({ clicks: 0, potentialCommissionChf: 0, byBrand: [] });
  });
});

describe("normalizeProgram", () => {
  it("refuses a non-http shop URL — that would be an open redirect from our UI", () => {
    expect(normalizeProgram({ brand: "X", refValue: "a", shopUrl: "javascript:alert(1)" })).toBeNull();
    expect(normalizeProgram({ brand: "X", refValue: "a", shopUrl: "https://x.ch" })).not.toBeNull();
  });

  it("requires a brand and a publisher id", () => {
    expect(normalizeProgram({ brand: "", refValue: "a" })).toBeNull();
    expect(normalizeProgram({ brand: "X", refValue: "  " })).toBeNull();
  });

  it("clamps a commission rate someone fat-fingers", () => {
    expect(normalizeProgram({ brand: "X", refValue: "a", commissionRate: 8 })!.commissionRate).toBe(0.5);
    expect(normalizeProgram({ brand: "X", refValue: "a", commissionRate: -1 })!.commissionRate).toBe(0);
  });

  it("defaults the parameter name and the cookie window", () => {
    const p = normalizeProgram({ brand: "X", refValue: "a" })!;
    expect(p.refParam).toBe("ref");
    expect(p.cookieDays).toBe(30);
  });
});

describe("partner ordering", () => {
  it("puts the biggest basket first, so the cart's primary action means something", () => {
    const link = (brand: string, productId: string) => ({
      productId,
      brand,
      name: productId,
      url: `https://example.ch/${productId}`,
      tracked: false,
    });
    const groups = byPartner([
      link("Winforce", "w1"),
      link("Sponser", "s1"),
      link("Sponser", "s2"),
      link("Sponser", "s3"),
    ]);
    expect(groups[0].brand).toBe("Sponser");
    expect(groups[0].links).toHaveLength(3);
  });

  it("breaks a tie by name, so the order is stable rather than incidental", () => {
    const link = (brand: string, productId: string) => ({
      productId,
      brand,
      name: productId,
      url: "https://example.ch/x",
      tracked: false,
    });
    const a = byPartner([link("Winforce", "w"), link("Sponser", "s")]).map((g) => g.brand);
    const b = byPartner([link("Sponser", "s"), link("Winforce", "w")]).map((g) => g.brand);
    expect(a).toEqual(b);
  });
});
