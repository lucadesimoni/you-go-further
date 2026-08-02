import type { Product } from "../engine";
import type { CartLine } from "./cart";

/**
 * Affiliate — how the free app earns.
 *
 * Phase 1 deliberately does not sell anything: no stock, no fulfilment, no
 * returns desk. The athlete is handed to the brand's own shop with an
 * attribution parameter, and the brand pays commission on what they buy. That
 * makes the *recommendation* the product, which is also the thing worth
 * licensing later.
 *
 * Programs are **configuration, not code**. We do not ship invented affiliate
 * ids: until a real partner agreement exists the athlete still gets a link to
 * the brand's shop, it simply carries no tracking and earns nothing — and the
 * UI says so rather than implying a partnership that isn't signed.
 */

export interface PartnerProgram {
  /** Brand this program pays for, matched case-insensitively. */
  brand: string;
  /** Fallback shop, used when a product carries no URL of its own. */
  shopUrl: string;
  /** Query parameter the partner's platform reads for attribution. */
  refParam: string;
  /** Our publisher id with that partner. */
  refValue: string;
  /** Commission as a fraction of order value, e.g. 0.08 for 8 %. */
  commissionRate: number;
  /** How long after a click a purchase still counts, in days. */
  cookieDays: number;
}

export interface OutboundLink {
  productId: string;
  brand: string;
  name: string;
  /** Where the athlete actually goes. */
  url: string;
  /** True when the link carries our attribution and can earn commission. */
  tracked: boolean;
  /** Estimated commission on this line, CHF — only when tracked. */
  commissionChf?: number;
}

/** A click we handed off, kept so commission statements can be reconciled. */
export interface AffiliateClick {
  id: string;
  userId: string;
  productId: string;
  brand: string;
  /** Whether attribution was attached — untracked clicks earn nothing. */
  tracked: boolean;
  /** Basket value at the moment of the click, CHF. */
  valueChf: number;
  at: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** The program covering a brand, if one is configured. */
export function programFor(brand: string, programs: PartnerProgram[]): PartnerProgram | undefined {
  return programs.find((p) => norm(p.brand) === norm(brand));
}

/**
 * Build the outbound URL for a product.
 *
 * `subId` is our own click id echoed back in the partner's report — it is what
 * turns "we sent 400 clicks" into "these 12 orders were ours". Existing query
 * parameters on the product URL are preserved; ours are appended.
 */
export function outboundUrl(product: Product, program: PartnerProgram | undefined, subId?: string): string | undefined {
  const base = product.shopUrl ?? program?.shopUrl;
  if (!base) return undefined;
  if (!program) return base;
  const sep = base.includes("?") ? "&" : "?";
  const params = `${encodeURIComponent(program.refParam)}=${encodeURIComponent(program.refValue)}` +
    (subId ? `&subid=${encodeURIComponent(subId)}` : "");
  return `${base}${sep}${params}`;
}

/**
 * Turn cart lines into the links the athlete is offered.
 *
 * Lines whose brand has no program still get a link when the product knows its
 * shop — sending someone to the right page is useful whether or not we are paid
 * for it. They are marked `tracked: false` so nothing downstream counts them as
 * revenue.
 */
export function outboundLinks(
  lines: CartLine[],
  byId: Map<string, Product>,
  programs: PartnerProgram[],
  subId?: string,
): OutboundLink[] {
  const out: OutboundLink[] = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;
    const program = programFor(line.brand, programs);
    const url = outboundUrl(product, program, subId);
    if (!url) continue;
    out.push({
      productId: line.productId,
      brand: line.brand,
      name: line.name,
      url,
      tracked: Boolean(program),
      ...(program ? { commissionChf: round2(line.lineTotalChf * program.commissionRate) } : {}),
    });
  }
  return out;
}

/** What the basket would pay us if every tracked line converted. */
export function estimatedCommissionChf(links: OutboundLink[]): number {
  return round2(links.reduce((sum, l) => sum + (l.commissionChf ?? 0), 0));
}

/** Group links by brand — an athlete checks out once per shop, not per product. */
export function byPartner(links: OutboundLink[]): { brand: string; links: OutboundLink[]; tracked: boolean }[] {
  const groups = new Map<string, OutboundLink[]>();
  for (const l of links) {
    const key = l.brand;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return [...groups.entries()].map(([brand, ls]) => ({ brand, links: ls, tracked: ls.every((l) => l.tracked) }));
}

export interface AffiliateSummary {
  clicks: number;
  trackedClicks: number;
  /** Basket value behind the tracked clicks — not revenue. */
  trackedValueChf: number;
  /** What that would pay at the configured rates if every click converted. */
  potentialCommissionChf: number;
  byBrand: { brand: string; clicks: number; valueChf: number }[];
}

/**
 * Aggregate recorded clicks.
 *
 * Deliberately reports *potential* commission, never revenue: we only know what
 * we handed off, not what was bought. Real revenue arrives in the partner's
 * statement, and reconciling the two is what `subid` exists for.
 */
export function summarise(clicks: AffiliateClick[], programs: PartnerProgram[]): AffiliateSummary {
  const byBrand = new Map<string, { clicks: number; valueChf: number }>();
  let trackedClicks = 0;
  let trackedValueChf = 0;
  let potential = 0;
  for (const c of clicks) {
    const cur = byBrand.get(c.brand) ?? { clicks: 0, valueChf: 0 };
    cur.clicks++;
    cur.valueChf = round2(cur.valueChf + c.valueChf);
    byBrand.set(c.brand, cur);
    if (!c.tracked) continue;
    trackedClicks++;
    trackedValueChf = round2(trackedValueChf + c.valueChf);
    potential = round2(potential + c.valueChf * (programFor(c.brand, programs)?.commissionRate ?? 0));
  }
  return {
    clicks: clicks.length,
    trackedClicks,
    trackedValueChf,
    potentialCommissionChf: round2(potential),
    byBrand: [...byBrand.entries()]
      .map(([brand, v]) => ({ brand, ...v }))
      .sort((a, b) => b.clicks - a.clicks),
  };
}

/** Normalise an admin-entered program, dropping anything unusable. */
export function normalizeProgram(raw: unknown): PartnerProgram | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PartnerProgram>;
  const brand = typeof p.brand === "string" ? p.brand.trim().slice(0, 80) : "";
  const shopUrl = typeof p.shopUrl === "string" ? p.shopUrl.trim().slice(0, 500) : "";
  const refValue = typeof p.refValue === "string" ? p.refValue.trim().slice(0, 120) : "";
  if (!brand || !refValue) return null;
  // Only http(s): a javascript: or data: URL here would be an open redirect
  // straight out of our own UI.
  if (shopUrl && !/^https?:\/\//i.test(shopUrl)) return null;
  const rate = typeof p.commissionRate === "number" && Number.isFinite(p.commissionRate) ? p.commissionRate : 0;
  const days = typeof p.cookieDays === "number" && Number.isFinite(p.cookieDays) ? Math.round(p.cookieDays) : 30;
  return {
    brand,
    shopUrl,
    refParam: typeof p.refParam === "string" && p.refParam.trim() ? p.refParam.trim().slice(0, 40) : "ref",
    refValue,
    commissionRate: Math.max(0, Math.min(0.5, rate)),
    cookieDays: Math.max(1, Math.min(365, days)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
