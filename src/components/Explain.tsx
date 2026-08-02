import type { ReactNode } from "react";
import { useT } from "../i18n";

/**
 * The reasoning behind something, one tap away.
 *
 * A screen that opens with a paragraph explaining itself makes the athlete read
 * before they can act. But the reasoning is what makes this product worth
 * trusting — hiding it would be worse. So it goes here: closed by default,
 * always available, never in the way.
 *
 * Native `<details>` on purpose — it is keyboard-operable, findable by the
 * browser's own in-page search, and needs no state.
 */
export function Explain({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT();
  return (
    <details className="explain">
      <summary>{label ?? t("common.whyThis")}</summary>
      <div className="explain-body">{children}</div>
    </details>
  );
}
