import { describe, expect, it, beforeEach, vi } from "vitest";
import { createApiRouter, type ApiRequest } from "./handlers";
import { signStripePayload } from "../commerce/payments";
import { createRuntime } from "../runtime";
import { getConfig } from "../config";
import type { Principal } from "../auth";
import type { AthleteInput } from "../engine";

const athlete: Principal = { id: "a1", name: "A", role: "athlete", tier: "free" };
const admin: Principal = { id: "ad1", name: "Admin", role: "admin", orgId: "swiss-tri-club", tier: "elite" };

const input: AthleteInput = {
  goal: "endurance-performance",
  activity: "cycling",
  durationMin: 120,
  intensity: "moderate",
  bodyWeightKg: 70,
};

function req(method: string, path: string, over: Partial<ApiRequest> = {}): ApiRequest {
  return { method, path, query: {}, principal: athlete, ...over };
}

describe("API router", () => {
  let route: ReturnType<typeof createApiRouter>;
  beforeEach(() => {
    // Fresh runtime (and store) per test.
    route = createApiRouter(createRuntime({ ...getConfig(), enabledProviders: ["garmin", "strava"] }));
  });

  it("reports health with the store count", async () => {
    const res = await route(req("GET", "/api/health"));
    expect(res.status).toBe(200);
    expect((res.data as { status: string }).status).toBe("ok");
  });

  it("reports what is deployed, module by module", async () => {
    const res = await route(req("GET", "/api/version"));
    expect(res.status).toBe(200);
    const data = res.data as { platform: string; modules: { id: string; version: string }[] };
    expect(data.platform).toMatch(/^\d+\.\d+\.\d+$/);
    // The engine is the module a support question is most likely to be about.
    expect(data.modules.find((m) => m.id === "engine")?.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("recommends from a posted AthleteInput", async () => {
    const res = await route(req("POST", "/api/recommend", { body: input }));
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("target");
    expect(res.data).toHaveProperty("phases");
  });

  it("rejects an invalid AthleteInput", async () => {
    const res = await route(req("POST", "/api/recommend", { body: { goal: "x" } }));
    expect(res.status).toBe(400);
  });

  it("returns a timed schedule", async () => {
    const res = await route(req("POST", "/api/schedule", { body: input }));
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("cues");
  });

  it("ingests, then analyzes the stored data (end-to-end backend loop)", async () => {
    const ingest = await route(req("POST", "/api/ingest", { body: { provider: "garmin", days: 28 } }));
    expect(ingest.status).toBe(200);
    expect((ingest.data as { inserted: number }).inserted).toBeGreaterThan(0);

    const analysis = await route(req("GET", "/api/analysis", { query: { bodyWeightKg: "70" } }));
    expect(analysis.status).toBe(200);
    expect(analysis.data).toHaveProperty("acwr");
    expect(analysis.data).toHaveProperty("nutrition");
  });

  it("derives physiology from ingested providers", async () => {
    await route(req("POST", "/api/ingest", { body: { provider: "garmin", days: 21 } }));
    const res = await route(req("GET", "/api/physiology", { query: {} }));
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("hasSignals", true);
  });

  it("enforces RBAC on the admin endpoint", async () => {
    const denied = await route(req("GET", "/api/admin/overview", { principal: athlete }));
    expect(denied.status).toBe(403);

    const allowed = await route(req("GET", "/api/admin/overview", { principal: admin }));
    expect(allowed.status).toBe(200);
    expect(allowed.data).toHaveProperty("members");
    expect(allowed.data).toHaveProperty("deployment");
  });

  it("persists feedback per principal and derives adaptation", async () => {
    const add = await route(
      req("POST", "/api/feedback", { body: { gi: "severe", energy: "steady", durationMin: 120, plannedCarbPerHourG: 90 } }),
    );
    expect(add.status).toBe(200);
    expect((add.data as { feedback: unknown[] }).feedback).toHaveLength(1);

    const list = await route(req("GET", "/api/feedback"));
    expect((list.data as { feedback: unknown[] }).feedback).toHaveLength(1);
    expect((list.data as { adaptation: { carbCeilingG?: number } }).adaptation.carbCeilingG).toBeDefined();
  });

  it("rejects malformed feedback", async () => {
    expect((await route(req("POST", "/api/feedback", { body: { gi: "nope" } }))).status).toBe(400);
  });

  it("isolates feedback between users and supports clear", async () => {
    await route(req("POST", "/api/feedback", { body: { gi: "mild", energy: "faded", durationMin: 90, plannedCarbPerHourG: 60 }, principal: athlete }));
    const adminList = await route(req("GET", "/api/feedback", { principal: admin }));
    expect((adminList.data as { feedback: unknown[] }).feedback).toHaveLength(0); // different user

    await route(req("DELETE", "/api/feedback", { principal: athlete }));
    const after = await route(req("GET", "/api/feedback", { principal: athlete }));
    expect((after.data as { feedback: unknown[] }).feedback).toHaveLength(0);
  });

  it("returns a Strava authorize URL and completes the dev OAuth callback", async () => {
    const auth = await route(req("GET", "/api/oauth/strava/authorize-url", { query: { return_to: "http://app" } }));
    expect(auth.status).toBe(200);
    const authData = auth.data as { authorizeUrl: string; configured: boolean };
    expect(authData.configured).toBe(true); // StravaProvider has exchangeToken
    expect(authData.authorizeUrl).toContain("/oauth/strava/"); // dev-consent (no creds)

    // dev-consent redirects into the callback
    const consent = await route(req("GET", "/api/oauth/strava/dev-consent", { query: { return_to: "http://app" } }));
    expect(consent.status).toBe(302);
    expect((consent.data as { redirect: string }).redirect).toContain("/api/oauth/strava/callback");

    // callback exchanges the code, ingests activities, and stores the connection
    const cb = await route(req("GET", "/api/oauth/strava/callback", { query: { code: "dev-code" } }));
    expect(cb.status).toBe(200);
    expect((cb.data as { connected: boolean; imported: number }).connected).toBe(true);
    expect((cb.data as { imported: number }).imported).toBeGreaterThan(0);

    const conns = await route(req("GET", "/api/connections"));
    const list = (conns.data as { connections: { provider: string }[] }).connections;
    expect(list.some((c) => c.provider === "strava")).toBe(true);
  });

  it("callback redirects back to the app when return_to is set", async () => {
    const cb = await route(req("GET", "/api/oauth/strava/callback", { query: { code: "dev-code", return_to: "http://app" } }));
    expect(cb.status).toBe(302);
    expect((cb.data as { redirect: string }).redirect).toBe("http://app?connected=strava");
  });

  it("disconnects a provider", async () => {
    await route(req("GET", "/api/oauth/garmin/callback", { query: { code: "dev-code" } }));
    let list = ((await route(req("GET", "/api/connections"))).data as { connections: unknown[] }).connections;
    expect(list.length).toBeGreaterThan(0);
    await route(req("DELETE", "/api/connections/garmin"));
    list = ((await route(req("GET", "/api/connections"))).data as { connections: unknown[] }).connections;
    expect(list.length).toBe(0);
  });

  it("rejects an unknown provider in the OAuth flow", async () => {
    expect((await route(req("GET", "/api/oauth/fitbit/authorize-url"))).status).toBe(400);
  });

  it("google sign-in is 400 when not configured, 400 without an idToken", async () => {
    const notConfigured = await route(req("POST", "/api/auth/google", { body: { idToken: "x" } }));
    expect(notConfigured.status).toBe(400);
    expect((notConfigured.data as { error: string }).error).toMatch(/not configured/i);

    vi.stubEnv("GOOGLE_CLIENT_ID", "client-123");
    const missing = await route(req("POST", "/api/auth/google", { body: {} }));
    expect(missing.status).toBe(400); // configured, but no idToken (no network)
    vi.unstubAllEnvs();
  });

  it("verifies a real-shape Google ID token and issues a session", async () => {
    const { generateKeyPairSync, sign } = await import("node:crypto");
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
    const jwks = { keys: [{ kty: "RSA", kid: "k1", alg: "RS256", n: jwk.n, e: jwk.e }] };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const claims = {
      iss: "https://accounts.google.com",
      aud: "client-xyz",
      sub: "g-1",
      email: "runner@gmail.com",
      name: "Runner",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
    const pay = b64(claims);
    const sig = sign("RSA-SHA256", Buffer.from(`${head}.${pay}`), privateKey).toString("base64url");
    const idToken = `${head}.${pay}.${sig}`;

    vi.stubEnv("GOOGLE_CLIENT_ID", "client-xyz");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(jwks), { status: 200 }));
    const res = await route(req("POST", "/api/auth/google", { body: { idToken } }));
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    expect(res.status).toBe(200);
    const token = (res.data as { token: string }).token;
    expect(token).toBeTruthy();
    // The issued session decodes to the verified identity.
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()) as { sub: string; email: string };
    expect(payload.sub).toBe("google:g-1");
    expect(payload.email).toBe("runner@gmail.com");
  });

  it("404s unknown routes", async () => {
    expect((await route(req("GET", "/api/nope"))).status).toBe(404);
  });

  it("lists the merged product catalog", async () => {
    const res = await route(req("GET", "/api/products"));
    expect(res.status).toBe(200);
    const data = res.data as { products: unknown[]; builtIn: number; custom: number };
    expect(data.products.length).toBe(data.builtIn);
    expect(data.custom).toBe(0);
  });

  it("a paid plan takes effect immediately, without signing out and back in", async () => {
    // The tier lives in the session token, which was minted before the purchase.
    const buyer: Principal = { id: "solo-1", name: "Solo", role: "athlete", tier: "free" };
    const res = await route(req("POST", "/api/checkout", { body: { kind: "subscription", tier: "pro" }, principal: buyer }));
    const orderId = (res.data as { orderId: string }).orderId;
    const order = ((await route(req("GET", "/api/orders", { principal: buyer }))).data as {
      orders: { id: string; providerRef: string }[];
    }).orders.find((o) => o.id === orderId)!;

    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: order.providerRef } } });
    await route(
      req("POST", "/api/webhooks/payments", {
        body: JSON.parse(payload),
        rawBody: payload,
        headers: { "stripe-signature": signStripePayload(payload, "dev-webhook-secret") },
      }),
    );

    // Same stale token, but the server answers with what the account now has.
    const me = await route(req("GET", "/api/me", { principal: buyer }));
    expect((me.data as { principal: { tier: string } }).principal.tier).toBe("pro");
  });

  it("ingests an Apple Health sync into activities, wellness and the profile", async () => {
    const day = (i: number) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const res = await route(
      req("POST", "/api/health/sync", {
        body: {
          platform: "apple-health",
          bodyMassKg: 68.4,
          daily: Array.from({ length: 8 }, (_, i) => ({ date: day(i), hrvMs: 60, restingHr: 47 })),
          workouts: [
            {
              externalId: "hk-1",
              sport: "HKWorkoutActivityTypeTrailRunning",
              startTime: new Date(Date.now() - 86_400_000).toISOString(),
              durationSec: 5400,
              distanceM: 14000,
            },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = res.data as {
      imported: number;
      inserted: number;
      days: number;
      profile: { bodyWeightKg: number; readiness: number; useSignals: boolean; syncedFrom?: string };
    };
    expect(data.imported).toBe(1);
    expect(data.inserted).toBe(1);
    expect(data.days).toBe(8);
    // Body mass and readiness land on the profile the planner actually reads.
    expect(data.profile.bodyWeightKg).toBe(68);
    expect(data.profile.useSignals).toBe(true);
    expect(data.profile.syncedFrom).toBe("Apple Health");
    // And the workout is a real activity the rest of the app can see.
    const insights = await route(req("GET", "/api/insights"));
    expect((insights.data as { hasData: boolean }).hasData).toBe(true);
  });

  it("re-syncing the same workouts does not duplicate them", async () => {
    const body = {
      platform: "google-health",
      workouts: [
        {
          externalId: "hc-1",
          sport: "RUNNING",
          startTime: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          durationSec: 3600,
        },
      ],
    };
    const first = await route(req("POST", "/api/health/sync", { body }));
    const second = await route(req("POST", "/api/health/sync", { body }));
    expect((first.data as { inserted: number }).inserted).toBe(1);
    expect((second.data as { inserted: number }).inserted).toBe(0);
  });

  it("refuses an unknown health platform and reports what it dropped", async () => {
    expect((await route(req("POST", "/api/health/sync", { body: { platform: "fitbit" } }))).status).toBe(400);
    const res = await route(
      req("POST", "/api/health/sync", {
        body: { platform: "apple-health", workouts: [{ externalId: "x", sport: "RUNNING", durationSec: 10 }] },
      }),
    );
    expect((res.data as { rejected: { workouts: number } }).rejected.workouts).toBe(1);
    expect((res.data as { imported: number }).imported).toBe(0);
  });

  it("shows a synced health platform alongside the OAuth connections", async () => {
    await route(req("POST", "/api/health/sync", { body: { platform: "apple-health", bodyMassKg: 70 } }));
    const conns = await route(req("GET", "/api/connections"));
    expect((conns.data as { connections: { provider: string }[] }).connections.map((c) => c.provider)).toContain(
      "apple-health",
    );
    // And it can be disconnected again, just like a service.
    const gone = await route(req("DELETE", "/api/connections/apple-health"));
    expect((gone.data as { connections: unknown[] }).connections).toHaveLength(0);
  });

  it("lists the on-device platforms, which are never offered as OAuth", async () => {
    const platforms = await route(req("GET", "/api/health/platforms"));
    expect((platforms.data as { platforms: { id: string }[] }).platforms.map((p) => p.id)).toEqual([
      "apple-health",
      "google-health",
    ]);
    // /api/providers reports every source, but marks how each one connects.
    const providers = (await route(req("GET", "/api/providers"))).data as { id: string; kind: string }[];
    expect(providers.find((p) => p.id === "apple-health")?.kind).toBe("device");
    expect(providers.find((p) => p.id === "strava")?.kind).toBe("oauth");
    // Starting OAuth against a device platform is refused.
    expect((await route(req("GET", "/api/oauth/apple-health/authorize-url"))).status).toBe(400);
  });

  it("ships when-to-use guidance with the catalog so every client explains it the same way", async () => {
    const res = await route(req("GET", "/api/products"));
    const data = res.data as {
      products: { id: string }[];
      usage: Record<string, { summary: string; bestWhen: string[]; avoidWhen: string[] }>;
    };
    // Every product carries guidance, including custom ones added by an admin.
    for (const p of data.products) {
      expect(data.usage[p.id]?.summary.length).toBeGreaterThan(0);
      expect(data.usage[p.id]?.bestWhen.length).toBeGreaterThan(0);
      expect(data.usage[p.id]?.avoidWhen.length).toBeGreaterThan(0);
    }
  });

  it("lets an admin add a custom Swiss product and recommends it", async () => {
    const body = { name: "Club Mix", brand: "Club", category: "drink-mix", phases: ["during"], carbsG: 80, sodiumMg: 400, multiTransportable: true };
    const created = await route(req("POST", "/api/products", { body, principal: admin }));
    expect(created.status).toBe(200);
    const list = await route(req("GET", "/api/products"));
    expect((list.data as { custom: number }).custom).toBe(1);

    // A high-carb race session should now be able to draw on the custom product.
    const rec = await route(
      req("POST", "/api/recommend", {
        body: { ...input, durationMin: 180, intensity: "race", goal: "race-preparation" },
      }),
    );
    const during = (rec.data as { phases: { phase: string; products: { brand: string }[] }[] }).phases.find(
      (p) => p.phase === "during",
    );
    expect(during?.products.some((p) => p.brand === "Club")).toBe(true);
  });

  it("forbids non-editors from adding products", async () => {
    const res = await route(req("POST", "/api/products", { body: { name: "X", brand: "Y", phases: ["during"] }, principal: athlete }));
    expect(res.status).toBe(403);
  });

  it("rejects invalid products with a 400 and a message", async () => {
    const res = await route(req("POST", "/api/products", { body: { brand: "Y", phases: ["during"] }, principal: admin }));
    expect(res.status).toBe(400);
    expect((res.data as { error: string }).error).toMatch(/name/i);
  });

  it("refuses to delete a built-in product", async () => {
    const res = await route(req("DELETE", "/api/products/sponser-competition", { principal: admin }));
    expect(res.status).toBe(400);
  });

  it("deletes a custom product", async () => {
    const body = { id: "custom-club-mix", name: "Club Mix", brand: "Club", category: "drink-mix", phases: ["during"], carbsG: 40, sodiumMg: 200 };
    await route(req("POST", "/api/products", { body, principal: admin }));
    const del = await route(req("DELETE", "/api/products/custom-club-mix", { principal: admin }));
    expect(del.status).toBe(200);
    const list = await route(req("GET", "/api/products"));
    expect((list.data as { custom: number }).custom).toBe(0);
  });

  it("forbids non-admins from the user roster", async () => {
    expect((await route(req("GET", "/api/admin/users", { principal: athlete }))).status).toBe(403);
  });

  it("lists org users for an admin", async () => {
    const res = await route(req("GET", "/api/admin/users", { principal: admin }));
    expect(res.status).toBe(200);
    const users = (res.data as { users: { orgId?: string }[] }).users;
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.orgId === "swiss-tri-club")).toBe(true);
  });

  it("invites, updates and removes a user", async () => {
    const created = await route(
      req("POST", "/api/admin/users", { body: { name: "New Athlete", email: "new@club.ch", role: "athlete", tier: "free" }, principal: admin }),
    );
    expect(created.status).toBe(200);
    const id = (created.data as { user: { id: string } }).user.id;

    const promoted = await route(req("POST", `/api/admin/users/${encodeURIComponent(id)}`, { body: { role: "coach", tier: "pro" }, principal: admin }));
    expect((promoted.data as { user: { role: string; tier: string } }).user.role).toBe("coach");
    expect((promoted.data as { user: { tier: string } }).user.tier).toBe("pro");

    const suspended = await route(req("POST", `/api/admin/users/${encodeURIComponent(id)}`, { body: { status: "suspended" }, principal: admin }));
    expect((suspended.data as { user: { status: string } }).user.status).toBe("suspended");

    const del = await route(req("DELETE", `/api/admin/users/${encodeURIComponent(id)}`, { principal: admin }));
    expect(del.status).toBe(200);
    expect((del.data as { users: { id: string }[] }).users.some((u) => u.id === id)).toBe(false);
  });

  it("rejects a duplicate email and invalid input", async () => {
    await route(req("POST", "/api/admin/users", { body: { name: "Dup", email: "dup@club.ch", role: "athlete", tier: "free" }, principal: admin }));
    const dup = await route(req("POST", "/api/admin/users", { body: { name: "Dup2", email: "dup@club.ch", role: "athlete", tier: "free" }, principal: admin }));
    expect(dup.status).toBe(400);
    const bad = await route(req("POST", "/api/admin/users", { body: { name: "", email: "x", role: "athlete", tier: "free" }, principal: admin }));
    expect(bad.status).toBe(400);
  });

  it("protects the owner account from demotion and removal", async () => {
    await route(req("POST", "/api/admin/users", { body: { name: "Owner", email: "owner@club.ch", role: "owner", tier: "elite" }, principal: admin }));
    const id = "user:owner@club.ch";
    expect((await route(req("POST", `/api/admin/users/${encodeURIComponent(id)}`, { body: { role: "athlete" }, principal: admin }))).status).toBe(400);
    expect((await route(req("DELETE", `/api/admin/users/${encodeURIComponent(id)}`, { principal: admin }))).status).toBe(400);
  });

  it("reads and updates platform settings (admin only)", async () => {
    expect((await route(req("GET", "/api/admin/settings", { principal: athlete }))).status).toBe(403);
    const get = await route(req("GET", "/api/admin/settings", { principal: admin }));
    expect(get.status).toBe(200);
    const updated = await route(req("POST", "/api/admin/settings", { body: { registrationOpen: false, defaultTier: "pro" }, principal: admin }));
    const s = (updated.data as { settings: { registrationOpen: boolean; defaultTier: string } }).settings;
    expect(s.registrationOpen).toBe(false);
    expect(s.defaultTier).toBe("pro");
  });

  it("creates a pending product order and a checkout session", async () => {
    const lines = [
      { productId: "p1", name: "Competition", brand: "Sponser", qty: 2, unitPriceChf: 2.2, lineTotalChf: 4.4 },
    ];
    const res = await route(req("POST", "/api/checkout", { body: { kind: "products", lines, returnTo: "/plan" } }));
    expect(res.status).toBe(200);
    const d = res.data as { orderId: string; url: string; amountChf: number };
    expect(d.amountChf).toBe(4.4);
    expect(d.url).toContain("/api/checkout/dev-complete");

    const list = await route(req("GET", "/api/orders"));
    const orders = (list.data as { orders: { id: string; status: string }[] }).orders;
    expect(orders.find((o) => o.id === d.orderId)?.status).toBe("pending");
  });

  it("rejects an empty cart", async () => {
    expect((await route(req("POST", "/api/checkout", { body: { kind: "products", lines: [] } }))).status).toBe(400);
  });

  it("marks an order paid only via a validly signed webhook", async () => {
    const res = await route(
      req("POST", "/api/checkout", {
        body: {
          kind: "products",
          lines: [{ productId: "p1", name: "Gel", brand: "Winforce", qty: 1, unitPriceChf: 2.6, lineTotalChf: 2.6 }],
        },
      }),
    );
    const orderId = (res.data as { orderId: string }).orderId;
    const ref = `dev_cs_${orderId}`;
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: ref } } });

    // A forged signature must not settle the order.
    const forged = await route(
      req("POST", "/api/webhooks/payments", {
        body: JSON.parse(payload),
        rawBody: payload,
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
      }),
    );
    expect(forged.status).toBe(400);
    let list = await route(req("GET", "/api/orders"));
    expect((list.data as { orders: { id: string; status: string }[] }).orders.find((o) => o.id === orderId)?.status).toBe(
      "pending",
    );

    // A correctly signed webhook settles it.
    const good = await route(
      req("POST", "/api/webhooks/payments", {
        body: JSON.parse(payload),
        rawBody: payload,
        headers: { "stripe-signature": signStripePayload(payload, "dev-webhook-secret") },
      }),
    );
    expect(good.status).toBe(200);
    list = await route(req("GET", "/api/orders"));
    expect((list.data as { orders: { id: string; status: string }[] }).orders.find((o) => o.id === orderId)?.status).toBe(
      "paid",
    );
  });

  it("upgrades the user's tier when a subscription order is paid", async () => {
    const admin2 = { ...admin, id: "club-athlete-1" };
    const res = await route(req("POST", "/api/checkout", { body: { kind: "subscription", tier: "elite" }, principal: admin2 }));
    const orderId = (res.data as { orderId: string }).orderId;
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: `dev_cs_${orderId}` } },
    });
    await route(
      req("POST", "/api/webhooks/payments", {
        body: JSON.parse(payload),
        rawBody: payload,
        headers: { "stripe-signature": signStripePayload(payload, "dev-webhook-secret") },
      }),
    );
    const users = await route(req("GET", "/api/admin/users", { principal: admin }));
    const u = (users.data as { users: { id: string; tier: string }[] }).users.find((x) => x.id === "club-athlete-1");
    expect(u?.tier).toBe("elite");
  });

  it("sends a magic link and issues a session only for a redeemed link", async () => {
    const asked = await route(req("POST", "/api/auth/email/request", { body: { email: "New@Runner.ch", returnTo: "/" } }));
    expect(asked.status).toBe(200);
    const devLink = (asked.data as { devLink?: string }).devLink!;
    expect(devLink).toContain("magic=");
    const token = decodeURIComponent(devLink.split("magic=")[1]);

    // A bad token is refused.
    expect((await route(req("POST", "/api/auth/email/verify", { body: { token: "not-a-token" } }))).status).toBe(401);

    const verified = await route(req("POST", "/api/auth/email/verify", { body: { token } }));
    expect(verified.status).toBe(200);
    const d = verified.data as { token: string; account: { email: string } };
    expect(d.account.email).toBe("new@runner.ch");
    expect(d.token.split(".").length).toBeGreaterThan(1);

    // The same link cannot be redeemed twice.
    const replay = await route(req("POST", "/api/auth/email/verify", { body: { token } }));
    expect(replay.status).toBe(401);
  });

  it("rejects an invalid email address", async () => {
    expect((await route(req("POST", "/api/auth/email/request", { body: { email: "nope" } }))).status).toBe(400);
  });

  it("serves insights (progress + fuelling score) for any client", async () => {
    await route(req("POST", "/api/ingest", { body: { provider: "garmin", days: 28 } }));
    await route(req("POST", "/api/feedback", { body: { gi: "none", energy: "strong", durationMin: 120, plannedCarbPerHourG: 60 } }));
    const res = await route(req("GET", "/api/insights"));
    expect(res.status).toBe(200);
    const d = res.data as { progress: { milestones: unknown[] }; fuelling: { score: number | null; nextActions: unknown[] }; hasData: boolean };
    expect(d.progress.milestones.length).toBeGreaterThan(0);
    expect(d.fuelling.score).not.toBeNull();
    expect(d.fuelling.nextActions.length).toBeGreaterThan(0);
    expect(d.hasData).toBe(true);
  });

  it("serves the nutrition guide content", async () => {
    const res = await route(req("GET", "/api/guide"));
    expect(res.status).toBe(200);
    const d = res.data as { articles: { keyNumbers: unknown[] }[]; categories: string[]; disclaimer: string };
    expect(d.articles.length).toBeGreaterThan(10);
    expect(d.articles[0].keyNumbers.length).toBeGreaterThan(0);
    expect(d.categories.length).toBeGreaterThan(0);
    expect(d.disclaimer).toMatch(/not medical advice/i);
  });
});

