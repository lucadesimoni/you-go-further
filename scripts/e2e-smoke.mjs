/**
 * End-to-end smoke test against a *running* app (SPA + API on one origin).
 * Drives the real browser journey — sign in, onboarding, plan, connect,
 * insights, checkout — and fails on any console/page error.
 *
 *   npm run build && node scripts/host-config.mjs
 *   STORE_BACKEND=file DATA_DIR=/tmp/ygf-smoke PORT=8830 npm run server &
 *   BASE_URL=http://localhost:8830 node scripts/e2e-smoke.mjs
 */
import { chromium } from "playwright-core";
import { launchOptions } from "./chrome.mjs";

const B = process.env.BASE_URL ?? "http://localhost:8787";
const errors = [];
let failed = 0;

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// Blocked tile/geodata hosts are an environment limit, not an app defect: the
// map is *supposed* to fall back when swisstopo or MeteoSwiss is unreachable,
// and that fallback is asserted below. Filter by the failing URL, not by the
// message text, so real errors are never swallowed.
const EXTERNAL_GEO = /geo\.admin\.ch|cartocdn\.com|open-meteo\.com/;
/**
 * One step below breaks the network on purpose, to prove the app says so.
 * Those failures are the assertion, not a defect, so the collector is muted
 * for exactly as long as the fault is injected — and never longer.
 */
let injectingFailures = false;
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (injectingFailures) return;
  if (EXTERNAL_GEO.test(m.location()?.url ?? "")) return;
  errors.push(`console: ${m.text()}`);
});
page.on("requestfailed", (r) => {
  if (injectingFailures) return;
  if (!EXTERNAL_GEO.test(r.url())) errors.push(`requestfailed: ${r.url()}`);
});

/**
 * Wait for a condition instead of for a number of milliseconds.
 *
 * A fixed sleep encodes one machine's timing. Two steps below read state the
 * app has just written through the API, and on a CI runner they read it a beat
 * too early — the assertion then reports "the profile was ignored" when the
 * truth is "the answer had not arrived yet". Polling fails just as loudly when
 * the state genuinely never arrives, which is the failure worth keeping.
 */
const waitFor = async (label, probe, timeoutMs = 15000) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await probe();
    if (last === true) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} (last saw: ${last})`);
};

const step = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label} — ${e.message.split("\n")[0]}`);
  }
};


/**
 * Pick which job the Plan screen is doing.
 *
 * The screen used to stack a named race, a GPX import and the session planner —
 * 6.7 screens and 53 controls. It now shows one at a time and remembers the
 * last choice, so a test that wants a particular one has to ask for it.
 */
const planMode = async (name) => {
  await page.click('button.topnav-tab:has-text("Plan")');
  await page.waitForSelector(".plan-modes", { timeout: 15000 });
  await page.click(`.plan-mode:has-text("${name}")`);
  await page.waitForTimeout(600);
};

/**
 * Pick an option from one of the visible choice groups.
 *
 * Every single-choice control that used to be a `<select>` is now a labelled
 * radio group whose options are all on screen, so the test picks one the same
 * way a person does — by clicking the option it can see.
 */
const choose = async (groupLabel, optionText) => {
  const group = page.locator(`[role="radiogroup"][aria-label="${groupLabel}"]`);
  await group.waitFor({ timeout: 15000 });
  await group.locator(`[role="radio"]:has-text("${optionText}")`).first().click();
  await page.waitForTimeout(400);
};

const email = `smoke-${Date.now()}@club.ch`;

console.log("── what is deployed ──");
await step("the running server states its own version, module by module", async () => {
  // Through the real Node server, not the pure router a unit test calls: the
  // route has to actually be reachable on the deployment.
  const res = await fetch(`${B}/api/version`);
  if (!res.ok) throw new Error(`GET /api/version → ${res.status}`);
  const manifest = await res.json();
  if (!/^\d+\.\d+\.\d+$/.test(manifest.platform ?? "")) throw new Error(`no platform version: ${manifest.platform}`);
  if (!Array.isArray(manifest.modules) || manifest.modules.length < 20) {
    throw new Error(`manifest lists ${manifest.modules?.length} modules`);
  }
  // Health and the manifest must agree — two version numbers is how a bug
  // report ends up naming a release that was never deployed.
  const health = await (await fetch(`${B}/api/health`)).json();
  if (health.version !== manifest.platform) {
    throw new Error(`health says ${health.version}, manifest says ${manifest.platform}`);
  }
});

console.log("── the public engine API ──");
await step("/v1 refuses an unauthenticated call and serves a keyed one", async () => {
  // Through the real Node server, not the pure router: a licensable API that
  // only works in a unit test is not a licensable API.
  const unauth = await fetch(`${B}/v1/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activity: "running", intensity: "race", durationMin: 180, bodyWeightKg: 70 }),
  });
  if (unauth.status !== 401) throw new Error(`unauthenticated /v1/plan returned ${unauth.status}, expected 401`);

  // Issue a key the way an operator would, as an owner.
  const issued = await fetch(`${B}/api/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ tenantId: "e2e", name: "smoke", scopes: ["plan", "course"] }),
  });
  if (issued.status !== 201) throw new Error(`issuing a key returned ${issued.status}`);
  const { secret, key } = await issued.json();
  if (!secret || !/^ygf_(live|test)_/.test(secret)) throw new Error(`unexpected key format: ${secret}`);
  if (JSON.stringify(key).includes(secret)) throw new Error("the stored key record contains the secret");

  const plan = await fetch(`${B}/v1/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": secret },
    body: JSON.stringify({
      goal: "race-preparation",
      activity: "trail-running",
      intensity: "race",
      durationMin: 300,
      bodyWeightKg: 70,
    }),
  });
  if (!plan.ok) throw new Error(`keyed /v1/plan returned ${plan.status}`);
  const body = await plan.json();
  if (!body.contract || !body.engine) throw new Error("response is not version-stamped");
  if (!(body.target?.carbPerHourG > 0)) throw new Error("no carbohydrate target returned");
  // The watch payload: an ordered list of "at this minute, do this".
  if (!Array.isArray(body.cues) || body.cues.length < 4) throw new Error("no cue schedule for a watch to count down");
  const times = body.cues.map((c) => c.atMin);
  if (times.some((t, i) => i > 0 && t < times[i - 1])) throw new Error("cues are not in time order");

  // A key without the catalog scope must be refused there, with 403 not 401.
  const scoped = await fetch(`${B}/v1/catalog`, { headers: { "x-api-key": secret } });
  if (scoped.status !== 403) throw new Error(`out-of-scope call returned ${scoped.status}, expected 403`);

  // Revoking has to bite immediately, not at the next restart.
  const del = await fetch(`${B}/api/keys/${key.id}`, { method: "DELETE", headers: { "x-role": "admin" } });
  if (!del.ok) throw new Error(`revoking returned ${del.status}`);
  const after = await fetch(`${B}/v1/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": secret },
    body: JSON.stringify({ activity: "running", intensity: "race", durationMin: 180, bodyWeightKg: 70 }),
  });
  if (after.status !== 401) throw new Error(`a revoked key still returned ${after.status}`);
});

