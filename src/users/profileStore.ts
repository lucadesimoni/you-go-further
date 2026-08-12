import type { SweatLevel } from "../engine";

/**
 * The athlete's body & health profile, stored **per user on the server** so it
 * follows them across devices. The browser keeps a local copy as a cache and as
 * the fallback for the API-less build.
 */
export interface AthleteProfile {
  bodyWeightKg: number;
  /** Max heart rate, used to infer session intensity from recorded HR. */
  maxHrBpm: number;
  sweatLevel: SweatLevel;
  caffeineOk: boolean;
  useSignals: boolean;
  sweatRateMlPerH: number;
  sweatSodiumMgPerL: number;
  readiness: number;
  syncedFrom?: string;
}

export const DEFAULT_PROFILE: AthleteProfile = {
  bodyWeightKg: 70,
  maxHrBpm: 190,
  sweatLevel: "average",
  caffeineOk: false,
  useSignals: false,
  sweatRateMlPerH: 1000,
  sweatSodiumMgPerL: 800,
  readiness: 65,
};

export interface ProfileStore {
  get(userId: string): Promise<AthleteProfile>;
  save(userId: string, patch: Partial<AthleteProfile>): Promise<AthleteProfile>;
  /**
   * Erase an athlete's body data.
   *
   * Required rather than convenient: weight, sweat rate and readiness are
   * health-adjacent personal data, and an athlete who deletes their account has
   * to take these with them. A store that can only ever accumulate cannot
   * honour that.
   */
  remove(userId: string): Promise<void>;
}

const SWEAT: SweatLevel[] = ["light", "average", "heavy"];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keep only recognized fields inside sane ranges — never trust the client. */
export function normalizeProfile(input: Partial<AthleteProfile>): Partial<AthleteProfile> {
  const out: Partial<AthleteProfile> = {};
  if (typeof input.bodyWeightKg === "number") out.bodyWeightKg = clamp(Math.round(input.bodyWeightKg), 30, 200);
  if (typeof input.maxHrBpm === "number") out.maxHrBpm = clamp(Math.round(input.maxHrBpm), 120, 230);
  if (input.sweatLevel && SWEAT.includes(input.sweatLevel)) out.sweatLevel = input.sweatLevel;
  if (typeof input.caffeineOk === "boolean") out.caffeineOk = input.caffeineOk;
  if (typeof input.useSignals === "boolean") out.useSignals = input.useSignals;
  if (typeof input.sweatRateMlPerH === "number") out.sweatRateMlPerH = clamp(Math.round(input.sweatRateMlPerH), 200, 3000);
  if (typeof input.sweatSodiumMgPerL === "number")
    out.sweatSodiumMgPerL = clamp(Math.round(input.sweatSodiumMgPerL), 100, 2500);
  if (typeof input.readiness === "number") out.readiness = clamp(Math.round(input.readiness), 0, 100);
  if (typeof input.syncedFrom === "string") out.syncedFrom = input.syncedFrom.slice(0, 40);
  return out;
}

export class InMemoryProfileStore implements ProfileStore {
  private readonly byUser = new Map<string, AthleteProfile>();

  async get(userId: string): Promise<AthleteProfile> {
    return this.byUser.get(userId) ?? DEFAULT_PROFILE;
  }

  async save(userId: string, patch: Partial<AthleteProfile>): Promise<AthleteProfile> {
    const next = { ...(await this.get(userId)), ...normalizeProfile(patch) };
    this.byUser.set(userId, next);
    return next;
  }

  async remove(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}