describe("sessions and connections belong to the athlete who signed in", () => {
  const other: Principal = { id: "a2", name: "B", role: "athlete", tier: "free" };
  let route: ReturnType<typeof createApiRouter>;
  beforeEach(() => {
    route = createApiRouter(createRuntime({ ...getConfig(), enabledProviders: ["garmin", "strava"] }));
  });

  const list = async (principal: Principal) => {
    const res = await route(req("GET", "/api/activities", { principal }));
    return (res.data as { activities: { id: string }[] }).activities;
  };

  it("never shows one athlete another athlete's sessions", async () => {
    await route(req("POST", "/api/ingest", { body: { provider: "strava" }, principal: athlete }));
    expect((await list(athlete)).length).toBeGreaterThan(0);
    expect(await list(other)).toEqual([]);
  });

  it("counts only the athlete's own training in insights", async () => {
    await route(req("POST", "/api/ingest", { body: { provider: "strava" }, principal: athlete }));
    const res = await route(req("GET", "/api/insights", { principal: other }));
    expect((res.data as { hasData: boolean }).hasData).toBe(false);
  });

  it("files an OAuth connect under the athlete who started it, not the request's principal", async () => {
    // The consent redirect comes back as a plain browser navigation: no session.
    // Only the one-time `state` says who this is for.
    const started = await route(req("GET", "/api/oauth/strava/authorize-url", { principal: other }));
    const { state } = started.data as { state: string };
    expect(state).toBeTruthy();

    await route(
      req("GET", "/api/oauth/strava/callback", { query: { code: "dev-code", state }, principal: athlete }),
    );

    expect((await list(other)).length).toBeGreaterThan(0);
    expect(await list(athlete)).toEqual([]);
    const conns = await route(req("GET", "/api/connections", { principal: other }));
    expect((conns.data as { connections: unknown[] }).connections).toHaveLength(1);
  });

  it("refuses to reuse a state token", async () => {
    const started = await route(req("GET", "/api/oauth/strava/authorize-url", { principal: other }));
    const { state } = started.data as { state: string };
    await route(req("GET", "/api/oauth/strava/callback", { query: { code: "dev-code", state } }));
    const before = (await list(athlete)).length;
    // A replayed state must not bind a second import to that athlete.
    await route(req("GET", "/api/oauth/strava/callback", { query: { code: "dev-code", state } }));
    expect((await list(other)).length).toBeGreaterThan(0);
    expect((await list(athlete)).length).toBeGreaterThan(before);
  });
});

