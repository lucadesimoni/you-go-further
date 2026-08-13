import { useState } from "react";
import {
  appleConfigured,
  googleConfigured,
  saveAccount,
  signInWithAppleReal,
  signInWithEmail,
  signInWithGoogleReal,
  signInWithProvider,
  type Account,
} from "../auth";
import { PERSONAS } from "../personas";
import { enterDemo } from "../api/onboarding";
import { api, isApiConfigured } from "../api/client";
import { getConfig } from "../config";
import { useI18n, LANGS, type Lang } from "../i18n";

/** Sign-in / register gate. Choose Apple, Google, or email — or a demo account. */
export function LoginScreen({ onSignedIn, allowDemo }: { onSignedIn: (a: Account) => void; allowDemo: boolean }) {
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<"choose" | "email" | "sent">("choose");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const live = isApiConfigured();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const termsUrl = getConfig().termsUrl;

  // With a server, email sign-in is a real magic link: the server mails a signed,
  // single-use token and only issues a session when it is redeemed. Without a
  // server (pure client demo) we fall back to a clearly-labelled local identity.
  const submitEmail = async () => {
    if (!live) {
      const a = signInWithEmail(email, name);
      if (!a) return setError(t("auth.invalidEmail"));
      return onSignedIn(a);
    }
    // Checked here, not only by the server: the server answers in English, and
    // this is the one screen with a language picker on it. A person who has
    // just switched the app to French should not be corrected in English.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError(t("auth.invalidEmail"));
    setSending(true);
    setError(null);
    try {
      const res = await api.emailLinkRequest(email, window.location.origin + window.location.pathname, name);
      setDevLink(res.devLink ?? null);
      setMode("sent");
    } catch (e) {
      // The server's own words when it gave some, ours when it did not — and
      // ours are translated, on the one screen that has a language picker.
      setError(e instanceof Error && e.message ? e.message : t("auth.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  // Use the provider's real sign-in when a client id is configured; otherwise a
  // simulated identity so the demo works without credentials.
  const signInGoogle = async () => {
    if (!googleConfigured()) return onSignedIn(signInWithProvider("google"));
    setBusy("google");
    try {
      onSignedIn(saveAccount(await signInWithGoogleReal()));
    } catch {
      setError(t("auth.providerFailed", { provider: "Google" }));
      onSignedIn(signInWithProvider("google"));
    } finally {
      setBusy(null);
    }
  };
  const signInApple = async () => {
    if (!appleConfigured()) return onSignedIn(signInWithProvider("apple"));
    setBusy("apple");
    try {
      onSignedIn(saveAccount(await signInWithAppleReal()));
    } catch {
      setError(t("auth.providerFailed", { provider: "Apple" }));
      onSignedIn(signInWithProvider("apple"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        {/* Language is switchable before sign-in too — otherwise a German
            speaker whose browser reports English has no way to change it. */}
        <div className="auth-lang">
          <select
            aria-label={t("language.title")}
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l} lang={l}>
                {t(`language.${l}` as "language.en")}
              </option>
            ))}
          </select>
        </div>
        <p className="kicker">{t("app.brand")}</p>
        <h1 className="auth-title">{t("auth.headline")}</h1>
        <p className="auth-sub">{t("auth.subtitle")}</p>

        {mode === "choose" ? (
          <div className="auth-actions">
            <button type="button" className="auth-btn auth-apple" onClick={signInApple} disabled={busy !== null}>
              <span className="auth-glyph"></span> {busy === "apple" ? t("auth.signingIn") : t("auth.continueApple")}
            </button>
            <button type="button" className="auth-btn auth-google" onClick={signInGoogle} disabled={busy !== null}>
              <span className="auth-glyph">G</span> {busy === "google" ? t("auth.signingIn") : t("auth.continueGoogle")}
            </button>
            <button type="button" className="auth-btn auth-email-btn" onClick={() => setMode("email")}>
              <span className="auth-glyph">✉</span> {t("auth.continueEmail")}
            </button>
          </div>
        ) : mode === "sent" ? (
          <div className="auth-actions">
            <p className="auth-sent">
              {t("auth.sentTo", { email })}
            </p>
            {devLink && (
              <a className="auth-btn auth-primary" href={devLink}>
                {t("auth.openDevLink")}
              </a>
            )}
            <button type="button" className="auth-link" onClick={() => setMode("email")}>
              {t("auth.differentAddress")}
            </button>
          </div>
        ) : (
          <div className="auth-actions">
            <input
              className="auth-input"
              type="text"
              placeholder={t("auth.namePlaceholder")}
              aria-label={t("auth.namePlaceholder")}
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="auth-input"
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              aria-label={t("auth.emailPlaceholder")}
              value={email}
              autoComplete="email"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "auth-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitEmail()}
            />
            {/*
              A message nobody hears is not a message. `role="alert"` is what
              makes a screen reader announce the refusal at the moment it
              happens, and `aria-describedby` is what ties it to the field that
              caused it rather than leaving it floating in the card.
            */}
            {error && (
              <p className="auth-error" id="auth-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="auth-btn auth-primary" onClick={submitEmail} disabled={sending}>
              {sending ? t("auth.sending") : live ? t("auth.sendLink") : t("auth.createOrSignIn")}
            </button>
            <button type="button" className="auth-link" onClick={() => setMode("choose")}>
              {t("auth.otherOptions")}
            </button>
          </div>
        )}

        <p className="auth-legal">
          {/*
            The claim was unfalsifiable: "you agree to our terms", with no way
            to read them. Where a deployment has published terms it links them
            here; where it has not, preflight has already warned, and the claim
            is not dressed up as a link to nowhere.
          */}
          {termsUrl ? (
            <a className="auth-terms-link" href={termsUrl} target="_blank" rel="noreferrer">
              {t("auth.terms")}
            </a>
          ) : (
            t("auth.terms")
          )}{" "}
          {live ? t("auth.termsLive") : t("auth.termsDemo")}
        </p>

        {allowDemo && mode === "choose" && (
          <div className="auth-demo">
            <span className="auth-demo-label">{t("auth.exploreDemo")}</span>
            <div className="auth-demo-row">
              {/* The person, not the role. Labelling these by role gave two
                  chips both reading "Athlete" — and the solo athlete and the
                  club athlete are the two most different accounts here. */}
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="auth-demo-chip"
                  onClick={() => onSignedIn(enterDemo(p))}
                >
                  <span className="auth-demo-name">{p.name}</span>
                  <span className="auth-demo-blurb">{p.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
