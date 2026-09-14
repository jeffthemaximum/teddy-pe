import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

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
//
// The list is the rule. When a heading trips it, the heading is wrong, not
// the list. Rewording around a denied word into different program
// vocabulary has happened twice and is the exact move this file exists to
// stop. Either the words arrive from the API payload at runtime, or the
// heading becomes plain English a stranger learns nothing from.
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
// are checked from a word boundary rather than as a bare substring. Only the
// LEFT side needs a boundary: "Cubs", "Foxes" and "CubTrials" are leaks, and
// a right-hand boundary would wave all three through.
const MUST_NOT_APPEAR_AS_WORD = ["Cub", "Fox", "Trials"];

// Third-party tokens that start with a denied word and have nothing to do
// with the program. Matching from the left boundary only means a real word
// from somebody else's CSS can land here, so each one is named rather than
// the rule being weakened back to matching both sides. "cubic-bezier" is the
// CSS easing function; nothing in the program spells itself that way.
const BENIGN_TOKENS = new Set(["cubic", "cubic-bezier"]);

// Teddy's own name is allowed, but only in these exact shapes. Anything else
// carrying it is a leak hiding behind the exemption. Lowercase because every
// comparison below happens on case-folded text.
const NAME_ALLOWED = new Set([
  "teddy-pe.session",
  "teddy-pe-api.fly.dev",
  "teddy-pe",
  "teddy pe",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  shy: "\u00ad",
  zwnj: "\u200c",
  zwj: "\u200d",
  middot: "\u00b7",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

function codePoint(value: number, whole: string): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return whole;
  return String.fromCodePoint(value);
}

// A \u00a0, a \u{1f600} or a \xa0 in a JS or CSS source file are the
// characters they spell. A minifier is free to write non-ASCII out as
// escapes, so a non-breaking space typed into JSX can reach dist as the
// six characters "\u00a0" and would never match a literal written here.
function decodeSourceEscapes(text: string): string {
  return text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (whole, hex) => codePoint(parseInt(hex, 16), whole))
    .replace(/\\u([0-9a-fA-F]{4})/g, (whole, hex) => codePoint(parseInt(hex, 16), whole))
    .replace(/\\x([0-9a-fA-F]{2})/g, (whole, hex) => codePoint(parseInt(hex, 16), whole));
}

// &nbsp; &#160; &#xA0; all reach the reader as a space. index.html is served
// as HTML, and JSX entities survive into the bundle as their characters, so
// both ends of the pipeline need this.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (whole, hex) => codePoint(parseInt(hex, 16), whole))
    .replace(/&#(\d{1,7});/g, (whole, dec) => codePoint(Number(dec), whole))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

// Normalise the text to what a reader actually sees, then match plainly.
// Every bypass this file has been shown so far was a way of spelling a word
// that looks identical on screen: TEDDY, Cubs, Land&nbsp;Like&nbsp;a&nbsp;Cat.
// Normalising once beats writing a cleverer pattern for each of them.
export function asServed(text: string): string {
  return decodeHtmlEntities(decodeSourceEscapes(text))
    // Invisible characters: soft hyphen, zero-width space, joiners, the
    // bidi marks, the word joiner, the BOM. They are not spaces, they are
    // nothing, so they come out rather than becoming a space.
    .replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, "")
    // Every other kind of space, including U+00A0 and the U+2000 block,
    // becomes one plain space. JS \s already covers all of them.
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function escapeForRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Served {
  name: string;
  text: string;
}

// Everything the build emits, at every depth, not just dist/assets. A
// <meta name="description"> in index.html is served to a stranger exactly
// the same way the JavaScript is.
function everythingUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? everythingUnder(full) : [full];
  });
}

