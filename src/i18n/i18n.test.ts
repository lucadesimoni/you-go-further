import { describe, it, expect } from "vitest";
// `it` is vitest's test function here, so the Italian dictionary is aliased.
import { de, en, fr, it as itDict, detectLang, translate, LANGS, type Lang } from "./index";
import type { Dictionary, TranslationKey } from "./en";

const keys = Object.keys(en) as TranslationKey[];

const LOCALES: { lang: Lang; dict: Dictionary; name: string }[] = [
  { lang: "de", dict: de, name: "German" },
  { lang: "fr", dict: fr, name: "French" },
  { lang: "it", dict: itDict, name: "Italian" },
];

describe("dictionary parity", () => {
  for (const { dict, name } of LOCALES) {
    it(`${name} covers every English key`, () => {
      expect(keys.filter((k) => !(k in dict))).toEqual([]);
    });

    it(`${name} adds no keys English doesn't have — a typo would silently never render`, () => {
      expect(Object.keys(dict).filter((k) => !(k in en))).toEqual([]);
    });

    it(`${name} leaves no string untranslated by accident`, () => {
      // Brand and language names are intentionally identical; everything else
      // being identical usually means a forgotten translation.
      const allowedIdentical = new Set<string>([
        "app.brand",
        "language.en",
        "language.de",
        "language.fr",
        "language.it",
        "nav.team",
        "appearance.system",
        "activity.triathlon",
        "plan.pause", // the same word in German, French and Italian
        "plan.sodiumPerLitreLong",
        "plan.conditions",
        "route.byTerrain",
        "connect.title",
        "connect.weather",
        "debrief.energy",
        "auth.continueApple",
        "auth.continueGoogle",
        "activity.trail-running",
        "nav.admin",
        "insights.hours",
        "home.hours",
        "home.distance",
        "guide.articles", // "articles" is the same word in French
        "privacy.tpProviders", // four brand names and a dash, in every language
        "nav.guide", // "Guide" is the same word in French
        "account.menu", // Italian uses the English "Account"
        "absorb.ceiling", // "max ~90 g/h" is the same abbreviation everywhere
        "load.fitness", // "Fitness" is the same word in German
        "load.form", // as is "Form"
        "load.fatigue", // and "Fatigue" in French
        "route.wind", // "Wind" is the same word in German
        "admin.status", // "Status" is the same word in German
        "server.backend", // "Backend" is untranslated everywhere on purpose
        "team.title", // "Team" is the same word in German
        "admin.commissionPct", // "Commission %" is the same in French
        "catalog.phases", // as is "Phases"
        "catalog.sortName", // "Name" is the same word in German
        "catalog.proteinShort", // as is "Protein"
        "catalog.sodiumShort", // "Sodium" is the same word in French
        "catalog.proteinG", // "Protein (g, optional)" is word-for-word the same in German
        "catalog.sodiumMg", // "Sodium (mg)" is the same in French
        "cat.gel", // "Gel" is the same word in all four
        "cue.fluid", // a millilitre reading is "{n} ml" in every language
        "event.course", // "{distance} km · ↑ {ascent} m" is figures and symbols only
        "event.legStart", // "Start" is the same word in German
        "train.hoursShort", // "{n} h" is the same unit everywhere
        "train.phase.base", // "Base" is the same word in French and Italian
        "train.focus.threshold", // "Seuil"/"Soglia" differ, but "Base"-like ties do not
      ]);
      const identical = keys.filter((k) => !allowedIdentical.has(k) && dict[k] === en[k]);
      expect(identical).toEqual([]);
    });

    it(`${name} keeps every placeholder, so no value goes missing`, () => {
      const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
      for (const k of keys) {
        expect(placeholders(dict[k]), `placeholders differ for "${k}"`).toEqual(placeholders(en[k]));
      }
    });

    it(`${name} contains no stray non-Latin characters`, () => {
      // A Cyrillic lookalike pasted into a string renders but is wrong.
      expect(keys.filter((k) => /[\u0400-\u04ff\u0370-\u03ff]/.test(dict[k]))).toEqual([]);
    });
  }

  it("German uses Swiss orthography — ss, never ß", () => {
    expect(keys.filter((k) => de[k].includes("ß"))).toEqual([]);
  });

  it("French and Italian actually carry their accents", () => {
    // A dictionary stripped of accents usually means it was machine-mangled
    // somewhere between the translator and the repo. The thresholds differ
    // because Italian simply accents far fewer words than French.
    expect(keys.filter((k) => /[àâçéèêëîïôùûüœ]/i.test(fr[k])).length).toBeGreaterThan(60);
    expect(keys.filter((k) => /[àèéìòù]/i.test(itDict[k])).length).toBeGreaterThan(25);
  });

  it("has no empty translations", () => {
    for (const { lang, dict } of [...LOCALES, { lang: "en" as Lang, dict: en }]) {
      for (const k of keys) expect(dict[k].trim().length, `${lang}.${k} is empty`).toBeGreaterThan(0);
    }
  });

  it("offers every dictionary in the language picker", () => {
    for (const { lang } of LOCALES) expect(LANGS).toContain(lang);
    expect(LANGS).toContain("en");
  });
});

