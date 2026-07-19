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
import { PERSONAS } from "../src/personas.ts";
import type { Principal } from "../src/auth/roles.ts";

const PORT = Number(process.env.PORT) || 8787;
const DIST = join(process.cwd(), "dist");
const route = createApiRouter();

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Resolve a Principal from the x-role header (a real deployment uses SSO/JWT). */
function principalFrom(headers: http.IncomingHttpHeaders): Principal {
  const role = String(headers["x-role"] ?? "athlete");
  const match = PERSONAS.find((p) => p.role === role);
  return match ?? { id: "anon", name: "Anonymous", role: "athlete", tier: "free" };
}

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-role");
}

async function serveStatic(pathname: string, res: http.ServerResponse): Promise<boolean> {
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
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    let body: unknown;
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        body = raw ? JSON.parse(raw) : undefined;
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
      principal: principalFrom(req.headers),
    });
    res.writeHead(result.status, { "content-type": "application/json" });
    return res.end(JSON.stringify(result.data));
  }

  // Static frontend (if built).
  if (await serveStatic(pathname, res)) return;
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`You Go Further API listening on http://localhost:${PORT}`);
});