await step("the transport refuses an oversized body and limits sign-in requests", async () => {
  // Both are transport-level: a unit test calling the router directly never
  // reaches the code that reads the socket or writes a header.
  const big = JSON.stringify({
    goal: "endurance-performance",
    activity: "running",
    intensity: "race",
    durationMin: 120,
    bodyWeightKg: 70,
    junk: "x".repeat(2_000_000),
  });
  const oversized = await fetch(`${B}/api/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: big,
  });
  if (oversized.status !== 413) throw new Error(`a 2 MB body returned ${oversized.status}, expected 413`);

  // A normal request must be entirely unaffected.
  const normal = await fetch(`${B}/api/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal: "endurance-performance",
      activity: "running",
      intensity: "race",
      durationMin: 120,
      bodyWeightKg: 70,
    }),
  });
  if (!normal.ok) throw new Error(`an ordinary request returned ${normal.status}`);

  // Asking for a sign-in link sends real email to an address the caller chose,
  // so the tight budget is on the address. Hammering *one* address trips it
  // without spending the looser per-source budget the rest of this suite needs.
  const victim = `flood-${Date.now()}@club.ch`;
  let limited;
  for (let i = 0; i < 6 && !limited; i++) {
    const res = await fetch(`${B}/api/auth/email/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: victim, returnTo: "/" }),
    });
    if (res.status === 429) limited = res;
  }
  if (!limited) throw new Error("sign-in link requests are not rate limited");
  // The header is what a client and a proxy read; a number in the body is not.
  if (!/^\d+$/.test(limited.headers.get("retry-after") ?? "")) {
    throw new Error(`429 carried no Retry-After header: ${limited.headers.get("retry-after")}`);
  }
});

console.log("── the landing page, before anyone has signed in ──");
await step("it says what the product is, and the way in is on the first screenful", async () => {
  await page.goto(B, { waitUntil: "networkidle" });
  // The logged-out surface used to be a sign-in card and nothing else. What
  // makes this a landing page rather than a decorated form is that the claims,
  // the diagrams and the guide are on it — and that the card is still right
  // there rather than behind a "get started" that scrolls somewhere.
  for (const sel of [".landing-hero", ".landing-chain-us", ".landing-cards", ".landing-curve", ".landing-articles"]) {
    if (!(await page.locator(sel).count())) throw new Error(`${sel} is missing from the landing page`);
  }
  const cards = await page.locator(".landing-article").count();
  if (cards < 4) throw new Error(`only ${cards} article previews — the guide is the editorial argument`);
  if (!(await page.locator(".landing-signin .auth-card").count())) {
    throw new Error("the sign-in card is not in the hero, so signing in now costs a scroll");
  }
});
await step("it holds together from a 320 px phone to a 1920 px desktop, in German", async () => {
  /*
   * German is the longest of the four languages and 320 px is the narrowest
   * screen still in use, so this is the corner where a landing page breaks.
   * A page that scrolls sideways is the single most obvious sign that nobody
   * looked at it on a phone, and it is invisible from a desktop browser.
   */
  await page.evaluate(() => localStorage.setItem("ygf.lang", "de"));
  await page.reload({ waitUntil: "networkidle" });
  const bad = [];
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(180);
    const r = await page.evaluate(() => {
      const d = document.documentElement;
      const out = [];
      for (const el of document.querySelectorAll(".landing *")) {
        const b = el.getBoundingClientRect();
        // Name the culprit: "the page is too wide" is not something anyone can
        // act on six months from now.
        if (b.width > 0 && (b.right > d.clientWidth + 1 || b.left < -1)) out.push(`${el.className || el.tagName}`.split(" ")[0]);
        /*
         * And the case a box measurement cannot see: content wider than the box
         * holding it. `getBoundingClientRect` returns the *box*, so a heading
         * set to `nowrap` inside a well-behaved grid track reports a perfectly
         * innocent width while its text runs off the side. This check found
         * exactly that on a build deliberately broken to test it.
         */
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible") {
          out.push(`${el.className || el.tagName}`.split(" ")[0] + "(text)");
        }
      }
      return { scroll: d.scrollWidth, client: d.clientWidth, over: [...new Set(out)].slice(0, 3) };
    });
    if (r.scroll > r.client + 1 || r.over.length) bad.push(`${width}px: ${r.scroll}>${r.client} (${r.over.join(", ")})`);
  }
  await page.setViewportSize({ width: 1180, height: 900 });
  // Put the language back. A step that leaves the app in German is a step that
  // breaks the next one from a distance — which is exactly what this did on its
  // first run, and the failure showed up as "login screen renders" timing out
  // three lines later.
  await page.evaluate(() => localStorage.removeItem("ygf.lang"));
  await page.reload({ waitUntil: "networkidle" });
  if (bad.length) throw new Error(bad.join("; "));
  return "320 · 390 · 768 · 1024 · 1440 · 1920";
});

console.log("── sign in (magic link) ──");
await page.goto(B, { waitUntil: "networkidle" });
await step("login screen renders", () => page.waitForSelector("text=Fuel smarter, go further"));
await step("request + redeem a sign-in link", async () => {
  await page.click("text=Continue with email");
  await page.fill('input[type="email"]', email);
  await page.click("text=Email me a sign-in link");
  await page.waitForSelector("text=Check your inbox");
  await page.click("text=Open the link (dev mailer)");
  await page.waitForLoadState("networkidle");
});

console.log("── onboarding ──");
await step("welcome → connect → body (setup is never skipped)", async () => {
  await page.waitForSelector("text=Fuel your body to go further");
  await page.click("text=Get started");
  await page.waitForSelector("text=Connect your training");
  await page.locator('.onboard-connect:has-text("Strava")').click();
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("text=Tune it to you", { timeout: 10000 });
});
await step("finish setup into the start screen", async () => {
  await page.click('button:has-text("Continue →")');
  await page.click("text=Build my first plan");
  // Onboarding now hands over to Home rather than dropping the athlete into a
  // form — the start screen tells them what to do next.
  await page.waitForSelector(".home-greeting", { timeout: 15000 });
});

console.log("── start screen ──");
await step("signing in lands on Home, not a form", async () => {
  await page.waitForSelector(".home-greeting", { timeout: 10000 });
  const greeting = await page.locator(".home-greeting").innerText();
  if (!/Good (morning|afternoon|evening)/.test(greeting)) throw new Error(`unexpected greeting: ${greeting}`);
  // The active tab must actually be Home.
  const active = await page.locator("button.topnav-tab.active").innerText();
  if (active !== "Home") throw new Error(`landed on "${active}"`);
});
await step("the next move matches what Insights recommends", async () => {
  const home = await page.locator(".home-next-title").innerText();
  await page.click('button.topnav-tab:has-text("Insights")');
  await page.waitForSelector(".score-next-list", { timeout: 10000 });
  const top = await page.locator(".score-next-list li strong").first().innerText();
  // One ranking, two screens: they must never disagree.
  if (home.trim() !== top.trim()) throw new Error(`home says "${home}" but insights says "${top}"`);
  await page.click('button.topnav-tab:has-text("Home")');
  await page.waitForSelector(".home-greeting");
});
await step("the week's figures are real, and the session list is the athlete's own", async () => {
  const week = await page.locator(".home .targets").innerText();
  if (!/Sessions/.test(week)) throw new Error(`week card missing: ${week}`);
  // Sessions belong to one athlete. A shared store would show this account
  // everyone else's training as its own — and 7 days can't hold 20 sessions.
  // Label then figure now, so match the label and take what follows it —
  // the assertion is about the count being plausible, not about the order.
  const sessions = Number(/Sessions\s*(\d+)/.exec(week.replace(/\n/g, " "))?.[1]);
  if (!(sessions >= 1 && sessions <= 14)) {
    throw new Error(`implausible weekly session count (other athletes' data?): ${sessions}`);
  }
  const rows = await page.locator(".home-session").count();
  if (rows === 0) throw new Error("no recent sessions listed after a sync");
  const first = await page.locator(".home-session").first().innerText();
  if (!/\d{1,2} \w{3}/.test(first)) throw new Error(`session row has no date: ${first}`);
});
await step("a session can be taken straight into the planner", async () => {
  await page.locator(".home-session-plan").first().click();
  await page.waitForSelector("text=Carb / hour", { timeout: 10000 });
  await page.click('button.topnav-tab:has-text("Home")');
  await page.waitForSelector(".home-greeting");
});

console.log("── insights show real data ──");
await step("own synced sessions (never sample data)", async () => {
  await page.click('button.topnav-tab:has-text("Insights")');
  await page.waitForSelector("text=Your training");
  // "Sessions", not "Activities" — one word for the same thing, everywhere.
  const acts = await page.locator('.stat:has-text("Sessions") .stat-value').first().textContent();
  if (Number(acts) <= 0) throw new Error("no synced sessions");
});

console.log("── profile syncs to the account ──");
await step("profile opens from the account menu", async () => {
  await page.click(".account-btn");
  await page.click("text=Profile & health");
  await page.waitForSelector("text=Body & preferences");
  await page.waitForSelector("text=synced to your account");
});

