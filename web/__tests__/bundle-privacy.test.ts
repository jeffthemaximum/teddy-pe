import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Words that exist only in Teddy's program. If any of these reach the bundle,
// a stranger with the URL can read something about a 7-year-old.
const MUST_NOT_APPEAR = [
  "Teddy",
  "teddymaxim",
  "Land Like a Cat",
  "Cub",
  "cartwheel",
  "high-intent",
  "Champion",
];

describe("the production bundle", () => {
  let files: string[];

  beforeAll(() => {
    execSync("npm run build", { cwd: join(__dirname, ".."), stdio: "pipe" });
    const dir = join(__dirname, "..", "dist", "assets");
    files = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8"));
  }, 120_000);

  it("was actually built, so this test is reading something", () => {
    // Without this, an empty dist would pass every assertion below.
    expect(files.length).toBeGreaterThan(0);
    expect(files.join("").length).toBeGreaterThan(1000);
  });

  it.each(MUST_NOT_APPEAR)("does not contain %s", (word) => {
    const found = files.filter((f) => f.toLowerCase().includes(word.toLowerCase()));
    expect(found).toHaveLength(0);
  });

  it("does contain the app's own chrome, proving the search works", () => {
    // If the search were broken, every assertion above would pass for the
    // wrong reason. This is the control.
    expect(files.some((f) => f.includes("Sign in"))).toBe(true);
  });
});
