/**
 * XP → level curve and level names. Cumulative XP to *reach* level L is
 * `STEP * L*(L-1)/2` (each level costs a bit more than the last).
 */

const STEP = 120;

export const LEVEL_NAMES = [
  "Rookie",
  "Weekend Warrior",
  "Club Athlete",
  "Racer",
  "Contender",
  "Elite",
  "Pro",
] as const;

/** Cumulative XP required to reach a level (level 1 = 0). */
export function xpToReach(level: number): number {
  const l = Math.max(1, level);
  return (STEP * (l * (l - 1))) / 2;
}

export function levelName(level: number): string {
  // Two levels per name band, capped at the last name.
  const idx = Math.min(LEVEL_NAMES.length - 1, Math.floor((level - 1) / 2));
  return LEVEL_NAMES[idx];
}

export interface LevelProgress {
  level: number;
  levelName: string;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (to the next). */
  xpForLevel: number;
}

/** Resolve a total XP into level + within-level progress. */
export function levelForXp(xp: number): LevelProgress {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpToReach(level + 1) <= total) level++;
  const base = xpToReach(level);
  const next = xpToReach(level + 1);
  return {
    level,
    levelName: levelName(level),
    xpIntoLevel: total - base,
    xpForLevel: next - base,
  };
}
