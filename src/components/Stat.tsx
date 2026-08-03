/**
 * A figure with its label, and optionally a note underneath.
 *
 * The note carries three different kinds of thing across the app — where a
 * number came from ("measured"), what it means ("suppressed"), and a plain
 * caption ("42-day load") — and every one of them used to render in the same
 * confident green. On the race forecast that put "this course demands" and
 * "fluid to replace" in the colour the rest of the app uses for *good*.
 *
 * So the tone is explicit, and neutral by default: colour is for when the note
 * says something about state, not for decoration.
 */
export type StatTone = "muted" | "good" | "watch";

export function Stat({
  label,
  value,
  note,
  tone = "muted",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: StatTone;
}) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {note && <span className={`stat-note stat-note-${tone}`}>{note}</span>}
    </div>
  );
}
