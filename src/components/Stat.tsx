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

/**
 * How this figure compares with the period before it.
 *
 * Direction is drawn, never coloured. In training, "more" is not a synonym for
 * "better": a bigger week can be exactly what an athlete is building towards or
 * exactly what got them injured, and this component cannot tell which. Green
 * arrows would be the app cheering for volume it knows nothing about. The
 * planner says what a change means, in words, where it has the context to.
 */
export interface StatDelta {
  /** Already formatted and localised, e.g. "1.3 h" — never a bare number. */
  text: string;
  direction: "up" | "down" | "flat";
}

export function Stat({
  label,
  value,
  unit,
  delta,
  note,
  tone = "muted",
}: {
  label: string;
  value: string;
  /**
   * The unit, kept out of the value so it can be set smaller.
   *
   * "129.7 km" as one string makes the unit compete with the figure at the same
   * weight and size; at a glance the eye has to read the whole token to find
   * the number. Split, the number carries and the unit stays available.
   */
  unit?: string;
  delta?: StatDelta;
  note?: string;
  tone?: StatTone;
}) {
  return (
    <div className="stat">
      <span className="stat-value">
        {value}
        {/*
          A real space, not just a margin: `innerText` is what a screen reader
          announces and what lands on the clipboard, and "129.7km" is not how
          anyone says it.
        */}
        {unit && <> <span className="stat-unit">{unit}</span></>}
      </span>
      <span className="stat-label">{label}</span>
      {delta && (
        <span className={`stat-delta stat-delta-${delta.direction}`}>
          <span aria-hidden>{delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "–"}</span>
          {delta.text}
        </span>
      )}
      {note && <span className={`stat-note stat-note-${tone}`}>{note}</span>}
    </div>
  );
}
