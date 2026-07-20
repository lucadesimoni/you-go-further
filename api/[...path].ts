/**
 * Vercel serverless adapter for the API router.
 *
 * This is the serverless twin of `server/index.ts`: both wrap the same pure,
 * transport-agnostic `createApiRouter()` from `src/api/handlers.ts`. The Node
 * server runs it as a long-lived process (dev / Codespace / any VM); this file
 * runs the identical logic as a Vercel function so the app deploys without a
 * server to babysit. The Vite SPA is served as static output (see vercel.json).
 *
 * State lives in Postgres, not the filesystem: serverless invocations are
 * ephemeral and don't share a disk, so set DATABASE_URL (Vercel Postgres / Neon
 * / Supabase) — config auto-selects the `postgres` backend when it is present.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiRouter } from "../src/api/handlers";
import { createRuntime } from "../src/runtime";
import { PERSONAS } from "../src/personas";
import type { Principal } from "../src/auth/roles";
import { verifySession, DEV_AUTH_SECRET } from "../src/auth/jwt";

// Created once per warm instance and reused across invocations (keeps the pg
// pool alive). Migrations run lazily on the first request via a memoized promise.
const runtime = createRuntime();
const route = createApiRouter(runtime);

let initPromise: Promise<void> | undefined;
function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = runtime.init ? runtime.init() : Promise.resolve();
  return initPromise;
}

/** Same precedence as the Node server: signed session, else the x-role demo header. */
function principalFrom(headers: IncomingMessage["headers"]): Principal {
  const auth = String(headers["authorization"] ?? "");
  if (auth.startsWith("Bearer ")) {
    const claims = verifySession(auth.slice(7), process.env.AUTH_SECRET ?? DEV_AUTH_SECRET);
    if (claims) {
      return { id: claims.sub, name: claims.name, role: claims.role, tier: claims.tier, orgId: claims.orgId };
    }
  }
  const role = String(headers["x-role"] ?? "athlete");
  const match = PERSONAS.find((p) => p.role === role);
  return match ?? { id: "anon", name: "Anonymous", role: "athlete", tier: "free" };
}

type VercelRequest = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

async function readBody(req: VercelRequest): Promise<unknown> {
  // @vercel/node parses JSON bodies for us; fall back to reading the stream.
  if (req.body !== undefined && req.body !== "") return req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-role,authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return void res.end();
  }

  const url = new URL(req.url ?? "/", "http://vercel.local");
  const query = Object.fromEntries(url.searchParams.entries());

  try {
    await ensureInit();
    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    }

    const result = await route({
      method: req.method ?? "GET",
      path: url.pathname,
      query,
      body,
      principal: principalFrom(req.headers),
    });

    // OAuth steps signal a redirect intent — honor it as a real 302.
    const redirect = (result.data as { redirect?: string } | undefined)?.redirect;
    if (result.status === 302 && redirect) {
      res.writeHead(302, { Location: redirect });
      return void res.end();
    }
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.data));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }));
  }
}
