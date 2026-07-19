/**
 * HTTP API router — pure and transport-agnostic.
 *
 * It reuses the very same domain modules the browser uses (engine, analysis,
 * data pipeline, subscription, auth), proving there is one implementation behind
 * both the client-side app and the server. `server/index.ts` wraps this with Node
 * `http`; tests exercise it directly with no sockets.
 */

import { recommend, buildSchedule, computeTarget } from "../engine";
import type { AthleteInput } from "../engine";
import { buildCart } from "../commerce";
import { deriveAdaptation, type EnergyRating, type GiRating, type SessionFeedback } from "../feedback";
import { analyze, derivePhysiology } from "../analysis";
import { generateSampleWellness } from "../providers";
import { lastNDays } from "../data";
import type { ProviderId } from "../model";
import { createRuntime, type Runtime } from "../runtime";
import { PLANS, TIER_ORDER } from "../subscription";
import { authorize, ForbiddenError, ROLE_LABELS, type Principal } from "../auth";
import { PERSONAS } from "../personas";
import { DESCRIPTORS, ALL_PROVIDER_IDS } from "../providers";

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
  principal: Principal;
}

export interface ApiResponse {
  status: number;
  data: unknown;
}

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
  const { config, store, pipeline, feedback } = runtime;

  return async function route(req: ApiRequest): Promise<ApiResponse> {
    const { method, path, query, body, principal } = req;
    const key = `${method} ${path}`;

    try {
      switch (true) {
        case key === "GET /api/health":
          return ok({
            status: "ok",
            environment: config.environment,
            version: config.version,
            storeBackend: config.storeBackend,
            activitiesStored: await store.count(),
          });

        case key === "GET /api/providers":
          return ok(
            ALL_PROVIDER_IDS.map((id) => ({
              id,
              displayName: DESCRIPTORS[id].displayName,
              capabilities: DESCRIPTORS[id].capabilities,
              scopes: DESCRIPTORS[id].oauth.scopes,
            })),
          );

        case key === "POST /api/recommend": {
          const input = asAthleteInput(body);
          if (!input) return bad("Invalid AthleteInput");
          return ok(recommend(input));
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
          return ok(buildCart(recommend(input), Math.max(1, Math.min(20, b.sessions ?? 1))));
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
            date: new Date().toISOString(),
            durationMin: typeof b.durationMin === "number" ? b.durationMin : 0,
            plannedCarbPerHourG: typeof b.plannedCarbPerHourG === "number" ? b.plannedCarbPerHourG : 0,
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
          const res = await pipeline.ingest(provider, { provider, accessToken: "demo" }, lastNDays(b.days ?? 28));
          return ok({ provider, fetched: res.fetched, inserted: res.inserted, totalStored: await store.count() });
        }

        case key === "GET /api/activities": {
          const activities = await store.query({
            provider: (query.provider as ProviderId) || undefined,
            after: query.after,
          });
          return ok({ count: activities.length, activities: activities.slice(0, Number(query.limit) || 50) });
        }

        case key === "GET /api/analysis": {
          const activities = await store.query();
          if (!activities.length) return ok({ empty: true });
          const profile = { bodyWeightKg: Number(query.bodyWeightKg) || 70, maxHr: Number(query.maxHr) || 190 };
          const goal = (query.goal as AthleteInput["goal"]) || "endurance-performance";
          return ok(analyze(activities, profile, goal));
        }

        case key === "GET /api/physiology": {
          const activities = await store.query();
          const providers = [...new Set(activities.map((a) => a.provider))];
          const wellness = providers.flatMap((p) => generateSampleWellness(p, Number(query.days) || 21));
          return ok(derivePhysiology(wellness));
        }

        case key === "GET /api/admin/overview": {
          authorize(principal, "org:configure"); // RBAC enforced server-side
          const members = PERSONAS.filter((p) => p.orgId === principal.orgId).map((m) => ({
            id: m.id,
            name: m.name,
            role: ROLE_LABELS[m.role],
            tier: PLANS[m.tier].name,
          }));
          return ok({
            org: principal.orgId ?? null,
            seats: members.length,
            members,
            plans: TIER_ORDER.map((t) => PLANS[t]),
            deployment: {
              environment: config.environment,
              version: config.version,
              storeBackend: config.storeBackend,
              enabledProviders: config.enabledProviders,
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