console.log("── one profile, not several ──");
await step("body data is editable in exactly one place", async () => {
  // Walk every tab and count controls that edit body weight. Two would mean an
  // athlete can set a weight that silently doesn't reach the plan — which is
  // precisely the bug this guards.
  let editors = 0;
  for (const tab of ["Home", "Plan", "Insights", "Connect", "Catalog"]) {
    await page.click(`button.topnav-tab:has-text("${tab}")`);
    await page.waitForTimeout(1200);
    editors += await page.locator('input[type="range"]#bw, input[type="range"]#p-weight').count();
    // And no tab besides the real one may head a panel "profile".
    const heads = await page.locator("main h2").allInnerTexts();
    const claims = heads.filter((h) => /athlete profile|your profile/i.test(h));
    if (claims.length > 0) throw new Error(`${tab} also calls a panel "${claims.join(", ")}"`);
  }
  if (editors !== 0) throw new Error(`${editors} body-weight editors outside Profile & health`);
});
await step("a weight set in the profile reaches the plan and the analysis", async () => {
  await page.click(".account-btn");
  await page.click("text=Profile & health");
  await page.waitForSelector("#p-weight");
  await page.locator("#p-weight").fill("83");
  // The save is what the rest of this step depends on; wait for the server to
  // acknowledge it rather than for a guessed number of milliseconds.
  await page.waitForResponse(
    (r) =>
      r.url().includes("/api/profile") &&
      r.request().method() === "POST" &&
      // This save, not one still in flight from the step before.
      (r.request().postData() ?? "").includes('"bodyWeightKg":83') &&
      r.ok(),
    { timeout: 15000 },
  );
  await page.click('button.topnav-tab:has-text("Connect")');
  await waitFor("connect ignored the profile", async () => {
    const seen = await page.locator(".from-profile span").first().innerText();
    return /83 kg/.test(seen) || seen;
  });
  await planMode("A session");
  await waitFor("planner ignored the profile", async () => {
    const seen = await page.locator(".from-profile span").first().innerText();
    return /83 kg/.test(seen) || seen;
  });
});

await step("a slow read cannot overwrite the weight the athlete just typed", async () => {
  // The bug this pins: the profile screen syncs on mount, the athlete edits
  // before that read answers, and the answer — the *old* profile — lands on
  // top of the new one. No error, nothing to retry; the number simply changes
  // back. It surfaced first on a CI runner, because a faster machine loses the
  // race more often, so here it is made deterministic: read the server now,
  // hand the answer back three seconds later.
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({ response, body });
  });
  try {
    await page.click(".account-btn");
    await page.click("text=Profile & health");
    await page.waitForSelector("#p-weight");
    await page.locator("#p-weight").fill("77");
    await page.waitForResponse(
      (r) =>
        r.url().includes("/api/profile") &&
        r.request().method() === "POST" &&
        (r.request().postData() ?? "").includes('"bodyWeightKg":77') &&
        r.ok(),
      { timeout: 15000 },
    );
    // Long enough for the stale answer to land, which is the whole point.
    await page.waitForTimeout(4000);
    const shown = await page.locator("#p-weight").inputValue();
    if (shown !== "77") throw new Error(`the stale read won: the field says ${shown}`);
  } finally {
    await page.unroute("**/api/profile");
  }
});

await step("a stalled network shows waiting, and a dead one says so", async () => {
  // The defect: waiting, empty and broken were one screen. A slow connection
  // and a 500 both rendered "No sessions yet — connect a service", telling an
  // athlete with a connected provider and real sessions that their training
  // was gone, and asking them to set it up again.
  let stall = true;
  await page.route("**/api/activities**", async (route) => {
    if (stall) await new Promise((r) => setTimeout(r, 5000));
    // The stalled request can outlive the unroute below; letting it go then is
    // the test's own housekeeping, not a failure of the app.
    await route.continue().catch(() => {});
  });
  try {
    await page.click('button.topnav-tab:has-text("Home")');
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const waiting = await page.evaluate(() => ({
      skeleton: document.querySelectorAll(".skeleton-line").length,
      claimsEmpty: document.body.textContent?.includes("No sessions yet") ?? false,
    }));
    if (waiting.skeleton === 0) throw new Error("no waiting state while the sessions were still coming");
    if (waiting.claimsEmpty) throw new Error('said "No sessions yet" while still loading');
  } finally {
    // Stop stalling, let the in-flight request finish, then remove the handler.
    stall = false;
    await page.waitForTimeout(5200);
    await page.unroute("**/api/activities**");
  }

  // Now the platform is simply down.
  injectingFailures = true;
  await page.route("**/api/**", (route) => route.fulfill({ status: 500, body: '{"error":"down"}' }));
  let recovered = 0;
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".failed-block", { timeout: 15000 });
    if ((await page.locator("text=No sessions yet").count()) > 0) {
      throw new Error('claimed "No sessions yet" when the platform was unreachable');
    }
    if ((await page.locator(".failed-block button").count()) === 0) throw new Error("no way to try again");
  } finally {
    await page.unroute("**/api/**");
  }
  // And the offered way back must actually work.
  await page.locator(".failed-block button").click();
  await page.waitForTimeout(3000);
  injectingFailures = false;
  recovered = await page.locator(".home-session").count();
  if (recovered === 0) throw new Error("retry did not bring the sessions back");
});

console.log("── commerce ──");
await step("a hand-off to a partner shop is recorded, so commission can be reconciled", async () => {
  await planMode("A session");
  await page.waitForSelector("text=Shop this plan");
  await page.waitForSelector(".cart-partner", { timeout: 15000 });

  // The click POSTs the hand-off and opens the brand's site in a new tab.
  const recorded = page.waitForResponse(
    (r) => r.url().includes("/api/affiliate/click") && r.request().method() === "POST",
    { timeout: 15000 },
  );
  const [popup] = await Promise.all([
    page.waitForEvent("popup", { timeout: 15000 }).catch(() => null),
    page.locator(".cart-partner").first().click(),
  ]);
  const res = await recorded;
  const body = await res.json();
  if (body.recorded !== true) throw new Error(`click was not recorded: ${JSON.stringify(body)}`);
  // No partner agreement is configured in a fresh deployment, so it must not
  // claim the click can earn.
  if (body.tracked !== false) throw new Error("an unsigned brand was marked as tracked");
  if (popup) await popup.close();
});

