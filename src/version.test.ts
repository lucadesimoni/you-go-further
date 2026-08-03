import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { MODULES, PLATFORM_VERSION, moduleVersion, versionManifest } from "./version";

/**
 * A manifest that drifts from the tree is worse than no manifest: it reads as
 * authoritative while describing a codebase that no longer exists. These tests
 * are what make it trustworthy — adding a module without versioning and
 * documenting it fails the build.
 */
const SEMVER = /^\d+\.\d+\.\d+$/;

describe("module manifest", () => {
  it("covers every module in src/, with nothing invented", () => {
    const onDisk = readdirSync("src", { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const declared = MODULES.filter((m) => m.path.startsWith("src/"))
      .map((m) => m.id)
      .sort();
    expect(declared).toEqual(onDisk);
  });

  it("points every entry at a path that actually exists", () => {
    expect(MODULES.filter((m) => !existsSync(m.path)).map((m) => m.path)).toEqual([]);
  });

  it("gives each module a unique id and a real semantic version", () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    expect(MODULES.filter((m) => !SEMVER.test(m.version)).map((m) => m.id)).toEqual([]);
    expect(SEMVER.test(PLATFORM_VERSION)).toBe(true);
  });

  it("says what every module is for, and what may be imported from it", () => {
    for (const m of MODULES) {
      expect(m.summary.length, `${m.id} has no summary`).toBeGreaterThan(20);
      expect(m.publicApi.length, `${m.id} declares no public API`).toBeGreaterThan(0);
    }
  });

  it("explains itself whenever it claims less than stable", () => {
    // A "preview" with no reason given is just a shrug. If the label is doing
    // any work, it can say what is missing.
    for (const m of MODULES) {
      if (m.stability === "stable") continue;
      expect(m.caveat?.length ?? 0, `${m.id} is ${m.stability} but gives no reason`).toBeGreaterThan(20);
    }
  });

  it("keeps a single platform version across package.json, config and the manifest", () => {
    // Two different version numbers in one repository is how a bug report ends
    // up naming a release that was never deployed.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(pkg.version).toBe(PLATFORM_VERSION);
    const config = readFileSync("src/config.ts", "utf8");
    expect(config).toMatch(/version:\s*PLATFORM_VERSION/);
  });

  it("is documented in prose, module by module", () => {
    const docs = readFileSync("docs/modules.md", "utf8");
    const undocumented = MODULES.filter((m) => !docs.includes(`\`${m.path}\``)).map((m) => m.id);
    expect(undocumented).toEqual([]);
  });

  it("records the current platform version in the changelog", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    expect(changelog).toContain(`## ${PLATFORM_VERSION}`);
  });

  it("looks a version up by id, and refuses an id it does not know", () => {
    expect(moduleVersion("engine")).toMatch(SEMVER);
    expect(() => moduleVersion("nope")).toThrow(/unknown module/);
  });

  it("summarises stability without losing any module", () => {
    const manifest = versionManifest();
    const counted = manifest.stability.stable + manifest.stability.evolving + manifest.stability.preview;
    expect(counted).toBe(MODULES.length);
    expect(manifest.platform).toBe(PLATFORM_VERSION);
  });

  it("keeps the domain layer free of React and the network", () => {
    // The reason the engine can run in a test, a browser, a Node server and an
    // edge function unchanged. Worth a test rather than a convention.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const offenders: string[] = [];
    for (const m of MODULES.filter((x) => x.layer === "domain")) {
      for (const file of walk(m.path).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))) {
        const body = readFileSync(file, "utf8");
        if (/from "react|from "react-dom|\bfetch\(|localStorage\./.test(body)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