describe("affiliate — the Phase-1 revenue path", () => {
  let route: ReturnType<typeof createApiRouter>;
  beforeEach(() => {
    route = createApiRouter(createRuntime({ ...getConfig(), enabledProviders: ["garmin", "strava"] }));
  });

  const lines = [
    { productId: "sponser-liquid-energy-plus", name: "Liquid Energy Plus", brand: "Sponser", qty: 2, unitPriceChf: 2.8, lineTotalChf: 5.6 },
    { productId: "winforce-carbo-load", name: "Carbo Load", brand: "Winforce", qty: 1, unitPriceChf: 2.4, lineTotalChf: 2.4 },
  ];

  const signPartner = () =>
    route(
      req("POST", "/api/admin/settings", {
        principal: admin,
        body: {
          partners: [
            { brand: "Sponser", shopUrl: "https://sponser.ch", refParam: "aff", refValue: "fuellabs", commissionRate: 0.09, cookieDays: 45 },
          ],
        },
      }),
    );

  it("still sends the athlete to the shop when nothing is signed, and earns nothing", async () => {
    const res = await route(req("POST", "/api/affiliate/links", { body: { lines } }));
    const { links, partnered } = res.data as { links: { url: string; tracked: boolean }[]; partnered: boolean };
    expect(partnered).toBe(false);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.tracked).toBe(false);
      expect(l.url).not.toContain("aff=");
    }
  });

  it("attaches attribution once a brand is signed — and only for that brand", async () => {
    await signPartner();
    const res = await route(req("POST", "/api/affiliate/links", { body: { lines } }));
    const { links } = res.data as { links: { brand: string; url: string; tracked: boolean; commissionChf?: number }[] };
    const sponser = links.find((l) => l.brand === "Sponser")!;
    const winforce = links.find((l) => l.brand === "Winforce")!;
    expect(sponser.tracked).toBe(true);
    expect(sponser.url).toContain("aff=fuellabs");
    expect(sponser.url).toContain("subid=");
    expect(sponser.commissionChf).toBe(0.5);
    expect(winforce.tracked).toBe(false);
    expect(winforce.url).not.toContain("aff=");
  });

  it("decides for itself whether a click can earn — the client does not get to say", async () => {
    // A client claiming `tracked: true` for an unsigned brand must be ignored.
    const res = await route(
      req("POST", "/api/affiliate/click", {
        body: { productId: "winforce-carbo-load", brand: "Winforce", valueChf: 2.4, tracked: true },
      }),
    );
    expect((res.data as { tracked: boolean }).tracked).toBe(false);
  });

  it("reports potential commission to an admin, never revenue we were not paid", async () => {
    await signPartner();
    await route(req("POST", "/api/affiliate/click", { body: { productId: "p", brand: "Sponser", valueChf: 100 } }));
    await route(req("POST", "/api/affiliate/click", { body: { productId: "p", brand: "Winforce", valueChf: 100 } }));
    const res = await route(req("GET", "/api/affiliate/summary", { principal: admin }));
    const { summary } = res.data as { summary: { clicks: number; trackedClicks: number; potentialCommissionChf: number } };
    expect(summary.clicks).toBe(2);
    expect(summary.trackedClicks).toBe(1);
    expect(summary.potentialCommissionChf).toBe(9);
  });

  it("keeps the ledger away from athletes", async () => {
    const res = await route(req("GET", "/api/affiliate/summary"));
    expect(res.status).toBe(403);
  });
});

