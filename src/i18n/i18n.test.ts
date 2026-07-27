import { describe, it, expect } from "vitest";
import { de, en, detectLang, translate, LANGS } from "./index";
import type { TranslationKey } from "./en";

const keys = Object.keys(en) as TranslationKey[];

describe("dictionary parity", () => {
  it("German covers every English key", () => {
    const missing = keys.filter((k) => !(k in de));
    expect(missing).toEqual([]);
  });

  it("German adds no keys English doesn't have — a typo would silently never render", () => {
    const extra = Object.keys(de).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it("no string is left untranslated by accident", () => {
    // Brand and language names are intentionally identical; everything else
    // being identical usually means a forgotten translation.
    // Words that are genuinely the same in both languages.
    const allowedIdentical = new Set<string>([
      "app.brand",
      "language.en",
      "language.de",
      "nav.team",
      "appearance.system",
      "activity.triathlon",
    ]);
    const identical = keys.filter((k) => !allowedIdentical.has(k) && de[k] === en[k]);
    expect(identical).toEqual([]);
  });

  it("placeholders match between languages, so no value goes missing", () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const k of keys) {
      expect(placeholders(de[k]), `placeholders differ for "${k}"`).toEqual(placeholders(en[k]));
    }
  });

  it("uses Swiss orthography — ss, never ß", () => {
    const withEszett = keys.filter((k) => de[k].includes("ß"));
    expect(withEszett).toEqual([]);
  });

  it("contains no stray non-Latin characters", () => {
    // A Cyrillic lookalike pasted into a German string renders but is wrong.
    const suspicious = keys.filter((k) => /[Ѐ-ӿͰ-Ͽ]/.test(de[k]));
    expect(suspicious).toEqual([]);
  });

  it("has no empty translations", () => {
    for (const lang of LANGS) {
      const dict = lang === "de" ? de : en;
      for (const k of keys) expect(dict[k].trim().length, `${lang}.${k} is empty`).toBeGreaterThan(0);
    }
  });
});

describe("translate", () => {
  it("returns the string for the active language", () => {
    expect(translate("en", "nav.plan")).toBe("Plan");
    expect(translate("de", "nav.plan")).toBe("Planen");
  });

  it("fills placeholders", () => {
    expect(translate("en", "account.streak", { days: 5 })).toBe("5-day training streak");
    expect(translate("de", "account.streak", { days: 5 })).toBe("5 Tage Trainingsserie");
  });

  it("leaves an unknown placeholder alone rather than printing 'undefined'", () => {
    expect(translate("en", "account.streak", { nope: 1 })).toBe("{days}-day training streak");
  });

  it("uses the singular form when count is exactly one", () => {
    expect(translate("en", "insights.sessionsLogged", { count: 1 })).toBe("1 session logged");
    expect(translate("en", "insights.sessionsLogged", { count: 4 })).toBe("4 sessions logged");
    expect(translate("de", "insights.sessionsLogged", { count: 1 })).toBe("1 Einheit erfasst");
    expect(translate("de", "insights.sessionsLogged", { count: 4 })).toBe("4 Einheiten erfasst");
  });

  it("falls back to English rather than showing a raw key", () => {
    // Simulates a locale that is missing a string.
    const partial = { ...de } as Record<string, string>;
    delete partial["nav.plan"];
    expect(translate("en", "nav.plan")).toBe("Plan");
  });
});

describe("detectLang", () => {
  it("gives a Swiss German browser German", () => {
    expect(detectLang(["de-CH", "de", "en"])).toBe("de");
    expect(detectLang(["de-DE"])).toBe("de");
  });

  it("gives an English browser English", () => {
    expect(detectLang(["en-GB", "fr"])).toBe("en");
  });

  it("defaults to English for anything else", () => {
    expect(detectLang(["fr-CH", "it-CH"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