console.log("── route, terrain & weather ──");
await step("Swiss routes are drawn on the swisstopo national map", async () => {
  const swisstopo = [];
  page.on("request", (r) => r.url().includes("wmts.geo.admin.ch") && swisstopo.push(r.url()));
  // A route is something you plan, not a setting — it lives on Plan beside the
  // race and the session, and no longer three panels below the provider cards.
  await planMode("A route");
  await page.waitForSelector(".route-map", { timeout: 15000 });
  await page.waitForTimeout(2500);
  if (swisstopo.length === 0) throw new Error("no swisstopo tiles were requested");

  // The layer control sits on the map and is collapsed until it is wanted.
  await page.locator(".map-switcher-toggle").click();
  await page.waitForSelector(".map-switcher-body", { timeout: 5000 });
  const labels = await page.locator(".map-opt-label").allInnerTexts();
  const flat = labels.map((l) => l.split("\n")[0]);
  // The official editions must all be offered, not just a generic basemap.
  for (const want of ["National map", "Aerial", "Muted"]) {
    if (!flat.includes(want)) throw new Error(`missing swisstopo layer "${want}" (got ${flat.join(", ")})`);
  }
  // And the overlays an athlete actually asks a Swiss map for.
  for (const want of ["Hiking trails", "Cycle routes"]) {
    if (!flat.includes(want)) throw new Error(`missing overlay "${want}" (got ${flat.join(", ")})`);
  }
  // Ticking one must reach the tile service rather than doing nothing quietly.
  const before = swisstopo.length;
  await page.locator('.map-opt:has-text("Hiking trails") input').check();
  await page.waitForTimeout(1500);
  if (swisstopo.length === before) throw new Error("enabling an overlay requested no tiles");
  await page.locator('.map-opt:has-text("Hiking trails") input').uncheck();
  await page.locator(".map-switcher-toggle").click();
});
await step("the service connected during setup shows as connected", async () => {
  // The connection belongs to the signed-in athlete, so Connect must read it
  // with the session — not as an anonymous demo role.
  await page.click('button.topnav-tab:has-text("Connect")');
  await page.waitForSelector(".provider-card", { timeout: 15000 });
  // The card renders before the connections have been fetched, so its first
  // paint says "not connected" whatever the truth is.
  await waitFor("Strava was connected in setup but the card never said so", async () =>
    /Disconnect/.test(await page.locator('.provider-card:has-text("Strava")').innerText()),
  );
});
await step("'Plan for this race' actually reaches the session planner", async () => {
  // The planner used to read its prefill only on mount, so pressing this on the
  // screen it was made for set a value that was cleared a tick later and
  // nothing moved. It now also has to *switch* the screen to the planner, since
  // the Plan screen shows one job at a time.
  await planMode("A session");
  const before = await page.locator("#duration").inputValue();

  await planMode("A race");
  // The race list is a list, not a dropdown: every race, its date, distance
  // and climb, all on screen. Picking one is a click on its card.
  const race = page.locator(".event .choice-card").first();
  await race.waitFor({ timeout: 15000 });
  await race.click();
  await page.waitForSelector(".event .geo-plan", { timeout: 20000 });
  const raceTarget = await page.locator(".event-cols .geo-block").nth(1).locator(".stat-value").first().innerText();

  await page.locator(".event .geo-plan").click();
  // Pressing it must bring the planner on screen, not just set a value behind a
  // tab the athlete cannot see.
  await page.waitForSelector("#duration", { timeout: 15000 });
  const after = await page.locator("#duration").inputValue();
  if (before === after) throw new Error(`the planner ignored the race (duration stayed ${before})`);
  const intensity = await page
    .locator('[role="radiogroup"][aria-label="Intensity"] [role="radio"][aria-checked="true"]')
    .innerText();
  if (!/race/i.test(intensity)) throw new Error(`a race should be planned at race intensity, got "${intensity}"`);

  // And the two must agree: the planner recomputing a different carbohydrate
  // target from the one shown on the race panel is worse than no button.
  const plannerTarget = await page.locator(".layout .stat").first().innerText();
  const num = (x) => Number(/(\d+)/.exec(x)?.[1]);
  if (num(plannerTarget) !== num(raceTarget)) {
    throw new Error(`race panel says ${raceTarget}, planner says ${plannerTarget}`);
  }

  // Hand the suite back the screen it was on: the steps after this one are
  // still working through the route view.
  await planMode("A route");
  await page.waitForSelector(".route-picker", { timeout: 15000 });
});

await step("a run can be chosen, not just the latest ride", async () => {
  const chips = await page.locator(".route-picker .chip").allInnerTexts();
  const run = chips.find((c) => /^Run|^Trail run/.test(c));
  if (!run) throw new Error(`no running session offered (got ${chips.join(" | ")})`);
  await page.locator(".route-picker .chip").filter({ hasText: /^Run|^Trail run/ }).first().click();
  await page.waitForTimeout(1200);
  // Read the selection off the picker, which states the sport, rather than off
  // the map's footer, which shows the session's own title. That footer only
  // ever matched /run/ because sample sessions were literally named "run
  // session" — a real title like "Sunday endurance" is a better label and was
  // failing an assertion that had quietly been testing the generator.
  const active = await page.locator(".route-picker .chip-active").innerText();
  if (!/^Run|^Trail run/.test(active)) throw new Error(`picker did not switch to a run: ${active}`);
});
await step("fuel stops are placed on the height profile, not just the clock", async () => {
  // Walk the sessions until one is long enough to need on-route feeds.
  const chips = await page.locator(".route-picker .chip").count();
  let found = false;
  for (let i = 0; i < chips && !found; i++) {
    await page.locator(".route-picker .chip").nth(i).click();
    await page.waitForTimeout(2000);
    found = (await page.locator(".route-fuel").count()) > 0;
  }
  if (!found) throw new Error("no session produced a terrain-aware fuelling plan");
  await page.locator(".elev-svg").waitFor({ timeout: 10000 });

  // Every stop must carry a time, a place on the route and a dose.
  const rows = await page.locator(".elev-stop-row").count();
  if (rows === 0) throw new Error("height profile rendered with no fuel stops");
  const first = await page.locator(".elev-stop-row").first().innerText();
  if (!/\d+:\d\d/.test(first)) throw new Error(`stop has no time: ${first}`);
  if (!/km \d/.test(first)) throw new Error(`stop has no position: ${first}`);
  if (!/\d+ g/.test(first)) throw new Error(`stop has no dose: ${first}`);

  // The chart's distance must agree with the session summary above it —
  // two different numbers for the same ride is worse than none.
  // Both panels must settle on the *same* session. The chart reloads when the
  // route changes, so a reading taken mid-switch compares one session's summary
  // with another's terrain — which is what this used to do, and what made it
  // fail on a CI runner and pass here.
  await waitFor("the chart and the session summary never agreed on a distance", async () => {
    const foot = await page.locator(".energy-foot").innerText();
    const chartEl = page.locator(".elev-foot");
    if ((await chartEl.count()) === 0) return "chart still loading";
    const sessionKm = Number(/([\d.]+) km/.exec(foot)?.[1]);
    const chartKm = Number(/([\d.]+) km/.exec(await chartEl.innerText())?.[1]);
    if (!Number.isFinite(sessionKm) || !Number.isFinite(chartKm)) return `session=${sessionKm} chart=${chartKm}`;
    return Math.abs(sessionKm - chartKm) <= Math.max(1, sessionKm * 0.05)
      ? true
      : `chart says ${chartKm} km but the session says ${sessionKm} km`;
  });

  // An estimated profile must say so — a chart looks authoritative either way.
  const estimatedChart = (await page.locator(".elev-chart-estimated").count()) > 0;
  const saysEstimated = (await page.locator(".elev-estimated").count()) > 0;
  if (estimatedChart !== saysEstimated) throw new Error("estimated profile is not labelled as estimated");
});
await step("the weather panel names its source instead of implying MeteoSwiss", async () => {
  const note = await page.locator(".geo-source-note").innerText();
  // Whatever the environment allows, the label must match the data: never
  // "MeteoSwiss" over a number we guessed.
  if (/MeteoSwiss ·/.test(note)) return; // a real station reading
  if (!/estimate|ICON-CH/i.test(note)) throw new Error(`unlabelled weather source: ${note}`);
});

