import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { api, getApiBase } from "./api";
import { C, S } from "./theme";
import { Btn, ErrorText, Loading, Panel, Pill, SectionHead } from "./ui";
import type { ProviderConnection } from "./types";

interface Provider {
  id: string;
  displayName: string;
}

/**
 * Connect the athlete's training and health services. The OAuth consent screen
 * opens in the system browser and returns to the server callback, which stores
 * the credential and imports recent activities — the same flow as the web app,
 * so a service connected on either side shows up on both.
 */
export function ConnectScreen() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.providers(), api.connections()]);
      setProviders(p);
      setConnections(c.connections);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your connections");
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (id: string) => {
    setBusy(id);
    setNote(null);
    try {
      // The callback returns to the app via its deep link once consent is given.
      const { authorizeUrl } = await api.oauthUrl(id, "yougofurther://connected");
      const url = authorizeUrl.startsWith("http") ? authorizeUrl : `${getApiBase()}${authorizeUrl}`;
      await Linking.openURL(url);
      setNote("Finish in the browser, then come back — pull the list to refresh.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the connection");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.disconnect(id);
      setConnections(r.connections);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  };

  if (!connections) return <Loading />;
  const connectedIds = new Set(connections.map((c) => c.provider));

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Panel>
        <SectionHead title="Your services" aside={`${connections.length} connected`} />
        <Text style={S.muted}>
          Connected sessions make the plan yours: real duration, terrain and load instead of what you type in.
        </Text>
        {providers.length === 0 && <Text style={S.muted}>No providers configured on this server.</Text>}
        {providers.map((p) => {
          const on = connectedIds.has(p.id);
          const conn = connections.find((c) => c.provider === p.id);
          return (
            <View
              key={p.id}
              style={[S.row, { justifyContent: "space-between", borderTopColor: C.border, borderTopWidth: 1, paddingTop: 10 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[S.text, { fontWeight: "700" }]}>{p.displayName}</Text>
                <Text style={S.muted}>
                  {on && conn ? `Connected ${new Date(conn.connectedAt).toLocaleDateString()}` : "Not connected"}
                </Text>
              </View>
              {on ? (
                <Pressable accessibilityRole="button" onPress={() => disconnect(p.id)} disabled={busy === p.id}>
                  <Text style={[S.pillText, { color: C.accent }]}>{busy === p.id ? "…" : "Disconnect"}</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  style={[S.seg, { paddingVertical: 7 }]}
                  onPress={() => connect(p.id)}
                  disabled={busy === p.id}
                >
                  <Text style={S.segText}>{busy === p.id ? "Opening…" : "Connect"}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {note && <Pill label={note} tone="good" />}
        {error && <ErrorText message={error} />}
        <Btn label="Refresh" variant="ghost" onPress={() => void load()} />
      </Panel>

      <Panel>
        <Text style={S.label}>What we read</Text>
        <Text style={S.muted}>
          Completed sessions only — duration, distance, elevation and heart rate where you share it. We never post to
          your accounts, and disconnecting removes the credential immediately.
        </Text>
      </Panel>
    </ScrollView>
  );
}
