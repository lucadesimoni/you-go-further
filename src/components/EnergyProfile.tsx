import { useMemo } from "react";
import { energyProfile, formatClock, type AthleteInput, type FuelingTarget, type FuelingSchedule } from "../engine";

const CUE_COLOR: Record<string, string> = {
  carb: "var(--during)",
  drink: "var(--pre)",
  caffeine: "var(--accent)",
};

// SVG canvas (viewBox units); the element scales to its container width.
const W = 640;
const H = 220;
const PAD = { l: 34, r: 14, t: 16, b: 26 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

/**
 * "Energy profile" strip — a Tesla trip-planner-style view of carbohydrate
 * availability across the session. The green curve is your store *with* the
 * fueling plan; the dim dashed curve is water only, sliding toward the fade
 * line. Fuel cues are pinned along the top. Pure inline SVG — no map tiles, no
 * external deps, themes with the app.
 */
export function EnergyProfile({
  input,
  target,
  schedule,
}: {
  input: AthleteInput;
  target: FuelingTarget;
  schedule: FuelingSchedule;
}) {
  const profile = useMemo(() => energyProfile(input, target), [input, target]);

  const x = (minute: number) => PAD.l + (minute / profile.durationMin) * PLOT_W;
  const y = (pct: number) => PAD.t + (1 - pct / 100) * PLOT_H;

  const toPath = (key: "fueledPct" | "unfueledPct") =>
    profile.samples.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.minute).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");

  const fueledPath = toPath("fueledPct");
  const unfueledPath = toPath("unfueledPct");
  // Area under the fueled curve for the gradient fill.
  const fueledArea = `${fueledPath} L${x(profile.durationMin).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const fadeY = y(profile.bonkPct);
  const cues = schedule.cues.filter((c) => c.kind === "carb" || c.kind === "drink" || c.kind === "caffeine");
  const gridPcts = [0, 25, 50, 75, 100];

  return (
    <div className="panel energy">
      <div className="section-head">
        <h3>Energy profile</h3>
        <span className="energy-legend">
          <span className="lg lg-fueled">With plan</span>
          <span className="lg lg-unfueled">Water only</span>
          <span className="lg lg-fade">Fade line</span>
        </span>
      </div>
      <p className="detail energy-headline">{profile.headline}</p>

      <svg className="energy-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Carbohydrate availability across the session">
        <defs>
          <linearGradient id="fuelFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--post)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--post)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + y labels */}
        {gridPcts.map((p) => (
          <g key={p}>
            <line className="energy-grid" x1={PAD.l} y1={y(p)} x2={W - PAD.r} y2={y(p)} />
            <text className="energy-axis" x={PAD.l - 6} y={y(p) + 3} textAnchor="end">
              {p}
            </text>
          </g>
        ))}

        {/* fade zone */}
        <rect className="energy-fadezone" x={PAD.l} y={fadeY} width={PLOT_W} height={y(0) - fadeY} />
        <line className="energy-fadeline" x1={PAD.l} y1={fadeY} x2={W - PAD.r} y2={fadeY} strokeDasharray="4 4" />

        {/* curves */}
        <path className="energy-fill" d={fueledArea} fill="url(#fuelFill)" />
        <path className="energy-unfueled" d={unfueledPath} fill="none" strokeDasharray="5 5" />
        <path className="energy-fueled" d={fueledPath} fill="none" />

        {/* unfueled fade marker */}
        {profile.unfueledFadeMin !== undefined && (
          <g>
            <line className="energy-fademark" x1={x(profile.unfueledFadeMin)} y1={PAD.t} x2={x(profile.unfueledFadeMin)} y2={y(0)} />
            <text className="energy-fadetext" x={x(profile.unfueledFadeMin)} y={PAD.t - 4} textAnchor="middle">
              fade ~{formatClock(profile.unfueledFadeMin)}
            </text>
          </g>
        )}

        {/* fuel cue pins */}
        {cues.map((c, i) => (
          <g key={i}>
            <line className="energy-cue" x1={x(c.atMin)} y1={PAD.t} x2={x(c.atMin)} y2={y(0)} />
            <circle cx={x(c.atMin)} cy={PAD.t} r={3.5} fill={CUE_COLOR[c.kind] ?? "var(--muted)"} />
          </g>
        ))}

        {/* x labels: start / mid / finish */}
        {[0, profile.durationMin / 2, profile.durationMin].map((m, i) => (
          <text
            key={i}
            className="energy-axis"
            x={x(m)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          >
            {formatClock(Math.round(m))}
          </text>
        ))}
      </svg>

      <div className="energy-foot">
        <span>Store ≈ {profile.storeG} g</span>
        <span>Burn ≈ {profile.burnPerHourG} g/h</span>
        <span>Intake {profile.intakePerHourG > 0 ? `≈ ${profile.intakePerHourG} g/h` : "— (water)"}</span>
        <span className="energy-reserve">Finish ≈ {profile.fueledEndPct}% in reserve</span>
      </div>
      <p className="energy-note">Illustrative model from population estimates — not a measurement of your metabolism.</p>
    </div>
  );
}
