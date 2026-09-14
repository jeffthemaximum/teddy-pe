import { createCoreStore, memoryStorage } from "../src";
import { programYears } from "../src/ducks/programYears";
import { programYear } from "../src/ducks/programYear";
import { plan } from "../src/ducks/plan";
import { week, selectDayByDate } from "../src/ducks/week";
import { drills, selectDrillsMatching, selectDrillBySlug } from "../src/ducks/drills";
import { progression } from "../src/ducks/progression";

describe("the read ducks", () => {
  it("each ask the API for the path the live API actually serves", () => {
    expect(programYears.path(undefined)).toBe("/api/v1/program_years");
    expect(programYear.path(1)).toBe("/api/v1/program_years/1");
    expect(plan.path({ yearId: 1, month: "2026-09" })).toBe(
      "/api/v1/program_years/1/plans/2026-09",
    );
    expect(week.path(1)).toBe("/api/v1/program_years/1/weeks/current");
    expect(drills.path(undefined)).toBe("/api/v1/drills");
    expect(progression.path(undefined)).toBe("/api/v1/progression");
  });
});

describe("each read duck's name matches the key it is registered under", () => {
  // createFetchDuck's selectors read state at s[opts.name]. Nothing at
  // compile time connects that string to the key a duck is actually given
  // in combineReducers, so a typo in either place compiles clean and only
  // fails the first time a selector runs against the real store. This test
  // reads the duck's own name and the store's real keys, two genuinely
  // different sources, and would fail if either drifted from the other.
  it("registers every duck under its own name in the real store", () => {
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage: memoryStorage(),
    });
    const stateKeys = Object.keys(store.getState());

    for (const duck of [programYears, programYear, plan, week, drills, progression]) {
      expect(stateKeys).toContain(duck.name);
    }
  });
});

const glossary = [
  {
    slug: "cartwheel",
    name: "Cartwheel",
    area_name: "Move",
    // "flip" is not a substring of "cartwheel" or its slug (unlike "wheel",
    // which is: cart-wheel). It has to be, or a search on it would pass by
    // matching the name and never actually exercise the alias branch.
    aliases: ["flip"],
    short: "",
    how: [],
    watch: "",
    cue: "",
    video: null,
  },
  {
    slug: "a-skip",
    name: "A-skip",
    area_name: "Run",
    aliases: [],
    short: "",
    how: [],
    watch: "",
    cue: "",
    video: null,
  },
];

describe("glossary search", () => {
  const state = { drills: { data: { drills: glossary }, loading: false, error: null } };

  it("finds a drill by its name, case insensitively", () => {
    expect(selectDrillsMatching("cart")(state).map((d) => d.slug)).toEqual(["cartwheel"]);
  });

  it("finds a drill by an alias, which is why aliases exist", () => {
    // Teddy will type what he calls it, not what the sheet calls it. "flip"
    // matches only the alias: it is not a substring of "cartwheel" or its
    // slug, so this fails if the alias branch is ever removed.
    expect(selectDrillsMatching("flip")(state).map((d) => d.slug)).toEqual(["cartwheel"]);
  });

  it("returns everything for an empty query rather than nothing", () => {
    expect(selectDrillsMatching("")(state)).toHaveLength(2);
  });

  it("returns an empty list, not undefined, when nothing matches", () => {
    expect(selectDrillsMatching("zzz")(state)).toEqual([]);
  });

  it("looks one up by slug, and returns null rather than throwing when it is gone", () => {
    expect(selectDrillBySlug("a-skip")(state)?.name).toBe("A-skip");
    expect(selectDrillBySlug("nope")(state)).toBeNull();
  });

  it("survives the glossary not having loaded yet", () => {
    // Every screen can render before its data arrives. A selector that throws
    // on null data turns a slow server into a crash.
    const empty = { drills: { data: null, loading: true, error: null } };
    expect(selectDrillsMatching("cart")(empty)).toEqual([]);
    expect(selectDrillBySlug("cartwheel")(empty)).toBeNull();
  });
});

const loadedWeek = {
  week: {
    data: {
      id: 1,
      number: 1,
      position_in_block: 1,
      theme: "Baseline & Land",
      dates_display: "Sep 14-20",
      targets: [],
      challenge: "",
      trials: false,
      block_key: "cub",
      high_intent_efforts: 28,
      budget: 40,
      days: [
        {
          id: 1,
          dow: "Mon",
          date: "2026-09-14",
          name: "Land Like a Cat",
          role: "Floor Day",
          minutes: "60-75",
          intensity: 2,
          hie: 0,
          summary_lines: [],
          drill_slugs: [],
        },
        {
          id: 4,
          dow: "Thu",
          date: "2026-09-17",
          name: "Wall & Ball",
          role: "Wall Day",
          minutes: "75",
          intensity: 2,
          hie: 2,
          summary_lines: [],
          drill_slugs: [],
        },
      ],
    },
    loading: false,
    error: null,
  },
};

describe("selectDayByDate", () => {
  it("finds the day card for a date", () => {
    expect(selectDayByDate("2026-09-17")(loadedWeek)?.name).toBe("Wall & Ball");
  });

  it("returns null for a date this week does not contain", () => {
    // Sunday's card belongs to next week's payload. Returning the wrong day
    // would show Teddy the wrong session, which is worse than showing none.
    expect(selectDayByDate("2026-09-21")(loadedWeek)).toBeNull();
  });

  it("does not return a day for a query that is only a prefix of its date", () => {
    // "2026-09-1" is a prefix of both "2026-09-14" and "2026-09-17". A match
    // on d.date.startsWith(date) would return the 14th's card here instead
    // of nothing, handing Teddy the wrong day's session. Exact equality is
    // the only match that cannot do that.
    expect(selectDayByDate("2026-09-1")(loadedWeek)).toBeNull();
  });

  it("returns null before the week has loaded", () => {
    expect(
      selectDayByDate("2026-09-17")({ week: { data: null, loading: true, error: null } }),
    ).toBeNull();
  });
});
