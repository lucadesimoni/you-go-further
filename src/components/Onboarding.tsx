import { useState } from "react";
import type { Account } from "../auth";
import { SWEAT_LEVELS } from "../options";
import { type AthleteProfile, loadProfile, saveProfile } from "../api/profileStore";
import { HEALTH_PLATFORMS, syncHealthSignals } from "../api/healthSync";
import { ALL_PROVIDER_IDS, DESCRIPTORS } from "../providers";
import { api, isApiConfigured } from "../api/client";
import { getConfig } from "../config";
import { setOnboardStep } from "../api/onboarding";
import { ChoiceRow } from "./Choice";
import { SWEAT_ICONS } from "./optionIcons";
import { Switch } from "./Switch";
import { useT } from "../i18n";

/**
 * First-run guided journey. Stitches the product story into one flow — the
 * promise, connecting devices, setting up the body, and the first plan — so a
 * new athlete lands with a tailored setup instead of a cold tab.
 */
export function Onboarding({
  account,
  onFinish,
  initialStep = 0,
}: {
  account: Account;
  onFinish: () => void;
  initialStep?: number;
}) {
  const t = useT();
  const [step, setStepRaw] = useState(initialStep);
  const setStep = (n: number) => {
    setOnboardStep(n); // survives the OAuth round-trip
    setStepRaw(n);
  };
  const [profile, setProfile] = useState<AthleteProfile>(() => loadProfile());
  const firstName = account.name.split(" ")[0];

  const set = <K extends keyof AthleteProfile>(key: K, value: AthleteProfile[K]) =>
    setProfile((p) => saveProfile({ ...p, [key]: value }));
  // Connect a provider without leaving setup: we remember the step, hand off to
  // the provider's consent screen, and come back here to finish the profile.
  const connectProvider = (id: string) => {
    if (!isApiConfigured()) {
      setStep(2);
      return;
    }
    setOnboardStep(2);
    const base = getConfig().apiBaseUrl;
    // Ask for the consent URL first: that request carries the session, so the
    // sessions imported on the way back belong to this athlete.
    void api
      .oauthAuthorizeUrl(id, window.location.href)
      .then(({ authorizeUrl }) => {
        window.location.href = authorizeUrl.startsWith("http") ? authorizeUrl : `${base}${authorizeUrl}`;
      })
      .catch(() => setStep(2));
  };

  const syncFrom = (id: string) => {
    const platform = HEALTH_PLATFORMS.find((p) => p.id === id);
    if (!platform) return;
    const s = syncHealthSignals(platform, profile.bodyWeightKg, profile.sweatLevel);
    setProfile((p) => saveProfile({ ...p, ...s, useSignals: true, syncedFrom: platform.label }));
  };

  const STEPS = ["Welcome", "Connect", "Your body", "Ready"];

  return (
    <div className="auth onboarding">
      <div className="auth-card onboard-card">
        <div className="onboard-progress" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`onboard-dot${i === step ? " active" : ""}${i < step ? " done" : ""}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <p className="kicker">{t("onboard.welcome", { name: firstName })}</p>
            <h1 className="auth-title">{t("onboard.title")}</h1>
            <p className="auth-sub">{t("onboard.sub")}</p>
            <div className="onboard-promise">
              <div className="onboard-promise-item">
                <span className="badge badge-pre">{t("plan.phasePre")}</span> {t("onboard.before")}
              </div>
              <div className="onboard-promise-item">
                <span className="badge badge-during">{t("plan.phaseDuring")}</span> {t("onboard.during")}
              </div>
              <div className="onboard-promise-item">
                <span className="badge badge-post">{t("plan.phasePost")}</span> {t("onboard.after")}
              </div>
            </div>
            <button type="button" className="auth-btn auth-primary" onClick={() => setStep(1)}>
              {t("onboard.getStarted")}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <p className="kicker">{t("onboard.step2")}</p>
            <h1 className="auth-title">{t("onboard.connectTitle")}</h1>
            <p className="auth-sub">{t("onboard.connectSub")}</p>
            <div className="onboard-logos">
              {ALL_PROVIDER_IDS.map((id) => (
                <button key={id} type="button" className="onboard-logo onboard-connect" onClick={() => connectProvider(id)}>
                  {DESCRIPTORS[id].displayName}
                </button>
              ))}
            </div>
            <p className="detail">{t("onboard.deviceNote")}</p>
            <button type="button" className="auth-btn auth-primary" onClick={() => setStep(2)}>
              {t("onboard.continue")}
            </button>
            <button type="button" className="auth-link" onClick={() => setStep(2)}>
              {t("onboard.later")}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="kicker">{t("onboard.step3")}</p>
            <h1 className="auth-title">{t("onboard.bodyTitle")}</h1>
            <p className="auth-sub">{t("onboard.bodySub")}</p>
            <div className="onboard-field">
              <label htmlFor="ob-weight">
                {t("onboard.bodyWeight")} <span className="value">{profile.bodyWeightKg} kg</span>
              </label>
              <input
                id="ob-weight"
                type="range"
                min={40}
                max={120}
                value={profile.bodyWeightKg}
                onChange={(e) => set("bodyWeightKg", Number(e.target.value))}
              />
            </div>
            <div className="onboard-field">
              <ChoiceRow
                label={t("onboard.sweatLevel")}
                value={profile.sweatLevel}
                onChange={(v) => set("sweatLevel", v)}
                options={SWEAT_LEVELS.map((s) => ({
                  value: s.value,
                  label: t(s.labelKey),
                  icon: SWEAT_ICONS[s.value],
                }))}
              />
            </div>
            <Switch
              label={t("onboard.caffeineOk")}
              hint={t("onboard.caffeineHint")}
              checked={profile.caffeineOk}
              onChange={(on) => set("caffeineOk", on)}
            />
            <div className="onboard-sync">
              <span className="group-label">{t("onboard.syncSignals")}</span>
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
            </div>
            <button type="button" className="auth-btn auth-primary" onClick={() => setStep(3)}>
              {t("onboard.continue")}
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <p className="kicker">{t("onboard.done")}</p>
            <h1 className="auth-title">{t("onboard.doneTitle")}</h1>
            <p className="auth-sub">{t("onboard.doneSub")}</p>
            <button type="button" className="auth-btn auth-primary" onClick={onFinish}>
              {t("onboard.buildFirst")}
            </button>
          </>
        )}

        {step < 3 && (
          <button type="button" className="onboard-skip" onClick={onFinish}>
            {t("onboard.skip")}
          </button>
        )}
      </div>
    </div>
  );
}
