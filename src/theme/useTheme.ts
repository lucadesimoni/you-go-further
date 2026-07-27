import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
  watchSystemTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from "./theme";

/**
 * The app's appearance, applied to <html> and kept in step with the OS while the
 * athlete is on "system".
 */
export function useTheme(): {
  choice: ThemeChoice;
  theme: ResolvedTheme;
  setChoice: (c: ThemeChoice) => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => loadThemeChoice());
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(loadThemeChoice()));

  useEffect(() => {
    const next = resolveTheme(choice);
    setTheme(next);
    applyTheme(next);
    // Only follow the OS while the athlete hasn't picked a side.
    if (choice !== "system") return;
    return watchSystemTheme((sys) => {
      setTheme(sys);
      applyTheme(sys);
    });
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    saveThemeChoice(c);
    setChoiceState(c);
  }, []);

  return { choice, theme, setChoice };
}
