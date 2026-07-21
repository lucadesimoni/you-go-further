/**
 * The "ideal offering" algorithm — *which* product to use *when*.
 *
 * `computeTarget` (recommend.ts) decides the numeric fueling need for a session;
 * this module turns that need + the athlete's context into a concrete product
 * offering by scoring every catalogue item for the functional **slots** a plan
 * has to fill (primary carb carrier, on-the-move top-up, sodium, hydration,
 * pre-fuel, recovery). Scoring is transparent: each product gets a 0–100 fit and
 * a short list of reasons, so the UI can always answer "why this, why now".
 *
 * It is the single source of truth for product selection — `recommend()`
 * delegates here — and it also exposes a session-independent `productUsage()`
 * guide ("best when / avoid when") that powers the catalogue's when-to-use view.
 */
import { CATALOG } from "./catalog";
import type { AthleteInput, FuelingTarget, Product } from "./types";

export type OfferingSlot =
  | "carb-carrier"
  | "carb-topup"
  | "electrolyte"
  | "hydration"
  | "pre-fuel"
  | "recovery";

export interface ScoredProduct {
  product: Product;
  /** 0–100 fit of this product for the session + slot. */
  score: number;
  /** Plain-language reasons this product fits *now*. */
  reasons: string[];
}

export interface OfferingSlotResult {
  slot: OfferingSlot;
  label: string;
  /** Whether this session actually needs the slot filled. */
  needed: boolean;
  /** Best product for the slot (absent if none eligible / not needed). */
  pick?: ScoredProduct;
  /** Next-best options, best first. */
  alternatives: ScoredProduct[];
  /** When-to-use guidance tailored to this session. */
  guidance: string;
}

export interface Offering {
  slots: OfferingSlotResult[];
  headline: string;
}

const SLOT_LABEL: Record<OfferingSlot, string> = {
  "carb-carrier": "Primary carbohydrate carrier",
  "carb-topup": "On-the-move carb top-up",
  electrolyte: "Standalone sodium",
  hydration: "Calorie-free hydration",
  "pre-fuel": "Pre-session fuel",
  recovery: "Recovery",
};

const wantsCaffeine = (input: AthleteInput): boolean =>
  Boolean(input.caffeineOk) &&
  (input.durationMin >= 90 || input.intensity === "race" || input.intensity === "hard");

const needsExtraSodium = (input: AthleteInput): boolean =>
  input.sweatLevel === "heavy" ||
  input.conditions === "hot" ||
  (input.physiology?.sweatSodiumMgPerL ?? 0) >= 900;

/** 0–1 closeness of `value` to `ideal`, fading to 0 at distance `span`. */
const closeness = (value: number, ideal: number, span: number): number =>
  Math.max(0, 1 - Math.abs(value - ideal) / span);

/**
 * Score one product for one slot in the context of a session. Returns `null`
 * when the product is ineligible for the slot (hard rules — phase, caffeine
 * opt-in, multi-transportable requirement), otherwise a 0–100 fit + reasons.
 */