console.log("── past-run debrief ──");
await step("the start screen asks about runs that were never reviewed", async () => {
  await page.click('button.topnav-tab:has-text("Home")');
  await page.waitForSelector(".home-greeting");
  const pending = await page.locator(".pill-todo").count();
  if (pending === 0) throw new Error("synced sessions but nothing offered for review");
  const cta = await page.locator(".home-session-actions .link-strong").count();
  if (cta === 0) throw new Error('no "How did it go?" on any recent session');
});
await step("it opens the debrief for that exact session, not the newest one", async () => {
  // Deliberately take the *oldest* offered session: a handoff that always lands
  // on the latest run would pass if we clicked the first.
  const rows = page.locator(".home-session");
  const n = await rows.count();
  let target = null;
  for (let i = n - 1; i >= 0 && !target; i--) {
    if (await rows.nth(i).locator(".link-strong").count()) target = rows.nth(i);
  }
  const rowText = await target.innerText();
  const km = /([\d.]+) km/.exec(rowText)?.[1];
  await target.locator(".link-strong").click();
  await page.waitForSelector(".debrief", { timeout: 20000 });
  const chip = await page.locator(".route-picker .chip-active").innerText();
  const chipKm = /(\d+) km/.exec(chip)?.[1];
  if (km && chipKm && Math.abs(Number(km) - Number(chipKm)) > 1) {
    throw new Error(`asked about a ${km} km session, opened a ${chipKm} km one`);
  }
});
await step("an unlogged session is asked about, never given an invented verdict", async () => {
  const verdict = await page.locator(".debrief-verdict").innerText();
  if (!/Not enough to judge/.test(verdict)) throw new Error(`invented a verdict with no log: ${verdict}`);
  await page.waitForSelector(".debrief-log");
});
await step("logging it turns the panel into the answer", async () => {
  await page
    .locator('.debrief-log [role="radiogroup"][aria-label="Energy"] [role="radio"]:has-text("Bonked")')
    .click();
  await page.locator("#debrief-actual").fill("0");
  await page.click('.debrief-log button:has-text("Save and see the debrief")');
  await page.waitForSelector(".debrief-compare", { timeout: 15000 });

  const verdict = await page.locator(".debrief-verdict").innerText();
  if (!/Under-fuelled/.test(verdict)) throw new Error(`bonking on nothing read as: ${verdict}`);
  // The gap must agree with the two figures it sits between — a headline that
  // contradicts its own numbers is worse than no headline.
  const compare = (await page.locator(".debrief-compare").innerText()).replace(/\n/g, " ");
  const [required, actual] = [...compare.matchAll(/(\d+) g\/h/g)].map((m) => Number(m[1]));
  if (actual !== 0) throw new Error(`logged 0 g/h but the debrief says ${actual}: ${compare}`);
  const shouldBeShort = required - actual >= 10;
  if (shouldBeShort !== /g\/h short/.test(compare)) {
    throw new Error(`gap label disagrees with the figures: ${compare}`);
  }
  const findings = await page.locator(".debrief-findings").innerText();
  if (/finding\./.test(findings)) throw new Error(`untranslated finding key: ${findings}`);
});
await step("it says what to take, by name, and where — in one list, not two", async () => {
  // The debrief must never print its own copy of the stops — one list, re-titled.
  if ((await page.locator(".debrief .elev-stop-row").count()) > 0) {
    throw new Error("the debrief duplicates the route's stop list");
  }

  // A short or flat session legitimately needs no on-route feeding. The contract
  // is that the debrief only promises a plan when there is one, so check which
  // case this session is and hold it to the matching promise.
  const hasPlan = (await page.locator(".route-fuel").count()) > 0;
  if (!hasPlan) {
    if ((await page.locator(".debrief-lead").count()) > 0) {
      throw new Error("the debrief points at a fuelling plan that isn't there");
    }
    return;
  }

  const title = await page.locator(".route-fuel .geo-title").innerText();
  if (!/next time/i.test(title)) throw new Error(`plan not re-framed for the debrief: ${title}`);
  const rows = await page.locator(".route-fuel .elev-stop-row").count();
  if (rows === 0) throw new Error("a fuelling section with no stops in it");
  const first = await page.locator(".route-fuel .elev-stop-row").first().innerText();
  if (!/\d+:\d\d/.test(first)) throw new Error(`no time on the stop: ${first}`);
  if (!/km \d/.test(first)) throw new Error(`no place on the stop: ${first}`);
  // A named product is the whole point — "25 g" is what the athlete already knew.
  const product = await page.locator(".route-fuel .elev-stop-row").first().locator(".elev-stop-product").count();
  if (product === 0) throw new Error(`no product named at the stop: ${first.replace(/\n/g, " | ")}`);
});
await step("the start screen shows it as reviewed afterwards", async () => {
  await page.click('button.topnav-tab:has-text("Home")');
  await page.waitForSelector(".home-greeting");
  if ((await page.locator(".pill-done").count()) === 0) throw new Error("logged session is not marked as reviewed");
});

console.log("── engine depth & crunching ──");
await step("the plan refuses to promise more than a gut can absorb", async () => {
  await planMode("A session");
  await page.waitForSelector("text=Carb / hour", { timeout: 15000 });
  // A five-hour race is where the target climbs past what any gut takes.
  await choose("Goal", "Race preparation");
  await choose("Activity", "Cycling");
  await page.locator("#duration").fill("300");
  await choose("Intensity", "Race");
  await page.waitForTimeout(1000);

  const target = Number(/(\d+)/.exec(await page.locator('.stat:has-text("Carb / hour") .stat-value').first().innerText())?.[1]);
  if (!(target > 90)) throw new Error(`expected a target above the absorption ceiling, got ${target}`);
  await page.waitForSelector(".absorb-warn", { timeout: 10000 });
  const warn = await page.locator(".absorb-warn").innerText();
  if (!/g\/h/.test(warn)) throw new Error(`warning names no rate: ${warn}`);
  // And it must say what to do, not just that something is wrong.
  if ((await page.locator(".absorb-fix").innerText()).length < 10) throw new Error("no fix offered");
});
await step("fitness, fatigue and form are computed from real sessions", async () => {
  await page.click('button.topnav-tab:has-text("Insights")');
  await page.waitForSelector(".load", { timeout: 20000 });
  const text = await page.locator(".load").innerText();
  for (const label of ["Fitness", "Fatigue", "Form"]) {
    if (!text.includes(label)) throw new Error(`${label} missing from the load card`);
  }
  // Two curves, not one — the whole point is the gap between them.
  if ((await page.locator(".load-spark polyline").count()) !== 2) throw new Error("load chart is not fitness vs fatigue");
});

