import { createCoreStore, memoryStorage } from "../src";
import { rootSaga } from "../src/store/rootSaga";
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

// Builds a value of whatever type a duck's succeeded() expects, tagged with
// a marker string. Its content does not matter; only that each duck gets a
// distinguishable one and that the real store round-trips it faithfully.
function fakeData<T>(marker: string): T {
  return { marker } as unknown as T;
}

describe("each read duck's own selectors read its own slice, not a different duck's", () => {
  // createFetchDuck's selectData reads state at s[opts.name]. A test that
  // only checks the six names are somewhere in Object.keys(state) cannot
  // catch two ducks that had their names swapped: both names are still in
  // the key set, so membership alone proves nothing about which duck is
  // reading which slice. This dispatches a distinct, real action through the
  // real store for every duck and checks that a duck's own selectData hands
  // back only what was dispatched under its own action, never another
  // duck's. Swapping any two ducks' names breaks this, because the swapped
  // duck's selectData would then read out of the other one's key.
  it("returns what was dispatched to a duck from that same duck's own selectData, never another's", () => {
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage: memoryStorage(),
    });

    store.dispatch(programYears.actions.succeeded(fakeData("programYears")));
    store.dispatch(programYear.actions.succeeded(fakeData("programYear")));
    store.dispatch(plan.actions.succeeded(fakeData("plan")));
    store.dispatch(week.actions.succeeded(fakeData("week")));
    store.dispatch(drills.actions.succeeded(fakeData("drills")));
    store.dispatch(progression.actions.succeeded(fakeData("progression")));

    // createFetchDuck's own selectors are typed against Record<string,
    // unknown>, not RootState, so state is bridged through unknown here
    // rather than assigned directly.
    const state = store.getState() as unknown as Record<string, unknown>;

    expect(programYears.selectors.selectData(state)).toEqual({ marker: "programYears" });
    expect(programYear.selectors.selectData(state)).toEqual({ marker: "programYear" });
    expect(plan.selectors.selectData(state)).toEqual({ marker: "plan" });
    expect(week.selectors.selectData(state)).toEqual({ marker: "week" });
    expect(drills.selectors.selectData(state)).toEqual({ marker: "drills" });
    expect(progression.selectors.selectData(state)).toEqual({ marker: "progression" });
  });
});

describe("every duck registered in the store is forked in the root saga", () => {
  // rootSaga is a single generator; stepping it directly (no runSaga, no
  // middleware) never executes a forked saga, only reveals which effects it
  // yields. This walks whatever it yields, flattening ALL and FORK effects
  // wherever they are nested, and collects the forked functions. If a
  // duck's saga is missing from that list, its reducer still flips
  // `loading: true` on every fetch and nothing ever answers it: a permanent
  // spinner, no crash, no error, nothing in a log.
  function forkedFns(saga: () => Generator<unknown, void, unknown>): unknown[] {
    const out: unknown[] = [];
    const collect = (effect: unknown): void => {
      if (Array.isArray(effect)) {
        effect.forEach(collect);
        return;
      }
      if (effect == null || typeof effect !== "object") return;
      const e = effect as { type?: unknown; payload?: unknown };
      if (e.type === "FORK") {
        const fn = (e.payload as { fn?: unknown } | undefined)?.fn;
        if (fn) out.push(fn);
        return;
      }
      if (e.type === "ALL") {
        collect(e.payload);
      }
    };

    const gen = saga();
    let step = gen.next();
    while (!step.done) {
      collect(step.value);
      step = gen.next();
    }
    return out;
  }

  it("forks all six read ducks' sagas", () => {
    const forked = forkedFns(rootSaga);

    for (const duck of [programYears, programYear, plan, week, drills, progression]) {
      expect(forked).toContain(duck.saga);
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
    // Slug deliberately drops the hyphen the name has. "cartwheel"/"Cartwheel"
    // above are the same string case-insensitively, so a query that matches
    // the name always matches the slug too and never isolates the name
    // branch. "askip" cannot: a query containing "-" matches "A-skip" but
    // not "askip".
    slug: "askip",
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

  it("finds a drill by its name, case insensitively, not merely by a slug that happens to overlap", () => {
    // "a-sk" is in "A-skip" (its name) but not in "askip" (its slug, which
    // has no hyphen) or in its empty aliases. Matching here has to come from
    // the name branch, unlike "cart" against "cartwheel" and "cartwheel",
    // where name and slug are the same string and either branch would pass.
    expect(selectDrillsMatching("a-sk")(state).map((d) => d.slug)).toEqual(["askip"]);
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
    expect(selectDrillBySlug("askip")(state)?.name).toBe("A-skip");
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
