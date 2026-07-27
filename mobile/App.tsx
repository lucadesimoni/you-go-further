import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, SafeAreaView, StatusBar, Text, View } from "react-native";
import { api, getApiBase } from "./src/api";
import { PlannerScreen } from "./src/PlannerScreen";
import { LogLearnScreen } from "./src/LogLearnScreen";
import { InsightsScreen } from "./src/InsightsScreen";
import { ConnectScreen } from "./src/ConnectScreen";
import { CatalogScreen } from "./src/CatalogScreen";
import { ProfileScreen } from "./src/ProfileScreen";
import { SignInScreen } from "./src/SignInScreen";
import { restoreSession, saveSession, type MobileAccount } from "./src/session";
import { C, S } from "./src/theme";
import { Loading } from "./src/ui";
import type { AthleteInput, AthleteProfile } from "./src/types";

type Tab = "plan" | "log" | "insights" | "shop" | "you";

// One navigation surface. Personal screens (profile, connections, sign-out) all
// live under "You", so nothing appears in two places.
const TABS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "log", label: "Log" },
  { id: "insights", label: "Insights" },
  { id: "shop", label: "Shop" },
  { id: "you", label: "You" },
];

const DEFAULT_INPUT: AthleteInput = {
  goal: "endurance-performance",
  activity: "cycling",
  durationMin: 120,
  intensity: "moderate",
  bodyWeightKg: 70,
  caffeineOk: false,
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState<MobileAccount | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [showConnect, setShowConnect] = useState(false);
  const [input, setInput] = useState<AthleteInput>(DEFAULT_INPUT);
  // The carb rate the current plan asks for — Log pre-fills with it, so what
  // gets logged is what was actually planned.
  const [plannedCarbPerHourG, setPlannedCarbPerHourG] = useState(60);
  const [health, setHealth] = useState<{ ok: boolean; env?: string }>({ ok: false });
  // A single transient message for things that finished outside the app.
  const [notice, setNotice] = useState<string | null>(null);

  // Seed the session from the athlete's stored profile, so weight and caffeine
  // are never asked for twice.
  const applyProfile = useCallback((p: AthleteProfile) => {
    setInput((prev) => ({ ...prev, bodyWeightKg: p.bodyWeightKg, caffeineOk: p.caffeineOk }));
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const restored = await restoreSession();
      if (!alive) return;
      setAccount(restored);
      setBooting(false);
      try {
        const h = await api.health();
        if (alive) setHealth({ ok: h.status === "ok", env: h.environment });
      } catch {
        if (alive) setHealth({ ok: false });
      }
      if (restored) {
        try {
          const r = await api.profileGet();
          if (alive) applyProfile(r.profile);
        } catch {
          /* the plan still works from defaults */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyProfile]);

  // Everything that leaves the app — the emailed sign-in link, OAuth consent,
  // Stripe checkout — comes back through the yougofurther:// scheme. Handle it
  // in one place so the athlete lands where the action finished, the same way
  // the web app handles ?magic= / ?connected= / ?paid=.
  const handleLink = useCallback(async (url: string | null) => {
    if (!url) return;
    const magic = /[?&]magic=([^&]+)/.exec(url);
    if (magic) {
      try {
        const r = await api.emailLinkVerify(decodeURIComponent(magic[1]));
        setAccount(await saveSession(r.token, r.account));
        setTab("plan");
      } catch {
        /* the sign-in screen reports an unusable link when it is redeemed there */
      }
      return;
    }
    if (/[?&]connected=/.test(url)) {
      setShowConnect(true);
      setTab("you");
      setNotice("Service connected — your sessions are importing.");
      return;
    }
    if (/[?&]paid=/.test(url)) {
      setTab("shop");
      setNotice("Payment received. Your order is confirmed once our server verifies it.");
    }
  }, []);

  useEffect(() => {
    void Linking.getInitialURL().then(handleLink);
    const sub = Linking.addEventListener("url", (e) => void handleLink(e.url));
    return () => sub.remove();
  }, [handleLink]);

  const signedIn = useCallback(
    async (a: MobileAccount) => {
      setAccount(a);
      setTab("plan");
      try {
        applyProfile((await api.profileGet()).profile);
      } catch {
        /* defaults are fine */
      }
    },
    [applyProfile],
  );

  return (
    <SafeAreaView style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <View style={[S.row, { justifyContent: "space-between" }]}>
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}>YOU GO FURTHER</Text>
          <View style={[S.pill, health.ok && { borderColor: C.post }]}>
            <Text style={[S.pillText, health.ok && { color: C.post }]}>
              {health.ok ? `● in sync · ${health.env}` : "offline"}
            </Text>
          </View>
        </View>
        {!health.ok && (
          <Text style={S.muted}>
            Can't reach the platform at {getApiBase()} — start the API (`npm run server`) or set
            EXPO_PUBLIC_API_BASE_URL.
          </Text>
        )}
        {notice && (
          <Pressable accessibilityRole="button" onPress={() => setNotice(null)} style={{ paddingTop: 6 }}>
            <Text style={[S.pillText, { color: C.post }]}>{notice} · tap to dismiss</Text>
          </Pressable>
        )}
      </View>

      {booting ? (
        <Loading />
      ) : !account ? (
        <SignInScreen onSignedIn={signedIn} />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {tab === "plan" && (
              <PlannerScreen
                input={input}
                onInput={setInput}
                onEditProfile={() => setTab("you")}
                onPlanned={setPlannedCarbPerHourG}
              />
            )}
            {tab === "log" && (
              <LogLearnScreen durationMin={input.durationMin} plannedCarbPerHourG={plannedCarbPerHourG} />
            )}
            {tab === "insights" && (
              <InsightsScreen
                onConnect={() => {
                  setShowConnect(true);
                  setTab("you");
                }}
              />
            )}
            {tab === "shop" && <CatalogScreen sessionInput={input} />}
            {tab === "you" &&
              (showConnect ? (
                <>
                  <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                    <Pressable accessibilityRole="button" onPress={() => setShowConnect(false)}>
                      <Text style={[S.pillText, { color: C.accent }]}>← Back to your profile</Text>
                    </Pressable>
                  </View>
                  <ConnectScreen />
                </>
              ) : (
                <ProfileScreen
                  account={account}
                  onSignedOut={() => setAccount(null)}
                  onConnect={() => setShowConnect(true)}
                  onProfileSaved={applyProfile}
                />
              ))}
          </View>

          <View style={S.tabbar}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.label}
                  style={S.tabItem}
                  onPress={() => {
                    setTab(t.id);
                    if (t.id === "you") setShowConnect(false);
                  }}
                >
                  <View style={[S.tabDot, active && S.tabDotActive]} />
                  <Text style={[S.tabLabel, active && S.tabLabelActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
