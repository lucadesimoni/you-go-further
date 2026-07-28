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
await step("checkout the planned cart", async () => {
  await page.click('button.topnav-tab:has-text("Plan")');
  await page.waitForSelector("text=Shop this plan");
  await page.click('button:has-text("Checkout · CHF")');
  await page.waitForSelector("text=Payment received", { timeout: 10000 });
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
