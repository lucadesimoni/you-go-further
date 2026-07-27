/**
 * End-to-end smoke test for the **mobile** app. There is no simulator in CI, so
 * the Expo screens are rendered through react-native-web (mobile/verify) and
 * driven in a real browser at phone size. Every assertion goes through the same
 * platform API the phone talks to, so this proves the mobile app is actually at
 * parity — not that a mock returns the right shape.
 *
 *   PORT=8791 npm run server &
 *   npx vite --config mobile/verify/vite.config.mts &
 *   node scripts/mobile-smoke.mjs
 *
 * or simply: npm run e2e:mobile
 */
import { chromium } from "playwright-core";

const API = process.env.API_URL ?? "http://localhost:8791";
// `health=apple-health` swaps in a stand-in for HealthKit, which cannot run in a
// browser. Only the device *read* is faked; the sync, validation, readiness and
// profile update below are the real paths.
const APP = `${process.env.APP_URL ?? "http://localhost:5199"}/?api=${encodeURIComponent(API)}&health=apple-health`;
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const errors = [];
let failed = 0;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
// iPhone-ish viewport: the layout has to work at phone width, not just fit.
const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("response", (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url()}`));

const step = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label} — ${e.message.split("\n")[0]}`);
  }
};

const email = `mobile-${Date.now()}@club.ch`;

