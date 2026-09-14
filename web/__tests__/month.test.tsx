import { act, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { MonthPlan, WeekPayload, DayCard } from "@teddy-pe/core";
import { Month, currentMonthKey } from "../src/screens/Month";
import { createAppStore } from "../src/bootstrap";
import { stubMe, ME_PROGRAM_YEAR_ID } from "../vitest.setup";

// Built from the real shape (core/src/types.ts's MonthPlan and Week,
// verified against backend/app/services/week_payload.rb and
// plans_controller.rb). Three weeks whose spends genuinely differ (28, 39,
// 20) against budgets of 40, 40 and 20: the third is a Trials week, at half
// the normal 40-point budget per CLAUDE.md. A fixture where a week's spend
// equalled its own budget would pass against a component that prints one of
// the two numbers twice, which is the defect this project has found twelve
// times; weeks 1 and 2 here rule that out on their own.
//
// Each week's seven days are listed out of weekday order on purpose, so a
// component that forgot to sort them can fail the ordering test. The three
// weeks themselves are also handed to the store out of `number` order (see
// MONTH_PLAN below), the same reasoning: `MonthPlan.has_many :weeks, ->
// { order(:number) }` makes the backend's own order reliable today, but
// nothing here should depend on that surviving a future refactor with
// silence as the failure mode.

function day(overrides: Partial<DayCard> & Pick<DayCard, "id" | "dow" | "date" | "name" | "role">): DayCard {
  return {
    minutes: "60 to 90",
    intensity: 2,
    hie: 0,
    summary_lines: [`${overrides.name} notes`],
    drill_slugs: [],
    ...overrides,
  };
}

const WEEK_1: WeekPayload = {
  id: 101,
  number: 1,
  position_in_block: 1,
  theme: "Baseline & Land",
  dates_display: "Sep 14 to Sep 20",
  targets: [
    "Full test battery recorded, all ten plus height",
    "Athletic stance and stick landing from the ground",
    "Cartwheel step 1: bunny hops over a line",
    "Basketball: 200 stationary dribbles a session, eyes up",
    "Soccer: first touch off the wall, both feet, 300 touches",
    "Tennis: drop-feed forehand and backhand, 20 each",
  ],
  challenge: "Silent Landings. Ten jumps off a step, count the silent ones. Monday number, Friday number.",
  trials: false,
  block_key: "cub",
  high_intent_efforts: 28,
  budget: 40,
  days: [
    day({ id: 1006, dow: "sat", date: "2026-09-19", name: "Game Day", role: "Game Day", minutes: "0", hie: 0, summary_lines: ["Home program off"] }),
    day({ id: 1001, dow: "mon", date: "2026-09-14", name: "Land Like a Cat", role: "Floor Day", hie: 5, summary_lines: ["Stick landings, ground then curb", "Basketball: 200 dribbles"] }),
    day({ id: 1004, dow: "thu", date: "2026-09-17", name: "Wall & Ball", role: "Wall Day", hie: 8, summary_lines: ["Tennis: drop-feed rally", "Basketball: jump stop and pivot"] }),
    day({ id: 1002, dow: "tue", date: "2026-09-15", name: "Test Day 1", role: "Rings Day", hie: 3, summary_lines: ["Riverside rings intro", "Soccer wall touch, 300 touches"] }),
    day({ id: 1007, dow: "sun", date: "2026-09-20", name: "Ceremony", role: "Court Day", minutes: "30 to 45", hie: 0, summary_lines: ["Bunny hops x10", "Draw the Cub card"] }),
    day({ id: 1005, dow: "fri", date: "2026-09-18", name: "Skate & Stick", role: "Skate Day", minutes: "45 to 60", hie: 4, summary_lines: ["Skate park, safe-fall lesson"] }),
    day({ id: 1003, dow: "wed", date: "2026-09-16", name: "Test Day 2", role: "Fast Day", hie: 8, summary_lines: ["20m sprint, broad jump", "Soccer inside-foot passing"] }),
  ],
};

const WEEK_2: WeekPayload = {
  id: 102,
  number: 2,
  position_in_block: 2,
  theme: "Build the Touches",
  dates_display: "Sep 21 to Sep 27",
  targets: [
    "Cartwheel step 2: hand, hand, foot, foot",
    "Split step on Dad's clap, ten reps",
    "Basketball: crossover and figure-8, 200 dribbles",
    "Soccer: inside-foot passing at three metres, both feet, 40 passes",
    "Tennis: wall rally, first touch clean, 20 shots",
  ],
  challenge: "Wall Rally Streak. Longest rally without a miss, tried Monday and tried again Friday.",
  trials: false,
  block_key: "cub",
  high_intent_efforts: 39,
  budget: 40,
  days: [
    day({ id: 2003, dow: "wed", date: "2026-09-23", name: "Fast at the Park", role: "Fast Day", hie: 9, summary_lines: ["Sprint ladder", "Soccer at speed"] }),
    day({ id: 2007, dow: "sun", date: "2026-09-27", name: "Ceremony", role: "Court Day", minutes: "30 to 45", hie: 0, summary_lines: ["Quick card", "Ball skills 15 min"] }),
    day({ id: 2001, dow: "mon", date: "2026-09-21", name: "Floor Work", role: "Floor Day", hie: 6, summary_lines: ["Crossover drills"] }),
    day({ id: 2004, dow: "thu", date: "2026-09-24", name: "Wall Day", role: "Wall Day", hie: 9, summary_lines: ["Tennis wall rally", "Basketball chest pass target"] }),
    day({ id: 2002, dow: "tue", date: "2026-09-22", name: "Rings Work", role: "Rings Day", hie: 6, summary_lines: ["Rings passes", "Soccer touches"] }),
    day({ id: 2005, dow: "fri", date: "2026-09-25", name: "Skate Day", role: "Skate Day", minutes: "45 to 60", hie: 5, summary_lines: ["Keeper W-catch"] }),
    day({ id: 2006, dow: "sat", date: "2026-09-26", name: "Game Day", role: "Game Day", minutes: "0", hie: 0, summary_lines: ["Home program off"] }),
  ],
};

const WEEK_3: WeekPayload = {
  id: 103,
  number: 3,
  position_in_block: 3,
  theme: "Trials",
  dates_display: "Sep 28 to Oct 4",
  targets: [
    "Retest the full battery, all ten plus height",
    "Cartwheel: show the whole progression so far",
    "Basketball: cone weave test",
    "Soccer: wall passes test, both feet",
    "Tennis: rally count test",
  ],
  challenge: "Best Rally Count. One try Monday, one try Friday, keep the better one.",
  trials: true,
  block_key: "cub",
  high_intent_efforts: 20,
  budget: 20,
  days: [
    day({ id: 3004, dow: "thu", date: "2026-10-01", name: "Trials: Wall & Ball", role: "Wall Day", hie: 4, summary_lines: ["Tennis rally count test"] }),
    day({ id: 3001, dow: "mon", date: "2026-09-28", name: "Trials: Floor", role: "Floor Day", hie: 3, summary_lines: ["Cone weave test"] }),
    day({ id: 3006, dow: "sat", date: "2026-10-03", name: "Game Day", role: "Game Day", minutes: "0", hie: 0, summary_lines: ["Home program off"] }),
    day({ id: 3003, dow: "wed", date: "2026-09-30", name: "Trials: Fast", role: "Fast Day", hie: 4, summary_lines: ["Sprint retest"] }),
    day({ id: 3002, dow: "tue", date: "2026-09-29", name: "Trials: Rings", role: "Rings Day", hie: 3, summary_lines: ["Wall passes test"] }),
    day({ id: 3007, dow: "sun", date: "2026-10-04", name: "Rank-Up Ceremony", role: "Court Day", minutes: "30 to 45", hie: 0, summary_lines: ["Award the new patches"] }),
    day({ id: 3005, dow: "fri", date: "2026-10-02", name: "Trials: Skate", role: "Skate Day", minutes: "45 to 60", hie: 3, summary_lines: ["Keeper retest"] }),
  ],
};

const MONTH_PLAN: MonthPlan = {
  month: "2026-09",
  label: "Cub block, weeks 1 to 3",
  range_display: "Sep 14 to Oct 4",
  block_key: "cub",
  // Out of number order on purpose: see the comment above WEEK_1.
  weeks: [WEEK_3, WEEK_1, WEEK_2],
};

function weekRegion(name: RegExp) {
  return screen.getByRole("region", { name });
}

// Seeds the auth slice the way a real restore does, in one action, so a
// rendering test does not have to run the sign-in or restore saga just to
// get a program year id in front of Month. `auth/RESTORE_FINISHED` is the
// same action core's own restoreSessionSaga dispatches once /api/v1/me
// answers (or, with current_program_year_id null, once it could not) — the
// same helper year.test.tsx uses for the same reason.
function seedAuth(store: ReturnType<typeof createCoreStore>, currentProgramYearId: number | null) {
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" },
      athlete: null,
      current_program_year_id: currentProgramYearId,
    },
  });
}

