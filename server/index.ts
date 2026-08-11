/**
 * Node HTTP adapter for the API router. Dependency-free (built-in `http`/`fs`).
 *
 *   npm run server                 # API on :8787, also serves dist/ if built
 *   PORT=9000 npm run server
 *
 * The API logic lives in src/api/handlers.ts (shared with the browser build and
 * unit-tested); this file only does sockets, CORS, body parsing, principal
 * resolution from the `x-role` header, and static file serving.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createApiRouter } from "../src/api/handlers.ts";
import { createRuntime } from "../src/runtime.ts";
import { getConfig } from "../src/config.ts";
import { PERSONAS } from "../src/personas.ts";
import type { Principal } from "../src/auth/roles.ts";
import { verifySession, DEV_AUTH_SECRET } from "../src/auth/jwt.ts";
import { preflight, passes, formatFindings } from "../src/preflight.ts";

const PORT = Number(process.env.PORT) || 8787;
/**
 * Bind address. Containers must listen on every interface or the orchestrator's
 * health probe never reaches them; a bare VM alongside a reverse proxy is safer
 * bound to loopback. Default stays 0.0.0.0 because that is the container case.
 */
const HOST = process.env.HOST || "0.0.0.0";
const DIST = join(process.cwd(), "dist");
const runtime = createRuntime();
const route = createApiRouter(runtime);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Resolve a Principal, preferring a signed session (Authorization: Bearer …).
 *
 * The `x-role` fallback is a **demo affordance**, and it is honoured only where
 * demo role switching is switched on. It used to be honoured everywhere, which
 * meant an unauthenticated request carrying `x-role: admin` became an org admin
 * on any deployment — `allowRoleSwitching` gated the UI's role picker and
 * nothing else. With API keys behind an owner-only endpoint, that gap would have
 * let anyone mint a credential for themselves.
 */
const ANONYMOUS: Principal = { id: "anon", name: "Anonymous", role: "athlete", tier: "free" };

function principalFrom(headers: http.IncomingHttpHeaders): Principal {
  const auth = String(headers["authorization"] ?? "");
  if (auth.startsWith("Bearer ")) {
    const claims = verifySession(auth.slice(7), process.env.AUTH_SECRET ?? DEV_AUTH_SECRET);
    if (claims) {
      return { id: claims.sub, name: claims.name, role: claims.role, tier: claims.tier, orgId: claims.orgId };
    }
  }
  if (!getConfig().allowRoleSwitching) return ANONYMOUS;
  const role = String(headers["x-role"] ?? "athlete");
  return PERSONAS.find((p) => p.role === role) ?? ANONYMOUS;
}

/** Nothing this API accepts is large; an elevation profile is the biggest by far. */
const MAX_BODY_BYTES = 1_000_000;

/**
 * The caller's address, for limiting endpoints nobody has signed in to use.
 *
 * `x-forwarded-for` is trusted only when a proxy is declared, because a client
 * can set that header themselves — trusting it blindly hands every attacker a
 * fresh bucket per request, which is worse than having no limit at all, since
 * it looks like protection.
 */
function clientIpFrom(req: http.IncomingMessage): string | undefined {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? undefined;
}

/**
 * Which origins may call this API from a browser.
 *
 * `*` is right for the demo and for a single-origin deploy where the SPA is
 * served by this same process — the SPA's own requests are same-origin and
 * never preflight. It is wrong the moment a deployment is public and the API
 * holds sessions, so a comma-separated `ALLOWED_ORIGINS` narrows it. The header
 * is echoed only for origins on the list, because `Access-Control-Allow-Origin`
 * takes one value, not a list.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function cors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = String(req.headers.origin ?? "");
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // Two different origins must not share one cached preflight.
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-role,authorization,x-api-key");
}

/**
 * The headers nginx was adding for the static-only image.
 *
 * They were never applied on the deployment that actually matters: in a
 * single-origin deploy this process serves the SPA itself and nginx is not in
 * the path, so the app shipped with no `X-Content-Type-Options`, no framing
 * policy and no HSTS. Set here, they cover both surfaces at once.
 *
 * HSTS is sent only when the request already arrived over TLS — announcing it
 * on a plain-HTTP development server would pin `localhost` to https in the
 * browser for a year.
 */
function securityHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // The app needs no camera, microphone or geolocation; say so.
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  const proto = String(req.headers["x-forwarded-proto"] ?? "");
  if (process.env.TRUST_PROXY === "true" && proto === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

/**
 * How long a static file may be cached.
 *
 * Vite fingerprints everything under `/assets/`, so those are immutable for a
 * year. `config.js` is the opposite: it is how a deployment is reconfigured
 * without a rebuild, and a cached copy would pin the old API base URL. The
 * entry HTML sits in between — revalidate every time so a deploy is picked up.
 */
function cacheControlFor(pathname: string): string {
  if (pathname === "/config.js") return "no-store, must-revalidate";
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return "no-cache";
}

async function serveStatic(pathname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  try {
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(DIST, safe === "/" ? "index.html" : safe);
    let s = await stat(filePath).catch(() => null);
    if (!s || s.isDirectory()) {
      filePath = join(DIST, "index.html"); // SPA fallback
      s = await stat(filePath).catch(() => null);
      if (!s) return false;
    }
    const data = await readFile(filePath);
    securityHeaders(req, res);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
      "cache-control": cacheControlFor(pathname),
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Two API surfaces reach the same router: `/api/` for our own app, and `/v1/`
  // for the public engine contract. Without `/v1` here it falls through to the
  // static handler, which answers every unknown path with the SPA — so an
  // unauthenticated call to a keyed endpoint would come back 200 with a page.
  if (pathname.startsWith("/api/") || pathname === "/v1" || pathname.startsWith("/v1/")) {
    let body: unknown;
    let rawBody: string | undefined;
    if (req.method === "POST") {
      // Read with a ceiling. Streaming an unbounded body into memory is a
      // one-request denial of service, and nothing this API accepts is large —
      // an elevation profile, the biggest legitimate payload, is far below it.
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        const buf = c as Buffer;
        size += buf.length;
        if (size > MAX_BODY_BYTES) {
          // Answer *first*, then stop reading. Destroying the socket before the
          // response is flushed means the client never sees the 413 — with
          // `Expect: 100-continue` it sees only the interim 100 and a dead
          // connection, which is indistinguishable from the server crashing.
          res.writeHead(413, { "content-type": "application/json", connection: "close" });
          return res.end(
            JSON.stringify({ error: "payload_too_large", detail: `Body exceeds ${MAX_BODY_BYTES} bytes.` }),
            () => req.destroy(),
          );
        }
        chunks.push(buf);
      }
      rawBody = Buffer.concat(chunks).toString("utf8");
      try {
        body = rawBody ? JSON.parse(rawBody) : undefined;
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    }
    const query = Object.fromEntries(url.searchParams.entries());
    const result = await route({
      method: req.method ?? "GET",
      path: pathname,
      query,
      body,
      rawBody,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v ?? "")]),
      ),
      principal: principalFrom(req.headers),
      clientIp: clientIpFrom(req),
    });
    // OAuth steps return a redirect intent — honor it as a real 302.
    const redirect = (result.data as { redirect?: string } | undefined)?.redirect;
    if (result.status === 302 && redirect) {
      res.writeHead(302, { Location: redirect });
      return res.end();
    }
    securityHeaders(req, res);
    res.writeHead(result.status, {
      "content-type": "application/json",
      // An API answer is never a cacheable document; several of these carry the
      // signed-in athlete's own data and must not sit in a shared proxy.
      "cache-control": "no-store",
      ...(result.headers ?? {}),
    });
    return res.end(JSON.stringify(result.data));
  }

  // Static frontend (if built).
  if (await serveStatic(pathname, req, res)) return;
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

/**
 * Stop taking new connections, let the ones in flight finish, then exit.
 *
 * An orchestrator rolling out a new version sends SIGTERM and waits. Without a
 * handler the process dies on the default action, which cuts every in-flight
 * request — including, at exactly the wrong moment, a payment webhook. The
 * timeout is the backstop: a connection that will not close must not hold the
 * deployment open forever.
 */
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 10_000;
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`${signal} received — finishing in-flight requests (up to ${SHUTDOWN_GRACE_MS} ms)`);
  const timer = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error("Grace period elapsed; exiting with connections still open.");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  timer.unref();
  server.close(() => {
    clearTimeout(timer);
    process.exit(0);
  });
}

async function start() {
  const cfg = getConfig();

  // Refuse to serve a production deployment that is misconfigured, rather than
  // starting and looking healthy. The rules are in `src/preflight.ts`; running
  // them here means a deploy cannot skip the check by not calling the script.
  const findings = preflight({ ...process.env });
  if (findings.length > 0) {
    // eslint-disable-next-line no-console
    console.log(formatFindings(findings));
  }
  if (!passes(findings)) {
    // eslint-disable-next-line no-console
    console.error("\nRefusing to start: the blockers above would make this deployment unsafe or lossy.");
    console.error("Fix them, or run with APP_ENV unset to start in development mode.");
    process.exit(1);
  }

  if (runtime.init) {
    try {
      await runtime.init();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("Backend init failed:", message);
      // In production this is the database: serving without it means every
      // request fails one at a time instead of the deploy failing once, loudly.
      if (cfg.environment === "production") process.exit(1);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(
      `You Go Further ${cfg.version} on http://${HOST}:${PORT} · env=${cfg.environment} · store=${cfg.storeBackend}`,
    );
  });
}

void start();