console.log("── sign in (magic link, server-verified) ──");
await page.goto(APP, { waitUntil: "networkidle" });
await step("app boots to the sign-in screen", () =>
  page.getByText("Sign in", { exact: true }).first().waitFor({ timeout: 15000 }),
);
await step("request a link and redeem the emailed token", async () => {
  await page.getByPlaceholder("you@example.ch").fill(email);
  await page.getByText("Email me a sign-in link").click();
  await page.getByText("Open the dev link").waitFor({ timeout: 10000 });
  // Redeem through the paste path — opening the link would navigate away from
  // the harness, which a phone's browser handoff would not.
  const link = await page.evaluate(async ({ api, to }) => {
    const r = await fetch(`${api}/api/auth/email/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: to, returnTo: "/" }),
    });
    return (await r.json()).devLink;
  }, { api: API, to: email });
  await page.getByPlaceholder("https://…?magic=…").fill(link);
  await page.getByText("Sign in", { exact: true }).last().click();
  await page.getByText("Your session").waitFor({ timeout: 15000 });
});

console.log("── plan ──");
await step("the planner shows real targets and its reasoning", async () => {
  await page.getByText("Carb / hour").waitFor({ timeout: 10000 });
  await page.getByText("Why this plan").waitFor({ timeout: 10000 });
  const carb = await page.getByText("Carb / hour").locator("xpath=preceding-sibling::div[1]").innerText();
  if (!/^\d+ g$/.test(carb.trim())) throw new Error(`unexpected carb target: ${carb}`);
});
await step("changing intensity re-plans the session", async () => {
  await page.getByText("Race", { exact: true }).click();
  await page.getByText("In-session schedule").waitFor({ timeout: 10000 });
});

console.log("── log & learn ──");
await step("logging a session writes to the shared account", async () => {
  await page.getByLabel("Log", { exact: true }).click();
  await page.getByText("Log this session").click();
  await page.getByText("What we learned").waitFor({ timeout: 10000 });
});

console.log("── insights ──");
await step("fuelling score comes from the server, on real logs", async () => {
  await page.getByLabel("Insights", { exact: true }).click();
  await page.getByText("Fuelling score").waitFor({ timeout: 10000 });
  await page.getByText("Do this next").waitFor({ timeout: 10000 });
  const logged = await page.getByText(/sessions? logged/).first().innerText();
  if (!/[1-9]\d* sessions? logged/.test(logged)) throw new Error(`score is not using real data: ${logged}`);
});
await step("the nutrition guide opens with real articles", async () => {
  await page.getByText("Read the guide").click();
  await page.getByText("Hide the guide").waitFor({ timeout: 10000 });
});

console.log("── catalog & shop ──");
await step("products list with when-to-use guidance", async () => {
  await page.getByLabel("Shop", { exact: true }).click();
  await page.getByText("Product library").waitFor({ timeout: 10000 });
  await page.getByText("Sponser", { exact: false }).first().click();
  await page.getByText("Best when").first().waitFor({ timeout: 8000 });
});
await step("a cart is built for the session that was just planned", async () => {
  await page.getByText("Build my cart").click();
  await page.getByText(/Checkout · CHF/).waitFor({ timeout: 10000 });
});

console.log("── profile & connections ──");
let expectedKg = 0;
await step("profile loads from the server and saves back", async () => {
  await page.getByLabel("You", { exact: true }).click();
  await page.getByText("Your body").waitFor({ timeout: 10000 });
  const before = await page.getByText(/Body weight: \d+ kg/).innerText();
  expectedKg = Number(/(\d+)/.exec(before)[1]) + 1;
  await page.getByLabel("Increase Body weight").click();
  await page.getByText("Save profile").click();
  await page.getByText("Saved ✓").waitFor({ timeout: 10000 });
});
await step("connections live in exactly one place", async () => {
  await page.getByText("Manage connections").click();
  await page.getByText("Your services").waitFor({ timeout: 10000 });
  await page.getByText("Strava").first().waitFor({ timeout: 8000 });
  await page.getByText("← Back to your profile").click();
  await page.getByText("Your body").waitFor({ timeout: 8000 });
});
await step("the saved profile flows straight back into the plan", async () => {
  await page.getByLabel("Plan", { exact: true }).click();
  await page.getByText(new RegExp(`From your profile: ${expectedKg} kg`)).waitFor({ timeout: 10000 });
});

console.log("\u2500\u2500 on-device health sync \u2500\u2500");
await step("Apple Health sync lands sessions, signals and a derived readiness", async () => {
  await page.getByLabel("You", { exact: true }).click();
  await page.getByText("Sync from this phone").waitFor({ timeout: 10000 });
  await page.getByText("Sync from this phone").click();
  // The server reports what it actually did: 2 usable workouts, 1 dropped.
  await page.getByText(/2 new sessions · 10 days of body signals/).waitFor({ timeout: 15000 });
  await page.getByText(/1 workout skipped as unreadable/).waitFor({ timeout: 8000 });
  // Body mass from the phone overwrote the profile the server holds.
  await page.getByText("Body weight: 66 kg").waitFor({ timeout: 8000 });
  // Readiness was derived from the HRV dip, not left at the 65 default.
  const readiness = await page.getByText(/Today: \d+/).innerText();
  const value = Number(/(\d+)/.exec(readiness)[1]);
  if (value === 65) throw new Error("readiness was not derived from the synced signals");
  if (value < 0 || value > 100) throw new Error(`readiness out of range: ${value}`);
});
await step("the synced sessions show up in insights", async () => {
  await page.getByLabel("Insights", { exact: true }).click();
  await page.getByText("Your training").waitFor({ timeout: 10000 });
  await page.getByText("Activities").waitFor({ timeout: 8000 });
  await page.getByLabel("You", { exact: true }).click();
  await page.getByText("Your body").waitFor({ timeout: 8000 });
});

console.log("── deep link back into the app ──");
await step("a yougofurther:// magic link signs straight in", async () => {
  const token = await page.evaluate(async ({ api, to }) => {
    const r = await fetch(`${api}/api/auth/email/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: to, returnTo: "/" }),
    });
    const link = (await r.json()).devLink;
    return new URL(link, "http://placeholder").searchParams.get("magic");
  }, { api: API, to: email });
  // A page reload clears the harness's storage, so landing signed-in proves the
  // incoming link was redeemed — not that a session was still cached.
  await page.goto(`${APP}&magic=${encodeURIComponent(token)}`, { waitUntil: "networkidle" });
  await page.getByText("Your session").waitFor({ timeout: 15000 });
});

await browser.close();

if (errors.length) {
  console.log("\nPage errors:");
  for (const e of errors) console.log("  " + e);
}
console.log(`\n${failed === 0 && errors.length === 0 ? "PASS" : "FAIL"} — ${failed} failed step(s), ${errors.length} page error(s)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
