/**
 * HTTP API router — pure and transport-agnostic.
 *
 * It reuses the very same domain modules the browser uses (engine, analysis,
 * data pipeline, subscription, auth), proving there is one implementation behind
 * both the client-side app and the server. `server/index.ts` wraps this with Node
 * `http`; tests exercise it directly with no sockets.
 */

import {
  recommend,
  buildSchedule,
  computeTarget,
  idealOffering,
  productUsage,
  normalizeProduct,
  mergeCatalog,
  CATALOG,
} from "../engine";
import type { AthleteInput, Product } from "../engine";
import {
  buildCart,
  newProductOrder,
  newSubscriptionOrder,
  outboundLinks,
  summarise,
  type AffiliateClick,
  type CartLine,
  type Order,
} from "../commerce";
import { deriveAdaptation, type EnergyRating, type GiRating, type SessionFeedback } from "../feedback";
import { analyze, derivePhysiology } from "../analysis";
import { generateSampleWellness } from "../providers";
import { lastNDays } from "../data";
import type { ProviderId } from "../model";
import { createRuntime, type Runtime } from "../runtime";
import { PLANS, TIER_ORDER } from "../subscription";
import { authorize, ForbiddenError, ROLE_LABELS, type Principal, type Role } from "../auth";
import { signSession, DEV_AUTH_SECRET } from "../auth/jwt";
import { createMagicToken, verifyMagicToken, magicLinkUrl, isEmail } from "../auth/magicLink";
import { verifyGoogleIdToken, verifyAppleIdToken } from "../auth/oidcVerify";
import type { Tier } from "../subscription";
import { DESCRIPTORS, ALL_PROVIDER_IDS, ALL_SOURCE_IDS, DEVICE_PLATFORM_IDS } from "../providers";
import { normalizeNewUser, normalizeUserPatch, type NewUser, type UserPatch } from "../users";
import type { PlatformSettings } from "../settings";
import type { AthleteProfile } from "../users";
import { computeProgress, fuellingScore } from "../progress";
import { normalizeHealthSync, profileUpdateFromSync } from "../health";
import { NUTRITION_GUIDE, GUIDE_CATEGORIES, GUIDE_DISCLAIMER } from "../content/nutritionGuide";

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
  /** Unparsed request body — required to verify payment webhook signatures. */
  rawBody?: string;
  headers?: Record<string, string>;
  principal: Principal;
}

export interface ApiResponse {
  status: number;
  data: unknown;
}

const getEnv = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

const ok = (data: unknown): ApiResponse => ({ status: 200, data });
const bad = (message: string): ApiResponse => ({ status: 400, data: { error: message } });
const notFound = (): ApiResponse => ({ status: 404, data: { error: "Not found" } });

function asAthleteInput(body: unknown): AthleteInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Partial<AthleteInput>;
  if (typeof b.durationMin !== "number" || typeof b.bodyWeightKg !== "number" || !b.goal || !b.activity || !b.intensity) {
    return null;
  }
  return b as AthleteInput;
}

/** Build a router bound to a runtime (its in-memory store persists per process). */
const GI_RATINGS: GiRating[] = ["none", "mild", "severe"];
const ENERGY_RATINGS: EnergyRating[] = ["bonked", "faded", "steady", "strong"];