console.log("── phase 1: free, race-first, affiliate ──");
await step("nothing is behind a paywall", async () => {
  await page.click(".account-btn");
  const menu = await page.locator(".account-dropdown").innerText();
  if (/Subscription/.test(menu)) throw new Error("billing is offered on a free app");
  await page.keyboard.press("Escape");
  await page.click('button.topnav-tab:has-text("Insights")');
  await page.waitForTimeout(600);
  const insights = await page.locator(".dash").innerText();
  if (/Available on Pro/i.test(insights)) throw new Error("upsell shown on a free app");
});
await step("a race GPX becomes a fuelling plan for that exact course", async () => {
  const { writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  // A climbing Swiss course, so the plan has to place feeds by terrain.
  const pts = Array.from({ length: 120 }, (_, i) => {
    const f = i / 119;
    return `<trkpt lat="${(46.686 + f * 0.09).toFixed(5)}" lon="${(7.863 + Math.sin(f * Math.PI) * 0.05).toFixed(5)}"><ele>${(570 + Math.sin(f * Math.PI) * 1250).toFixed(1)}</ele></trkpt>`;
  }).join("");
  const file = join(tmpdir(), `e2e-race-${Date.now()}.gpx`);
  writeFileSync(file, `<?xml version="1.0"?><gpx version="1.1"><trk><name>Jungfrau Marathon</name><trkseg>${pts}</trkseg></trk></gpx>`);

  await planMode("A route");
  // The route view opens on your own recorded routes when there are any; the
  // importer is the other source, one click away.
  await choose("Which route", "Import a course").catch(() => {});
  await page.waitForSelector(".race", { timeout: 15000 });
  await page.locator(".race input[type=file]").setInputFiles(file);
  await page.waitForSelector(".race-head", { timeout: 20000 });

  const head = await page.locator(".race-head").innerText();
  if (!/Jungfrau Marathon/.test(head)) throw new Error(`route name lost: ${head}`);
  if (!/↑ \d{3,}/.test(head)) throw new Error(`no climbing read from the GPX: ${head}`);
  // The point of the whole feature: a plan for a course never run before.
  await page.waitForSelector(".race .route-fuel", { timeout: 30000 });
  const stops = await page.locator(".race .route-fuel .elev-stop-row").count();
  if (stops === 0) throw new Error("imported a course but placed no fuelling");
  const first = await page.locator(".race .route-fuel .elev-stop-row").first().innerText();
  if (!/km \d/.test(first)) throw new Error(`stop has no place on the course: ${first}`);
  if ((await page.locator(".race .elev-stop-product").count()) === 0) {
    throw new Error("no product named on the imported course");
  }
});
await step("the forecast says where the tank runs down on this course", async () => {
  // A mountain marathon is exactly the case a watch cannot answer in advance:
  // where does the plan hold, and where would water alone leave you.
  await page.waitForSelector(".race .sim", { timeout: 20000 });
  await page.locator(".race .sim").scrollIntoViewIfNeeded();

  const headline = await page.locator(".race .sim-headline").innerText();
  if (!/km \d|%/.test(headline)) throw new Error(`forecast names neither a kilometre nor a reserve: ${headline}`);

  // Both curves have to be drawn — one of them is the whole argument.
  if ((await page.locator(".race .sim-line-fuelled").count()) === 0) throw new Error("no fuelled curve");
  if ((await page.locator(".race .sim-line-unfuelled").count()) === 0) throw new Error("no water-only curve");

  // And the four numbers behind it: burn, intake, sweat, finish.
  const stats = await page.locator(".race .sim .stat").count();
  if (stats < 4) throw new Error(`forecast shows ${stats} figures, expected burn/intake/sweat/finish`);
  const body = await page.locator(".race .sim").innerText();
  if (!/\d+ g/.test(body)) throw new Error(`forecast prints no carbohydrate figure: ${body}`);
  if (!/[\d.]+ L/.test(body)) throw new Error(`forecast prints no fluid figure: ${body}`);

  // An estimated height profile must carry through to the forecast drawn on it.
  const estimatedProfile = (await page.locator(".race .elev-chart-estimated").count()) > 0;
  const estimatedSim = (await page.locator(".race .sim-chart-estimated").count()) > 0;
  if (estimatedProfile !== estimatedSim) throw new Error("forecast hides that its profile was estimated");
});
await step("buying means going to the brand, not our own checkout", async () => {
  await page.locator(".geo-plan").first().click();
  await page.waitForSelector(".cart", { timeout: 20000 });
  await page.locator(".cart").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  if ((await page.locator(".cart-checkout").count()) > 0) throw new Error("still selling directly");
  const partners = await page.locator(".cart-partner").count();
  if (partners === 0) throw new Error("no partner shop offered for the plan");
  // With no signed programs, the app must say so rather than imply one.
  // Say what we earn, either way — a commission, or nothing.
  const note = await page.locator(".cart .note-top").last().innerText();
  if (!/commission|earn nothing|no agreement/i.test(note)) {
    throw new Error(`how this is paid for is not stated: ${note}`);
  }
});

console.log("── four Swiss languages ──");
await step("French and Italian are real, not a fallback to English", async () => {
  for (const [label, expect] of [
    ["Français", /Accueil|Planifier/],
    ["Italiano", /Inizio|Pianifica/],
    ["Deutsch", /Start|Planen/],
  ]) {
    await page.click(".account-btn");
    await page.selectOption("#lang-select", { label });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const nav = (await page.locator(".topnav-tab").allInnerTexts()).join(", ");
    if (!expect.test(nav)) throw new Error(`${label} did not switch the interface: ${nav}`);
    const code = label === "Français" ? "fr" : label === "Italiano" ? "it" : "de";
    const htmlLang = await page.getAttribute("html", "lang");
    if (htmlLang !== code) throw new Error(`html lang is "${htmlLang}", expected "${code}"`);
  }
  // Back to English for the steps that follow.
  await page.click(".account-btn");
  await page.selectOption("#lang-select", { label: "English" });
  await page.keyboard.press("Escape");
});
await step("the language picker is a dropdown, and it holds every language", async () => {
  await page.click(".account-btn");
  await page.waitForSelector("#lang-select");
  const options = await page.locator("#lang-select option").allInnerTexts();
  if (options.length < 4) throw new Error(`only ${options.length} languages offered: ${options.join(", ")}`);
  // A select never clips its own options, but it can still overflow the menu.
  const menu = await page.locator(".account-dropdown").boundingBox();
  const sel = await page.locator("#lang-select").boundingBox();
  if (sel.x + sel.width > menu.x + menu.width + 1) throw new Error("the language select overflows the menu");
  await page.keyboard.press("Escape");
});

console.log("── controls ──");
await step("settings that apply immediately are switches, and they flip", async () => {
  await page.click(".account-btn");
  await page.click("text=Profile & health");
  await page.waitForSelector("text=Body & preferences");
  const sw = page.locator('.switch-row input[role="switch"]').first();
  if ((await sw.count()) === 0) throw new Error("no switch on the profile screen");
  const before = await sw.isChecked();
  // Click the label, as a person does — the visible track is not the input.
  await page.locator(".switch-row").first().click();
  if ((await sw.isChecked()) === before) throw new Error("switch did not flip");
  // Keyboard: Space must work, which is why this is an input and not a button.
  await sw.focus();
  await page.keyboard.press(" ");
  if ((await sw.isChecked()) !== before) throw new Error("Space did not toggle the switch");
});
await step("every dropdown is themed, on-screen and aligned with its label", async () => {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("select")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.backgroundImage === "none") out.push(`${el.id || "select"}: native arrow, not the themed chevron`);
      if (r.height < 36) out.push(`${el.id || "select"}: ${Math.round(r.height)}px tall`);
      if (r.right > window.innerWidth + 1) out.push(`${el.id || "select"}: overflows the viewport`);
      const lab = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      if (lab && Math.abs(lab.getBoundingClientRect().x - r.x) > 1) {
        out.push(`${el.id}: not aligned with its label`);
      }
    }
    return out;
  });
  if (bad.length) throw new Error(bad.join("; "));
});
await step("a single choice shows all its options, and answers the arrow keys", async () => {
  await planMode("A session");
  await page.waitForSelector("text=Carb / hour", { timeout: 15000 });

  // The goal picker exists to show the sentence that tells two goals apart.
  // A dropdown collapsed four of the five and truncated the fifth.
  const goals = page.locator('[role="radiogroup"][aria-label="Goal"] [role="radio"]');
  if ((await goals.count()) !== 5) throw new Error(`expected 5 goals on screen, saw ${await goals.count()}`);
  const blurbs = await page.locator('[aria-label="Goal"] .choice-card-blurb').allInnerTexts();
  if (blurbs.length !== 5 || blurbs.some((b) => b.trim().length < 10)) {
    throw new Error(`goals are not explaining themselves: ${blurbs.join(" | ")}`);
  }
  // Nothing may be cut off — truncation is the defect this replaced.
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Goal"] .choice-card-blurb')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.textContent),
  );
  if (clipped.length) throw new Error(`clipped goal text: ${clipped.join(" | ")}`);

  // Exactly one option is checked, and the arrow keys move that selection —
  // the radio-group contract these groups claim through their roles.
  const checked = async (label) =>
    page.locator(`[role="radiogroup"][aria-label="${label}"] [role="radio"][aria-checked="true"]`);
  if ((await (await checked("Intensity")).count()) !== 1) throw new Error("intensity has no single selection");
  const was = await (await checked("Intensity")).innerText();
  await (await checked("Intensity")).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const now = await (await checked("Intensity")).innerText();
  if (was === now) throw new Error(`ArrowRight did not move the selection off "${was}"`);
});
await step("the account menu opens under its trigger and stays on screen", async () => {
  await page.click(".account-btn");
  await page.waitForSelector(".account-dropdown");
  const menu = await page.locator(".account-dropdown").boundingBox();
  const btn = await page.locator(".account-btn").boundingBox();
  const vw = page.viewportSize().width;
  if (menu.x < 0 || menu.x + menu.width > vw + 1) throw new Error(`menu runs off screen (x=${menu.x}, w=${menu.width})`);
  if (Math.abs(menu.x + menu.width - (btn.x + btn.width)) > 1) throw new Error("menu is not aligned to its trigger");
  if (menu.y < btn.y + btn.height - 1) throw new Error("menu overlaps its trigger");
  await page.keyboard.press("Escape");
});

