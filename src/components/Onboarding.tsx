import { useState } from "react";
import type { Account } from "../auth";
import { SWEAT_LEVELS } from "../options";
import { type AthleteProfile, loadProfile, saveProfile } from "../api/profileStore";
import { HEALTH_PLATFORMS, syncHealthSignals } from "../api/healthSync";
import { ALL_PROVIDER_IDS, DESCRIPTORS } from "../providers";
import { api, isApiConfigured } from "../api/client";
import { getConfig } from "../config";
import { setOnboardStep } from "../api/onboarding";
import { Switch } from "./Switch";

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
            <p className="kicker">Welcome, {firstName}</p>
            <h1 className="auth-title">Fuel your body to go further</h1>
            <p className="auth-sub">
              The right nutrition <strong>before, during and after</strong> every session — from your own training
              data.
            </p>
            <div className="onboard-promise">
              <div className="onboard-promise-item">
                <span className="badge badge-pre">before</span> Top up right, settle the gut.
              </div>
              <div className="onboard-promise-item">
                <span className="badge badge-during">during</span> Carbs, fluid & sodium to your effort.
              </div>
              <div className="onboard-promise-item">
                <span className="badge badge-post">after</span> Recover and adapt faster.
              </div>
            </div>
            <button type="button" className="auth-btn auth-primary" onClick={() => setStep(1)}>
              Get started →
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <p className="kicker">Step 2 · Connect</p>
            <h1 className="auth-title">Connect your training & health</h1>
            <p className="auth-sub">
              So plans use your real sessions, not what you type in. You can do this later.
            </p>
            <div className="onboard-logos">
              {ALL_PROVIDER_IDS.map((id) => (
                <button key={id} type="button" className="onboard-logo onboard-connect" onClick={() => connectProvider(id)}>
                  {DESCRIPTORS[id].displayName}
                </button>
              ))}
            </div>
            <p className="detail">Apple Health and Google Health sync from the mobile app.</p>
            <button type="button" className="auth-btn auth-primary" onClick={() => setStep(2)}>
              Continue →
            </button>
            <button type="button" className="auth-link" onClick={() => setStep(2)}>
              I'll connect later →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="kicker">Step 3 · Your body</p>
            <h1 className="auth-title">Tune it to you</h1>
            <p className="auth-sub">
              A few basics so every plan is personalised. You can refine these any time in Profile.
            </p>
            <div className="onboard-field">
              <label htmlFor="ob-weight">
                Body weight <span className="value">{profile.bodyWeightKg} kg</span>
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
              <label htmlFor="ob-sweat">Sweat level</label>
              <select
                id="ob-sweat"
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
            <Switch
              label="I tolerate caffeine"
              hint="Suggest it for long or hard efforts."
              checked={profile.caffeineOk}
              onChange={(on) => set("caffeineOk", on)}
            />
            <div className="onboard-sync">
              <span className="group-label">Sync body signals (optional)</span>
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
              Continue →
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <p className="kicker">You're set</p>
            <h1 className="auth-title">Let's build your first plan</h1>
            <p className="auth-sub">
              Tell us the session; we'll tailor the fuelling from Swiss products.
            </p>
            <button type="button" className="auth-btn auth-primary" onClick={onFinish}>
              Build my first plan →
            </button>
          </>
        )}

        {step < 3 && (
          <button type="button" className="onboard-skip" onClick={onFinish}>
            Skip setup
          </button>
        )}
      </div>
    </div>
  );
}