describe("crunching: load analytics and the cohort", () => {
  let route: ReturnType<typeof createApiRouter>;
  beforeEach(() => {
    route = createApiRouter(createRuntime({ ...getConfig(), enabledProviders: ["garmin", "strava"] }));
  });

  const logAt = async (principal: Principal, actualCarbPerHourG: number, gi: "none" | "mild" | "severe") =>
    route(
      req("POST", "/api/feedback", {
        principal,
        body: { gi, energy: "steady", durationMin: 180, plannedCarbPerHourG: 80, actualCarbPerHourG },
      }),
    );

  it("pools outcomes across athletes, not just the one asking", async () => {
    const a: Principal = { id: "u-a", name: "A", role: "athlete", tier: "free" };
    const b: Principal = { id: "u-b", name: "B", role: "athlete", tier: "free" };
    for (let i = 0; i < 8; i++) await logAt(a, 90, i < 2 ? "severe" : "none");
    for (let i = 0; i < 8; i++) await logAt(b, 92, i < 2 ? "mild" : "none");

    const res = await route(req("GET", "/api/cohort", { query: { carbPerHourG: "90" }, principal: a }));
    const { prior, total } = res.data as { prior: { n: number; known: boolean; distressRate: number }; total: number };
    // Neither athlete alone reaches the threshold; together they do.
    expect(total).toBe(16);
    expect(prior.n).toBe(16);
    expect(prior.known).toBe(true);
    expect(prior.distressRate).toBe(0.25);
  });

  it("returns nothing identifying — a band, an outcome and a count", async () => {
    const a: Principal = { id: "u-a", name: "A", role: "athlete", tier: "free" };
    await logAt(a, 90, "severe");
    const res = await route(req("GET", "/api/cohort", { principal: a }));
    const body = JSON.stringify(res.data);
    expect(body).not.toContain("u-a");
    expect(body).not.toContain("severe");
  });

  it("says it does not know rather than guessing from three logs", async () => {
    const a: Principal = { id: "u-a", name: "A", role: "athlete", tier: "free" };
    for (let i = 0; i < 3; i++) await logAt(a, 90, "severe");
    const res = await route(req("GET", "/api/cohort", { query: { carbPerHourG: "90" }, principal: a }));
    const { prior } = res.data as { prior: { known: boolean; text: string } };
    expect(prior.known).toBe(false);
    expect(prior.text).toMatch(/not enough/i);
  });

  it("computes fitness, fatigue and form from the athlete's own sessions only", async () => {
    const a: Principal = { id: "u-a", name: "A", role: "athlete", tier: "free" };
    const b: Principal = { id: "u-b", name: "B", role: "athlete", tier: "free" };
    await route(req("POST", "/api/ingest", { body: { provider: "strava", days: 60 }, principal: a }));

    const mine = await route(req("GET", "/api/load", { principal: a }));
    const theirs = await route(req("GET", "/api/load", { principal: b }));
    const m = mine.data as { fitness: number; reliable: boolean; series: unknown[]; flags: unknown[] };
    const t2 = theirs.data as { fitness: number; reliable: boolean };
    expect(m.fitness).toBeGreaterThan(0);
    expect(m.reliable).toBe(true);
    expect(Array.isArray(m.flags)).toBe(true);
    // Another athlete's training must not appear in this one's numbers.
    expect(t2.fitness).toBe(0);
    expect(t2.reliable).toBe(false);
  });

  it("does not ship the whole daily history to the client", async () => {
    const a: Principal = { id: "u-a", name: "A", role: "athlete", tier: "free" };
    await route(req("POST", "/api/ingest", { body: { provider: "strava", days: 120 }, principal: a }));
    const res = await route(req("GET", "/api/load", { principal: a }));
    expect((res.data as { series: unknown[] }).series.length).toBeLessThanOrEqual(90);
  });
});

