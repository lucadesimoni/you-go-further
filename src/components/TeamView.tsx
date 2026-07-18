import { useMemo, useState } from "react";
import type { ProviderId } from "../model";
import { generateSampleActivities } from "../providers";
import { analyze } from "../analysis";
import { lastNDays } from "../data";

const ROSTER: { name: string; provider: ProviderId; weightKg: number; maxHr: number }[] = [
  { name: "Lena Brunner", provider: "garmin", weightKg: 58, maxHr: 194 },
  { name: "Marco Frei", provider: "strava", weightKg: 72, maxHr: 188 },
  { name: "Anouk Piller", provider: "polar", weightKg: 63, maxHr: 191 },
  { name: "Timo Keller", provider: "suunto", weightKg: 78, maxHr: 185 },
  { name: "Sara Widmer", provider: "garmin", weightKg: 60, maxHr: 196 },
];

const STATUS_LABEL: Record<string, string> = {
  detraining: "Detraining",
  optimal: "Optimal",
  caution: "Caution",
  "high-risk": "High risk",
};

/** Coach / nutritionist roster: per-athlete load status and weekly fuel needs. */
export function TeamView({ canExport }: { canExport: boolean }) {
  const now = useMemo(() => new Date(), []);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      ROSTER.map((a) => {
        const window = lastNDays(28, now);
        const activities = generateSampleActivities(a.provider, window.after, window.before, a.maxHr);
        const report = analyze(activities, { bodyWeightKg: a.weightKg, maxHr: a.maxHr }, "endurance-performance", now);
        return { ...a, report };
      }),
    [now],
  );

  const flagged = rows.filter((r) => r.report.acwr.status === "caution" || r.report.acwr.status === "high-risk").length;

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>Team</h2>
          <span className="pill">
            {rows.length} athletes · {flagged} flagged
          </span>
        </div>
        <p className="detail">
          Load status and weekly fueling needs across your roster. Athletes whose acute:chronic ratio
          leaves the safe band are flagged for a check-in.
        </p>

        <div className="roster">
          {rows.map((r) => {
            const isOpen = open === r.name;
            return (
              <div key={r.name} className={`roster-row${isOpen ? " open" : ""}`}>
                <button type="button" className="roster-head" onClick={() => setOpen(isOpen ? null : r.name)}>
                  <span className="roster-name">{r.name}</span>
                  <span className="roster-meta">
                    {r.report.totalActivities} sessions · {r.report.totalHours} h
                  </span>
                  <span className={`acwr-badge acwr-${r.report.acwr.status}`}>
                    {STATUS_LABEL[r.report.acwr.status]} {r.report.acwr.ratio || "—"}
                  </span>
                </button>
                {isOpen && (
                  <div className="roster-detail">
                    <div className="targets" style={{ padding: 0, border: "none", background: "none" }}>
                      <div className="stat">
                        <span className="stat-value">{r.report.acwr.acuteLoad}</span>
                        <span className="stat-label">7-day load</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">{r.report.acwr.chronicWeeklyLoad}</span>
                        <span className="stat-label">28-day avg</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">{r.report.nutrition.weeklyDuringCarbG} g</span>
                        <span className="stat-label">Weekly carbs</span>
                      </div>
                      <div className="stat">
                        <span className="stat-value">{r.report.nutrition.avgCarbPerHourG} g/h</span>
                        <span className="stat-label">Avg fuel rate</span>
                      </div>
                    </div>
                    <p className="detail" style={{ margin: "12px 0 0" }}>
                      {r.report.nutrition.fueledSessions} of {r.report.nutrition.totalSessions} sessions this week need
                      in-session fuel. Source: {r.provider}.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canExport && (
          <p className="upgrade-note">
            Export the full team dataset from the <strong>Admin</strong> tab (Elite).
          </p>
        )}
      </section>
    </main>
  );
}
