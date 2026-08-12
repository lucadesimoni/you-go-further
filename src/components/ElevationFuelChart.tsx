import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { formatClock } from "../engine";
import type { RouteFuelPlan } from "../engine";
import type { ElevationSample } from "../geo";

/**
 * The route's height profile with the fuelling stops pinned on it.
 *
 * The point of drawing this rather than listing times is that the *shape* is the
 * argument: an athlete can see at a glance that a feed sits on the approach to
 * the climb and that the long descent after it has none, which is exactly the
 * reasoning behind the plan.
 *
 * Three things this had wrong, and why they mattered:
 *
 * 1. **It was drawn from the fuelling segments, not the terrain.** Segments are
 *    the units the fuelling engine reasons in — a handful of them across a
 *    marathon — so a 42 km profile was a dozen straight lines. The elevation
 *    samples are the actual measurement, and there are hundreds of them.
 * 2. **It was stretched.** A fixed 320×96 viewBox scaled to whatever width the
 *    panel happened to be, with `preserveAspectRatio="none"`, so every gradient
 *    on screen was a lie about its own steepness. It is now measured and drawn
 *    at the real pixel size, and the vertical exaggeration is stated rather than
 *    accidental.
 * 3. **It had no scale.** No altitude gridlines, no distance ticks and nothing
 *    to hover: a picture with no numbers on it.
 *
 * Inline SVG, no chart library — it is still a polyline and a few pins.
 */

const H = 190;
const PAD = { top: 14, right: 10, bottom: 26, left: 44 };

/** Round a metre span up to a readable gridline step. */
function altStep(span: number): number {
  for (const step of [10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (span / step <= 5) return step;
  }
  return 2000;
}

/** Round a kilometre span to a readable tick interval. */
function kmStep(totalKm: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 20, 25, 50]) {
    if (totalKm / step <= 8) return step;
  }
  return 100;
}