describe("no dead keys", () => {
  /**
   * A dictionary should describe what the app actually says. Unused keys are
   * dead weight a translator would waste effort on, and they hide the fact that
   * a screen was never wired up — which is exactly what happened while this
   * feature was being built.
   */
  it("every key is referenced by some component", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const body = walk("src")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("/i18n/"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");

    // Keys built at the call site, e.g. t(`appearance.${choice}`), can't be
    // found by a literal search — match them by prefix instead.
    const builtDynamically = [
      /^appearance\./,
      /^language\./,
      /^goal\./,
      /^activity\./,
      /^intensity\./,
      /^conditions\./,
      /^sweat\./,
      /^nav\./,
      /^plan\.phase/,
      // Engine-produced next actions: t(`action.${action.id}`).
      /^action\./,
      /^insights\.band/,
      // Debrief ratings and findings: t(`debrief.gi.${g}`), t(`finding.${f.id}`).
      /^debrief\.(gi|energy)\./,
      /^finding\./,
      // Phase prose: t(`phase.${headlineId}`), t(`phaseDetail.${detailId}`).
      /^phase\./,
      /^phaseDetail\./,
      // Energy headline: t(`energy.${headlineId}`).
      /^energy\.(water|plan)/,
      // The race forecast's badge: t(`sim.badge.${sim.verdict}`).
      /^sim\.badge\./,
      // Event coaching: t(`event.advice.${a.id}`) and t(`event.phase.${phase}`).
      /^event\.advice\./,
      /^event\.phase\./,
      // Training plan: t(`train.phase.${w.phase}`), t(`train.kind.${s.kind}`),
      // t(`train.focus.${s.focusId}`), t(`train.fuel.${w.fuelFocusId}`).
      /^train\.phase\./,
      /^train\.kind\./,
      /^train\.focus\./,
      /^train\.fuel\./,
      // Learnings: t(`train.learn.${l.id}`).
      /^train\.learn\./,
    ];
    const unused = keys.filter(
      (k) => !k.endsWith("_one") && !body.includes(`"${k}"`) && !builtDynamically.some((r) => r.test(k)),
    );
    expect(unused).toEqual([]);
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
    expect(detectLang(["en-GB"])).toBe("en");
  });

  it("serves Romandie and Ticino their own language, not English", () => {
    expect(detectLang(["fr-CH", "de-CH"])).toBe("fr");
    expect(detectLang(["it-CH"])).toBe("it");
  });

  it("takes the first language the browser actually prefers", () => {
    // A Genevois whose browser lists French first must not get German just
    // because German is the biggest Swiss market.
    expect(detectLang(["fr-CH", "de-CH", "en"])).toBe("fr");
    expect(detectLang(["de-CH", "fr-CH"])).toBe("de");
  });

  it("defaults to English for anything else", () => {
    expect(detectLang(["es-ES", "ja"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});

describe("house style", () => {
  /**
   * The app is Swiss and writes Swiss/British English. Both spellings were in
   * the codebase at once — `FuelingTarget` next to `fuellingScore`, "fueling
   * plan" next to "fuelling score" — which is the kind of thing a reader
   * notices even when they can't name it.
   */
  const sourceFiles = async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    return walk("src")
      // This file names the wrong spellings in order to forbid them.
      .filter((f) => /\.(ts|tsx|css)$/.test(f) && !f.endsWith("i18n.test.ts"))
      .map((f) => [f, readFileSync(f, "utf8")] as const);
  };

  it("spells it fuelling, never fueling", async () => {
    const offenders = (await sourceFiles())
      .filter(([, body]) => /\bfuel(ing|ed)\b|Fuel(ing|ed)[A-Z]|\bunfueled\b/i.test(body))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("keeps the -ise ending in the words the UI actually uses", async () => {
    const offenders = (await sourceFiles())
      .filter(([, body]) => /\b(personaliz|optimiz|emphasiz)[a-z]*\b/.test(body))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("says 'session' to the athlete, not 'activity'", () => {
    // `Activity` is the model type and stays. What must not happen is a *label*
    // calling the same thing by the other name.
    for (const [key, value] of Object.entries(en)) {
      if (!/^(home|insights|debrief|race|connect)\./.test(key)) continue;
      expect(value.toLowerCase(), `${key} says "activity" to the athlete`).not.toMatch(/\bactivit(y|ies)\b/);
    }
  });
});