console.log("── appearance & language ──");
await step("light and dark are switchable and stick to <html>", async () => {
  await page.locator(".account-btn").click();
  await page.locator(".choice", { hasText: "Light" }).click();
  await page.waitForTimeout(300);
  const light = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (light !== "light") throw new Error(`expected light, got ${light}`);
  // The page background must actually change, not just the attribute.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (!/^rgb\((2[0-9]{2}|1[89][0-9])/.test(bg)) throw new Error(`light background did not apply: ${bg}`);
  await page.locator(".choice", { hasText: "Dark" }).click();
  await page.waitForTimeout(300);
  const dark = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (dark !== "dark") throw new Error(`expected dark, got ${dark}`);
});
await step("every chart colour and ink is legible in both themes", async () => {
  // Reading the stylesheet cannot answer this: the tokens are chained
  // (--chart-primary → --post-ink → --success-ink → --success) and several are
  // color-mix(), so only a browser knows what they actually resolve to. Two
  // real defects hid behind that — a Swiss red carrying 3.5:1 as dark-mode
  // text, and an amber marker at 2.8:1 on a white panel.
  const TOKENS = {
    // Thin marks need 3:1 to be distinguishable (WCAG 1.4.11 non-text).
    "chart-primary": 3, "chart-baseline": 3, "chart-limit": 3, "chart-stop": 3,
    "chart-stop-climb": 3, "chart-terrain": 3, "chart-fitness": 3,
    "chart-fatigue": 3, "chart-alert": 3,
    // Text needs 4.5:1.
    "accent-ink": 4.5, "info-ink": 4.5, "warn-ink": 4.5, "success-ink": 4.5,
    "accent-purple-ink": 4.5, text: 4.5, muted: 4.5,
  };
  const measured = await page.evaluate((tokens) => {
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const resolve = (expr) => {
      probe.style.color = expr;
      return getComputedStyle(probe).color;
    };
    const out = {};
    for (const theme of ["dark", "light"]) {
      document.documentElement.setAttribute("data-theme", theme);
      out[theme] = { panel: resolve("var(--panel)"), tokens: {} };
      for (const t of Object.keys(tokens)) out[theme].tokens[t] = resolve(`var(--${t})`);
    }
    probe.remove();
    return out;
  }, TOKENS);

  const parse = (css) => (css.match(/rgba?\(([^)]+)\)/)?.[1] ?? "")
    .split(/[\s,/]+/).filter(Boolean).map(Number);
  const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (f, b) => {
    const [x, y] = [lum(f) + 0.05, lum(b) + 0.05];
    return Math.round((Math.max(x, y) / Math.min(x, y)) * 100) / 100;
  };

  const bad = [];
  for (const [theme, { panel, tokens }] of Object.entries(measured)) {
    const bg = parse(panel);
    for (const [t, need] of Object.entries(TOKENS)) {
      const rgb = parse(tokens[t]);
      // An unresolvable token voids whatever declaration used it, silently.
      if (rgb.length < 3) {
        bad.push(`${theme}/${t} does not resolve`);
        continue;
      }
      const r = ratio(rgb, bg);
      if (r < need) bad.push(`${theme}/${t} ${r}:1 (needs ${need})`);
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  if (bad.length) throw new Error(bad.join("; "));
});
await step("every filled badge carries the text sitting on it, in both themes", async () => {
  /*
   * The step above asks "is this colour readable *on the page*". This one asks
   * the opposite and stricter question: a status pill is a coloured fill with a
   * word on top, and the fill has to carry the word.
   *
   * Walking the app cannot answer it, because most of these states never render
   * in one session — a single athlete is one training-load verdict, not four —
   * so the failing ones stayed invisible. Every phase badge in the app measured
   * 2.83–3.59:1 in the light theme, and "Finish" was white on a near-white map
   * pin at 1.10:1. So each state is built here, in the live document, where the
   * chained tokens actually resolve.
   */
  const CASES = [
    ["badge badge-pre"], ["badge badge-during"], ["badge badge-post"],
    ["acwr-badge acwr-optimal"], ["acwr-badge acwr-detraining"],
    ["acwr-badge acwr-caution"], ["acwr-badge acwr-high-risk"],
    ["map-pin start"], ["map-pin finish"], ["map-pin fuel"],
    ["btn done"], ["btn btn-primary"], ["btn-danger-solid"],
    // These two take their fill from a parent state class.
    ["toast-mark", "toast-success"], ["toast-mark", "toast-error"], ["toast-mark", "toast-info"],
    ["milestone-mark", "milestone done"],
  ];
  const measured = await page.evaluate((cases) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:-9999px;left:0";
    document.body.appendChild(host);
    const out = {};
    for (const theme of ["dark", "light"]) {
      document.documentElement.setAttribute("data-theme", theme);
      out[theme] = [];
      for (const [cls, wrap] of cases) {
        const outer = document.createElement("div");
        if (wrap) outer.className = wrap;
        const el = document.createElement("span");
        el.className = cls;
        el.textContent = "Optimal";
        outer.appendChild(el);
        host.appendChild(outer);
        const cs = getComputedStyle(el);
        out[theme].push({
          name: wrap ? `.${cls} in .${wrap}` : `.${cls}`,
          fg: cs.color,
          bg: cs.backgroundColor,
          size: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight) || 400,
        });
      }
      host.replaceChildren();
    }
    host.remove();
    return out;
  }, CASES);

  /* `color(srgb …)` is 0–1 and `rgb()` is 0–255; reading one as the other turns
     white into near-black, which is how a first pass at this "found" nine
     failures that were not there. */
  const rgb = (css) => {
    const n = (css.match(/[\d.]+/g) ?? []).map(Number);
    return css.startsWith("color(") ? n.slice(0, 3).map((c) => c * 255) : n.slice(0, 3);
  };
  const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (f, b) => {
    const [x, y] = [lum(f) + 0.05, lum(b) + 0.05];
    return Math.round((Math.max(x, y) / Math.min(x, y)) * 100) / 100;
  };
  const bad = [];
  for (const [theme, items] of Object.entries(measured)) {
    for (const { name, fg, bg, size, weight } of items) {
      // A badge with no fill of its own is not a filled shape; skip rather than
      // measure it against a transparent background and invent a number.
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
        bad.push(`${theme}/${name} has no fill — the case is stale`);
        continue;
      }
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const got = ratio(rgb(fg), rgb(bg));
      if (got < need) bad.push(`${theme}/${name} ${got}:1 (needs ${need})`);
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  if (bad.length) throw new Error(bad.join("; "));
});
await step("German switches the interface and the html lang", async () => {
  await page.selectOption("#lang-select", { label: "Deutsch" });
  await page.waitForTimeout(400);
  const lang = await page.evaluate(() => document.documentElement.lang);
  if (lang !== "de") throw new Error(`html lang is ${lang}`);
  const nav = await page.locator(".topnav").innerText();
  if (!/Planen/.test(nav)) throw new Error(`nav did not translate: ${nav.replace(/\n/g, " | ")}`);
  // The screen body must translate too, not only the chrome.
  await page.keyboard.press("Escape");
  await page.locator('button.topnav-tab:has-text("Planen")').click();
  await page.waitForSelector("text=Sportart", { timeout: 8000 });
  await page.waitForSelector("text=Intensität", { timeout: 8000 });
});
await step("the choice survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const lang = await page.evaluate(() => document.documentElement.lang);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (lang !== "de" || theme !== "dark") throw new Error(`lost after reload: lang=${lang} theme=${theme}`);
  // Put it back so later steps read English.
  await page.evaluate(() => {
    localStorage.setItem("ygf.lang", "en");
    localStorage.setItem("ygf.theme", "system");
  });
});

