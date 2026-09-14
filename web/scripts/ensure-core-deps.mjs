// Vercel builds this app with the root directory set to web/, so the only
// `npm install` it runs is this package's. core/ is pulled in as
// `file:../core`, which links the source but never installs core's own
// dependencies: npm recorded them in web/package-lock.json as a bare
// declaration under "../core" with no resolved tree beneath it.
//
// TypeScript and Vite both resolve a module from the file that imports it,
// following the symlink to its real path first. So an import inside
// core/src/ looks in core/node_modules and then at the repo root, and never
// at web/node_modules. With core/node_modules absent, every one of core's
// imports fails and the build stops on 70-odd errors whose real cause is
// four missing packages.
//
// Locally core/node_modules is already there, installed for core's own Jest
// suite, which is why this only ever broke in CI. The guard below keeps that
// asymmetry from mattering: it installs only when something is actually
// missing, so a developer's `npm run build`, and the bundle test that shells
// out to it, stay offline and instant.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "core");

/**
 * Every package core imports at runtime has to be resolvable from core's own
 * directory. Read the list from core's manifest rather than keeping a copy
 * here, so a dependency added to core is covered the day it is added.
 */
export function requiredCoreDeps(dir = coreDir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return Object.keys(manifest.dependencies ?? {});
}

export function missingCoreDeps(dir = coreDir) {
  return requiredCoreDeps(dir).filter(
    (name) => !existsSync(join(dir, "node_modules", name, "package.json")),
  );
}

export function installCoreDeps(dir = coreDir) {
  // --include=dev because the typecheck needs core's @types/react, and Vercel
  // sets NODE_ENV=production, which would otherwise drop it.
  const command = existsSync(join(dir, "package-lock.json")) ? "ci" : "install";
  execFileSync("npm", [command, "--include=dev", "--no-audit", "--no-fund"], {
    cwd: dir,
    stdio: "inherit",
  });
}

// Only act when run as a script, so the tests can import the pieces.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = missingCoreDeps();
  if (missing.length > 0) {
    console.log(`core/ cannot resolve ${missing.join(", ")}; installing its dependencies.`);
    installCoreDeps();
    const stillMissing = missingCoreDeps();
    if (stillMissing.length > 0) {
      console.error(`core/ still cannot resolve ${stillMissing.join(", ")} after install.`);
      process.exit(1);
    }
  }
}
