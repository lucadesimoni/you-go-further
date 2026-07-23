import type { GamificationProfile } from "../gamification";
import { Stat } from "./Stat";
import { NUTRITION_GUIDE } from "../content/nutritionGuide";

/**
 * Insights — a calm, editorial view of the athlete's training consistency and,
 * more importantly, guidance on fuelling and everyday eating. Deliberately not
 * gamified: no XP, levels or badge grid — milestones are quiet progress markers,
 * and the focus is the nutrition guide.
 */
export function ProgressView({ profile }: { profile: GamificationProfile }) {
  const reached = profile.achievements.filter((a) => a.unlocked);
  const upcoming = profile.achievements.filter((a) => !a.unlocked);
  const ordered = [...reached, ...upcoming];

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>Your training</h2>
          {profile.streakDays > 0 && (
            <span className="pill">{profile.streakDays}-day streak · best {profile.longestStreakDays}</span>
          )}
        </div>
        <div className="targets plain-grid">
          <Stat label="Activities" value={String(profile.stats.activities)} />
          <Stat label="Hours" value={`${profile.stats.hours}`} />
          <Stat label="Distance" value={`${profile.stats.distanceKm} km`} />
          <Stat label="Climbed" value={`${profile.stats.elevationM} m`} />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Fuel &amp; nutrition guide</h2>
          <span className="pill">{NUTRITION_GUIDE.length} reads</span>
        </div>
        <p className="detail">
          Getting fuelling and everyday eating right — the fundamentals behind every plan.
        </p>
        <div className="guide-grid">
          {NUTRITION_GUIDE.map((c) => (
            <article className="guide-card" key={c.title}>
              <span className="guide-cat">{c.category}</span>
              <h3 className="guide-title">{c.title}</h3>
              <p className="guide-body">{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Milestones</h2>
          <span className="pill">
            {reached.length} of {profile.achievements.length}
          </span>
        </div>
        <ul className="milestones">
          {ordered.map((a) => (
            <li key={a.id} className={`milestone${a.unlocked ? " done" : ""}`}>
              <span className="milestone-mark" aria-hidden>
                {a.unlocked ? "✓" : "○"}
              </span>
              <span className="milestone-body">
                <span className="milestone-name">{a.name}</span>
                <span className="milestone-desc">{a.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
