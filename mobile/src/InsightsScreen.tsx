import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api } from "./api";
import { C, S } from "./theme";
import { Btn, Empty, ErrorText, Loading, Meter, Panel, Pill, SectionHead, Stat } from "./ui";
import type { FuellingScore, GuideArticle, InsightsResponse } from "./types";

const BAND_LABEL: Record<FuellingScore["band"], string> = {
  "getting-started": "Getting started",
  building: "Building",
  solid: "Solid",
  "dialled-in": "Dialled in",
};

const bandColor = (band: FuellingScore["band"]) =>
  band === "dialled-in" ? C.post : band === "solid" ? C.pre : band === "building" ? C.during : C.muted;

/**
 * Insights — the same numbers as the web app, because the server computes them.
 * The point is fuelling quality and what to change next, not points or badges.
 */
export function InsightsScreen({ onConnect }: { onConnect: () => void }) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [guide, setGuide] = useState<GuideArticle[]>([]);
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [i, g] = await Promise.all([api.insights(), api.guide()]);
        if (!alive) return;
        setData(i);
        setGuide(g.articles);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load insights");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={S.content}>
        <Panel>
          <ErrorText message={error} />
        </Panel>
      </ScrollView>
    );
  }
  if (!data) return <Loading />;

  const { progress, fuelling, hasData } = data;
  const ordered = [...progress.milestones].sort((a, b) => Number(b.done) - Number(a.done));

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Panel>
        <SectionHead
          title="Fuelling score"
          aside={`${fuelling.sessionsLogged} session${fuelling.sessionsLogged === 1 ? "" : "s"} logged`}
        />

        <View style={[S.row, { gap: 16 }]}>
          <View style={{ alignItems: "center", width: 96 }}>
            <Text style={{ color: bandColor(fuelling.band), fontSize: 40, fontWeight: "800" }}>
              {fuelling.score ?? "—"}
            </Text>
            <Text style={[S.statLabel, { color: bandColor(fuelling.band), fontWeight: "700" }]}>
              {BAND_LABEL[fuelling.band]}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {fuelling.score === null ? (
              <Text style={S.muted}>
                Log a session and this starts tracking how well your fuelling is actually working — energy, gut, and
                whether the long ones are covered.
              </Text>
            ) : fuelling.trend ? (
              <Text
                style={[
                  S.muted,
                  {
                    color:
                      fuelling.trend.direction === "up" ? C.post : fuelling.trend.direction === "down" ? C.accent : C.muted,
                  },
                ]}
              >
                {fuelling.trend.direction === "up"
                  ? `Improving — up ${fuelling.trend.delta} points over your recent sessions.`
                  : fuelling.trend.direction === "down"
                    ? `Slipping — down ${Math.abs(fuelling.trend.delta)} points recently.`
                    : "Holding steady over your recent sessions."}
              </Text>
            ) : (
              // No trend yet — say what the number rests on rather than leaving a gap.
              <Text style={S.muted}>
                Based on your last {fuelling.sessionsLogged} logged session
                {fuelling.sessionsLogged === 1 ? "" : "s"}. Log a few more and this starts showing a trend.
              </Text>
            )}
          </View>
        </View>

        {fuelling.score !== null &&
          fuelling.components.map((c) => (
            <View key={c.id} style={{ gap: 5, marginTop: 4 }}>
              <View style={[S.row, { justifyContent: "space-between" }]}>
                <Text style={[S.text, { fontWeight: "600" }]}>{c.label}</Text>
                <Text style={[S.text, { fontWeight: "700", color: C.muted }]}>{c.score}</Text>
              </View>
              <Meter value={c.score} tone={c.score >= 85 ? C.post : c.score >= 60 ? C.during : C.accent} />
              <Text style={S.muted}>{c.detail}</Text>
            </View>
          ))}
      </Panel>

      {fuelling.healthFlags.length > 0 && (
        <Panel tone="warn">
          <Text style={[S.h2, { color: C.accent }]}>Worth attention</Text>
          {fuelling.healthFlags.map((f, i) => (
            <Text key={i} style={S.text}>
              {f}
            </Text>
          ))}
        </Panel>
      )}

      <Panel>
        <Text style={S.h2}>Do this next</Text>
        {fuelling.nextActions.map((a, i) => (
          <View key={i} style={{ gap: 3 }}>
            <Text style={[S.text, { fontWeight: "700" }]}>
              {i + 1}. {a.title}
            </Text>
            <Text style={S.muted}>{a.why}</Text>
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHead
          title="Your training"
          aside={hasData && progress.streakDays > 0 ? `${progress.streakDays}-day streak · best ${progress.longestStreakDays}` : undefined}
        />
        {hasData ? (
          <View style={[S.row, { flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }]}>
            <Stat label="Activities" value={String(progress.stats.activities)} />
            <Stat label="Hours" value={String(progress.stats.hours)} />
            <Stat label="Long sessions" value={String(progress.stats.longSessions)} note="90 min+" />
            <Stat label="Logged" value={String(progress.stats.loggedSessions)} note="plan learns" />
          </View>
        ) : (
          <Empty
            text="No sessions synced yet — connect a service and your real training shows up here."
            action={{ label: "Connect a service", onPress: onConnect }}
          />
        )}
      </Panel>

      {hasData && (
        <Panel>
          <SectionHead title="Milestones" aside={`${progress.doneCount} of ${progress.milestones.length}`} />
          {ordered.map((m) => (
            <View key={m.id} style={[S.row, { alignItems: "flex-start" }]}>
              <Text style={{ color: m.done ? C.post : C.muted, width: 18, fontSize: 15 }}>{m.done ? "✓" : "○"}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={S.row}>
                  <Text style={[S.text, { fontWeight: "600", opacity: m.done ? 1 : 0.85 }]}>{m.name}</Text>
                  <Pill label={m.category} />
                </View>
                <Text style={S.muted}>{m.description}</Text>
              </View>
            </View>
          ))}
        </Panel>
      )}

      <Panel>
        <SectionHead title="Fuel &amp; nutrition guide" aside={`${guide.length} articles`} />
        {showGuide ? (
          <>
            {guide.map((a) => {
              const open = openArticle === a.id;
              return (
                <View key={a.id} style={{ gap: 6, borderTopColor: C.border, borderTopWidth: 1, paddingTop: 10 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setOpenArticle(open ? null : a.id)}
                    style={{ gap: 3 }}
                  >
                    <View style={S.row}>
                      <Pill label={a.category} />
                      <Text style={S.statLabel}>{a.readMinutes} min read</Text>
                    </View>
                    <Text style={[S.text, { fontWeight: "700" }]}>{a.title}</Text>
                    <Text style={S.muted}>{a.summary}</Text>
                  </Pressable>
                  {open && (
                    <View style={{ gap: 8, paddingTop: 4 }}>
                      <View style={[S.row, { flexWrap: "wrap", rowGap: 8 }]}>
                        {a.keyNumbers.map((k) => (
                          <View key={k.label} style={{ minWidth: 96 }}>
                            <Text style={[S.text, { fontWeight: "800", color: C.pre }]}>{k.value}</Text>
                            <Text style={S.statLabel}>{k.label}</Text>
                          </View>
                        ))}
                      </View>
                      {a.body.map((p, i) => (
                        <Text key={i} style={S.text}>
                          {p}
                        </Text>
                      ))}
                      <Text style={S.label}>In practice</Text>
                      {a.practice.map((p, i) => (
                        <Text key={i} style={S.muted}>
                          • {p}
                        </Text>
                      ))}
                      <Text style={S.label}>Common mistakes</Text>
                      {a.pitfalls.map((p, i) => (
                        <Text key={i} style={S.muted}>
                          • {p}
                        </Text>
                      ))}
                      <Text style={[S.statLabel, { fontStyle: "italic" }]}>{a.evidence}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <Btn label="Hide the guide" variant="ghost" onPress={() => setShowGuide(false)} />
          </>
        ) : (
          <Empty
            text="Protocol-grade guidance behind every number in your plan — carbohydrate rates, gut training, hydration, heat, recovery and low energy availability."
            action={{ label: "Read the guide", onPress: () => setShowGuide(true) }}
          />
        )}
      </Panel>
    </ScrollView>
  );
}
