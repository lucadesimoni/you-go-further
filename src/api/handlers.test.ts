import { describe, expect, it, beforeEach, vi } from "vitest";
import { createApiRouter, type ApiRequest } from "./handlers";
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
});
