import type { GamificationProfile } from "../gamification";
import { Stat } from "./Stat";

/** Stats & achievements screen — the gamification hub. */
export function ProgressView({ profile }: { profile: GamificationProfile }) {
  const pct = profile.xpForLevel > 0 ? Math.round((profile.xpIntoLevel / profile.xpForLevel) * 100) : 100;

  return (
    <main className="dash">
      {/* Level hero */}
      <section className="panel level-hero">
        <div className="level-badge-lg">{profile.level}</div>
        <div className="level-hero-body">
          <div className="level-hero-top">
            <h2 style={{ margin: 0 }}>{profile.levelName}</h2>
            <span className="pill">{profile.xp.toLocaleString()} XP</span>
          </div>
          <div className="xp-track" aria-label="XP to next level">
            <div className="xp-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="detail" style={{ margin: 0 }}>
            {profile.xpIntoLevel} / {profile.xpForLevel} XP to level {profile.level + 1}
          </span>
        </div>
      </section>

      {/* Streak + key stats */}
      <section className="panel">
        <div className="targets" style={{ padding: 0, border: "none", background: "none" }}>
          <div className="stat">
            <span className="stat-value">🔥 {profile.streakDays}</span>
            <span className="stat-label">Day streak</span>
          </div>
          <Stat label="Longest streak" value={`${profile.longestStreakDays} d`} />
          <Stat label="Activities" value={String(profile.stats.activities)} />
          <Stat label="Hours" value={`${profile.stats.hours}`} />
        </div>
        <div className="targets" style={{ padding: "12px 0 0", border: "none", background: "none" }}>
          <Stat label="Distance" value={`${profile.stats.distanceKm} km`} />
          <Stat label="Climbed" value={`${profile.stats.elevationM} m`} />
          <Stat label="Badges" value={`${profile.unlockedCount}/${profile.achievements.length}`} />
          <Stat label="Level" value={`${profile.level}`} />
        </div>
      </section>

      {/* Achievements */}
      <section className="panel">
        <div className="section-head">
          <h2>Achievements</h2>
          <span className="pill">
            {profile.unlockedCount}/{profile.achievements.length} unlocked
          </span>
        </div>
        <div className="achievements">
          {profile.achievements.map((a) => (
            <div key={a.id} className={`achv${a.unlocked ? " on" : ""}`} title={a.description}>
              <span className="achv-emoji">{a.unlocked ? a.emoji : "🔒"}</span>
              <span className="achv-name">{a.name}</span>
              <span className="achv-desc">{a.description}</span>
              <span className="achv-xp">+{a.xp} XP</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
