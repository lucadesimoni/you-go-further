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

/** Sign-in / register gate. Choose Apple, Google, or email — or a demo account. */
export function LoginScreen({ onSignedIn, allowDemo }: { onSignedIn: (a: Account) => void; allowDemo: boolean }) {
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  const submitEmail = () => {
    const a = signInWithEmail(email, name);
    if (!a) return setError("Please enter a valid email address.");
    onSignedIn(a);
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
            <button type="button" className="auth-btn auth-primary" onClick={submitEmail}>
              Create account / sign in
            </button>
            <button type="button" className="auth-link" onClick={() => setMode("choose")}>
              ← other options
            </button>
          </div>
        )}

        <p className="auth-legal">
          By continuing you agree to our terms.{" "}
          {googleConfigured() || appleConfigured()
            ? "Sign-in is verified server-side against the provider."
            : "Social sign-in is simulated in this demo; set the provider client ids to enable real Google / Apple auth."}
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
