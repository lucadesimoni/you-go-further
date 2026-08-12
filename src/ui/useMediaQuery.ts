import { useEffect, useState } from "react";

/**
 * Follow a CSS media query from React.
 *
 * Most responsive work belongs in the stylesheet, and this is deliberately not
 * a way around that. It exists for the cases where the *markup* has to differ,
 * not just its appearance: rendering both a phone navigation bar and a desktop
 * one and hiding one with CSS would put every navigation target in the document
 * twice, which a screen reader reads twice and a test finds twice.
 *
 * Reads the match during the first render rather than after it, so the first
 * paint is already correct — a bar that renders desktop-shaped and then jumps
 * is worse than one that costs a synchronous match.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update(); // the query may have changed between render and effect
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * The three shapes this interface is designed for.
 *
 * Named rather than repeated as raw strings, because a breakpoint that appears
 * in four files with three different numbers is how a layout ends up broken on
 * exactly one device.
 */
export const PHONE = "(max-width: 640px)";
export const TABLET = "(min-width: 641px) and (max-width: 1024px)";