describe("the production bundle", () => {
  let served: Served[];
  let names: string[];

  beforeAll(() => {
    const root = join(__dirname, "..");
    execSync("npm run build", { cwd: root, stdio: "pipe" });
    const dist = join(root, "dist");
    served = everythingUnder(dist).map((path) => ({
      name: relative(dist, path),
      text: asServed(readFileSync(path, "utf8")),
    }));
    names = served.map((file) => file.name);
  }, 120_000);

  it("was actually built, so this test is reading something", () => {
    // Without this, an empty dist would pass every assertion below.
    expect(served.length).toBeGreaterThan(0);
    expect(served.map((f) => f.text).join("").length).toBeGreaterThan(1000);
  });

  it("reads the page itself, not only the assets folder", () => {
    // This test once globbed dist/assets and nothing else, which left the
    // one file every visitor loads first completely unread.
    expect(names).toContain("index.html");
    expect(names.some((name) => name.endsWith(".js"))).toBe(true);
  });

  it.each(MUST_NOT_APPEAR)("does not contain %s", (word) => {
    const needle = asServed(word);
    const found = served.filter((file) => file.text.includes(needle)).map((file) => file.name);
    expect(found).toEqual([]);
  });

  it.each(MUST_NOT_APPEAR_AS_WORD)("does not contain the word %s", (word) => {
    const pattern = new RegExp(`\\b${escapeForRegExp(word.toLowerCase())}[a-z0-9_-]*`, "g");
    const hits = served.flatMap((file) =>
      (file.text.match(pattern) ?? [])
        .filter((hit) => !BENIGN_TOKENS.has(hit))
        .map((hit) => `${file.name}: ${hit}`),
    );
    expect([...new Set(hits)]).toEqual([]);
  });

  it("mentions teddy only as the product's own name, never as anything about him", () => {
    // The name is allowed and unavoidable. This asserts it appears ONLY in
    // the places it is allowed, so a real leak carrying his name cannot hide
    // behind the exemption. The optional " pe" tail is what makes the
    // "teddy pe" arm of the allowlist reachable at all: without it the
    // character class stops at the space and that arm is dead code.
    const pattern = /[a-z0-9._-]*teddy[a-z0-9._-]*(?: pe(?![a-z0-9]))?/g;
    const hits = served.flatMap((file) =>
      (file.text.match(pattern) ?? [])
        .filter((hit) => !NAME_ALLOWED.has(hit))
        .map((hit) => `${file.name}: ${hit}`),
    );
    expect([...new Set(hits)]).toEqual([]);
  });

  it("does contain the app's own chrome, proving the search works", () => {
    // If the search were broken, every assertion above would pass for the
    // wrong reason. This is the control.
    expect(served.some((file) => file.text.includes("sign in"))).toBe(true);
  });
});

// The normaliser is the whole defence, so it is tested directly rather than
// only through a build. Each case here is a bypass that was found live in a
// bundle that this file had already called clean.
describe("asServed", () => {
  it("folds case, so TEDDY reads as teddy", () => {
    expect(asServed("TEDDY")).toBe("teddy");
    expect(asServed("tEdDy MaXiM")).toBe("teddy maxim");
  });

  it("turns a non-breaking space into a plain one", () => {
    expect(asServed("Land\u00a0Like\u00a0a\u00a0Cat")).toBe("land like a cat");
  });

  it("turns every other Unicode space into a plain one", () => {
    expect(asServed("Floor\u2007Day")).toBe("floor day");
    expect(asServed("Rings\u3000Day")).toBe("rings day");
    expect(asServed("Land \u2009Like\u2002a\u205fCat")).toBe("land like a cat");
  });

  it("decodes HTML entities, named and numeric", () => {
    expect(asServed("Land&nbsp;Like&nbsp;a&nbsp;Cat")).toBe("land like a cat");
    expect(asServed("Land&#160;Like&#xA0;a&#x00a0;Cat")).toBe("land like a cat");
  });

  it("decodes the escapes a minifier writes non-ASCII out as", () => {
    expect(asServed("Land\\u00a0Like\\u00A0a\\xa0Cat")).toBe("land like a cat");
  });

  it("removes invisible characters rather than turning them into spaces", () => {
    expect(asServed("Te\u200bddy")).toBe("teddy");
    expect(asServed("cart\u00adwheel")).toBe("cartwheel");
  });

  it("leaves an unknown entity alone rather than mangling the text around it", () => {
    expect(asServed("A &notreal; B")).toBe("a &notreal; b");
  });
});
