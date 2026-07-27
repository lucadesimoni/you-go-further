import { useT } from "../i18n";
import { formatClock } from "../engine";
import type { RouteFuelPlan } from "../engine";

/**
 * The route's height profile with the fuelling stops pinned on it.
 *
 * The point of drawing this rather than listing times is that the *shape* is the
 * argument: an athlete can see at a glance that a feed sits on the approach to
 * the climb and that the long descent after it has none, which is exactly the
 * reasoning behind the plan.
 *
 * Inline SVG, no chart library — the whole thing is a polyline and a few pins.
 */
const W = 320;
const H = 96;
const PAD_TOP = 10;
const PAD_BOTTOM = 16;

export function ElevationFuelChart({
  plan,
  estimated = false,
}: {
  plan: RouteFuelPlan;
  /** True when the profile is a local estimate rather than swisstopo's DEM. */
  estimated?: boolean;
}) {
  const t = useT();
  const { segments, stops } = plan;
  if (segments.length < 2) return null;

  const totalKm = segments[segments.length - 1].toKm || 1;
  const alts = segments.map((s) => s.altM);
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  // A flat route would otherwise divide by zero and draw a line through the
  // middle of nowhere; give it a nominal band instead.
  const span = Math.max(20, maxAlt - minAlt);

  const x = (km: number) => (km / totalKm) * W;
  const y = (altM: number) => PAD_TOP + (1 - (altM - minAlt) / span) * (H - PAD_TOP - PAD_BOTTOM);

  // Total ascent of the drawn line. Summing only the climbs *worth a feed*
  // would report "↑ 0 m" on a rolling route that plainly goes up and down.
  const ascentM = segments.reduce((sum, s, i) => {
    const rise = i === 0 ? 0 : s.altM - segments[i - 1].altM;
    return sum + Math.max(0, rise);
  }, 0);

  const points = segments.map((s) => `${x(s.fromKm).toFixed(1)},${y(s.altM).toFixed(1)}`);
  const last = segments[segments.length - 1];
  points.push(`${x(last.toKm).toFixed(1)},${y(last.altM).toFixed(1)}`);
  const line = points.join(" ");
  const area = `${x(0)},${H - PAD_BOTTOM} ${line} ${x(totalKm)},${H - PAD_BOTTOM}`;

  /** Altitude at a given distance, for placing a pin on the line. */
  const altAtKm = (km: number) => {
    let found = segments[0];
    for (const s of segments) if (s.fromKm <= km) found = s;
    return found.altM;
  };

  return (
    <figure className={`elev-chart${estimated ? " elev-chart-estimated" : ""}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="elev-svg"
        role="img"
        aria-label={t("route.chartLabel", { count: stops.length, gain: Math.round(ascentM) })}
        preserveAspectRatio="none"
      >
        {/* Climbs shaded, so the demanding stretches read at a glance. */}
        {plan.climbs.map((c, i) => (
          <rect
            key={i}
            className="elev-climb"
            x={x(c.fromKm)}
            y={PAD_TOP}
            width={Math.max(1, x(c.toKm) - x(c.fromKm))}
            height={H - PAD_TOP - PAD_BOTTOM}
          />
        ))}
        <polyline className="elev-area" points={area} />
        <polyline className="elev-line" points={line} />
        {stops.map((s, i) => (
          <g key={i} className={`elev-stop elev-stop-${s.kind}`}>
            <line x1={x(s.atKm)} y1={y(altAtKm(s.atKm))} x2={x(s.atKm)} y2={H - PAD_BOTTOM} />
            <circle cx={x(s.atKm)} cy={y(altAtKm(s.atKm))} r={3.5} />
          </g>
        ))}
      </svg>

      <figcaption className="elev-foot">
        <span>{minAlt} m</span>
        <span>
          {totalKm} km · ↑ {Math.round(ascentM)} m
        </span>
        <span>{maxAlt} m</span>
      </figcaption>

      <ol className="elev-stops">
        {stops.map((s, i) => (
          <li key={i} className={`elev-stop-row elev-stop-${s.kind}`}>
            <span className="elev-stop-when">{formatClock(s.atMin)}</span>
            <span className="elev-stop-where">
              km {s.atKm} · {s.altM} m
            </span>
            <span className="elev-stop-dose">{s.carbG} g</span>
            <span className="elev-stop-why">{s.reason}</span>
          </li>
        ))}
      </ol>

      {/* A chart looks authoritative whether or not the data is. Say plainly
          when the shape was invented locally. */}
      {estimated && <p className="detail elev-note elev-estimated">{t("route.estimatedProfile")}</p>}

      {plan.notes.map((n, i) => (
        <p key={i} className="detail elev-note">
          {n}
        </p>
      ))}
    </figure>
  );
}
