import { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { api } from "./api";
import { clearSession, type MobileAccount } from "./session";
import { C, S } from "./theme";
import { Btn, Choice, ErrorText, Loading, Panel, Pill, SectionHead, Stepper } from "./ui";
import type { AthleteProfile } from "./types";

const SWEAT: { value: AthleteProfile["sweatLevel"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "average", label: "Average" },
  { value: "heavy", label: "Heavy" },
];

/**
 * Profile — body and health data in ONE place, stored server-side so the phone
 * and the web app describe the same athlete. Everything here feeds the plan:
 * weight sets carbohydrate, sweat data sets fluid and sodium.
 */
export function ProfileScreen({
  account,
  onSignedOut,
  onConnect,
  onProfileSaved,
}: {
  account: MobileAccount;
  onSignedOut: () => void;
  /** Opens the connected-services screen — the one place it lives. */
  onConnect: () => void;
  onProfileSaved?: (p: AthleteProfile) => void;
}) {
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .profileGet()
      .then((r) => alive && setProfile(r.profile))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load your profile"));
    return () => {
      alive = false;
    };
  }, []);

  const set = <K extends keyof AthleteProfile>(k: K, v: AthleteProfile[K]) => {
    setProfile((p) => (p ? { ...p, [k]: v } : p));
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.profileSave(profile);
      setProfile(r.profile);
      setDirty(false);
      setSaved(true);
      onProfileSaved?.(r.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    onSignedOut();
  };

  if (!profile) return error ? <ErrorText message={error} /> : <Loading />;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Panel>
        <SectionHead title={account.name} aside={account.tier} />
        <Text style={S.muted}>{account.email}</Text>
        <View style={S.segRow}>
          <Pill label={account.role} />
          <Pill label="Signed in on this device" tone="good" />
        </View>
      </Panel>

      <Panel>
        <SectionHead title="Connected services" />
        <Text style={S.muted}>
          Strava, Garmin, Polar or Suunto — connected sessions are what make the plan yours instead of an average.
        </Text>
        <Btn label="Manage connections" variant="ghost" onPress={onConnect} />
      </Panel>

      <Panel>
        <SectionHead title="Your body" />
        <Text style={S.muted}>Carbohydrate targets scale with your weight; fluid and sodium follow how you sweat.</Text>
        <Stepper
          label="Body weight"
          value={profile.bodyWeightKg}
          onChange={(v) => set("bodyWeightKg", v)}
          min={30}
          max={200}
          suffix=" kg"
        />
        <Text style={S.label}>How much you sweat</Text>
        <View style={S.segRow}>
          {SWEAT.map((s) => (
            <Choice key={s.value} value={s.value} current={profile.sweatLevel} label={s.label} onPress={(v) => set("sweatLevel", v)} />
          ))}
        </View>
        <View style={[S.row, { justifyContent: "space-between" }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>Caffeine is fine for me</Text>
            <Text style={S.muted}>Allows caffeinated gels late in long sessions.</Text>
          </View>
          <Switch
            value={profile.caffeineOk}
            onValueChange={(v) => set("caffeineOk", v)}
            trackColor={{ true: C.accentSoft, false: C.panel2 }}
            thumbColor={profile.caffeineOk ? C.accent : C.muted}
            accessibilityLabel="Caffeine is fine for me"
          />
        </View>
      </Panel>

      <Panel tone={profile.useSignals ? "good" : "default"}>
        <SectionHead title="Measured sweat data" aside={profile.useSignals ? "in use" : "estimated"} />
        <Text style={S.muted}>
          One 90-minute weigh-in replaces a population estimate with your own numbers. Until then the plan uses a
          sensible average and says so.
        </Text>
        <View style={[S.row, { justifyContent: "space-between" }]}>
          <Text style={S.label}>Use my measured values</Text>
          <Switch
            value={profile.useSignals}
            onValueChange={(v) => set("useSignals", v)}
            trackColor={{ true: C.accentSoft, false: C.panel2 }}
            thumbColor={profile.useSignals ? C.post : C.muted}
            accessibilityLabel="Use my measured values"
          />
        </View>
        {profile.useSignals && (
          <>
            <Stepper
              label="Sweat rate"
              value={profile.sweatRateMlPerH}
              onChange={(v) => set("sweatRateMlPerH", v)}
              min={200}
              max={3000}
              step={50}
              suffix=" ml/h"
            />
            <Stepper
              label="Sweat sodium"
              value={profile.sweatSodiumMgPerL}
              onChange={(v) => set("sweatSodiumMgPerL", v)}
              min={100}
              max={2500}
              step={50}
              suffix=" mg/L"
            />
          </>
        )}
        {profile.syncedFrom && <Pill label={`Synced from ${profile.syncedFrom}`} tone="good" />}
      </Panel>

      <Panel>
        <SectionHead title="Readiness" aside={`${profile.readiness}/100`} />
        <Text style={S.muted}>
          How recovered you feel today. Low readiness pulls intensity-driven carb targets back a little.
        </Text>
        <Stepper label="Today" value={profile.readiness} onChange={(v) => set("readiness", v)} min={0} max={100} step={5} />
      </Panel>

      <Panel>
        <Btn label={busy ? "Saving…" : "Save profile"} onPress={save} disabled={busy || !dirty} />
        {!dirty && <Pill label={saved ? "Saved ✓" : "Everything is saved"} tone={saved ? "good" : "muted"} />}
        {error && <ErrorText message={error} />}
        <Btn label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </Panel>
    </ScrollView>
  );
}