export function ElevationFuelChart({
  plan,
  samples,
  estimated = false,
  hoverKm,
  onHoverKm,
}: {
  plan: RouteFuelPlan;
  /**
   * The terrain measurement itself. Falls back to the fuelling segments when a
   * caller has none — a coarse but honest line, rather than no chart.
   */
  samples?: ElevationSample[];
  /** True when the profile is a local estimate rather than swisstopo's DEM. */
  estimated?: boolean;
  /** Distance the map is pointing at, so the two views share one cursor. */
  hoverKm?: number | null;
  onHoverKm?: (km: number | null) => void;
}) {
  const t = useT();
  const { segments, stops } = plan;
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  // Draw at the real width. Anything else is a chart that misreports gradient,
  // which is the one thing a height profile exists to show.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** The line, at whatever resolution the caller could give us. */
  const points = useMemo<{ km: number; altM: number }[]>(() => {
    if (samples && samples.length > 1) {
      return samples.map((s) => ({ km: s.distanceM / 1000, altM: s.altM }));
    }
    if (segments.length < 2) return [];
    const fromSegments = segments.map((s) => ({ km: s.fromKm, altM: s.altM }));
    const last = segments[segments.length - 1];
    fromSegments.push({ km: last.toKm, altM: last.altM });
    return fromSegments;
  }, [samples, segments]);

  if (points.length < 2) return null;

  const totalKm = points[points.length - 1].km || 1;
  const alts = points.map((p) => p.altM);
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  // A flat route would otherwise divide by zero and draw a line through the
  // middle of nowhere; give it a nominal band instead.
  const span = Math.max(20, maxAlt - minAlt);
  const step = altStep(span);
  // Grid to whole steps around the data, so the labels are round numbers.
  const gridMin = Math.floor(minAlt / step) * step;
  const gridMax = Math.ceil(maxAlt / step) * step;
  const gridSpan = Math.max(step, gridMax - gridMin);

  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (km: number) => PAD.left + (km / totalKm) * plotW;
  const y = (altM: number) => PAD.top + (1 - (altM - gridMin) / gridSpan) * plotH;

  // Total ascent of the drawn line. Summing only the climbs *worth a feed*
  // would report "↑ 0 m" on a rolling route that plainly goes up and down.
  const ascentM = points.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.max(0, p.altM - points[i - 1].altM)), 0);

  const line = points.map((p) => `${x(p.km).toFixed(1)},${y(p.altM).toFixed(1)}`).join(" ");
  const area = `${x(0)},${H - PAD.bottom} ${line} ${x(totalKm)},${H - PAD.bottom}`;

  /** Altitude at a given distance, interpolated between the two nearest samples. */
  const altAtKm = (km: number) => {
    if (km <= points[0].km) return points[0].altM;
    for (let i = 1; i < points.length; i++) {
      if (points[i].km >= km) {
        const a = points[i - 1];
        const b = points[i];
        const f = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
        return a.altM + (b.altM - a.altM) * f;
      }
    }
    return points[points.length - 1].altM;
  };

  /** Gradient around a point, over a window wide enough not to be noise. */
  const gradeAtKm = (km: number) => {
    const w = Math.max(0.1, totalKm / 100);
    const back = altAtKm(Math.max(0, km - w));
    const fwd = altAtKm(Math.min(totalKm, km + w));
    const runM = (Math.min(totalKm, km + w) - Math.max(0, km - w)) * 1000;
    return runM === 0 ? 0 : ((fwd - back) / runM) * 100;
  };

  const gridLines: number[] = [];
  for (let a = gridMin; a <= gridMax + 0.5; a += step) gridLines.push(a);
  const kmTicks: number[] = [];
  const kStep = kmStep(totalKm);
  for (let k = 0; k <= totalKm + 0.001; k += kStep) kmTicks.push(Math.round(k * 10) / 10);

  /**
   * How much the vertical scale is stretched relative to the horizontal.
   *
   * Every height profile exaggerates — 1000 m over 40 km is invisible drawn to
   * scale. Printing the factor is what keeps the picture honest: a wall on
   * screen at ×25 is a gradient anyone can run up.
   */
  const exaggeration = Math.round((plotH / gridSpan) * ((totalKm * 1000) / plotW));

  const pointerKm = (clientX: number): number | null => {
    const box = wrap.current?.querySelector(".elev-svg")?.getBoundingClientRect();
    if (!box) return null;
    const scale = width / box.width;
    const px = (clientX - box.left) * scale;
    if (px < PAD.left || px > width - PAD.right) return null;
    return ((px - PAD.left) / plotW) * totalKm;
  };

  const cursorKm = hoverKm != null && hoverKm >= 0 && hoverKm <= totalKm ? hoverKm : null;
  const cursorAlt = cursorKm == null ? 0 : altAtKm(cursorKm);
  const cursorGrade = cursorKm == null ? 0 : gradeAtKm(cursorKm);

  return (
    <figure className={`elev-chart${estimated ? " elev-chart-estimated" : ""}`} ref={wrap}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        className="elev-svg"
        role="img"
        aria-label={t("route.chartLabel", { count: stops.length, gain: Math.round(ascentM) })}
        onMouseMove={(e) => onHoverKm?.(pointerKm(e.clientX))}
        onMouseLeave={() => onHoverKm?.(null)}
        onTouchStart={(e) => onHoverKm?.(pointerKm(e.touches[0].clientX))}
        onTouchMove={(e) => onHoverKm?.(pointerKm(e.touches[0].clientX))}
        onTouchEnd={() => onHoverKm?.(null)}
      >
        {/* Altitude grid: the numbers that turn a shape into a measurement. */}
        {gridLines.map((a) => (
          <g key={a} className="elev-grid">
            <line x1={PAD.left} y1={y(a)} x2={width - PAD.right} y2={y(a)} />
            <text x={PAD.left - 6} y={y(a) + 3.5} className="elev-axis-label" textAnchor="end">
              {a}
            </text>
          </g>
        ))}

        {/* Climbs shaded, so the demanding stretches read at a glance. */}
        {plan.climbs.map((c, i) => (
          <rect
            key={i}
            className="elev-climb"
            x={x(c.fromKm)}
            y={PAD.top}
            width={Math.max(1, x(c.toKm) - x(c.fromKm))}
            height={plotH}
          />
        ))}

        <polyline className="elev-area" points={area} />
        <polyline className="elev-line" points={line} />

        {kmTicks.map((k) => (
          <text key={k} x={x(k)} y={H - 8} className="elev-axis-label" textAnchor="middle">
            {k % 1 === 0 ? k : k.toFixed(1)}
          </text>
        ))}
        {/* The unit, only where it does not sit on top of the last tick — on a
            phone the axis ends within a few pixels of the frame. */}
        {x(kmTicks[kmTicks.length - 1]) < width - PAD.right - 22 && (
          <text x={width - PAD.right} y={H - 8} className="elev-axis-unit" textAnchor="end">
            km
          </text>
        )}

        {stops.map((s, i) => (
          <g key={i} className={`elev-stop elev-stop-${s.kind}`}>
            <line x1={x(s.atKm)} y1={y(altAtKm(s.atKm))} x2={x(s.atKm)} y2={H - PAD.bottom} />
            <circle cx={x(s.atKm)} cy={y(altAtKm(s.atKm))} r={4} />
          </g>
        ))}

        {/* The shared cursor. The same distance is marked on the map above. */}
        {cursorKm != null && (
          <g className="elev-cursor">
            <line x1={x(cursorKm)} y1={PAD.top} x2={x(cursorKm)} y2={H - PAD.bottom} />
            <circle cx={x(cursorKm)} cy={y(cursorAlt)} r={4.5} />
          </g>
        )}
      </svg>

      {/* A readout rather than a floating tooltip: it never covers the line it
          describes, and it holds its place instead of chasing the pointer. */}
      <figcaption className={cursorKm == null ? "elev-foot" : "elev-foot reading"}>
        {cursorKm == null ? (
          <>
            <span>
              {minAlt}–{maxAlt} m
            </span>
            <span>
              {totalKm.toFixed(1)} km · ↑ {Math.round(ascentM)} m
            </span>
            <span className="elev-exaggeration">{t("route.verticalScale", { factor: exaggeration })}</span>
          </>
        ) : (
          <>
            <span className="elev-read-km">km {cursorKm.toFixed(1)}</span>
            <span className="elev-read-alt">{Math.round(cursorAlt)} m</span>
            <span className={`elev-read-grade${Math.abs(cursorGrade) >= 5 ? " steep" : ""}`}>
              {cursorGrade >= 0 ? "+" : "−"}
              {Math.abs(cursorGrade).toFixed(1)} %
            </span>
          </>
        )}
      </figcaption>

      <ol className="elev-stops">
        {stops.map((s, i) => (
          <li
            key={i}
            className={`elev-stop-row elev-stop-${s.kind}${
              cursorKm != null && Math.abs(cursorKm - s.atKm) < Math.max(0.3, totalKm / 60) ? " near" : ""
            }`}
            onMouseEnter={() => onHoverKm?.(s.atKm)}
            onMouseLeave={() => onHoverKm?.(null)}
          >
            <span className="elev-stop-when">{formatClock(s.atMin)}</span>
            <span className="elev-stop-where">
              km {s.atKm} · {s.altM} m
            </span>
            <span className="elev-stop-dose">{s.carbG} g</span>
            {/* Naming the product is the difference between a target and an
                instruction: "25 g" is what the athlete already knew. */}
            {s.product && (
              <span className="elev-stop-product">
                {s.product.brand} {s.product.name} <span className="elev-stop-serving">· {s.product.servingLabel}</span>
              </span>
            )}
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
