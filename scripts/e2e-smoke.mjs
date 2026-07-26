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
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

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
await step("finish setup into the planner", async () => {
  await page.click('button:has-text("Continue →")');
  await page.click("text=Build my first plan");
  await page.waitForSelector("text=Carb / hour");
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

console.log("── commerce ──");
await step("checkout the planned cart", async () => {
  await page.click('button.topnav-tab:has-text("Plan")');
  await page.waitForSelector("text=Shop this plan");
  await page.click('button:has-text("Checkout · CHF")');
  await page.waitForSelector("text=Payment received", { timeout: 10000 });
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