describe("public engine API (/v1)", () => {
  let route: ReturnType<typeof createApiRouter>;
  const owner: Principal = { id: "o1", name: "Owner", role: "owner", orgId: "fuel-labs", tier: "elite" };

  const session = {
    goal: "race-preparation",
    activity: "trail-running",
    intensity: "race",
    durationMin: 240,
    bodyWeightKg: 70,
  };

  /** Issue a key through the admin endpoint, the way an operator actually would. */
  async function issue(over: Record<string, unknown> = {}): Promise<string> {
    const res = await route(
      req("POST", "/api/keys", { principal: owner, body: { tenantId: "garmin", name: "pilot", ...over } }),
    );
    expect(res.status).toBe(201);
    return (res.data as { secret: string }).secret;
  }

  beforeEach(() => {
    route = createApiRouter(createRuntime({ ...getConfig(), enabledProviders: ["garmin"] }));
  });

  it("refuses an unauthenticated call — this is not an open endpoint", async () => {
    const res = await route(req("POST", "/v1/plan", { body: session }));
    expect(res.status).toBe(401);
    expect((res.data as { error: string }).error).toBe("unauthorized");
  });

  it("refuses a key that was never issued", async () => {
    const res = await route(req("POST", "/v1/plan", { body: session, headers: { "x-api-key": "ygf_test_made_up" } }));
    expect(res.status).toBe(401);
  });

  it("answers a valid key, and takes it from either header", async () => {
    const secret = await issue();
    const forms: Record<string, string>[] = [{ "x-api-key": secret }, { authorization: `Bearer ${secret}` }];
    for (const headers of forms) {
      const res = await route(req("POST", "/v1/plan", { body: session, headers }));
      expect(res.status).toBe(200);
      expect((res.data as { target: { carbPerHourG: number } }).target.carbPerHourG).toBeGreaterThan(0);
    }
  });

  it("separates 'who are you' from 'not with that key'", async () => {
    // A plan-only key must not reach the course endpoint, and the status has to
    // say why — a partner debugging an integration needs to tell them apart.
    const secret = await issue({ scopes: ["plan"] });
    const res = await route(
      req("POST", "/v1/course", { body: { session, route: [] }, headers: { "x-api-key": secret } }),
    );
    expect(res.status).toBe(403);
    expect((res.data as { error: string }).error).toBe("insufficient_scope");
  });

  it("lets meta through on any valid key, so a partner can discover their own scopes", async () => {
    const secret = await issue({ scopes: ["course"] });
    const res = await route(req("GET", "/v1/meta", { headers: { "x-api-key": secret } }));
    expect(res.status).toBe(200);
    expect((res.data as { scopes: string[] }).scopes).toEqual(["course"]);
  });

  it("rate-limits per key and says when to come back", async () => {
    const secret = await issue({ rateLimitPerMin: 3 });
    const call = () => route(req("POST", "/v1/plan", { body: session, headers: { "x-api-key": secret } }));
    for (let i = 0; i < 3; i++) expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect((limited.data as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
  });

  it("stops serving a revoked key immediately", async () => {
    const secret = await issue();
    const list = await route(req("GET", "/api/keys", { principal: owner }));
    const id = (list.data as { keys: { id: string }[] }).keys[0].id;

    expect((await route(req("POST", "/v1/plan", { body: session, headers: { "x-api-key": secret } }))).status).toBe(200);
    await route(req("DELETE", `/api/keys/${id}`, { principal: owner }));
    const after = await route(req("POST", "/v1/plan", { body: session, headers: { "x-api-key": secret } }));
    expect(after.status).toBe(401);
  });

  it("never returns a hash or a usable secret when listing keys", async () => {
    const secret = await issue();
    const res = await route(req("GET", "/api/keys", { principal: owner }));
    const body = JSON.stringify(res.data);
    expect(body).not.toContain("hash");
    // The whole secret must be gone. The prefix stays on purpose — it is how an
    // operator tells two keys apart in a list — so the test that matters is
    // that it is a prefix and not the key.
    expect(body).not.toContain(secret);
    const [key] = (res.data as { keys: { prefix: string }[] }).keys;
    expect(secret.startsWith(key.prefix)).toBe(true);
    expect(key.prefix.length).toBeLessThanOrEqual(16);
    expect(secret.length - key.prefix.length).toBeGreaterThan(20);
  });

  it("counts usage against the tenant, for the licence conversation", async () => {
    const secret = await issue();
    await route(req("POST", "/v1/plan", { body: session, headers: { "x-api-key": secret } }));
    await route(req("POST", "/v1/heat", { body: { bodyWeightKg: 70, intensity: "race", temperatureC: 28, humidityPct: 60 }, headers: { "x-api-key": secret } }));
    const res = await route(req("GET", "/api/keys", { principal: owner }));
    const usage = (res.data as { usage: { calls: Record<string, number>; total: number }[] }).usage;
    expect(usage[0].total).toBe(2);
    expect(usage[0].calls).toEqual({ plan: 1, heat: 1 });
  });

  it("keeps an anonymous caller out of key administration entirely", async () => {
    // The transport resolves `x-role` to a principal only where demo role
    // switching is on; with no session at all, the request arrives as an
    // anonymous athlete and must get nowhere near issuing a credential.
    const anon: Principal = { id: "anon", name: "Anonymous", role: "athlete", tier: "free" };
    expect((await route(req("GET", "/api/keys", { principal: anon }))).status).toBe(403);
    expect((await route(req("POST", "/api/keys", { principal: anon, body: { tenantId: "x", name: "y" } }))).status).toBe(403);
    expect((await route(req("DELETE", "/api/keys/k_1", { principal: anon }))).status).toBe(403);
  });

  it("keeps key administration to an owner", async () => {
    const res = await route(req("POST", "/api/keys", { principal: athlete, body: { tenantId: "x", name: "y" } }));
    expect(res.status).toBe(403);
  });

  it("requires a tenant, so usage is always attributable to someone", async () => {
    const res = await route(req("POST", "/api/keys", { principal: owner, body: { name: "orphan" } }));
    expect(res.status).toBe(400);
  });

  it("answers the same on both deployments, however the platform rewrites the path", async () => {
    // Vercel delivers /v1/plan as /api/v1/plan. One router, one answer.
    const secret = await issue();
    const direct = await route(req("POST", "/v1/plan", { body: session, headers: { "x-api-key": secret } }));
    const rewritten = await route(req("POST", "/api/v1/plan", { body: session, headers: { "x-api-key": secret } }));
    expect(direct.status).toBe(200);
    expect(rewritten.status).toBe(200);
    expect((rewritten.data as { target: unknown }).target).toEqual((direct.data as { target: unknown }).target);
  });

  it("404s an unknown v1 endpoint rather than falling through to an app route", async () => {
    const secret = await issue();
    const res = await route(req("GET", "/v1/activities", { headers: { "x-api-key": secret } }));
    expect(res.status).toBe(404);
  });
});

describe("API hardening", () => {
  let route: ReturnType<typeof createApiRouter>;
  beforeEach(() => {
    route = createApiRouter(createRuntime({ ...getConfig(), enabledProviders: ["garmin", "strava"] }));
  });

  it("protects an inbox from being flooded through us", async () => {
    // The thing being abused is the recipient's inbox, so that is what carries
    // the tight budget.
    const send = (email: string, ip = "1.2.3.4") =>
      route(req("POST", "/api/auth/email/request", { body: { email, returnTo: "/" }, clientIp: ip }));
    for (let i = 0; i < 3; i++) expect((await send("victim@club.ch")).status).toBe(200);

    const blocked = await send("victim@club.ch");
    expect(blocked.status).toBe(429);
    // The header is what a client and a proxy read; a number in the body alone
    // is decoration.
    expect(blocked.headers?.["retry-after"]).toMatch(/^\d+$/);
    expect((blocked.data as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);

    // Another address is unaffected, even from the same caller.
    expect((await send("someone-else@club.ch")).status).toBe(200);
  });

  it("does not lock out a whole office sharing one address", async () => {
    // A university, a company and a mobile carrier all put many people behind
    // one IP. A tight per-IP limit there is an outage, not a security control.
    const send = (email: string) =>
      route(req("POST", "/api/auth/email/request", { body: { email, returnTo: "/" }, clientIp: "10.0.0.1" }));
    for (let i = 0; i < 12; i++) {
      expect((await send(`colleague-${i}@club.ch`)).status, `request ${i} from a shared address`).toBe(200);
    }
  });

  it("does not let the sign-in endpoint reveal who has an account", async () => {
    // With registration closed, a stranger and a member must be answered the
    // same way, or the endpoint becomes a membership oracle for any address.
    const rt = createRuntime({ ...getConfig() });
    await rt.settings.update({ registrationOpen: false });
    const r = createApiRouter(rt);

    const stranger = await r(req("POST", "/api/auth/email/request", { body: { email: "nobody@example.ch" }, clientIp: "9.9.9.1" }));
    await rt.users.create({
      id: "user:member@club.ch",
      name: "Member",
      email: "member@club.ch",
      role: "athlete",
      tier: "free",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    const member = await r(req("POST", "/api/auth/email/request", { body: { email: "member@club.ch" }, clientIp: "9.9.9.2" }));

    expect(stranger.status).toBe(member.status);
    expect((stranger.data as { sent: boolean }).sent).toBe((member.data as { sent: boolean }).sent);
    // Only the mail differs, and only its recipient can observe that.
    expect((stranger.data as { devLink?: string }).devLink).toBeUndefined();
    expect((member.data as { devLink?: string }).devLink).toBeTruthy();
  });

  it("returns a reference instead of the internal failure text", async () => {
    // A raw error message carries whatever the failure happened to say: a
    // Postgres error carries the query, a filesystem error carries a path.
    const rt = createRuntime({ ...getConfig() });
    rt.store.count = async () => {
      throw new Error("connection to database ygf_prod at 10.4.2.9 failed: password authentication failed");
    };
    const r = createApiRouter(rt);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await r(req("GET", "/api/health"));
      expect(res.status).toBe(500);
      const body = JSON.stringify(res.data);
      expect(body).not.toMatch(/password|10\.4\.2\.9|ygf_prod/);
      expect((res.data as { reference: string }).reference).toMatch(/^e_/);
      // The detail is not lost — it goes where we can read it, tagged with the
      // same reference so a support question is answerable.
      expect(spy.mock.calls[0]?.join(" ")).toMatch(/password authentication failed/);
      expect(spy.mock.calls[0]?.join(" ")).toContain((res.data as { reference: string }).reference);
    } finally {
      spy.mockRestore();
    }
  });

  it("limits an ingest, which spends a third party's quota as well as ours", async () => {
    const body = { provider: "garmin", days: 7 };
    for (let i = 0; i < 10; i++) {
      // Assert success, not merely "not 429" — a 400 would satisfy that and
      // prove nothing about the limit.
      expect((await route(req("POST", "/api/ingest", { body }))).status).toBe(200);
    }
    expect((await route(req("POST", "/api/ingest", { body }))).status).toBe(429);
  });

  it("leaves ordinary reads unlimited", async () => {
    // A limit on the endpoints an athlete uses constantly would be a bug, not
    // protection.
    for (let i = 0; i < 40; i++) {
      expect((await route(req("GET", "/api/health"))).status).toBe(200);
    }
  });

  it("keeps the public API's 429 carrying a Retry-After header too", async () => {
    const owner: Principal = { id: "o1", name: "Owner", role: "owner", orgId: "fuel-labs", tier: "elite" };
    const issued = await route(
      req("POST", "/api/keys", { principal: owner, body: { tenantId: "t", name: "n", rateLimitPerMin: 1 } }),
    );
    const secret = (issued.data as { secret: string }).secret;
    const call = () =>
      route(
        req("POST", "/v1/plan", {
          body: { activity: "running", intensity: "race", durationMin: 120, bodyWeightKg: 70 },
          headers: { "x-api-key": secret },
        }),
      );
    expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.headers?.["retry-after"]).toMatch(/^\d+$/);
  });
});
