import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Guards on the design system that a browser cannot check.
 *
 * The contrast of what these tokens *resolve to* is measured in the real
 * browser by `npm run e2e` — chained tokens and `color-mix()` need a rendering
 * engine. What is checkable here is the discipline that keeps the two themes
 * one design rather than two: no raw colours outside the token block, and no
 * chart drawing a shared idea through its own private colour.
 */
const css = readFileSync("src/styles.css", "utf8");

/** Everything after the theme definitions — where raw colour is not allowed. */
const TOKEN_BLOCK_END = css.indexOf("* {\n  box-sizing: border-box;");
const body = css.slice(TOKEN_BLOCK_END);

const rules = (selectorFragment: string) =>
  body
    .split("\n")
    .filter((l) => l.includes(selectorFragment))
    .join("\n");

describe("design system", () => {
  it("keeps raw colour inside the token block", () => {
    // Pure black and white are allowed: they are brand marks (the Google button)
    // and scrims, not theme colours. Everything else must be a token, or a
    // light-mode panel silently keeps a dark-mode tint — which is exactly what
    // twenty-two hand-written rgba() values were doing.
    const offenders = body
      .split("\n")
      .map((line, i) => [i, line] as const)
      .filter(([, l]) => !l.includes("url(\"data:"))
      .filter(([, l]) => /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,/.test(l))
      .filter(([, l]) => !/#fff\b|#ffffff\b|#000\b|#000000\b|rgba?\(\s*0\s*,\s*0\s*,\s*0|rgba?\(\s*255\s*,\s*255\s*,\s*255/.test(l))
      // The Google brand blue is theirs, not ours, and must not be themed.
      .filter(([, l]) => !l.includes("#4285f4"))
      .map(([i, l]) => `line ${i}: ${l.trim()}`);
    expect(offenders).toEqual([]);
  });

  it("draws every chart mark through a chart role token", () => {
    // A chart's stroke or fill naming a palette colour directly is how four
    // charts ended up showing the same three ideas in three greens and two
    // reds. The score arc is the documented exception below.
    const marks = body
      .split("\n")
      .filter((l) => /^\s*\.[a-z-]*(elev|energy|sim|load-line|chart)[a-z-]*.*\b(stroke|fill):\s*var\(/.test(l))
      .filter((l) => !l.includes("var(--chart-"))
      .filter((l) => !/(stroke|fill):\s*(none|var\(--panel\))/.test(l))
      .map((l) => l.trim());
    expect(marks).toEqual([]);
  });

  it("gives every legend swatch the colour of the line it names", () => {
    // A legend that disagrees with its chart is worse than no legend.
    const pairs: [string, string][] = [
      [".lg-fuelled", "--chart-primary"],
      [".lg-unfuelled", "--chart-baseline"],
      [".lg-fade", "--chart-limit"],
      [".lg-fitness", "--chart-fitness"],
      [".lg-fatigue", "--chart-fatigue"],
    ];
    for (const [swatch, token] of pairs) {
      expect(rules(swatch), `${swatch} should use ${token}`).toContain(token);
    }
  });

  it("defines every chart role in the shared token block, once", () => {
    const roles = [...css.matchAll(/^\s*--chart-[a-z-]+:/gm)].map((m) => m[0].trim());
    expect(roles.length).toBeGreaterThan(10);
    // Declared once, in `:root` — a per-theme override would mean the two
    // themes had drifted into two different designs.
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("derives every semantic tint rather than writing it out", () => {
    for (const name of ["accent", "info", "warn", "success"]) {
      expect(css).toMatch(new RegExp(`--${name}-line: color-mix\\(`));
    }
    for (const name of ["accent", "info", "warn", "success"]) {
      expect(css).toMatch(new RegExp(`--${name}-soft: color-mix\\(`));
    }
  });

  it("uses no token it never defines", () => {
    // An undefined token voids the whole declaration silently: `--surface` was
    // used for a marker ring and a label mask, and neither ever rendered.
    const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    expect([...used].filter((t) => !defined.has(t))).toEqual([]);
  });
});