function renderMonth(currentProgramYearId: number | null = 42) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  return {
    store,
    ...render(
      <Provider store={store}>
        <Month />
      </Provider>,
    ),
  };
}

describe("the Month view", () => {
  it("asks for the current year's month once on mount", async () => {
    // Signed in the way a real launch does it, through the same
    // createAppStore (src/bootstrap.ts) main.tsx calls, with the real /me
    // round trip stubbed rather than a hand-dispatched
    // currentProgramYearId. Hand-fabricating that value would test a
    // sequence only this test ran, not the one the app actually runs, and
    // would not catch a regression that broke the wiring between /me and
    // this screen's effect.
    const storage = memoryStorage();
    const user = { id: 1, email: "a@b.c", name: "Jeff", role: "coach" };
    await storage.setItem("teddy-pe.session", JSON.stringify({ jwt: "a.b.c", user }));
    stubMe(user);

    const store = createAppStore({ baseUrl: "https://api.test", storage });
    const dispatched: { type: string; payload?: unknown }[] = [];
    const realDispatch = store.dispatch;
    store.dispatch = ((action: never) => {
      dispatched.push(action as { type: string; payload?: unknown });
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { rerender } = render(
      <Provider store={store}>
        <Month />
      </Provider>,
    );

    const monthFetches = () => dispatched.filter((a) => a.type === "plan/FETCH");

    // The /me round trip is real (async, through the actual saga), so the
    // fetch this screen dispatches only lands once currentProgramYearId
    // resolves off it.
    await waitFor(() => {
      expect(monthFetches()).toHaveLength(1);
    });
    expect(monthFetches()[0].payload).toEqual({
      yearId: ME_PROGRAM_YEAR_ID,
      month: currentMonthKey(),
    });

    // A rerender with nothing changed must not ask again. A screen that
    // refetches on every render hammers a server that takes seven seconds
    // to wake.
    rerender(
      <Provider store={store}>
        <Month />
      </Provider>,
    );
    expect(monthFetches()).toHaveLength(1);
  });

  it("shows a waiting message rather than a blank panel while the current year id is not known yet", () => {
    // selectCurrentProgramYearId is null both while /api/v1/me is still in
    // flight right after sign-in, and, more lastingly, when a restore
    // succeeded on a cached session because /me could not answer for a
    // reason that says nothing about the token (a cold server, no
    // connection). core deliberately lets that restore succeed rather than
    // sign someone out over a slow tunnel, so a signed-in person can sit
    // here with no id yet, and this screen must say something rather than
    // leave the content area empty.
    //
    // Before this test existed, the component fell straight through to
    // `return null` for this exact case: no fetch is ever dispatched
    // (nothing to dispatch it with), so data/loading/error all stay falsy
    // forever, and a signed-in person got a blank panel with no
    // explanation, indefinitely, if /me never recovered.
    renderMonth(null);

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("says the server may be waking rather than showing a blank panel", () => {
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/FETCH", payload: { yearId: 1, month: "2026-09" } });
    });

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("keeps the weeks on screen while refetching", () => {
    // data present AND loading true. Blanking on every refresh is what makes
    // a scale-to-zero server feel broken.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });
    expect(screen.getByRole("heading", { name: /week 1: baseline/i })).toBeInTheDocument();

    act(() => {
      store.dispatch({ type: "plan/FETCH", payload: { yearId: 1, month: "2026-09" } });
    });

    expect(screen.getByRole("heading", { name: /week 1: baseline/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/FAILED", payload: "That month could not be found." });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That month could not be found.");
  });

  it("renders every week with its own theme and dates", () => {
    // Scoped to each week's own region, both ways: theme and dates_display
    // are asserted together inside the region that week's own heading names,
    // and each week's dates are asserted absent from the other two regions.
    // The earlier, unscoped version of this test (plain screen.getByText,
    // no `within`) would still pass content that leaked into the wrong
    // week's section, since it only ever checked presence anywhere on the
    // page.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    const week1 = weekRegion(/week 1/i);
    expect(within(week1).getByRole("heading", { name: /baseline & land/i })).toBeInTheDocument();
    expect(within(week1).getByText("Sep 14 to Sep 20")).toBeInTheDocument();

    const week2 = weekRegion(/week 2/i);
    expect(within(week2).getByRole("heading", { name: /build the touches/i })).toBeInTheDocument();
    expect(within(week2).getByText("Sep 21 to Sep 27")).toBeInTheDocument();

    const week3 = weekRegion(/week 3/i);
    expect(within(week3).getByRole("heading", { name: /trials/i })).toBeInTheDocument();
    expect(within(week3).getByText("Sep 28 to Oct 4")).toBeInTheDocument();

    expect(within(week1).queryByText("Sep 21 to Sep 27")).not.toBeInTheDocument();
    expect(within(week1).queryByText("Sep 28 to Oct 4")).not.toBeInTheDocument();
    expect(within(week2).queryByText("Sep 14 to Sep 20")).not.toBeInTheDocument();
    expect(within(week2).queryByText("Sep 28 to Oct 4")).not.toBeInTheDocument();
    expect(within(week3).queryByText("Sep 14 to Sep 20")).not.toBeInTheDocument();
    expect(within(week3).queryByText("Sep 21 to Sep 27")).not.toBeInTheDocument();
  });

  it("renders the three weeks in number order, not the order they arrived", () => {
    // MONTH_PLAN hands the store WEEK_3, WEEK_1, WEEK_2 in that order. This
    // fails if the component does not sort by `number`.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual([
      "Week 1: Baseline & Land",
      "Week 2: Build the Touches",
      "Week 3: Trials",
    ]);
  });

  it("shows each week's spend and its budget, and they are different numbers", () => {
    // Assert both per week, as one combined phrase, so a component that
    // printed budget in place of spend (or vice versa) cannot pass by
    // showing either number alone.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    expect(within(weekRegion(/week 1/i)).getByText(/28 of 40/)).toBeInTheDocument();
    expect(within(weekRegion(/week 2/i)).getByText(/39 of 40/)).toBeInTheDocument();
    expect(within(weekRegion(/week 3/i)).getByText(/20 of 20/)).toBeInTheDocument();
  });

  it("marks the week the API budgeted lighter, and only that one", () => {
    // Assert the other two are NOT marked. Week 8 of every block is at half
    // volume, so its budget is 20 rather than 40 and that is the point, not
    // just a label. The marker reads the budgets rather than the payload's
    // `trials` flag, because a property access survives minification and
    // would put that word in a public bundle (bundle-privacy.test.ts).
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    expect(within(weekRegion(/week 3/i)).getByText(/lighter week/i)).toBeInTheDocument();
    expect(within(weekRegion(/week 1/i)).queryByText(/lighter week/i)).not.toBeInTheDocument();
    expect(within(weekRegion(/week 2/i)).queryByText(/lighter week/i)).not.toBeInTheDocument();
  });

  it("shows all of a week's sub-targets", () => {
    // CLAUDE.md requires five or six, including one tennis, one basketball
    // and one soccer. Assert the count and that none is dropped.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    const list = within(weekRegion(/week 1/i)).getByRole("list", { name: "Sub-targets" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(WEEK_1.targets.length);
    for (const target of WEEK_1.targets) {
      expect(within(list).getByText(target)).toBeInTheDocument();
    }
    expect(items.some((el) => /tennis/i.test(el.textContent ?? ""))).toBe(true);
    expect(items.some((el) => /basketball/i.test(el.textContent ?? ""))).toBe(true);
    expect(items.some((el) => /soccer/i.test(el.textContent ?? ""))).toBe(true);
  });

  it("shows the Challenge of the Week for each week", () => {
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    expect(within(weekRegion(/week 1/i)).getByText(/silent landings/i)).toBeInTheDocument();
    expect(within(weekRegion(/week 2/i)).getByText(/wall rally streak/i)).toBeInTheDocument();
    expect(within(weekRegion(/week 3/i)).getByText(/best rally count/i)).toBeInTheDocument();
  });

  it("lists the seven days of each week in weekday order", () => {
    // The fixture lists each week's days shuffled. This fails if the
    // component does not sort.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    for (const region of [/week 1/i, /week 2/i, /week 3/i]) {
      const list = within(weekRegion(region)).getByRole("list", { name: "Days" });
      // Direct children only: each day's own <li> nests a second list (that
      // day's summary lines), and getAllByRole("listitem") would otherwise
      // also pick up every summary item's <li>, which is not what "the
      // seven days" means here.
      const items = Array.from(list.querySelectorAll(":scope > li"));
      const dows = items.map((el) => el.querySelector("strong")?.textContent);
      expect(dows).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    }
  });

  it("does not pretend to have what the month payload omits", () => {
    // The month's day cards carry no blocks, no dad note and no journal
    // entries (backend/app/services/week_payload.rb only adds those when
    // called with detailed: true, and plans_controller.rb calls it with
    // detailed: false). A screen that renders an empty section for them
    // teaches Jeff the day has nothing in it, which is false: the week view
    // has it all.
    const { store } = renderMonth();
    act(() => {
      store.dispatch({ type: "plan/SUCCEEDED", payload: MONTH_PLAN });
    });

    const week1 = weekRegion(/week 1/i);
    expect(within(week1).queryByText(/dad('?s)? note/i)).not.toBeInTheDocument();
    expect(within(week1).queryByText(/coach('?s)? (note|entry)/i)).not.toBeInTheDocument();
    expect(within(week1).queryByText(/athlete('?s)? (note|entry)/i)).not.toBeInTheDocument();
    expect(within(week1).queryByText(/journal/i)).not.toBeInTheDocument();
    expect(within(week1).queryByRole("heading", { name: /blocks/i })).not.toBeInTheDocument();
  });

  it("renders nothing rather than throwing before the month has loaded", () => {
    // Every screen can render before its data arrives. A component that
    // throws on null data turns a slow server into a crash. The id is known
    // here (so the effect fires and skips the "finding the month" branch),
    // but the FETCH action it dispatches is intercepted before it can reach
    // the reducer, freezing the component in the instant between "the id
    // arrived" and "the resulting fetch updated loading" - the exact gap
    // the component's own fallback (`return null`) is for. Without the
    // intercept, this would only ever observe the FINDING_MONTH_LABEL
    // branch above (yearId still null) or the WAKING_LABEL branch (loading
    // already true), never the true empty case.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "plan/FETCH") return action;
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <Month />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