export function scoreForSlot(
  product: Product,
  slot: OfferingSlot,
  input: AthleteInput,
  target: FuelingTarget,
): ScoredProduct | null {
  const reasons: string[] = [];
  const p = product;

  // --- Hard eligibility rules (shared) ---
  const caffeinated = (p.caffeineMg ?? 0) > 0;
  // Never surface caffeine unless the athlete opted in for a long/hard effort.
  if (caffeinated && !wantsCaffeine(input)) return null;

  switch (slot) {
    case "carb-carrier": {
      if (!p.phases.includes("during") || p.category !== "drink-mix" || p.carbsG <= 5) return null;
      if (target.carbPerHourG <= 0) return null;
      if (target.requiresMultiTransportable && !p.multiTransportable) return null;
      let score = 45;
      // A drink mix that carries carbs, fluid and sodium in one bottle is ideal.
      reasons.push("One bottle carries carbs, fluid and sodium together.");
      // Carb density near the per-hour target (one drink ≈ one hour) scores best.
      score += 35 * closeness(p.carbsG, target.carbPerHourG, 45);
      if (p.multiTransportable) {
        score += 12;
        reasons.push(
          target.requiresMultiTransportable
            ? "2:1 glucose+fructose — required to absorb 60 g/h+."
            : "2:1 glucose+fructose absorbs cleanly and scales up later.",
        );
      }
      // Sodium that matches the plan's per-litre target helps in heat.
      score += 8 * closeness(p.sodiumMg, target.sodiumPerLitreMg, 500);
      return { product: p, score: clampScore(score), reasons };
    }

    case "carb-topup": {
      if (!p.phases.includes("during")) return null;
      if (!(p.category === "gel" || p.category === "bar") || p.carbsG <= 5) return null;
      if (target.carbPerHourG <= 0) return null;
      if (target.requiresMultiTransportable && !p.multiTransportable) return null;
      let score = 50;
      reasons.push("Tops up carbs on the move without extra fluid.");
      if (p.category === "gel") {
        score += 10;
        reasons.push("Fast-absorbing between drink bottles.");
      } else {
        // Bars suit lower-intensity, longer sessions you can chew.
        score += input.intensity === "easy" || input.intensity === "moderate" ? 6 : -6;
        if (input.durationMin >= 150) reasons.push("Real-food texture for very long steady efforts.");
      }
      if (caffeinated) {
        score += 14;
        reasons.push(`${p.caffeineMg} mg caffeine for the final third of a long/hard effort.`);
      }
      if (p.multiTransportable) score += 6;
      return { product: p, score: clampScore(score), reasons };
    }

    case "electrolyte": {
      if (!p.phases.includes("during") || p.category !== "electrolyte") return null;
      let score = 30 + 40 * closeness(p.sodiumMg, 400, 400);
      reasons.push("Adds sodium independently of carbs.");
      if (needsExtraSodium(input)) {
        score += 20;
        reasons.push(
          input.conditions === "hot"
            ? "It's hot — the drink alone won't cover sodium losses."
            : "Heavy/salty sweater — extra sodium protects against cramp and hyponatraemia.",
        );
      }
      return { product: p, score: clampScore(score), reasons };
    }

    case "hydration": {
      if (!p.phases.includes("during") || p.category !== "electrolyte" || p.carbsG > 1) return null;
      let score = 55 + 30 * closeness(p.sodiumMg, target.sodiumPerLitreMg, 500);
      reasons.push("Electrolytes without unnecessary sugar.");
      if (input.goal === "weight-loss") {
        score += 10;
        reasons.push("Keeps easy sessions calorie-free to protect the deficit.");
      }
      return { product: p, score: clampScore(score), reasons };
    }

    case "pre-fuel": {
      if (!p.phases.includes("pre") || p.carbsG < 20) return null;
      let score = 40 + 30 * closeness(p.carbsG, 45, 45);
      reasons.push("Carbohydrate-focused to top up glycogen before you start.");
      // Low protein/fat = lower fibre/fat, easier on the gut close to the start.
      if ((p.proteinG ?? 0) <= 6) {
        score += 12;
        reasons.push("Low in fat/fibre, so it settles before the effort.");
      }
      if (p.category === "bar") reasons.push("Chewable option 2–3 h out.");
      return { product: p, score: clampScore(score), reasons };
    }

    case "recovery": {
      const isRecovery = p.phases.includes("post") && (p.category === "recovery" || (p.proteinG ?? 0) >= 10);
      if (!isRecovery) return null;
      let score = 35;
      const protein = p.proteinG ?? 0;
      reasons.push("Carbohydrate refills glycogen and protein repairs muscle.");
      score += 25 * closeness(protein, 20, 20);
      if (input.goal === "weight-loss") {
        // Reward protein density, discount extra carbs on a deficit.
        score += Math.min(15, protein - p.carbsG * 0.4);
        if (protein >= 20) reasons.push("Protein-forward to preserve muscle on a deficit.");
      } else {
        score += 15 * closeness(p.carbsG, 30, 30);
        if (input.physiology?.readiness !== undefined && input.physiology.readiness < 45) {
          reasons.push("Readiness is low — lean into recovery to close the gap.");
        }
      }
      return { product: p, score: clampScore(score), reasons };
    }
  }
}

const clampScore = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Rank every eligible product in the catalogue for a slot, best first. */
function rankSlot(
  slot: OfferingSlot,
  input: AthleteInput,
  target: FuelingTarget,
  catalog: Product[],
): ScoredProduct[] {
  return catalog
    .map((p) => scoreForSlot(p, slot, input, target))
    .filter((s): s is ScoredProduct => s !== null)
    .sort((a, b) => b.score - a.score);
}

/** Whether a session needs a given slot filled at all. */
function slotNeeded(slot: OfferingSlot, input: AthleteInput, target: FuelingTarget): boolean {
  switch (slot) {
    case "carb-carrier":
    case "carb-topup":
      return target.carbPerHourG > 0;
    case "hydration":
      return target.carbPerHourG === 0;
    case "electrolyte":
      return needsExtraSodium(input) && target.carbPerHourG > 0;
    case "pre-fuel":
    case "recovery":
      return true;
  }
}

