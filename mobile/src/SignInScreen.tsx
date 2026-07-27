import { useState } from "react";
import { Linking, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "./api";
import { saveSession, type MobileAccount } from "./session";
import { C, S } from "./theme";
import { Btn, ErrorText, Panel, SectionHead } from "./ui";

/**
 * Passwordless sign-in — the same server-verified magic link the web app uses.
 * The phone never decides who you are: it posts the emailed token to
 * /api/auth/email/verify and the server issues the signed session.
 *
 * The link opens in the browser and deep-links back into the app; where that
 * isn't wired up (Expo Go, a desktop mailbox) the athlete can paste the link
 * here instead, which redeems exactly the same single-use token.
 */
export function SignInScreen({ onSignedIn }: { onSignedIn: (a: MobileAccount) => void }) {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"email" | "sent">("email");
  const [pasted, setPasted] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.emailLinkRequest(email.trim());
      setDevLink(r.devLink ?? null);
      setStage("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the link");
    } finally {
      setBusy(false);
    }
  };

  /** Accept either a raw token or the whole link, and redeem it server-side. */
  const verify = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const match = /[?&]magic=([^&\s]+)/.exec(value);
    const token = match ? decodeURIComponent(match[1]) : value;
    setBusy(true);
    setError(null);
    try {
      const r = await api.emailLinkVerify(token);
      onSignedIn(await saveSession(r.token, r.account));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That link could not be verified");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Panel>
        <SectionHead title="Sign in" />
        <Text style={S.muted}>
          One account across phone and web. Your sessions, profile and fuelling history follow you.
        </Text>

        {stage === "email" ? (
          <>
            <Text style={S.label}>Email</Text>
            <TextInput
              style={S.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.ch"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              accessibilityLabel="Email address"
            />
            <Btn label={busy ? "Sending…" : "Email me a sign-in link"} onPress={request} disabled={busy || !email.includes("@")} />
          </>
        ) : (
          <>
            <Text style={S.text}>
              Link sent to <Text style={{ fontWeight: "700" }}>{email.trim()}</Text>. It is valid for 15 minutes and
              works once.
            </Text>
            {devLink && (
              <Btn
                label="Open the dev link"
                variant="ghost"
                onPress={() => {
                  void Linking.openURL(devLink).catch(() => undefined);
                  void verify(devLink);
                }}
              />
            )}
            <Text style={S.label}>Or paste the link from your mail</Text>
            <TextInput
              style={S.input}
              value={pasted}
              onChangeText={setPasted}
              placeholder="https://…?magic=…"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Sign-in link"
            />
            <Btn label={busy ? "Verifying…" : "Sign in"} onPress={() => verify(pasted)} disabled={busy || !pasted.trim()} />
            <Btn
              label="Use a different email"
              variant="ghost"
              onPress={() => {
                setStage("email");
                setPasted("");
                setDevLink(null);
                setError(null);
              }}
            />
          </>
        )}
        {error && <ErrorText message={error} />}
      </Panel>

      <Panel>
        <Text style={S.label}>Why no password</Text>
        <Text style={S.muted}>
          There is nothing to leak or reuse. The emailed token is signed by the server, expires in 15 minutes and can
          only be redeemed once.
        </Text>
      </Panel>
    </ScrollView>
  );
}
