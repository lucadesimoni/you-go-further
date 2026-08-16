import { useT } from "../i18n";
import { FADE_PCT, type RaceSimulation } from "../engine";
import { Explain } from "./Explain";
import { Stat } from "./Stat";

/**
 * The tank, kilometre by kilometre — with the plan and without it.
 *
 * A watch says "low stamina" once it has already happened. This says *where* it
 * would happen on this course, before the athlete starts, and how much the plan
 * moves it. The two curves are the argument: the gap between them is what the
 * fuelling is buying, drawn against the actual climbs.
 *
 * Every sentence is written here from the simulation's numbers rather than taken
 * from its English text, so the card speaks the athlete's language.
 */
const W = 320;
const H = 88;
const PAD_TOP = 8;
const PAD_BOTTOM = 14;

const VERDICT_KEY = {
  outrun: "sim.verdict.outrun",
  averted: "sim.verdict.averted",
  covered: "sim.verdict.covered",
} as const;

const WARN_KEY = {
  bonk: "sim.warn.bonk",
  bonkAverted: "sim.warn.bonkAverted",
  dehydration: "sim.warn.dehydration",
  sodium: "sim.warn.sodium",
  lateStart: "sim.warn.lateStart",
  gapBeforeClimb: "sim.warn.gapBeforeClimb",
} as const;

export function RaceForecast({ sim, estimated = false }: { sim: RaceSimulation; estimated?: boolean }) {
  const t = useT();
  const { points } = sim;
  if (points.length < 2) return null;

  const totalKm = points[points.length - 1].km || 1;
  const x = (km: number) => (km / totalKm) * W;
  const y = (pct: number) => PAD_TOP + (1 - pct / 100) * (H - PAD_TOP - PAD_BOTTOM);

  // Both curves start full: the simulation's first point is already one segment
  // in, and a line that begins mid-descent reads as if the race started there.
  const curve = (pick: (p: (typeof points)[number]) => number) =>
    [`${x(0).toFixed(1)},${y(100).toFixed(1)}`, ...points.map((p) => `${x(p.km).toFixed(1)},${y(pick(p)).toFixed(1)}`)].join(
      " ",
    );

  const fadeY = y(FADE_PCT).toFixed(1);
  const rest = sim.warnings.filter((w) => w.id !== "bonk" && w.id !== "bonkAverted");

  return (
    <section className="panel sim">
      <div className="section-head">
        <h2>{t("sim.title")}</h2>
        <span className={`pill sim-verdict-${sim.verdict}`}>{t(`sim.badge.${sim.verdict}`)}</span>
      </div>

      <p className="sim-headline">
        {t(VERDICT_KEY[sim.verdict], {
          km: sim.bonkKmFuelled ?? sim.bonkKmUnfuelled ?? 0,
          finishPct: Math.round(sim.finishFuelledPct),
        })}
      </p>

      <figure className={`sim-chart${estimated ? " sim-chart-estimated" : ""}`}>
        {/* The two axis labels are HTML pinned over the plot rather than SVG
            text: the chart scales non-uniformly to its container, which would
            stretch any text drawn inside it. The fade label has to sit *on* its
            line — in a footer it reads as an x-axis label for the wrong axis. */}
        <div className="sim-plot">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="sim-svg"
            role="img"
            aria-label={t("sim.chartLabel", { km: totalKm, finishPct: Math.round(sim.finishFuelledPct) })}
            preserveAspectRatio="none"
          >
            {/* The fade line: below it, pace goes whatever the athlete wants. */}
            <line className="sim-fade" x1={0} y1={fadeY} x2={W} y2={fadeY} />
            <polyline className="sim-line-unfuelled" points={curve((p) => p.unfuelledPct)} />
            <polyline className="sim-line-fuelled" points={curve((p) => p.fuelledPct)} />
          </svg>
          {/* The marker is HTML, not an SVG circle: the plot scales
              non-uniformly to its container, which would draw the circle as an
              ellipse — wider on a desktop, rounder on a phone. */}
          {sim.bonkKmUnfuelled !== undefined && (
            <span
              className="sim-bonk-mark"
              style={{ left: `${(x(sim.bonkKmUnfuelled) / W) * 100}%`, top: `${(y(FADE_PCT) / H) * 100}%` }}
            />
          )}
          <span className="sim-axis sim-axis-full" style={{ top: `${(y(100) / H) * 100}%` }}>
            {t("sim.full")}
          </span>
          <span className="sim-axis sim-axis-fade" style={{ top: `${(y(FADE_PCT) / H) * 100}%` }}>
            {t("sim.fadeLine", { pct: FADE_PCT })}
          </span>
        </div>
        <figcaption className="sim-foot">
          <span>km 0</span>
          <span>km {totalKm}</span>
        </figcaption>
      </figure>

      <div className="sim-legend">
        <span className="lg lg-fuelled">{t("sim.withPlan")}</span>
        <span className="lg lg-unfuelled">{t("sim.onWater")}</span>
      </div>

      <div className="targets plain-grid">
        <Stat label={t("sim.burn")} value={String(sim.burnTotalG)} unit="g" note={t("sim.burnNote")} />
        <Stat label={t("sim.intake")} value={String(sim.intakeTotalG)} unit="g" note={t("sim.intakeNote")} />
        <Stat label={t("sim.sweat")} value={`${(sim.sweatTotalMl / 1000).toFixed(1)} L`} note={t("sim.sweatNote")} />
        <Stat label={t("sim.finish")} value={`${Math.round(sim.finishFuelledPct)}%`} note={t("sim.finishNote")} />
      </div>

      {/* The headline already states the bonk verdict; repeating it as the first
          warning made the card say the same sentence twice. */}
      {rest.length > 0 && (
        <ul className="sim-warnings">
          {rest.map((w) => (
            <li key={w.id} className={`sim-warning sim-warning-${w.severity}`}>
              {t(WARN_KEY[w.id], w.values)}
            </li>
          ))}
        </ul>
      )}

      <Explain>
        <p>{t("sim.explain")}</p>
        <p>{t("sim.explainHeat", { feelsLike: sim.feelsLikeC, store: sim.storeG })}</p>
      </Explain>
    </section>
  );
}
