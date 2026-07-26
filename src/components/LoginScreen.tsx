import { useState } from "react";
import {
  appleConfigured,
  googleConfigured,
  ROLE_LABELS,
  saveAccount,
  signInAsDemo,
  signInWithAppleReal,
  signInWithEmail,
  signInWithGoogleReal,
  signInWithProvider,
  type Account,
} from "../auth";
import { PERSONAS } from "../personas";
import { api, isApiConfigured } from "../api/client";

/** Sign-in / register gate. Choose Apple, Google, or email — or a demo account. */
export function LoginScreen({ onSignedIn, allowDemo }: { onSignedIn: (a: Account) => void; allowDemo: boolean }) {
  const [mode, setMode] = useState<"choose" | "email" | "sent">("choose");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const live = isApiConfigured();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  // With a server, email sign-in is a real magic link: the server mails a signed,
  // single-use token and only issues a session when it is redeemed. Without a
  // server (pure client demo) we fall back to a clearly-labelled local identity.
  const submitEmail = async () => {
    if (!live) {
      const a = signInWithEmail(email, name);
      if (!a) return setError("Please enter a valid email address.");
      return onSignedIn(a);
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.emailLinkRequest(email, window.location.origin + window.location.pathname);
      setDevLink(res.devLink ?? null);
      setMode("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the sign-in link.");
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
      setError("Google sign-in failed. Using a demo account instead.");
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
      setError("Apple sign-in failed. Using a demo account instead.");
      onSignedIn(signInWithProvider("apple"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <p className="kicker">You Go Further</p>
        <h1 className="auth-title">Fuel smarter, go further</h1>
        <p className="auth-sub">Sign in or create your account to sync your training and fueling.</p>

        {mode === "choose" ? (
          <div className="auth-actions">
            <button type="button" className="auth-btn auth-apple" onClick={signInApple} disabled={busy !== null}>
              <span className="auth-glyph"></span> {busy === "apple" ? "Signing in…" : "Continue with Apple"}
            </button>
            <button type="button" className="auth-btn auth-google" onClick={signInGoogle} disabled={busy !== null}>
              <span className="auth-glyph">G</span> {busy === "google" ? "Signing in…" : "Continue with Google"}
            </button>
            <button type="button" className="auth-btn auth-email-btn" onClick={() => setMode("email")}>
              <span className="auth-glyph">✉</span> Continue with email
            </button>
          </div>
        ) : mode === "sent" ? (
          <div className="auth-actions">
            <p className="auth-sent">
              Check your inbox — we sent a sign-in link to <strong>{email}</strong>. It works once and
              expires in 15 minutes.
            </p>
            {devLink && (
              <a className="auth-btn auth-primary" href={devLink}>
                Open the link (dev mailer)
              </a>
            )}
            <button type="button" className="auth-link" onClick={() => setMode("email")}>
              ← use a different address
            </button>
          </div>
        ) : (
          <div className="auth-actions">
            <input
              className="auth-input"
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitEmail()}
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="button" className="auth-btn auth-primary" onClick={submitEmail} disabled={sending}>
              {sending ? "Sending…" : live ? "Email me a sign-in link" : "Create account / sign in"}
            </button>
            <button type="button" className="auth-link" onClick={() => setMode("choose")}>
              ← other options
            </button>
          </div>
        )}

        <p className="auth-legal">
          By continuing you agree to our terms.{" "}
          {live
            ? "Sign-in is verified server-side — social tokens against the provider, email via a single-use link."
            : "Running without a server: sign-in is simulated for the demo."}
        </p>

        {allowDemo && mode === "choose" && (
          <div className="auth-demo">
            <span className="auth-demo-label">Explore a demo account</span>
            <div className="auth-demo-row">
              {PERSONAS.map((p) => (
                <button key={p.id} type="button" className="auth-demo-chip" onClick={() => onSignedIn(signInAsDemo(p))}>
                  {ROLE_LABELS[p.role]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
