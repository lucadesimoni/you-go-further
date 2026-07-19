import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StatusBar, Text, View } from "react-native";
import { api, getApiBase } from "./src/api";
import { PlannerScreen } from "./src/PlannerScreen";
import { LogLearnScreen } from "./src/LogLearnScreen";
import { C, S } from "./src/theme";

type Tab = "plan" | "log";

export default function App() {
  const [tab, setTab] = useState<Tab>("plan");
  const [health, setHealth] = useState<{ ok: boolean; env?: string; version?: string }>({ ok: false });

  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setHealth({ ok: h.status === "ok", env: h.environment, version: h.version }))
      .catch(() => alive && setHealth({ ok: false }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={S.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
        <View style={[S.row, { justifyContent: "space-between" }]}>
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}>YOU GO FURTHER</Text>
          <View style={[S.pill, health.ok && { borderColor: C.post }]}>
            <Text style={[S.pillText, health.ok && { color: C.post }]}>
              {health.ok ? `● in sync · ${health.env}` : "offline"}
            </Text>
          </View>
        </View>
        <Text style={[S.h1, { marginTop: 4 }]}>Swiss endurance fueling</Text>
        {!health.ok && (
          <Text style={S.muted}>
            Can't reach the platform at {getApiBase()} — start the API (`npm run server`) or set
            EXPO_PUBLIC_API_BASE_URL.
          </Text>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Pressable style={[S.seg, tab === "plan" && S.segActive]} onPress={() => setTab("plan")}>
          <Text style={[S.segText, tab === "plan" && S.segTextActive]}>Fuel planner</Text>
        </Pressable>
        <Pressable style={[S.seg, tab === "log" && S.segActive]} onPress={() => setTab("log")}>
          <Text style={[S.segText, tab === "log" && S.segTextActive]}>Log &amp; learn</Text>
        </Pressable>
      </View>

      {tab === "plan" ? <PlannerScreen /> : <LogLearnScreen />}
    </SafeAreaView>
  );
}
