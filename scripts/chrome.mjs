import { existsSync } from "node:fs";

/**
 * Which browser the smoke suites drive.
 *
 * This repository's sandbox ships a Chromium at a fixed path and blocks the
 * download, so the suites pinned `executablePath` to it. On a CI runner that
 * path does not exist, and a pinned path that is missing is not a fallback —
 * it is a hard launch failure, which is exactly how the demo suite came to be
 * red on every push while passing locally.
 *
 * So: an explicit `CHROME_PATH` wins, then the sandbox's browser, then the
 * common system locations, and finally `undefined` — which tells Playwright to
 * use the browser it installed itself.
 */
export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

/** Launch options that work in the sandbox, in CI, and on a laptop. */
export function launchOptions() {
  const executablePath = chromePath();
  return { args: ["--no-sandbox"], ...(executablePath ? { executablePath } : {}) };
}
