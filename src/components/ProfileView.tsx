import { useEffect, useState } from "react";
import type { Account } from "../auth";
import { ROLE_LABELS } from "../auth";
import { SWEAT_LEVELS } from "../options";
import { estimateSweatRateMlPerH } from "../analysis";
import { type AthleteProfile, loadProfile, saveProfile, syncProfile, profilePersistence } from "../api/profileStore";
import { HEALTH_PLATFORMS, syncHealthSignals } from "../api/healthSync";
import { useT } from "../i18n";
import { Switch } from "./Switch";

/**
 * Profile settings — the athlete's body + health data, moved out of the planner
 * so the planner stays session-focused. Changes save immediately; the planner
 * reads this profile to personalise every plan.
 */
export function ProfileView({ account }: { account: Account }) {
  const t = useT();
  const [profile, setProfile] = useState<AthleteProfile>(() => loadProfile());

  // The server copy is authoritative — refresh so the profile is the same on
  // every device the athlete signs in from.
  useEffect(() => {
    let live = true;
    void syncProfile().then((p) => live && setProfile(p));
    return () => {
      live = false;
    };
  }, []);

  const set = <K extends keyof AthleteProfile>(key: K, value: AthleteProfile[K]) =>
    setProfile((prev) => saveProfile({ ...prev, [key]: value }));

  const syncFrom = (platformId: string) =>
    setProfile((prev) => {
      const platform = HEALTH_PLATFORMS.find((p) => p.id === platformId);
      if (!platform) return prev;
      const signals = syncHealthSignals(platform, prev.bodyWeightKg, prev.sweatLevel);
      return saveProfile({ ...prev, ...signals, useSignals: true, syncedFrom: platform.label });
    });

  const initials = account.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="dash profile">
      <section className="panel">
        <div className="section-head">
          <h2>{t("profile.yourProfile")}</h2>
          <span className="pill">{profilePersistence.mode() === "server" ? t("profile.synced") : t("profile.savedLocally")}</span>
        </div>
        <div className="profile-identity">
          <span className="avatar avatar-lg">{initials}</span>
          <div>
            <div className="profile-name">{account.name}</div>
            <div className="account-email">{account.email}</div>
            <span className="badge badge-post" style={{ marginTop: "var(--space-2)", display: "inline-block" }}>
              {ROLE_LABELS[account.role]}
            </span>
          </div>
        </div>
        <p className="detail note-top">
          Identity comes from your sign-in (Apple / Google / email). The body data below personalises your
          fuelling{profilePersistence.mode() === "server" ? " and follows you across devices." : " and is stored in this browser."}
        </p>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{t("profile.bodyPrefs")}</h2>
        </div>
        <div className="profile-grid-2">
          <div className="field">
            <label htmlFor="p-weight">
              {t("profile.bodyWeight")} <span className="value">{profile.bodyWeightKg} kg</span>
            </label>
            <input
              id="p-weight"
              type="range"
              min={40}
              max={120}
              step={1}
              value={profile.bodyWeightKg}
              onChange={(e) => set("bodyWeightKg", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="p-maxhr">
              {t("profile.maxHr")} <span className="value">{profile.maxHrBpm} bpm</span>
            </label>
            <input
              id="p-maxhr"
              type="range"
              min={140}
              max={210}
              step={1}
              value={profile.maxHrBpm}
              onChange={(e) => set("maxHrBpm", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="p-sweat">{t("profile.sweatLevelShort")}</label>
            <select
              id="p-sweat"
              value={profile.sweatLevel}
              onChange={(e) => set("sweatLevel", e.target.value as AthleteProfile["sweatLevel"])}
            >
              {SWEAT_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* A preference that persists the instant it changes — a switch, not a
            checkbox waiting on a Save button that doesn't exist here. */}
        <Switch
          label={t("profile.caffeineLong")}
          checked={profile.caffeineOk}
          onChange={(on) => set("caffeineOk", on)}
        />
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{t("profile.measuredSignals")}</h2>
          <span className="pill">optional</span>
        </div>
        <p className="detail">
          From a sweat test or your watch. When on, these override the population estimates for a plan
          tuned to <em>your</em> physiology.
        </p>

        <div className="health-sync">
          <span className="group-label health-sync-label">{t("profile.syncPlatform")}</span>
          <div className="health-platforms">
            {HEALTH_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`health-chip${profile.syncedFrom === p.label ? " on" : ""}`}
                onClick={() => syncFrom(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="detail health-sync-note">
            {profile.syncedFrom
              ? `Synced from ${profile.syncedFrom}. Reconnect any time to refresh.`
              : "Pulls readiness and sweat estimates. Garmin & Suunto use the OAuth connectors; Apple & Google Health use the mobile SDKs."}
          </p>
        </div>

        <Switch
          label={t("profile.useMeasuredSignals")}
          checked={profile.useSignals}
          onChange={(on) => {
            if (on && profile.sweatRateMlPerH === 1000) {
              set("sweatRateMlPerH", estimateSweatRateMlPerH(profile.bodyWeightKg, "moderate", "temperate"));
            }
            set("useSignals", on);
          }}
        />

        {profile.useSignals && (
          <div className="signals-body">
            <div className="field">
              <label htmlFor="p-rate">
                {t("profile.sweatRate")} <span className="value">{profile.sweatRateMlPerH} ml/h</span>
              </label>
              <input
                id="p-rate"
                type="range"
                min={400}
                max={2200}
                step={50}
                value={profile.sweatRateMlPerH}
                onChange={(e) => set("sweatRateMlPerH", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="p-na">
                {t("profile.sweatSodium")} <span className="value">{profile.sweatSodiumMgPerL} mg/L</span>
              </label>
              <input
                id="p-na"
                type="range"
                min={300}
                max={1500}
                step={50}
                value={profile.sweatSodiumMgPerL}
                onChange={(e) => set("sweatSodiumMgPerL", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="p-ready">
                Training readiness <span className="value">{profile.readiness}/100</span>
              </label>
              <input
                id="p-ready"
                type="range"
                min={10}
                max={100}
                step={1}
                value={profile.readiness}
                onChange={(e) => set("readiness", Number(e.target.value))}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