export function createApiRouter(runtime: Runtime = createRuntime()) {
  const { config, store, pipeline, feedback, registry, connections, products, users, settings, orders, affiliate, magicLinks, profiles, payments, mailer } = runtime;

  const isProvider = (v: string): v is ProviderId => (ALL_PROVIDER_IDS as string[]).includes(v);

  /** Apply a payment outcome: mark the order and, for plans, move the user's tier. */
  async function settleOrder(order: Order, outcome: "paid" | "failed"): Promise<void> {
    if (order.status === "paid") return; // idempotent — webhooks can repeat
    await orders.update(order.id, {
      status: outcome,
      paidAt: outcome === "paid" ? new Date().toISOString() : undefined,
    });
    if (outcome === "paid" && order.kind === "subscription" && order.tier) {
      // Someone has paid: the entitlement must land, so if there is no user
      // record yet we create one rather than dropping the upgrade on the floor.
      const updated = await users.update(order.userId, { tier: order.tier });
      if (!updated) {
        await users.create({
          id: order.userId,
          name: order.userId,
          email: "",
          role: "athlete",
          tier: order.tier,
          status: "active",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * The athlete's *current* identity and entitlement.
   *
   * The session token carries the tier from the moment they signed in, so after
   * an upgrade it is stale — without this the athlete pays and keeps seeing the
   * free plan until they sign out and back in. The stored user record is the
   * authority; the token only proves who they are.
   */
  async function currentPrincipal(p: Principal): Promise<Principal> {
    const user = await users.get(p.id);
    if (!user) return p;
    return { ...p, role: user.role, tier: user.tier, orgId: user.orgId ?? p.orgId };
  }

  /**
   * OAuth `state` → the athlete who started the flow.
   *
   * A provider consent screen sends the browser back as a *top-level
   * navigation*, which carries no Authorization header — so the callback cannot
   * tell who it is for. Binding the identity to the one-time `state` value is
   * what `state` is for, and it keeps the session token out of URLs (where it
   * would land in server logs and Referer headers). Single-use, 10 minutes.
   */
  const oauthStates = new Map<string, { userId: string; at: number }>();
  const STATE_TTL_MS = 10 * 60 * 1000;
  function mintState(userId: string): string {
    const now = Date.now();
    for (const [k, v] of oauthStates) if (now - v.at > STATE_TTL_MS) oauthStates.delete(k);
    const state = `${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    oauthStates.set(state, { userId, at: now });
    return state;
  }
  function claimState(state: string | undefined): string | undefined {
    if (!state) return undefined;
    const entry = oauthStates.get(state);
    if (!entry) return undefined;
    oauthStates.delete(state);
    return Date.now() - entry.at > STATE_TTL_MS ? undefined : entry.userId;
  }

  return async function route(req: ApiRequest): Promise<ApiResponse> {
    const { method, path, query, body, rawBody, headers, principal } = req;
    const key = `${method} ${path}`;
    const segs = path.split("/").filter(Boolean); // ["api","oauth","strava","callback"]

    try {
      // --- OAuth connect flow: /api/oauth/:provider/(authorize-url|dev-consent|callback) ---
      if (segs[0] === "api" && segs[1] === "oauth" && method === "GET") {
        const provider = segs[2];
        const action = segs[3];
        if (!provider || !isProvider(provider)) return bad("Unknown provider");
        const prov = registry.get(provider);
        const configured = Boolean(prov.exchangeToken); // real adapter present

        if (action === "start") {
          // Top-level navigation entry point: 302 the browser to the provider's
          // consent screen (or the dev stub), which returns to the callback.
          // The caller should mint `state` from `authorize-url` first — that is
          // the only step that knows who is signing in.
          const returnTo = query.return_to ?? "";
          const state = query.state ?? mintState(principal.id);
          const hasCreds = Boolean(getEnv(`${provider.toUpperCase()}_CLIENT_ID`));
          const redirect = hasCreds
            ? prov.authorizeUrl(query.redirect_uri ?? `/api/oauth/${provider}/callback`, state)
            : `/api/oauth/${provider}/dev-consent?return_to=${encodeURIComponent(returnTo)}&state=${state}`;
          return { status: 302, data: { redirect } };
        }

        if (action === "authorize-url") {
          const returnTo = query.return_to ?? "";
          // Authenticated call: bind the flow to this athlete, so whatever comes
          // back from the provider lands on their account and nobody else's.
          const state = mintState(principal.id);
          // Dev (or no real adapter): route to a local consent stub so the flow
          // completes without a registered app. Prod: the real provider URL.
          const hasCreds = Boolean(getEnv(`${provider.toUpperCase()}_CLIENT_ID`));
          const redirectUri = query.redirect_uri ?? `/api/oauth/${provider}/callback`;
          const authorizeUrl = hasCreds
            ? prov.authorizeUrl(redirectUri, state)
            : `/api/oauth/${provider}/dev-consent?return_to=${encodeURIComponent(returnTo)}&state=${state}`;
          return ok({ authorizeUrl, configured, live: hasCreds, redirectUri, state });
        }

        if (action === "dev-consent") {
          // Stand-in for the provider's consent screen (dev only). It must hand
          // `state` on to the callback exactly as a real provider would.
          const returnTo = query.return_to ?? "";
          const state = query.state ? `&state=${encodeURIComponent(query.state)}` : "";
          return {
            status: 302,
            data: {
              redirect: `/api/oauth/${provider}/callback?code=dev-code&return_to=${encodeURIComponent(returnTo)}${state}`,
            },
          };
        }

        if (action === "callback") {
          const code = query.code ?? "";
          if (!code) return bad("Missing authorization code");
          const cred = prov.exchangeToken
            ? await prov.exchangeToken(code, query.redirect_uri ?? "")
            : { provider, accessToken: `dev-${provider}-token` };
          // Who this is for comes from the one-time `state`, not the request:
          // a consent redirect carries no session, so trusting the request's
          // principal would file another athlete's training under the demo user.
          const ownerId = claimState(query.state) ?? principal.id;
          await connections.save(ownerId, cred);
          const activities = await prov.fetchActivities(cred, lastNDays(28));
          const inserted = await store.upsert(activities, ownerId);
          if (query.return_to) {
            const sep = query.return_to.includes("?") ? "&" : "?";
            return { status: 302, data: { redirect: `${query.return_to}${sep}connected=${provider}` } };
          }
          return ok({ connected: true, provider, imported: activities.length, inserted });
        }
        return notFound();
      }

      // --- Affiliate: hand the athlete to a partner shop, and keep the trail ---
      if (key === "POST /api/affiliate/links") {
        // Turn cart lines into outbound links. Done server-side because the
        // partner programs (and our publisher ids) live in platform settings,
        // which the browser has no business holding.
        const b = (body ?? {}) as { lines?: CartLine[] };
        const lines = Array.isArray(b.lines) ? b.lines.slice(0, 60) : [];
        const catalog = mergeCatalog(await products.list());
        const byId = new Map(catalog.map((p) => [p.id, p]));
        const { partners } = await settings.get();
        const links = outboundLinks(lines, byId, partners, `${principal.id}-${Date.now().toString(36)}`);
        return ok({ links, partnered: partners.length > 0 });
      }

      if (key === "POST /api/affiliate/click") {
        const b = (body ?? {}) as Partial<AffiliateClick>;
        if (typeof b.productId !== "string" || typeof b.brand !== "string") return bad("productId and brand required");
        const { partners } = await settings.get();
        const click: AffiliateClick = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          userId: principal.id,
          productId: b.productId.slice(0, 120),
          brand: b.brand.slice(0, 80),
          // Whether this can earn is ours to decide, never the client's.
          tracked: partners.some((p) => p.brand.toLowerCase() === String(b.brand).toLowerCase()),
          valueChf: typeof b.valueChf === "number" && Number.isFinite(b.valueChf) ? Math.max(0, Math.round(b.valueChf * 100) / 100) : 0,
          at: new Date().toISOString(),
        };
        await affiliate.record(click);
        return ok({ recorded: true, tracked: click.tracked });
      }

      if (key === "GET /api/affiliate/summary") {
        authorize(principal, "org:configure");
        const { partners } = await settings.get();
        return ok({ summary: summarise(await affiliate.list(), partners), partners });
      }

      // --- Product library: browse (merged) + admin CRUD of custom products ---
      if (segs[0] === "api" && segs[1] === "products") {
        const custom = await products.list();
        // GET /api/products → the full merged catalog every athlete browses,
        // flagged so the UI can show built-in vs. house products.
        if (method === "GET" && segs.length === 2) {
          const merged = mergeCatalog(custom);
          // `usage` travels alongside (rather than inside) each product so the
          // Product shape stays pure, and every client — web or mobile — shows
          // the same "when to use this" guidance from the same function.
          const usage: Record<string, ReturnType<typeof productUsage>> = {};
          for (const p of merged) usage[p.id] = productUsage(p);
          return ok({ products: merged, usage, builtIn: CATALOG.length, custom: custom.length });
        }
        // POST /api/products → add or edit a custom product (admin / nutritionist).
        if (method === "POST" && segs.length === 2) {
          authorize(principal, "catalog:edit");
          let product: Product;
          try {
            product = normalizeProduct((body ?? {}) as Partial<Product>);
          } catch (e) {
            return bad(e instanceof Error ? e.message : "Invalid product");
          }
          const saved = await products.upsert(product);
          return ok({ product: saved, products: mergeCatalog(await products.list()) });
        }
        // DELETE /api/products/:id → remove a custom product (built-ins are fixed).
        if (method === "DELETE" && segs.length === 3) {
          authorize(principal, "catalog:edit");
          const id = segs[2];
          if (CATALOG.some((p) => p.id === id) && !custom.some((p) => p.id === id)) {
            return bad("Built-in products can't be deleted — override its values instead.");
          }
          await products.remove(id);
          return ok({ products: mergeCatalog(await products.list()) });
        }
      }



      // --- Insights: progress + fuelling score, computed server-side so every
      // client (web, mobile) shows exactly the same numbers ------------------
      if (key === "GET /api/insights") {
        const [acts, logs, prof, conns] = await Promise.all([
          store.query({ userId: principal.id }),
          feedback.list(principal.id),
          profiles.get(principal.id),
          connections.list(principal.id),
        ]);
        const longSessions = acts.filter((a) => a.durationSec >= 90 * 60).length;
        return ok({
          progress: computeProgress({
            activities: acts,
            feedbackCount: logs.length,
            connectionsCount: conns.length,
            hasMeasuredSweatRate: prof.useSignals,
          }),
          fuelling: fuellingScore({
            feedback: logs,
            longSessions,
            connectionsCount: conns.length,
            hasMeasuredSweatRate: prof.useSignals,
          }),
          hasData: acts.length > 0,
        });
      }

      // --- Nutrition guide content (shared by web and mobile) ---------------
      if (key === "GET /api/guide") {
        return ok({ articles: NUTRITION_GUIDE, categories: GUIDE_CATEGORIES, disclaimer: GUIDE_DISCLAIMER });
      }

      // --- On-device health platforms (Apple Health / Health Connect) -------
      // These have no server-to-server API, so the phone reads the samples and
      // posts them here. Everything after that is server-side, so the numbers
      // match what the web app shows.
      if (key === "POST /api/health/sync") {
        const sync = normalizeHealthSync(body);
        if (!sync) return bad("Unknown health platform or malformed payload.");
        const inserted = await store.upsert(sync.activities, principal.id);
        const update = profileUpdateFromSync(sync, DESCRIPTORS[sync.platform].displayName);
        // Real measured signals beat the population estimate — but only say so
        // when something actually came back.
        const profile = await profiles.save(principal.id, {
          ...update,
          ...(update.readiness !== undefined ? { useSignals: true } : {}),
        });
        // Record it as a connection so it appears next to the OAuth services.
        await connections.save(principal.id, { provider: sync.platform, accessToken: "on-device" });
        return ok({
          platform: sync.platform,
          imported: sync.activities.length,
          inserted,
          days: sync.wellness.length,
          rejected: sync.rejected,
          profile,
        });
      }

      // GET /api/health/platforms — the on-device platforms and their state.
      if (key === "GET /api/health/platforms") {
        const conns = await connections.list(principal.id);
        return ok({
          platforms: DEVICE_PLATFORM_IDS.map((id) => ({
            id,
            displayName: DESCRIPTORS[id].displayName,
            capabilities: DESCRIPTORS[id].capabilities,
            syncNote: DESCRIPTORS[id].syncNote,
            connectedAt: conns.find((c) => c.provider === id)?.connectedAt,
          })),
        });
      }

      // --- Athlete profile (per user, follows them across devices) ---------
      if (key === "GET /api/profile") return ok({ profile: await profiles.get(principal.id) });
      if (key === "POST /api/profile") {
        return ok({ profile: await profiles.save(principal.id, (body ?? {}) as Partial<AthleteProfile>) });
      }

      // --- Passwordless email sign-in --------------------------------------
      // POST /api/auth/email/request — mail a signed, expiring, single-use link.
      if (key === "POST /api/auth/email/request") {
        const b = (body ?? {}) as { email?: string; returnTo?: string };
        const email = (b.email ?? "").trim().toLowerCase();
        if (!isEmail(email)) return bad("Please enter a valid email address.");
        const platform = await settings.get();
        const known = await users.get(`user:${email}`);
        if (!platform.registrationOpen && !known) {
          return bad("Registration is closed. Ask an admin for an invitation.");
        }
        const secret = getEnv("AUTH_SECRET") ?? DEV_AUTH_SECRET;
        const token = createMagicToken(email, secret);
        const link = magicLinkUrl(b.returnTo || "/", token);
        await mailer.send({
          to: email,
          subject: "Your You Go Further sign-in link",
          text: `Sign in here (valid 15 minutes, one use):\n\n${link}`,
        });
        // Only the console (dev) mailer echoes the link back to the caller.
        return ok({ sent: true, devLink: mailer.id === "console" ? link : undefined });
      }

      // POST /api/auth/email/verify — redeem the link and issue a real session.
      if (key === "POST /api/auth/email/verify") {
        const b = (body ?? {}) as { token?: string };
        const secret = getEnv("AUTH_SECRET") ?? DEV_AUTH_SECRET;
        const claims = b.token ? verifyMagicToken(b.token, secret) : null;
        if (!claims) return { status: 401, data: { error: "That link is invalid or has expired." } };
        if (!(await magicLinks.consume(claims.jti, claims.exp))) {
          return { status: 401, data: { error: "That link has already been used." } };
        }
        const id = `user:${claims.email}`;
        let user = await users.get(id);
        if (!user) {
          const platform = await settings.get();
          user = await users.create({
            id,
            name: claims.email.split("@")[0],
            email: claims.email,
            role: "athlete",
            tier: platform.defaultTier,
            status: "active",
            createdAt: new Date().toISOString(),
          });
        }
        if (user.status === "suspended") return { status: 403, data: { error: "This account is suspended." } };
        const token = signSession(
          { sub: user.id, name: user.name, email: user.email, role: user.role, tier: user.tier, orgId: user.orgId },
          secret,
        );
        return ok({ token, account: { id: user.id, name: user.name, email: user.email, role: user.role, tier: user.tier } });
      }

      // --- Checkout & payments ---------------------------------------------
      if (segs[0] === "api" && segs[1] === "checkout") {
        // POST /api/checkout — create a pending order + a provider checkout session.
        if (method === "POST" && segs.length === 2) {
          const b = (body ?? {}) as { kind?: string; lines?: CartLine[]; tier?: Tier; returnTo?: string };
          const base = b.returnTo || "/";
          let order: Order;
          if (b.kind === "subscription") {
            const tier = TIER_ORDER.includes(b.tier as Tier) ? (b.tier as Tier) : undefined;
            if (!tier) return bad("Unknown plan");
            const price = PLANS[tier].priceChfPerMonth;
            if (price <= 0) return bad("The free plan needs no checkout");
            order = newSubscriptionOrder(principal.id, tier, price);
          } else {
            const lines = Array.isArray(b.lines) ? b.lines : [];
            if (lines.length === 0) return bad("Your cart is empty");
            order = newProductOrder(principal.id, lines);
            if (order.amountChf <= 0) return bad("Cart total must be greater than zero");
          }
          await orders.create(order);
          const session = await payments.createCheckout(order, {
            successUrl: `${base}${base.includes("?") ? "&" : "?"}paid=${order.id}`,
            cancelUrl: base,
          });
          await orders.update(order.id, { providerRef: session.ref });
          return ok({ orderId: order.id, url: session.url, provider: payments.id, amountChf: order.amountChf });
        }

        // GET /api/checkout/dev-complete — the simulated provider's "payment page".
        if (method === "GET" && segs[2] === "dev-complete") {
          const ref = query.ref ?? "";
          const order = await orders.getByProviderRef(ref);
          if (!order) return notFound();
          await settleOrder(order, "paid");
          const back = query.return_to || "/";
          return { status: 302, data: { redirect: back } };
        }
      }

      // POST /api/webhooks/payments — the only path that marks an order paid in
      // production. Signature-verified; the client is never trusted for money.
      if (key === "POST /api/webhooks/payments") {
        const sig = headers?.["stripe-signature"] ?? headers?.["x-payment-signature"] ?? "";
        const event = payments.verifyWebhook(rawBody ?? "", sig);
        if (!event) return { status: 400, data: { error: "Invalid signature" } };
        const order = await orders.getByProviderRef(event.ref);
        if (!order) return ok({ received: true, matched: false });
        await settleOrder(order, event.type);
        return ok({ received: true, matched: true, status: event.type });
      }

      // GET /api/orders — the athlete's purchase history.
      if (key === "GET /api/orders") {
        return ok({ orders: await orders.list(principal.id) });
      }

      // --- Admin: user management (all gated by org:configure) ---
      if (segs[0] === "api" && segs[1] === "admin" && segs[2] === "users") {
        authorize(principal, "org:configure");
        const id = segs[3] ? decodeURIComponent(segs[3]) : undefined;
        if (method === "GET" && !id) return ok({ users: await users.list(principal.orgId) });
        if (method === "POST" && !id) {
          let created;
          try {
            created = normalizeNewUser((body ?? {}) as Partial<NewUser>, principal.orgId);
          } catch (e) {
            return bad(e instanceof Error ? e.message : "Invalid user");
          }
          if (await users.get(created.id)) return bad("A user with that email already exists.");
          await users.create(created);
          return ok({ user: created, users: await users.list(principal.orgId) });
        }
        if (method === "POST" && id) {
          const target = await users.get(id);
          if (!target) return notFound();
          // Guard: an admin can't strip the owner's role or suspend an owner.
          const patch = normalizeUserPatch((body ?? {}) as Partial<UserPatch>);
          if (target.role === "owner" && (patch.role !== undefined || patch.status === "suspended")) {
            return bad("The owner account can't be demoted or suspended.");
          }
          const updated = await users.update(id, patch);
          return ok({ user: updated, users: await users.list(principal.orgId) });
        }
        if (method === "DELETE" && id) {
          const target = await users.get(id);
          if (target?.role === "owner") return bad("The owner account can't be removed.");
          if (id === principal.id) return bad("You can't remove your own account.");
          await users.remove(id);
          return ok({ users: await users.list(principal.orgId) });
        }
      }

      // --- Admin: platform settings ---
      if (segs[0] === "api" && segs[1] === "admin" && segs[2] === "settings") {
        authorize(principal, "org:configure");
        if (method === "GET") return ok({ settings: await settings.get() });
        if (method === "POST") return ok({ settings: await settings.update((body ?? {}) as Partial<PlatformSettings>) });
      }

      // --- Connections: list / disconnect ---
      if (segs[0] === "api" && segs[1] === "connections") {
        if (method === "GET" && segs.length === 2) return ok({ connections: await connections.list(principal.id) });
        // Any source can be disconnected, on-device platforms included.
        const isSource = (v: string): v is ProviderId => (ALL_SOURCE_IDS as string[]).includes(v);
        if (method === "DELETE" && segs[2] && isSource(segs[2])) {
          await connections.remove(principal.id, segs[2]);
          return ok({ connections: await connections.list(principal.id) });
        }
      }

      switch (true) {
        case key === "GET /api/health":
          return ok({
            status: "ok",
            environment: config.environment,
            version: config.version,
            storeBackend: config.storeBackend,
            activitiesStored: await store.count(),
          });

        case key === "POST /api/auth/session": {
          // Issue a signed session. In production the caller first verifies the
          // Google/Apple token or email login; here we sign the provided identity.
          const b = (body ?? {}) as Partial<Principal> & { email?: string };
          if (!b.email || !b.name) return bad("name and email required");
          const roles: Role[] = ["athlete", "coach", "nutritionist", "admin", "owner"];
          const tiers: Tier[] = ["free", "pro", "elite"];
          const token = signSession(
            {
              sub: b.id ?? `email:${b.email}`,
              name: b.name,
              email: b.email,
              role: roles.includes(b.role as Role) ? (b.role as Role) : "athlete",
              tier: tiers.includes(b.tier as Tier) ? (b.tier as Tier) : "free",
              orgId: b.orgId,
            },
            getEnv("AUTH_SECRET") ?? DEV_AUTH_SECRET,
          );
          return ok({ token });
        }

        case key === "POST /api/auth/google":
        case key === "POST /api/auth/apple": {
          const provider = key.endsWith("google") ? "google" : "apple";
          const clientId =
            getEnv(`${provider.toUpperCase()}_CLIENT_ID`) ?? getEnv(`VITE_${provider.toUpperCase()}_CLIENT_ID`);
          if (!clientId) return bad(`${provider} sign-in not configured (set ${provider.toUpperCase()}_CLIENT_ID)`);
          const b = (body ?? {}) as { idToken?: string; name?: string };
          if (!b.idToken) return bad("idToken required");
          try {
            const claims =
              provider === "google"
                ? await verifyGoogleIdToken(b.idToken, clientId)
                : await verifyAppleIdToken(b.idToken, clientId);
            const token = signSession(
              {
                sub: `${provider}:${claims.sub}`,
                name: claims.name ?? b.name ?? claims.email ?? "Athlete",
                email: claims.email ?? "",
                role: "athlete",
                tier: "free",
              },
              getEnv("AUTH_SECRET") ?? DEV_AUTH_SECRET,
            );
            return ok({ token });
          } catch {
            return { status: 401, data: { error: `Invalid ${provider} token` } };
          }
        }

        case key === "GET /api/me":
          // Reflects a tier bought since sign-in, so an upgrade takes effect
          // immediately instead of on next login.
          return ok({ principal: await currentPrincipal(principal) });

        case key === "GET /api/providers":
          // Every source a session can come from. `kind` tells the client which
          // ones it can start over OAuth and which the phone has to push.
          return ok(
            ALL_SOURCE_IDS.map((id) => ({
              id,
              displayName: DESCRIPTORS[id].displayName,
              kind: DESCRIPTORS[id].kind,
              capabilities: DESCRIPTORS[id].capabilities,
              scopes: DESCRIPTORS[id].oauth?.scopes ?? [],
            })),
          );

        case key === "POST /api/recommend": {
          const input = asAthleteInput(body);
          if (!input) return bad("Invalid AthleteInput");
          return ok(recommend(input, mergeCatalog(await products.list())));
        }

        case key === "POST /api/offering": {
          // The "ideal offering" algorithm: which product for each slot, and why.
          const input = asAthleteInput(body);
          if (!input) return bad("Invalid AthleteInput");
          return ok(idealOffering(input, computeTarget(input), mergeCatalog(await products.list())));
        }

        case key === "POST /api/schedule": {
          const input = asAthleteInput(body);
          if (!input) return bad("Invalid AthleteInput");
          return ok(buildSchedule(input));
        }

        case key === "POST /api/cart": {
          const b = (body ?? {}) as { input?: unknown; sessions?: number };
          const input = asAthleteInput(b.input);
          if (!input) return bad("Invalid AthleteInput");
          const catalog = mergeCatalog(await products.list());
          return ok(buildCart(recommend(input, catalog), Math.max(1, Math.min(20, b.sessions ?? 1))));
        }

        case key === "POST /api/adaptation": {
          const b = (body ?? {}) as { feedback?: SessionFeedback[] };
          return ok(deriveAdaptation(Array.isArray(b.feedback) ? b.feedback : []));
        }

        case key === "GET /api/feedback": {
          const list = await feedback.list(principal.id);
          return ok({ feedback: list, adaptation: deriveAdaptation(list) });
        }

        case key === "POST /api/feedback": {
          const b = (body ?? {}) as Partial<SessionFeedback>;
          if (!b.gi || !GI_RATINGS.includes(b.gi) || !b.energy || !ENERGY_RATINGS.includes(b.energy)) {
            return bad("Invalid feedback (gi/energy required)");
          }
          const entry: SessionFeedback = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            // Attach the session when the client names one, so a debrief can
            // hold this log against that run's actual terrain.
            ...(typeof b.activityId === "string" && b.activityId ? { activityId: b.activityId.slice(0, 200) } : {}),
            date: new Date().toISOString(),
            durationMin: typeof b.durationMin === "number" ? b.durationMin : 0,
            plannedCarbPerHourG: typeof b.plannedCarbPerHourG === "number" ? b.plannedCarbPerHourG : 0,
            ...(typeof b.actualCarbPerHourG === "number"
              ? { actualCarbPerHourG: Math.max(0, Math.min(200, Math.round(b.actualCarbPerHourG))) }
              : {}),
            gi: b.gi,
            energy: b.energy,
          };
          const list = await feedback.add(principal.id, entry);
          return ok({ feedback: list, adaptation: deriveAdaptation(list) });
        }

        case key === "DELETE /api/feedback": {
          await feedback.clear(principal.id);
          return ok({ feedback: [], adaptation: deriveAdaptation([]) });
        }

        case key === "POST /api/target": {
          const input = asAthleteInput(body);
          if (!input) return bad("Invalid AthleteInput");
          return ok(computeTarget(input));
        }

        case key === "POST /api/ingest": {
          const b = (body ?? {}) as { provider?: string; days?: number };
          const provider = b.provider as ProviderId | undefined;
          if (!provider || !ALL_PROVIDER_IDS.includes(provider)) return bad("Unknown provider");
          const res = await pipeline.ingest(
            provider,
            { provider, accessToken: "demo" },
            lastNDays(b.days ?? 28),
            principal.id,
          );
          return ok({ provider, fetched: res.fetched, inserted: res.inserted, totalStored: await store.count(principal.id) });
        }

        case key === "GET /api/activities": {
          const activities = await store.query({
            // Scoped to the signed-in athlete: without this, one athlete's start
            // screen would count everybody's sessions as their own.
            userId: principal.id,
            provider: (query.provider as ProviderId) || undefined,
            after: query.after,
          });
          return ok({ count: activities.length, activities: activities.slice(0, Number(query.limit) || 50) });
        }

        case key === "GET /api/analysis": {
          const activities = await store.query({ userId: principal.id });
          if (!activities.length) return ok({ empty: true });
          const profile = { bodyWeightKg: Number(query.bodyWeightKg) || 70, maxHr: Number(query.maxHr) || 190 };
          const goal = (query.goal as AthleteInput["goal"]) || "endurance-performance";
          return ok(analyze(activities, profile, goal));
        }

        case key === "GET /api/physiology": {
          const activities = await store.query({ userId: principal.id });
          const providers = [...new Set(activities.map((a) => a.provider))];
          const wellness = providers.flatMap((p) => generateSampleWellness(p, Number(query.days) || 21));
          return ok(derivePhysiology(wellness));
        }

        case key === "GET /api/admin/overview": {
          authorize(principal, "org:configure"); // RBAC enforced server-side
          const roster = await users.list(principal.orgId);
          const members = roster.map((m) => ({
            id: m.id,
            name: m.name,
            role: ROLE_LABELS[m.role],
            tier: PLANS[m.tier].name,
          }));
          const platform = await settings.get();
          return ok({
            org: principal.orgId ?? null,
            seats: members.length,
            activeSeats: roster.filter((m) => m.status === "active").length,
            members,
            plans: TIER_ORDER.map((t) => PLANS[t]),
            settings: platform,
            deployment: {
              environment: config.environment,
              version: config.version,
              storeBackend: config.storeBackend,
              enabledProviders: platform.enabledProviders,
              activitiesStored: await store.count(),
            },
          });
        }

        default:
          return notFound();
      }
    } catch (e) {
      if (e instanceof ForbiddenError) return { status: 403, data: { error: e.message } };
      return { status: 500, data: { error: e instanceof Error ? e.message : "Internal error" } };
    }
  };
}

export type ApiRouter = ReturnType<typeof createApiRouter>;
