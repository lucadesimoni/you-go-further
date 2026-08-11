/**
 * Check a running deployment, over real HTTP.
 *
 *   npm run verify:deploy                        # http://localhost:8787
 *   npm run verify:deploy -- https://yougofurther.ch
 *
 * The preflight reads configuration; this reads *behaviour*. They catch
 * different things: preflight cannot tell you that a proxy strips a security
 * header, that `config.js` is being cached by a CDN, or that the demo role
 * header is still honoured because the container is running yesterday's image.
 *
 * Every assertion below is something that has to be true of a public
 * deployment, and each one names what it would mean if it were false. Run it
 * against staging before the DNS change and against production after it.
 */
const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
const isHttps = BASE.startsWith("https://");

let failed = 0;
let warned = 0;

const check = async (label, fn) => {
  try {
    const note = await fn();
    console.log(`  ✓ ${label}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label} — ${e.message}`);
  }
};

/** Something that is not wrong, but is worth an operator's attention. */
const warn = (message) => {
  warned++;
  console.log(`  ! ${message}`);
};

const get = (path, init) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

console.log(`── verifying ${BASE} ──`);

console.log("\n── it is up, and says what it is ──");
await check("the API answers its health check", async () => {
  const res = await get("/api/health");
  if (!res.ok) throw new Error(`GET /api/health → ${res.status}`);
  const body = await res.json();
  if (body.status !== "ok") throw new Error(`health says ${JSON.stringify(body)}`);
  if (body.environment !== "production") warn(`environment is "${body.environment}", not "production"`);
  if (body.storeBackend === "memory") {
    throw new Error("the store backend is `memory` — every account is lost on the next restart");
  }
  return `${body.version} · ${body.environment} · store=${body.storeBackend}`;
});

await check("it reports which release is deployed, module by module", async () => {
  const res = await get("/api/version");
  if (!res.ok) throw new Error(`GET /api/version → ${res.status}`);
  const manifest = await res.json();
  if (!/^\d+\.\d+\.\d+$/.test(manifest.platform ?? "")) throw new Error(`no platform version: ${manifest.platform}`);
  const health = await (await get("/api/health")).json();
  if (health.version !== manifest.platform) {
    throw new Error(`health says ${health.version}, the manifest says ${manifest.platform}`);
  }
  return `v${manifest.platform}, ${manifest.modules?.length ?? 0} modules`;
});

await check("the app itself loads", async () => {
  const res = await get("/");
  if (!res.ok) throw new Error(`GET / → ${res.status}`);
  const html = await res.text();
  if (!/<div id="root">/.test(html)) throw new Error("the served page is not the app shell");
  return `${html.length} bytes`;
});

console.log("\n── nobody is an owner just by asking ──");
await check("the demo role header is not honoured", async () => {
  // With role switching left on, this header alone is an admin login — no
  // password, no session. It is the single most consequential setting in the
  // deployment, so it is probed from outside rather than trusted from a config
  // file that may not be the one the running container was started with.
  //
  // The endpoint is chosen because it *discriminates*: it answers 200 to this
  // header when role switching is on and 403 when it is off. A check pointed at
  // a route that 404s either way would pass on a deployment that is wide open.
  const res = await get("/api/admin/users", { headers: { "x-role": "admin" } });
  if (res.ok) {
    throw new Error("`x-role: admin` was served the admin user list — set ALLOW_ROLE_SWITCHING=false and redeploy");
  }
  if (res.status === 404) throw new Error("/api/admin/users is missing; this check can no longer tell the two apart");
  return `refused with ${res.status}`;
});

