import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Dictionary, type TranslationKey } from "./en";
import { de } from "./de";
import { fr } from "./fr";
import { it } from "./it";

/**
 * Switzerland's national languages plus English. The dictionaries are plain
 * objects checked against each other at compile time, so nothing here reaches
 * for an i18n framework the app doesn't need.
 *
 * Romanche is not included: it has around 40 000 speakers, essentially all of
 * whom also read German, and a half-maintained translation would be worse than
 * none. Adding it later is one more file.
 */
export type Lang = "en" | "de" | "fr" | "it";

export const LANGS: Lang[] = ["de", "fr", "it", "en"];

const DICTIONARIES: Record<Lang, Dictionary> = { en, de, fr, it };

const STORAGE_KEY = "ygf.lang";

/** Most of this platform's users are Swiss, so their own language wins first. */
export function detectLang(navigatorLanguages?: readonly string[]): Lang {
  const langs =
    navigatorLanguages ??
    (typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
  for (const raw of langs) {
    const tag = String(raw).toLowerCase();
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("it")) return "it";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(stored as Lang)) return stored as Lang;
  } catch {
    /* private mode */
  }
  return detectLang();
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* the choice just won't persist */
  }
}

export type Vars = Record<string, string | number>;

/**
 * Look up a key and fill its `{placeholders}`.
 *
 * Keys ending in a count get an `_one` sibling for the singular — enough
 * plural handling for two languages that both have a simple singular/plural
 * split, without pulling in ICU message formatting.
 */
export function translate(lang: Lang, key: TranslationKey, vars?: Vars): string {
  const dict = DICTIONARIES[lang] ?? en;
  let template: string = dict[key] ?? en[key] ?? key;

  if (vars && typeof vars.count === "number" && Math.abs(vars.count) === 1) {
    const singular = `${key}_one` as TranslationKey;
    if (singular in dict) template = dict[singular];
  }

  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => loadLang());

  // Keep <html lang> correct: screen readers pick pronunciation from it, and
  // the browser uses it for hyphenation and translation offers.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    saveLang(l);
    setLangState(l);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Translation for a component. Falls back to English outside a provider, so a
 * component rendered in isolation (a test, a story) still shows real text.
 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return { lang: "en", setLang: () => {}, t: (key, vars) => translate("en", key, vars) };
}

/** Shorthand for the common case. */
export function useT(): (key: TranslationKey, vars?: Vars) => string {
  return useI18n().t;
}

export type { Dictionary, TranslationKey } from "./en";
export { en, de, fr, it };
