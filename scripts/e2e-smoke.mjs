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

const B = process.env.BASE_URL ?? "http://localhost:8787";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const errors = [];
let failed = 0;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// Blocked tile/geodata hosts are an environment limit, not an app defect: the
// map is *supposed* to fall back when swisstopo or MeteoSwiss is unreachable,
// and that fallback is asserted below. Filter by the failing URL, not by the
// message text, so real errors are never swallowed.
const EXTERNAL_GEO = /geo\.admin\.ch|cartocdn\.com|open-meteo\.com/;
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (EXTERNAL_GEO.test(m.location()?.url ?? "")) return;
  errors.push(`console: ${m.text()}`);
});
page.on("requestfailed", (r) => {
  if (!EXTERNAL_GEO.test(r.url())) errors.push(`requestfailed: ${r.url()}`);
});

const step = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label} — ${e.message.split("\n")[0]}`);
  }
};

const email = `smoke-${Date.now()}@club.ch`;

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
  const sessions = Number(/(\d+)\s*Sessions/.exec(week.replace(/\n/g, " "))?.[1]);
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
  const acts = await page.locator('.stat:has-text("Activities") .stat-value').first().textContent();
  if (Number(acts) <= 0) throw new Error("no synced activities");
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
  await page.waitForTimeout(1000);
  await page.click('button.topnav-tab:has-text("Connect")');
  await page.waitForTimeout(2000);
  const connect = await page.locator(".from-profile span").first().innerText();
  if (!/83 kg/.test(connect)) throw new Error(`connect ignored the profile: ${connect}`);
  await page.click('button.topnav-tab:has-text("Plan")');
  await page.waitForTimeout(1200);
  const plan = await page.locator(".from-profile span").first().innerText();
  if (!/83 kg/.test(plan)) throw new Error(`planner ignored the profile: ${plan}`);
});

console.log("── commerce ──");
await step("a hand-off to a partner shop is recorded, so commission can be reconciled", async () => {
  await page.click('button.topnav-tab:has-text("Plan")');
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
  await page.click('button.topnav-tab:has-text("Connect")');
  await page.waitForSelector("text=Route & fuel stops", { timeout: 15000 });
  await page.waitForSelector(".map-layers", { timeout: 15000 });
  await page.waitForTimeout(2500);
  if (swisstopo.length === 0) throw new Error("no swisstopo tiles were requested");
  // The official editions must all be offered, not just a generic basemap.
  const labels = await page.locator(".map-layers .chip").allInnerTexts();
  for (const want of ["National map", "Aerial", "Muted"]) {
    if (!labels.includes(want)) throw new Error(`missing swisstopo layer "${want}" (got ${labels.join(", ")})`);
  }
});
await step("the service connected during setup shows as connected", async () => {
  // The connection belongs to the signed-in athlete, so Connect must read it
  // with the session — not as an anonymous demo role.
  const strava = await page.locator('.provider-card:has-text("Strava")').innerText();
  if (!/Disconnect/.test(strava)) throw new Error(`Strava was connected in setup but reads: ${strava}`);
});
await step("a run can be chosen, not just the latest ride", async () => {
  const chips = await page.locator(".route-picker .chip").allInnerTexts();
  const run = chips.find((c) => /^Run|^Trail run/.test(c));
  if (!run) throw new Error(`no running session offered (got ${chips.join(" | ")})`);
  await page.locator(".route-picker .chip").filter({ hasText: /^Run|^Trail run/ }).first().click();
  await page.waitForTimeout(1200);
  const foot = await page.locator(".energy-foot").innerText();
  if (!/run/i.test(foot)) throw new Error(`picker did not switch to a run: ${foot}`);
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
  const foot = await page.locator(".energy-foot").innerText();
  const chart = await page.locator(".elev-foot").innerText();
  const sessionKm = Number(/([\d.]+) km/.exec(foot)?.[1]);
  const chartKm = Number(/([\d.]+) km/.exec(chart)?.[1]);
  if (Math.abs(sessionKm - chartKm) > Math.max(1, sessionKm * 0.05)) {
    throw new Error(`chart says ${chartKm} km but the session says ${sessionKm} km`);
  }

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
  await page.locator(".debrief-log .segmented").nth(1).locator('button:has-text("Bonked")').click();
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

  await page.click('button.topnav-tab:has-text("Plan")');
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
await step("buying means going to the brand, not our own checkout", async () => {
  await page.locator(".geo-plan").first().click();
  await page.waitForSelector(".cart", { timeout: 20000 });
  await page.locator(".cart").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  if ((await page.locator(".cart-checkout").count()) > 0) throw new Error("still selling directly");
  const partners = await page.locator(".cart-partner").count();
  if (partners === 0) throw new Error("no partner shop offered for the plan");
  // With no signed programs, the app must say so rather than imply one.
  const note = await page.locator(".cart .note-top").last().innerText();
  if (!/partner|commission/i.test(note)) throw new Error(`how this is paid for is not stated: ${note}`);
});

console.log("── four Swiss languages ──");
await step("French and Italian are real, not a fallback to English", async () => {
  for (const [label, expect] of [
    ["Français", /Accueil|Planifier/],
    ["Italiano", /Inizio|Pianifica/],
    ["Deutsch", /Start|Planen/],
  ]) {
    await page.click(".account-btn");
    await page.click(`.dropdown-choice-lang button:has-text("${label}")`);
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
  await page.click('.dropdown-choice-lang button:has-text("English")');
  await page.keyboard.press("Escape");
});
await step("the language picker fits inside its menu", async () => {
  await page.click(".account-btn");
  await page.waitForSelector(".dropdown-choice-lang");
  const menu = await page.locator(".account-dropdown").boundingBox();
  for (const b of await page.locator(".dropdown-choice-lang button").all()) {
    const r = await b.boundingBox();
    if (r.x + r.width > menu.x + menu.width + 1) throw new Error("a language name is clipped by the menu");
  }
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
await step("German switches the interface and the html lang", async () => {
  await page.locator(".choice", { hasText: "Deutsch" }).click();
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

await browser.close();
if (errors.length) console.log("\nconsole/page errors:\n  " + errors.join("\n  "));
console.log(`\n${failed === 0 && errors.length === 0 ? "PASS" : "FAIL"} — ${failed} failed step(s), ${errors.length} error(s)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
