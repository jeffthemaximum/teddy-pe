import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The bundle is public. Anyone with the URL reads every byte of it, so the
// privacy of a child's program rests entirely on nothing about him being in
// here and everything arriving from an API that answers 401 without a token.
//
// What this list is NOT: an attempt to keep the product's own name out. The
// repo is teddy-pe, the API is teddy-pe-api.fly.dev, and core stores its
// session under "teddy-pe.session". A stranger reading the bundle already
// typed the name to get here, and excluding it would be theatre that also
// makes this test impossible to keep green.
//
// What it IS: anything about Teddy as a person, and anything out of his
// program. Those come from the API or they do not exist.
const MUST_NOT_APPEAR = [
  // Him, and the people around him.
  "teddymaxim",
  "emmabark",
  "frey.maxim",
  "Maxim",
  "2019-01-09",
  // His program. Day names, block names, drills, the vocabulary of the year.
  "Land Like a Cat",
  "cartwheel",
  "high-intent",
  "Champion",
  "Floor Day",
  "Rings Day",
  "green ball",
];

// Short words that would match inside unrelated minified identifiers, so they
// are checked on a word boundary rather than as a substring.
const MUST_NOT_APPEAR_AS_WORD = ["Cub", "Fox", "Trials"];

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

  it.each(MUST_NOT_APPEAR_AS_WORD)("does not contain the word %s", (word) => {
    const pattern = new RegExp(`\\b${word}\\b`);
    expect(files.filter((f) => pattern.test(f))).toHaveLength(0);
  });

  it("mentions teddy only as the product's own name, never as anything about him", () => {
    // The name is allowed and unavoidable. This asserts it appears ONLY in the
    // places it is allowed, so a real leak carrying his name cannot hide behind
    // the exemption the list above grants.
    const allowed = /^(teddy-pe\.session|teddy-pe-api\.fly\.dev|teddy-pe|Teddy PE)$/;
    const hits = files
      .flatMap((f) => f.match(/[A-Za-z0-9.\-]*[Tt]eddy[A-Za-z0-9.\-]*/g) ?? [])
      .filter((hit) => !allowed.test(hit));
    expect([...new Set(hits)]).toEqual([]);
  });

  it("does contain the app's own chrome, proving the search works", () => {
    // If the search were broken, every assertion above would pass for the
    // wrong reason. This is the control.
    expect(files.some((f) => f.includes("Sign in"))).toBe(true);
  });
});
