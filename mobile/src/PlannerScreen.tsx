import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "./api";
import { C, S } from "./theme";
import type { AthleteInput, FuelingSchedule, Goal, Intensity, Recommendation } from "./types";

const GOALS: { value: Goal; label: string }[] = [
  { value: "endurance-performance", label: "Performance" },
  { value: "race-preparation", label: "Race prep" },
  { value: "general-fitness", label: "Fitness" },
  { value: "weight-loss", label: "Weight loss" },
  { value: "recovery-focus", label: "Recovery" },
];
const INTENSITIES: Intensity[] = ["easy", "moderate", "hard", "race"];

function Seg<T extends string>({ value, current, label, onPress }: { value: T; current: T; label: string; onPress: (v: T) => void }) {
  const active = value === current;
  return (
    <Pressable style={[S.seg, active && S.segActive]} onPress={() => onPress(value)}>
      <Text style={[S.segText, active && S.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

const badgeColor = (phase: string) => (phase === "pre" ? C.pre : phase === "during" ? C.during : C.post);

export function PlannerScreen() {
  const [input, setInput] = useState<AthleteInput>({
    goal: "endurance-performance",
    activity: "cycling",
    durationMin: 120,
    intensity: "moderate",
    bodyWeightKg: 70,
    caffeineOk: false,
  });
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [schedule, setSchedule] = useState<FuelingSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AthleteInput>(k: K, v: AthleteInput[K]) => setInput((p) => ({ ...p, [k]: v }));

  const fetchPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, s] = await Promise.all([api.recommend(input), api.schedule(input)]);
      setRec(r);
      setSchedule(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on first mount.
  useEffect(() => {
    void fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hrs = Math.floor(input.durationMin / 60);
  const mins = input.durationMin % 60;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <View style={S.panel}>
        <Text style={S.h2}>Your session</Text>

        <Text style={S.label}>Goal</Text>
        <View style={S.segRow}>
          {GOALS.map((g) => (
            <Seg key={g.value} value={g.value} current={input.goal} label={g.label} onPress={(v) => set("goal", v)} />
          ))}
        </View>

        <Text style={S.label}>Intensity</Text>
        <View style={S.segRow}>
          {INTENSITIES.map((i) => (
            <Seg key={i} value={i} current={input.intensity} label={i[0].toUpperCase() + i.slice(1)} onPress={(v) => set("intensity", v)} />
          ))}
        </View>

        <View style={[S.row, { justifyContent: "space-between" }]}>
          <Text style={S.label}>
            Duration: {hrs ? `${hrs} h ` : ""}
            {mins ? `${mins} min` : hrs ? "" : "0 min"}
          </Text>
          <View style={S.stepper}>
            <Pressable style={S.stepBtn} onPress={() => set("durationMin", Math.max(20, input.durationMin - 15))}>
              <Text style={S.stepBtnText}>−</Text>
            </Pressable>
            <Pressable style={S.stepBtn} onPress={() => set("durationMin", Math.min(360, input.durationMin + 15))}>
              <Text style={S.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={[S.row, { justifyContent: "space-between" }]}>
          <Text style={S.label}>Body weight: {input.bodyWeightKg} kg</Text>
          <View style={S.stepper}>
            <Pressable style={S.stepBtn} onPress={() => set("bodyWeightKg", Math.max(40, input.bodyWeightKg - 1))}>
              <Text style={S.stepBtnText}>−</Text>
            </Pressable>
            <Pressable style={S.stepBtn} onPress={() => set("bodyWeightKg", Math.min(120, input.bodyWeightKg + 1))}>
              <Text style={S.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={[S.seg, input.caffeineOk && S.segActive, { alignSelf: "flex-start" }]} onPress={() => set("caffeineOk", !input.caffeineOk)}>
          <Text style={[S.segText, input.caffeineOk && S.segTextActive]}>{input.caffeineOk ? "✓ " : ""}Caffeine ok</Text>
        </Pressable>

        <Pressable style={S.btn} onPress={fetchPlan} disabled={loading}>
          <Text style={S.btnText}>{loading ? "Loading…" : "Get my plan"}</Text>
        </Pressable>
        {error && <Text style={[S.muted, { color: C.accent }]}>Could not reach the platform API: {error}</Text>}
      </View>

      {loading && !rec && <ActivityIndicator color={C.accent} />}

      {rec && (
        <View style={S.panel}>
          <View style={[S.row, { justifyContent: "space-between" }]}>
            <View>
              <Text style={S.statValue}>{rec.target.carbPerHourG || "—"} g</Text>
              <Text style={S.statLabel}>Carb / hour</Text>
            </View>
            <View>
              <Text style={S.statValue}>{rec.target.fluidPerHourMl} ml</Text>
              <Text style={S.statLabel}>Fluid / hour</Text>
            </View>
            <View>
              <Text style={S.statValue}>{rec.target.sodiumPerLitreMg} mg</Text>
              <Text style={S.statLabel}>Sodium / L</Text>
            </View>
          </View>
        </View>
      )}

      {rec?.phases.map((ph) => (
        <View key={ph.phase} style={S.panel}>
          <View style={S.row}>
            <View style={{ backgroundColor: badgeColor(ph.phase), borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
              <Text style={{ color: "#0f1417", fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>{ph.phase}</Text>
            </View>
            <Text style={[S.text, { fontWeight: "700", flex: 1 }]}>{ph.headline}</Text>
          </View>
          <Text style={S.muted}>{ph.detail}</Text>
          {ph.products.map((p) => (
            <Text key={p.id} style={S.text}>
              • <Text style={{ fontWeight: "700" }}>{p.brand}</Text> {p.name} — {p.servingLabel}
            </Text>
          ))}
        </View>
      ))}

      {schedule && (
        <View style={S.panel}>
          <Text style={S.h2}>In-session schedule</Text>
          {schedule.cues.map((c, i) => (
            <View key={i} style={[S.row, { justifyContent: "space-between" }]}>
              <Text style={[S.text, { fontWeight: "700", color: C.muted, width: 54 }]}>
                {Math.floor(c.atMin / 60)}:{String(c.atMin % 60).padStart(2, "0")}
              </Text>
              <Text style={[S.text, { flex: 1 }]}>{c.label}</Text>
            </View>
          ))}
          <Text style={S.muted}>
            {schedule.totalCarbG} g carb · {schedule.totalFluidMl} ml planned
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
