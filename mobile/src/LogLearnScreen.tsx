import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api } from "./api";
import { C, S } from "./theme";
import type { AdaptationInsight, EnergyRating, GiRating, SessionFeedback } from "./types";

const GI: GiRating[] = ["none", "mild", "severe"];
const ENERGY: EnergyRating[] = ["bonked", "faded", "steady", "strong"];

const CONF: Record<AdaptationInsight["confidence"], string> = {
  none: "no data yet",
  low: "low confidence",
  medium: "building confidence",
  high: "high confidence",
};

/**
 * Log & learn — reads and writes the SAME server-side feedback the web app uses,
 * so logging on the phone updates the athlete's plan on the web and vice versa.
 */
export function LogLearnScreen() {
  const [gi, setGi] = useState<GiRating>("none");
  const [energy, setEnergy] = useState<EnergyRating>("steady");
  const [feedback, setFeedback] = useState<SessionFeedback[]>([]);
  const [insight, setInsight] = useState<AdaptationInsight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const r = await api.feedbackList();
      setFeedback(r.feedback);
      setInsight(r.adaptation);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const log = async () => {
    setBusy(true);
    try {
      const r = await api.feedbackAdd({ gi, energy, durationMin: 120, plannedCarbPerHourG: 60 });
      setFeedback(r.feedback);
      setInsight(r.adaptation);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    const r = await api.feedbackClear();
    setFeedback(r.feedback);
    setInsight(r.adaptation);
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <View style={S.panel}>
        <View style={[S.row, { justifyContent: "space-between" }]}>
          <Text style={S.h2}>Log &amp; learn</Text>
          <View style={S.pill}>
            <Text style={[S.pillText, { color: C.post }]}>● synced to account</Text>
          </View>
        </View>
        <Text style={S.muted}>Tell us how the session went. It tunes your plan — on this phone and on the web.</Text>

        <Text style={S.label}>Gut / GI</Text>
        <View style={S.segRow}>
          {GI.map((g) => (
            <Pressable key={g} style={[S.seg, gi === g && S.segActive]} onPress={() => setGi(g)}>
              <Text style={[S.segText, gi === g && S.segTextActive]}>{g[0].toUpperCase() + g.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={S.label}>Energy</Text>
        <View style={S.segRow}>
          {ENERGY.map((en) => (
            <Pressable key={en} style={[S.seg, energy === en && S.segActive]} onPress={() => setEnergy(en)}>
              <Text style={[S.segText, energy === en && S.segTextActive]}>{en[0].toUpperCase() + en.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={S.btn} onPress={log} disabled={busy}>
          <Text style={S.btnText}>{busy ? "Saving…" : "Log this session"}</Text>
        </Pressable>
        {error && <Text style={[S.muted, { color: C.accent }]}>API error: {error}</Text>}
      </View>

      {insight && (
        <View style={[S.panel, insight.samples > 0 && { borderColor: C.post }]}>
          <View style={[S.row, { justifyContent: "space-between" }]}>
            <Text style={[S.text, { fontWeight: "700" }]}>What we learned</Text>
            <View style={S.pill}>
              <Text style={S.pillText}>
                {insight.samples} logged · {CONF[insight.confidence]}
              </Text>
            </View>
          </View>
          <View style={S.segRow}>
            {insight.carbCeilingG !== undefined && (
              <View style={[S.pill, { borderColor: C.accent }]}>
                <Text style={[S.pillText, { color: C.accent }]}>carb ceiling {insight.carbCeilingG} g/h</Text>
              </View>
            )}
            {(insight.carbBiasG ?? 0) > 0 && (
              <View style={[S.pill, { borderColor: C.post }]}>
                <Text style={[S.pillText, { color: C.post }]}>+{insight.carbBiasG} g/h</Text>
              </View>
            )}
          </View>
          {insight.rationale.map((r, i) => (
            <Text key={i} style={S.muted}>
              • {r}
            </Text>
          ))}
        </View>
      )}

      {feedback.length > 0 && (
        <View style={S.panel}>
          <View style={[S.row, { justifyContent: "space-between" }]}>
            <Text style={S.label}>Recent sessions</Text>
            <Pressable onPress={clear}>
              <Text style={[S.pillText, { color: C.accent }]}>Clear</Text>
            </Pressable>
          </View>
          {feedback.slice(0, 6).map((f) => (
            <View key={f.id} style={[S.row, { justifyContent: "space-between" }]}>
              <Text style={S.muted}>{new Date(f.date).toLocaleDateString()}</Text>
              <Text style={S.muted}>
                GI {f.gi} · {f.energy} · @ {f.plannedCarbPerHourG} g/h
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
