/**
 * Light / dark appearance.
 *
 * Three choices, not two: an athlete who has set their phone to switch at dusk
 * expects the app to follow, so **system** is the default and stays live — the
 * OS preference is watched, not read once at boot.
 *
 * The whole implementation is one attribute on <html>; every colour in the app
 * already resolves to a token, so the stylesheet does the rest.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ygf.theme";
const CHOICES: ThemeChoice[] = ["system", "light", "dark"];

/** The browser's current preference, defaulting to dark where unknown. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function loadThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return CHOICES.includes(raw as ThemeChoice) ? (raw as ThemeChoice) : "system";
  } catch {
    return "system";
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* private mode — the choice just won't persist */
  }
}

export const resolveTheme = (choice: ThemeChoice): ResolvedTheme =>
  choice === "system" ? systemTheme() : choice;

/** Browser-chrome colour, so the notch and address bar match the app. */
const THEME_COLOR: Record<ResolvedTheme, string> = { dark: "#0f1417", light: "#f6f8f9" };

/**
 * Put the resolved theme on <html>. Also updates `color-scheme`, so native
 * controls, scrollbars and form widgets follow — without it, a light page keeps
 * dark scrollbars and looks broken.
 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Watch the OS preference. The callback fires only while the athlete is on
 * "system"; returns an unsubscribe.
 */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? "light" : "dark");
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