console.log("── accessibility ──");
await step("skip link is the first tab stop", async () => {
  await page.goto(B, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const t = await page.evaluate(() => document.activeElement?.textContent ?? "");
  if (!/skip to content/i.test(t)) throw new Error(`first tab stop was "${t}"`);
});

console.log("── a finger, not a mouse ──");
await step("every control is big enough to hit with a thumb", async () => {
  // Measured once and found six kinds under 44 px, the smallest of them the
  // "Buy at <brand>" link at 24 px — the highest-intent click in the app. The
  // rules are keyed to `pointer: coarse`, so this needs a context that reports
  // one; a desktop Chromium says "fine" and the rules never apply.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await touch.newPage();
  try {
    const mail = `touch-${Date.now()}@club.ch`;
    await tp.goto(B, { waitUntil: "networkidle" });
    await tp.click("text=Continue with email");
    await tp.fill('input[type="email"]', mail);
    await tp.click("text=Email me a sign-in link");
    await tp.waitForSelector("text=Check your inbox");
    await tp.click("text=Open the link (dev mailer)");
    await tp.waitForSelector("text=Fuel your body to go further", { timeout: 20000 });
    await tp.click("text=Get started");
    await tp.waitForSelector("text=Connect your training");
    await tp.locator('.onboard-connect:has-text("Strava")').click();
    await tp.waitForSelector("text=Tune it to you", { timeout: 20000 });
    await tp.click('button:has-text("Continue →")');
    await tp.click("text=Build my first plan");
    await tp.waitForSelector(".home-greeting", { timeout: 20000 });

    const small = new Set();
    for (const tab of ["Home", "Plan", "Insights", "Catalog"]) {
      await tp.click(`button.topnav-tab:has-text("${tab}")`);
      await tp.waitForTimeout(1500);
      for (const found of await tp.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("button, a[href], [role=radio], [role=tab], summary, input")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || r.height >= 44) continue;
          out.push(`${(el.getAttribute("class") ?? el.tagName).split(" ")[0]} (${Math.round(r.height)}px)`);
        }
        return out;
      })) {
        small.add(found);
      }
    }
    if (small.size) throw new Error(`under 44 px: ${[...small].join(", ")}`);
  } finally {
    await touch.close();
  }
});

console.log("── a tablet, where the nav used to hide itself ──");
await step("every destination is reachable at every width, not just the wide ones", async () => {
  // The defect: the tab strip scrolls sideways when it runs out of room, and
  // at 768 px it ran out — an iPad in portrait showed "…Catalo" with no hint
  // that the bar could be swiped, so two destinations were effectively gone.
  const bad = [];
  for (const width of [1440, 1024, 900, 860, 800, 768, 700, 660]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const acct = document.querySelector(".account-btn")?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll(".topnav-tab")];
      // Two boxes collide only if they overlap on both axes: comparing x alone
      // calls a nav that has moved to its own row a collision.
      const overlaps = (a, b) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const clipped = tabs
        .map((el) => el.querySelector(".topnav-label"))
        .filter((l) => l && l.scrollWidth > l.clientWidth + 1)
        .map((l) => l.textContent);
      const collided = acct
        ? tabs.filter((el) => overlaps(el.getBoundingClientRect(), acct)).map((el) => el.textContent?.trim())
        : [];
      return { clipped, collided, onScreen: tabs.length };
    });
    if (state.clipped.length) bad.push(`${width}px: clipped ${state.clipped.join(", ")}`);
    if (state.collided.length) bad.push(`${width}px: the account chip sits on ${state.collided.join(", ")}`);
    if (state.onScreen < 3) bad.push(`${width}px: only ${state.onScreen} destinations on screen`);
  }
  await page.setViewportSize({ width: 1180, height: 900 });
  if (bad.length) throw new Error(bad.join("; "));
});

console.log("── a phone, in the longest language ──");
await step("no screen is wider than the phone it is on, in German", async () => {
  // The defect this guards: a grid track's automatic minimum is its content's
  // min-content width, so one row of equal columns with long German labels
  // widened its whole column past the viewport — and because the page clips
  // sideways overflow, the right-hand edge of every control in that column was
  // simply cut off with nothing to scroll to. English fitted, so it was
  // invisible until someone switched language on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem("ygf.lang", "de"));
  await page.goto(B, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const tooWide = () =>
    page.evaluate(() => {
      // Something that sticks out of a box which clips or scrolls is contained
      // on purpose — a map tile, a wide table, a chart drawn past its frame.
      // Only overflow that reaches the page unclipped is a layout defect, so
      // the walk stops at `.page`, whose own `overflow-x: clip` is what turns
      // this class of bug into silent truncation in the first place.
      const contained = (el) => {
        for (let p = el.parentElement; p && !p.classList.contains("page"); p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== "visible") return true;
        }
        return false;
      };
      const names = [...document.querySelectorAll(".page *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 40 && r.right > window.innerWidth + 1 && !contained(el);
        })
        .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ")[0]}`);
      return [...new Set(names)].slice(0, 6);
    });

  const bad = [];
  const tabs = await page.locator(".topnav-tab").count();
  for (let i = 0; i < tabs; i++) {
    await page.locator(".topnav-tab").nth(i).click();
    await page.waitForTimeout(1600);
    const name = (await page.locator(".topnav-tab").nth(i).innerText()).replace(/\n/g, " ");
    // A phone bar holds four targets and a "More"; the screens behind it have
    // to be walked too, or half the app goes unchecked at the width where it
    // matters most.
    if (await page.locator(".nav-sheet-item").count()) {
      const items = await page.locator(".nav-sheet-item").count();
      for (let m = 0; m < items; m++) {
        // The sheet is already open on the first pass — choosing an item closes
        // it, so only the later passes need it opened again.
        if ((await page.locator(".nav-sheet-item").count()) === 0) await page.locator(".topnav-more").click();
        await page.locator(".nav-sheet-item").nth(m).click();
        await page.waitForTimeout(1600);
        const sheetName = (await page.locator(".topnav-more").innerText()).replace(/\n/g, " ");
        for (const el of await tooWide()) bad.push(`${sheetName} ${m}: ${el}`);
      }
      continue;
    }
    for (const el of await tooWide()) bad.push(`${name}: ${el}`);
    // The Plan screen is three screens behind one switcher; check all of them.
    if (await page.locator(".plan-modes").count()) {
      const modes = await page.locator(".plan-mode").count();
      for (let m = 0; m < modes; m++) {
        await page.locator(".plan-mode").nth(m).click();
        await page.waitForTimeout(1200);
        for (const el of await tooWide()) bad.push(`${name}/mode ${m}: ${el}`);
      }
    }
  }

  await page.evaluate(() => localStorage.setItem("ygf.lang", "en"));
  await page.setViewportSize({ width: 1180, height: 900 });
  if (bad.length) throw new Error([...new Set(bad)].join("; "));
});

// Last on purpose: the second of these two steps ends the account, so nothing
// can follow it.
console.log("── the athlete's own data ──");
await step("privacy is reachable from the account menu and names the third parties", async () => {
  await page.goto(B, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.click(".account-btn");
  await page.waitForTimeout(400);
  await page.click("text=Privacy & your data");
  await page.waitForSelector(".privacy", { timeout: 15000 });
  const parties = await page.locator(".privacy-third-parties li").count();
  if (parties < 4) throw new Error(`only ${parties} third parties disclosed`);
});

await step("the export is a real file, holds this athlete's sessions, and leaks no token", async () => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click('button:has-text("Download everything we hold")'),
  ]);
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  const dump = JSON.parse(readFileSync(path, "utf8"));
  if (!dump.activities?.length) throw new Error("export contained no activities");
  if (!dump.profile) throw new Error("export contained no body profile");
  // An export is handed to the athlete and often forwarded onwards. A provider
  // access token in it is a live credential to someone else's Strava account.
  if (/"(accessToken|refreshToken)"/.test(JSON.stringify(dump))) throw new Error("export leaked provider tokens");
});

await step("deleting the account really deletes it — the same address comes back empty", async () => {
  await page.click('button:has-text("Delete my account")');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Delete everything")');
  await page.waitForSelector(".auth-card", { timeout: 20000 });

  // The server's word for it, not the browser's: signing in again with the
  // same address must start onboarding, which only happens with no profile.
  await page.click("text=Continue with email");
  await page.fill('input[type="email"]', email);
  await page.click("text=Email me a sign-in link");
  await page.waitForSelector("text=Check your inbox");
  await page.click("text=Open the link (dev mailer)");
  await page.waitForSelector("text=Fuel your body to go further", { timeout: 20000 });
});

await browser.close();
if (errors.length) console.log("\nconsole/page errors:\n  " + errors.join("\n  "));
console.log(`\n${failed === 0 && errors.length === 0 ? "PASS" : "FAIL"} — ${failed} failed step(s), ${errors.length} error(s)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