function slotGuidance(slot: OfferingSlot, target: FuelingTarget): string {
  switch (slot) {
    case "carb-carrier":
      return `Your base for ~${target.carbPerHourG} g/h — one bottle roughly per hour.`;
    case "carb-topup":
      return "Use between bottles when a single drink can't carry the whole carb load.";
    case "electrolyte":
      return "Add on top of the drink when it's hot or you sweat heavily/salty.";
    case "hydration":
      return `Short/easy enough to run on water — ~${target.fluidPerHourMl} ml/h, no sugar needed.`;
    case "pre-fuel":
      return "1–3 h before the start, low in fat and fibre.";
    case "recovery":
      return "Within ~60 min after the session, especially before another inside 24 h.";
  }
}

const ORDER: OfferingSlot[] = ["pre-fuel", "carb-carrier", "carb-topup", "hydration", "electrolyte", "recovery"];

/**
 * The full ideal offering for a session: the best product for each functional
 * slot, with alternatives and when-to-use guidance. `recommend()` maps this onto
 * its pre/during/post phases.
 */
export function idealOffering(
  input: AthleteInput,
  target: FuelingTarget,
  catalog: Product[] = CATALOG,
): Offering {
  const slots = ORDER.map((slot): OfferingSlotResult => {
    const ranked = rankSlot(slot, input, target, catalog);
    const needed = slotNeeded(slot, input, target);
    return {
      slot,
      label: SLOT_LABEL[slot],
      needed,
      pick: needed ? ranked[0] : undefined,
      alternatives: ranked.slice(1, 3),
      guidance: slotGuidance(slot, target),
    };
  });

  const carrier = slots.find((s) => s.slot === "carb-carrier")?.pick?.product;
  const headline =
    target.carbPerHourG === 0
      ? "Hydration-led session — run on water plus electrolytes."
      : carrier
        ? `${carrier.brand} ${carrier.name} anchors ~${target.carbPerHourG} g/h, topped up as the session runs long.`
        : `Target ~${target.carbPerHourG} g/h across your chosen products.`;

  return { slots, headline };
}

// --- Session-independent usage guide (powers the catalogue's when-to-use view) ---

export interface UsageGuide {
  summary: string;
  bestWhen: string[];
  avoidWhen: string[];
}

/**
 * Describe when a product is the right choice, independent of any one session —
 * derived from its own attributes so it stays correct for admin/house products
 * too.
 */
export function productUsage(p: Product): UsageGuide {
  const bestWhen: string[] = [];
  const avoidWhen: string[] = [];
  let summary = "";

  switch (p.category) {
    case "drink-mix": {
      const high = p.carbsG >= 55;
      summary = high
        ? "High-carb loader / primary carrier for long, hard sessions."
        : "Everyday primary carb carrier — carbs, fluid and sodium in one bottle.";
      bestWhen.push(high ? "Sessions 2 h+ or carb-up days" : "Sessions 60 min+ at moderate–hard effort");
      if (p.multiTransportable) bestWhen.push("When you need 60 g/h or more (2:1 glucose+fructose)");
      if (p.sodiumMg >= 300) bestWhen.push("Hot weather or salty sweaters");
      avoidWhen.push("Short easy sessions where water is enough");
      break;
    }
    case "gel":
      summary = p.caffeineMg
        ? "Caffeinated carb top-up for the back half of long/hard efforts."
        : "Fast carb top-up on the move between bottles.";
      bestWhen.push("Topping up carbs mid-session without extra fluid");
      if (p.caffeineMg) bestWhen.push("Final third of a long or hard effort (if caffeine-tolerant)");
      if (p.multiTransportable) bestWhen.push("Alongside a drink when targeting high carb rates");
      avoidWhen.push(p.caffeineMg ? "Easy sessions, or if you avoid caffeine" : "When you also need fluid — pair with water");
      break;
    case "bar":
      summary = "Chewable real-food carbs for pre-session or long steady efforts.";
      bestWhen.push("1–3 h before a session", "Long, low-intensity efforts you can chew through");
      avoidWhen.push("High-intensity or race pace — hard to digest");
      break;
    case "electrolyte":
      summary = p.carbsG <= 1
        ? "Calorie-free hydration and sodium."
        : "Standalone sodium to add on top of your drink.";
      bestWhen.push("Hot conditions or heavy/salty sweaters");
      if (p.carbsG <= 1) bestWhen.push("Easy sessions or weight-loss goals (no sugar)");
      avoidWhen.push("As your only carb source on long/hard sessions");
      break;
    case "recovery":
      summary = "Post-session carbohydrate + protein to rebuild.";
      bestWhen.push("Within ~60 min after demanding sessions", "When training again inside 24 h");
      if ((p.proteinG ?? 0) >= 20) bestWhen.push("Preserving muscle on a calorie deficit");
      avoidWhen.push("Mid-session — it's a recovery product");
      break;
  }
  return { summary, bestWhen, avoidWhen };
}
