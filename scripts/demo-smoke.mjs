/**
 * The demo, on the build a demo actually runs on.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm run e2e:demo
 *
 * This is the *client-side* build — no API server, the app running entirely in
 * the browser. It is what a static host serves, what "explore a demo account"
 * opens, and it was broken in a way no other suite could see: the e2e journey
 * runs against the Node server, so every screen had a server to ask and the
 * client-side path was never exercised.
 *
 * What it was: Home with no sessions, Insights with nothing to analyse, a route
 * screen offering only a file importer, and a Connect screen where linking a
 * provider worked until you left it — the connection lived in React state and
 * nowhere else, so navigating away or reloading lost it.
 *
 * Every assertion below is one of those.
 */
import { chromium } from "playwright-core";

const B = process.env.BASE_URL ?? "http://localhost:4173";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const errors = [];
let failed = 0;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// Map tiles and geodata are blocked in CI sandboxes; the app is supposed to
// degrade there, and does. Filter by host, never by message.
const EXTERNAL = /geo\.admin\.ch|cartocdn\.com|open-meteo\.com/;
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (EXTERNAL.test(m.location()?.url ?? "")) return;
  errors.push(`console: ${m.text()}`);
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

const goConnect = async () => {
  await page.click('button.topnav-tab:has-text("Connect")');
  await page.waitForSelector(".provider-card", { timeout: 15000 });
  await page.waitForTimeout(1200);
};
const connectedCount = () => page.locator('.provider-card:has-text("Disconnect")').count();

console.log(`── the client-side demo · ${B} ──`);

await step("the build really is server-less", async () => {
  await page.goto(B, { waitUntil: "networkidle" });
  const configured = await page.evaluate(() => Boolean(window.__APP_CONFIG__?.apiBaseUrl));
  if (configured) {
    throw new Error("this build has an apiBaseUrl — run it against `vite preview`, not the Node server");
  }
  await page.waitForSelector(".auth-demo-chip", { timeout: 15000 });
});

await step("a demo account lands on a populated start screen", async () => {
  await page.locator(".auth-demo-chip").first().click();
  await page.waitForSelector(".home-greeting", { timeout: 20000 });
  await page.waitForTimeout(2500);
  const sessions = await page.locator(".home-session").count();
  if (sessions === 0) throw new Error("no recent sessions — the demo has nothing to explore");
  const week = await page.locator(".home-week, .dash").first().innerText();
  if (!/\d/.test(week)) throw new Error("the week summary has no figures in it");
});

await step("it arrives with a training source already connected", async () => {
  await goConnect();
  if ((await connectedCount()) === 0) throw new Error("nothing connected, so nothing could have been imported");
});

await step("connecting a provider survives leaving the screen", async () => {
  const before = await connectedCount();
  await page.locator('.provider-card:has-text("Garmin") button').first().click();
  await page.waitForTimeout(2000);
  if ((await connectedCount()) !== before + 1) throw new Error("connecting did not take effect");

  await page.click('button.topnav-tab:has-text("Home")');
  await page.waitForTimeout(1500);
  await goConnect();
  if ((await connectedCount()) !== before + 1) {
    throw new Error("the connection was forgotten on the way back — it is only in React state");
  }
});

await step("and survives a reload", async () => {
  const before = await connectedCount();
  // Non-vacuous: "0 stayed 0" would pass on a build that persists nothing.
  if (before < 2) throw new Error("expected two connected providers before reloading");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await goConnect();
  if ((await connectedCount()) !== before) throw new Error(`had ${before} connected, reloaded to ${await connectedCount()}`);
});

await step("disconnecting sticks, and the demo bootstrap does not undo it", async () => {
  await page.locator('.provider-card:has-text("Garmin") button').first().click();
  await page.waitForTimeout(1500);
  const after = await connectedCount();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await goConnect();
  if ((await connectedCount()) !== after) throw new Error("a reload re-connected something the athlete had removed");
});

await step("the route screen has the athlete's own routes, not just an importer", async () => {
  await page.click('button.topnav-tab:has-text("Plan")');
  await page.waitForSelector(".plan-modes", { timeout: 15000 });
  await page.click('.plan-mode:has-text("route")');
  await page.waitForTimeout(3000);
  if ((await page.locator(".route-map").count()) === 0) {
    throw new Error("no map — the demo fell through to the GPX importer");
  }
  if ((await page.locator(".route-picker .chip").count()) < 2) throw new Error("no choice of recorded route");
});

await step("insights has something to analyse", async () => {
  await page.click('button.topnav-tab:has-text("Insights")');
  await page.waitForTimeout(2500);
  const body = await page.locator(".dash").innerText();
  if (/No sessions synced yet/i.test(body)) throw new Error("insights reports no synced sessions");
  // The stat tiles must carry real counts, not zeros.
  const stats = await page.locator(".targets .stat-value").allInnerTexts();
  if (!stats.some((v) => Number(v.replace(/[^\d.]/g, "")) > 0)) {
    throw new Error(`every insights figure is zero: ${stats.join(", ")}`);
  }
});

await step("'How did it go?' opens that session, not another one", async () => {
  // The one assertion that catches a *regenerated* world: if the sessions are
  // rebuilt with different ids between screens, this handoff lands elsewhere.
  await page.click('button.topnav-tab:has-text("Home")');
  await page.waitForTimeout(1500);
  const review = page.locator(".home-session .link-strong").first();
  if ((await review.count()) === 0) throw new Error("no session offered for review");
  const row = await review.locator("xpath=ancestor::*[contains(@class,'home-session')]").first().innerText();
  const km = Number(/([\d.]+) km/.exec(row)?.[1]);
  await review.click();
  await page.waitForSelector(".debrief", { timeout: 20000 });
  const chip = await page.locator(".route-picker .chip-active").innerText();
  const chipKm = Number(/(\d+) km/.exec(chip)?.[1]);
  if (Number.isFinite(km) && Number.isFinite(chipKm) && Math.abs(km - chipKm) > 1) {
    throw new Error(`asked about a ${km} km session, opened a ${chipKm} km one`);
  }
});

await browser.close();
if (errors.length) console.log("\nconsole/page errors:\n  " + errors.join("\n  "));
console.log(`\n${failed === 0 && errors.length === 0 ? "PASS" : "FAIL"} — ${failed} failed step(s), ${errors.length} error(s)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
