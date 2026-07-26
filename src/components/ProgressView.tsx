import type { ProgressProfile } from "../progress";
import { Stat } from "./Stat";
import { NutritionGuide } from "./NutritionGuide";

/**
 * Insights — a calm, editorial view of the athlete's training consistency and,
 * more importantly, guidance on fuelling and everyday eating. Deliberately not
 * gamified: no XP, levels or badge grid — milestones are quiet progress markers,
 * and the focus is the nutrition guide.
 */
export function ProgressView({
  profile,
  hasData = true,
  onConnect,
}: {
  profile: ProgressProfile;
  /** False until the athlete has synced real sessions — we never show invented numbers. */
  hasData?: boolean;
  onConnect?: () => void;
}) {
  const ordered = [...profile.milestones].sort((a, b) => Number(b.done) - Number(a.done));

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>Your training</h2>
          {hasData && profile.streakDays > 0 && (
            <span className="pill">{profile.streakDays}-day streak · best {profile.longestStreakDays}</span>
          )}
        </div>
        {hasData ? (
          <div className="targets plain-grid">
            <Stat label="Activities" value={String(profile.stats.activities)} />
            <Stat label="Hours" value={`${profile.stats.hours}`} />
            <Stat label="Long sessions" value={String(profile.stats.longSessions)} note="90 min+" />
            <Stat label="Logged" value={String(profile.stats.loggedSessions)} note="plan learns" />
          </div>
        ) : (
          <div className="empty-state">
            <p style={{ margin: 0 }}>No sessions synced yet — connect a service and your real training shows up here.</p>
            {onConnect && (
              <button type="button" className="btn btn-primary mt-5" onClick={onConnect}>
                Connect a service
              </button>
            )}
          </div>
        )}
      </section>

      <NutritionGuide />

      {hasData && (
      <section className="panel">
        <div className="section-head">
          <h2>Milestones</h2>
          <span className="pill">
            {profile.doneCount} of {profile.milestones.length}
          </span>
        </div>
        <ul className="milestones">
          {ordered.map((a) => (
            <li key={a.id} className={`milestone${a.done ? " done" : ""}`}>
              <span className="milestone-mark" aria-hidden>
                {a.done ? "✓" : "○"}
              </span>
              <span className="milestone-body">
                <span className="milestone-name">
                  {a.name} <span className="milestone-cat">{a.category}</span>
                </span>
                <span className="milestone-desc">{a.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      )}
    </main>
  );
}