await check("the public engine API refuses an unauthenticated call", async () => {
  const res = await fetch(`${BASE}/v1/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activity: "running", intensity: "race", durationMin: 180, bodyWeightKg: 70 }),
  });
  if (res.status !== 401) throw new Error(`unauthenticated /v1/plan returned ${res.status}, expected 401`);
  return "401";
});

console.log("\n── the headers a browser relies on ──");
await check("the app shell carries the security headers", async () => {
  const res = await get("/");
  const missing = [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", null],
    ["referrer-policy", null],
  ]
    .filter(([h, want]) => {
      const got = res.headers.get(h);
      return !got || (want && got.toLowerCase() !== want);
    })
    .map(([h]) => h);
  if (missing.length) throw new Error(`missing or wrong: ${missing.join(", ")}`);
  return "nosniff · frame-options · referrer-policy";
});

if (isHttps) {
  await check("HTTPS is announced with HSTS", async () => {
    const res = await get("/");
    const hsts = res.headers.get("strict-transport-security");
    if (!hsts) {
      throw new Error("no Strict-Transport-Security — is TRUST_PROXY=true and does the proxy set X-Forwarded-Proto?");
    }
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    if (maxAge < 15552000) throw new Error(`max-age=${maxAge} is under the six months browsers expect`);
    return hsts;
  });

  await check("plain HTTP redirects to HTTPS", async () => {
    const res = await fetch(BASE.replace("https://", "http://"), { redirect: "manual" });
    if (res.status < 300 || res.status >= 400) throw new Error(`http:// returned ${res.status}, not a redirect`);
    const location = res.headers.get("location") ?? "";
    if (!location.startsWith("https://")) throw new Error(`redirects to ${location}`);
    return `${res.status} → ${location}`;
  });
} else {
  warn(`${BASE} is plain HTTP — TLS and HSTS are unchecked. Run this against the public URL before go-live.`);
}

console.log("\n── caching, which is how a deploy fails silently ──");
await check("the runtime config is never cached", async () => {
  // `config.js` is how a deployment is reconfigured without a rebuild. Cached,
  // it pins the old API base URL and the change appears to have done nothing.
  const res = await get("/config.js");
  if (!res.ok) throw new Error(`GET /config.js → ${res.status} (did the entrypoint write it?)`);
  const cc = res.headers.get("cache-control") ?? "";
  if (!/no-store/.test(cc)) throw new Error(`cache-control is "${cc}", expected no-store`);
  const body = await res.text();
  if (!/__APP_CONFIG__/.test(body)) throw new Error("config.js does not set window.__APP_CONFIG__");
  if (/allowRoleSwitching:\s*true/.test(body)) throw new Error("config.js turns the demo role switcher on");
  return cc;
});

await check("fingerprinted assets are cached hard", async () => {
  const html = await (await get("/")).text();
  const asset = /\/assets\/[A-Za-z0-9._-]+\.js/.exec(html)?.[0];
  if (!asset) throw new Error("no hashed asset referenced by the app shell");
  const res = await get(asset);
  if (!res.ok) throw new Error(`GET ${asset} → ${res.status}`);
  const cc = res.headers.get("cache-control") ?? "";
  if (!/immutable/.test(cc)) throw new Error(`cache-control is "${cc}", expected immutable`);
  return `${asset} · ${cc}`;
});

await check("API answers are not cached", async () => {
  const res = await get("/api/health");
  const cc = res.headers.get("cache-control") ?? "";
  if (!/no-store/.test(cc)) throw new Error(`cache-control is "${cc}" — a shared cache could serve one athlete's data to another`);
  return cc;
});

console.log("\n── the SPA reaches its own API ──");
await check("an unknown path serves the app, not a 404", async () => {
  // Client-side routing: a deep link pasted into a browser has to land on the
  // app, which then reads the path itself.
  const res = await get("/insights");
  if (!res.ok) throw new Error(`GET /insights → ${res.status}`);
  const html = await res.text();
  if (!/<div id="root">/.test(html)) throw new Error("the SPA fallback is not serving the app shell");
  return "SPA fallback";
});

console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} failed check(s), ${warned} warning(s)`,
);
process.exit(failed === 0 ? 0 : 1);
