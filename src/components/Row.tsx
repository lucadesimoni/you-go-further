import type { ReactNode } from "react";

/**
 * One row shape, for every list in the app.
 *
 * Four screens had each invented their own: a session on Home, a product in
 * the library, a provider on Connect, a milestone on Insights. They carry
 * different things, but they are the same object — a leading mark, a name with
 * something underneath it, and something on the right — and rendering that
 * four ways is how an app stops feeling like one app. Anything with this shape
 * uses this component now, so a change to the shape is one change.
 *
 * The slots are deliberately plain nodes rather than typed props for icon,
 * badge, price and so on. A row's trailing slot is a price here, a button
 * there and a pair of figures somewhere else; enumerating those would be a
 * component that knows about every screen it appears on.
 */
export function Row({
  lead,
  title,
  meta,
  trail,
  tone,
  className = "",
  onClick,
  as: As = "div",
}: {
  /** The mark on the left: a sport disc, a thumbnail, a tick. */
  lead?: ReactNode;
  title: ReactNode;
  /** A line under the title — a date, a category, a status. */
  meta?: ReactNode;
  /** The right-hand side: figures, a price, a button. */
  trail?: ReactNode;
  /** Muted rows read as "not yet" — a locked milestone, a stale connection. */
  tone?: "muted";
  className?: string;
  onClick?: () => void;
  as?: "div" | "li";
}) {
  const classes = ["row", tone === "muted" ? "row-muted" : "", className].filter(Boolean).join(" ");
  const body = (
    <>
      {lead && <span className="row-lead">{lead}</span>}
      <span className="row-body">
        <span className="row-title">{title}</span>
        {meta && <span className="row-meta">{meta}</span>}
      </span>
      {trail && <span className="row-trail">{trail}</span>}
    </>
  );
  // A row that does something is a button, so it is reachable by keyboard and
  // announced as actionable. A row that only shows is not.
  if (onClick) {
    return (
      <As className={classes}>
        <button type="button" className="row-hit" onClick={onClick}>
          {body}
        </button>
      </As>
    );
  }
  return <As className={classes}>{body}</As>;
}
