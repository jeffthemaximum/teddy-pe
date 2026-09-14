import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error - a plain build script, deliberately outside tsconfig's "src"
import { missingCoreDeps, requiredCoreDeps } from "../scripts/ensure-core-deps.mjs";

const webRoot = resolve(__dirname, "..");
const coreRoot = resolve(webRoot, "..", "core");

/** A throwaway package tree, so the checks are exercised against both answers. */
function fixture(deps: string[], installed: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "core-deps-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", dependencies: Object.fromEntries(deps.map((d) => [d, "^1.0.0"])) }),
  );
  for (const name of installed) {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name }));
  }
  return dir;
}

describe("the core dependency guard", () => {
  it("names every declared dependency that is not installed", () => {
    const dir = fixture(["alpha", "beta", "gamma"], ["beta"]);

    expect(missingCoreDeps(dir).sort()).toEqual(["alpha", "gamma"]);
  });

  it("reports nothing missing once each one is installed", () => {
    const dir = fixture(["alpha", "beta"], ["alpha", "beta"]);

    expect(missingCoreDeps(dir)).toEqual([]);
  });

  it("treats a scoped package the same as an unscoped one", () => {
    const dir = fixture(["@scope/thing", "plain"], ["plain"]);

    expect(missingCoreDeps(dir)).toEqual(["@scope/thing"]);
  });

  // Written out by hand from core/package.json rather than read back from it.
  // Without this, a guard that read an empty dependency list would report
  // nothing missing and still pass every test above.
  it("watches the four packages core actually imports", () => {
    expect(requiredCoreDeps(coreRoot).sort()).toEqual([
      "@reduxjs/toolkit",
      "react-redux",
      "redux",
      "redux-saga",
    ]);
  });

  it("finds all four of them installed in this checkout", () => {
    expect(missingCoreDeps(coreRoot)).toEqual([]);
  });

  // The guard only helps if the build actually runs it. npm runs "prebuild"
  // ahead of "build" on its own, which is what makes this work on Vercel,
  // where the build is invoked as `npm run build`.
  it("is wired into the build through npm's prebuild hook", () => {
    const scripts = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")).scripts;

    expect(scripts.prebuild).toBe("node scripts/ensure-core-deps.mjs");
  });
});
