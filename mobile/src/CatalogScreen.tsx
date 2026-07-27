import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { api, getApiBase } from "./api";
import { C, S } from "./theme";
import { Btn, Choice, Empty, ErrorText, Loading, Panel, Pill, SectionHead } from "./ui";
import type { AthleteInput, CartLine, Order, Product, UsageGuide } from "./types";

type Filter = "all" | "pre" | "during" | "post";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pre", label: "Before" },
  { value: "during", label: "During" },
  { value: "post", label: "After" },
];

const phaseColor = (p: string) => (p === "pre" ? C.pre : p === "during" ? C.during : C.post);

/**
 * The product library and shop in one place — browse what's available, see when
 * each product is the right choice (guidance computed by the same engine
 * function the web app uses), and buy the kit for a planned session.
 */
export function CatalogScreen({ sessionInput }: { sessionInput: AthleteInput }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [usage, setUsage] = useState<Record<string, UsageGuide>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [sessions, setSessions] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [p, o] = await Promise.all([api.products(), api.orders().catch(() => ({ orders: [] }))]);
        if (!alive) return;
        setProducts(p.products);
        setUsage(p.usage ?? {});
        setOrders(o.orders);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Could not load the catalog");
          setProducts([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(
    () => (products ?? []).filter((p) => filter === "all" || p.phases.includes(filter)),
    [products, filter],
  );

  const buildCart = async (n: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.cart(sessionInput, n);
      setLines(r.lines);
      setSubtotal(r.subtotalChf);
      setSessions(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build a cart");
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.checkoutProducts(lines, "yougofurther://paid");
      const url = r.url.startsWith("http") ? r.url : `${getApiBase()}${r.url}`;
      await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setBusy(false);
    }
  };

  if (!products) return <Loading />;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Panel>
        <SectionHead title="Kit for your session" aside={`${sessionInput.durationMin} min`} />
        <Text style={S.muted}>
          Exactly what your current plan needs — Swiss products, matched to your carb, fluid and sodium targets.
        </Text>
        {lines.length === 0 ? (
          <Btn label={busy ? "Building…" : "Build my cart"} onPress={() => buildCart(1)} disabled={busy} />
        ) : (
          <>
            {lines.map((l) => (
              <View key={l.productId} style={[S.row, { justifyContent: "space-between" }]}>
                <Text style={[S.text, { flex: 1 }]}>
                  {l.qty}× <Text style={{ fontWeight: "700" }}>{l.brand}</Text> {l.name}
                </Text>
                <Text style={S.muted}>CHF {l.lineTotalChf.toFixed(2)}</Text>
              </View>
            ))}
            <View style={[S.row, { justifyContent: "space-between", borderTopColor: C.border, borderTopWidth: 1, paddingTop: 10 }]}>
              <Text style={S.label}>
                Subtotal · {sessions} session{sessions === 1 ? "" : "s"}
              </Text>
              <Text style={[S.text, { fontWeight: "800" }]}>CHF {subtotal.toFixed(2)}</Text>
            </View>
            <View style={S.segRow}>
              {[1, 4, 8].map((n) => (
                <Choice key={n} value={String(n)} current={String(sessions)} label={`${n}×`} onPress={(v) => void buildCart(Number(v))} />
              ))}
            </View>
            <Btn label={busy ? "Opening checkout…" : `Checkout · CHF ${subtotal.toFixed(2)}`} onPress={checkout} disabled={busy} />
            <Text style={S.muted}>
              Payment happens in the browser. Your order only becomes paid once the payment provider confirms it to our
              server.
            </Text>
          </>
        )}
        {error && <ErrorText message={error} />}
      </Panel>

      <Panel>
        <SectionHead title="Product library" aside={`${shown.length} of ${products.length}`} />
        <View style={S.segRow}>
          {FILTERS.map((f) => (
            <Choice key={f.value} value={f.value} current={filter} label={f.label} onPress={setFilter} />
          ))}
        </View>

        {shown.map((p) => {
          const isOpen = open === p.id;
          const use = usage[p.id];
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => setOpen(isOpen ? null : p.id)}
              style={{ gap: 6, borderTopColor: C.border, borderTopWidth: 1, paddingTop: 10 }}
            >
              <View style={[S.row, { justifyContent: "space-between" }]}>
                <Text style={[S.text, { flex: 1, fontWeight: "700" }]}>
                  {p.brand} {p.name}
                </Text>
                {p.priceChf !== undefined && <Text style={S.muted}>CHF {p.priceChf.toFixed(2)}</Text>}
              </View>
              <View style={[S.row, { flexWrap: "wrap", rowGap: 6 }]}>
                {p.phases.map((ph) => (
                  <View key={ph} style={{ backgroundColor: phaseColor(ph), borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 }}>
                    <Text style={{ color: C.bg, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{ph}</Text>
                  </View>
                ))}
                <Pill label={`${p.carbsG} g carb`} />
                <Pill label={`${p.sodiumMg} mg Na`} />
                {p.caffeineMg ? <Pill label={`${p.caffeineMg} mg caffeine`} tone="accent" /> : null}
                {p.multiTransportable ? <Pill label="2:1 glucose+fructose" tone="good" /> : null}
                {p.custom ? <Pill label="House product" tone="accent" /> : null}
              </View>
              <Text style={S.muted}>{p.servingLabel}</Text>

              {isOpen && use && (
                <View style={{ gap: 6, paddingTop: 4 }}>
                  <Text style={[S.text, { fontWeight: "600" }]}>{use.summary}</Text>
                  <Text style={S.label}>Best when</Text>
                  {use.bestWhen.map((b, i) => (
                    <Text key={i} style={S.muted}>
                      • {b}
                    </Text>
                  ))}
                  <Text style={S.label}>Skip it when</Text>
                  {use.avoidWhen.map((b, i) => (
                    <Text key={i} style={S.muted}>
                      • {b}
                    </Text>
                  ))}
                  {p.shopUrl && (
                    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(p.shopUrl!).catch(() => undefined)}>
                      <Text style={[S.pillText, { color: C.accent }]}>Open the brand's shop →</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}
      </Panel>

      <Panel>
        <SectionHead title="Your orders" aside={orders.length ? `${orders.length}` : undefined} />
        {orders.length === 0 ? (
          <Empty text="No orders yet. Build a cart above and everything you buy shows up here." />
        ) : (
          orders.map((o) => (
            <View key={o.id} style={[S.row, { justifyContent: "space-between" }]}>
              <Text style={S.muted}>{new Date(o.createdAt).toLocaleDateString()}</Text>
              <Text style={S.text}>CHF {o.amountChf.toFixed(2)}</Text>
              <Pill label={o.status} tone={o.status === "paid" ? "good" : o.status === "pending" ? "muted" : "accent"} />
            </View>
          ))
        )}
      </Panel>
    </ScrollView>
  );
}
