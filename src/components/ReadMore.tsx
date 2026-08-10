import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";

/**
 * Long prose, folded down to its first few lines.
 *
 * Several panels open with three or four paragraphs of reasoning. The reasoning
 * is worth having — it is why the numbers can be trusted — but on a phone it
 * pushes the numbers themselves below the fold, and an athlete who has read it
 * once has to scroll past it every time after that.
 *
 * Two rules keep this honest:
 *
 * 1. The toggle appears **only when the text is actually clipped**. A control
 *    that says "Show more" and then reveals nothing teaches people to ignore
 *    it, so the clamped height is measured against the real one rather than
 *    guessed from a character count.
 * 2. Nothing is removed from the document — the text is clipped by CSS, so the
 *    browser's own find-in-page and a screen reader still reach all of it.
 */
export function ReadMore({
  children,
  /** How many lines survive the fold. */
  lines = 3,
  className,
}: {
  children: ReactNode;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Ask the clamped element whether it has more in it than it is showing.
    // A couple of pixels of slack: sub-pixel line heights round the wrong way
    // and would otherwise offer "Show more" on text that entirely fits.
    setClipped(el.scrollHeight - el.clientHeight > 2);
  }, []);

  useEffect(() => {
    if (open) return; // measuring an expanded element tells us nothing
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure, open, children]);

  const t = useT();
  return (
    <div className={className ? `readmore ${className}` : "readmore"}>
      <div
        ref={ref}
        className={open ? "readmore-body" : "readmore-body readmore-clamped"}
        style={{ "--readmore-lines": lines } as React.CSSProperties}
      >
        {children}
      </div>
      {(clipped || open) && (
        <button type="button" className="link-btn readmore-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
    </div>
  );
}

/**
 * A list that shows its first few entries and offers the rest.
 *
 * Same argument as above, applied to advice and learnings: four items of three
 * lines each is a wall, and the ones that matter most are already first.
 */
export function MoreList({
  items,
  keep = 2,
  className,
}: {
  items: ReactNode[];
  /** How many entries are shown before the athlete asks for the rest. */
  keep?: number;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, items.length - keep);
  const shown = open || hidden === 0 ? items : items.slice(0, keep);
  return (
    <>
      <ul className={className}>{shown}</ul>
      {hidden > 0 && (
        <button type="button" className="link-btn readmore-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("common.showLess") : t("common.showRest", { count: hidden })}
        </button>
      )}
    </>
  );
}
