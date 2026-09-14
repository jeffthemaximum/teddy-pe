import { act, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { ProgressionPayload } from "@teddy-pe/core";
import { Progress } from "../src/screens/Progress";

// Built from the real shape captured from a locally seeded database (see
// .superpowers/sdd/2026-09-14-phase-2c-writing-screens/progression-payload.json
// and core/src/types.ts's own comment on Progression), not invented: every
// number below is a string on the wire except height.cm_per_year, which the
// producer sends as a real number.

type BatteryMeasure = ProgressionPayload["battery"][number];

// direction "lower", values fall (5.00 -> 4.00): an improvement for a
// measure where lower is better. Paired with JUMP below, whose direction
// and movement are both the opposite, so a chart that ignores `direction`
// entirely, or one that just assumes "falling is always good", cannot pass
// both of the tests that use this pair (see the "shows a measure where
// ... is better" tests).
const SPRINT: BatteryMeasure = {
  test_id: "t-sprint",
  label: "Quick sprint",
  unit: "s",
  direction: "lower",
  first: "5.00",
  latest: "4.00",
  change: "better",
  series: [
    { window: "2026-09", value: "5.00", recorded_at: "2026-09-16T00:00:00.000Z", year_label: "2026-27" },
    { window: "2027-09", value: "4.00", recorded_at: "2027-09-15T00:00:00.000Z", year_label: "2027-28" },
  ],
};

// direction "higher", values rise (100.0 -> 150.0): an improvement for a
// measure where higher is better. Opposite direction AND opposite movement
// from SPRINT, on purpose.
const JUMP: BatteryMeasure = {
  test_id: "t-jump",
  label: "Standing jump",
  unit: "cm",
  direction: "higher",
  first: "100.0",
  latest: "150.0",
  change: "better",
  series: [
    { window: "2026-09", value: "100.0", recorded_at: "2026-09-16T00:00:00.000Z", year_label: "2026-27" },
    { window: "2027-09", value: "150.0", recorded_at: "2027-09-15T00:00:00.000Z", year_label: "2027-28" },
  ],
};

// direction "higher", values rise (10.0 -> 20.0), which reads as an
// improvement by raw arithmetic on a higher-is-better measure, but `change`
// says "worse" anyway. The server is allowed to know something the two raw
// numbers alone do not; a screen computing its own verdict from first and
// latest would show "better" here and be wrong.
const CONTRADICTED: BatteryMeasure = {
  test_id: "t-balance",
  label: "Balance hold",
  unit: "s",
  direction: "higher",
  first: "10.0",
  latest: "20.0",
  change: "worse",
  series: [
    { window: "2026-09", value: "10.0", recorded_at: "2026-09-16T00:00:00.000Z", year_label: "2026-27" },
    { window: "2027-09", value: "20.0", recorded_at: "2027-09-15T00:00:00.000Z", year_label: "2027-28" },
  ],
};

// Handed to the store out of window order on purpose (2027-09 before
// 2026-09 before 2028-03), the same reasoning month.test.tsx uses for its
// out-of-order weeks: a component that trusted arrival order rather than
// sorting by window would fail the ordering test and pass every other one.
const HEIGHT: ProgressionPayload["height"] = {
  series: [
    { window: "2027-09", value: "140.0", recorded_at: "2027-09-15T00:00:00.000Z", year_label: "2027-28" },
    { window: "2026-09", value: "128.0", recorded_at: "2026-09-15T00:00:00.000Z", year_label: "2026-27" },
    { window: "2028-03", value: "142.5", recorded_at: "2028-03-03T00:00:00.000Z", year_label: "2027-28" },
  ],
  cm_per_year: 9.7,
};

// Handed to the store out of chronological order (Third, First, Second),
// the same reasoning as HEIGHT above: a component that trusted arrival
// order would fail the ordering test.
const RANKS: ProgressionPayload["ranks"] = [
  { block_key: "block-c", block_name: "Third Rank", awarded_on: "2027-11-08", patch_count: 8, year_label: "2027-28" },
  { block_key: "block-a", block_name: "First Rank", awarded_on: "2026-11-08", patch_count: 7, year_label: "2026-27" },
  { block_key: "block-b", block_name: "Second Rank", awarded_on: "2027-03-01", patch_count: 9, year_label: "2026-27" },
];

const DRILLS: ProgressionPayload["drills"] = [
  {
    slug: "wall-taps",
    name: "Wall taps",
    latest: "owns",
    history: [
      { session_date: "2026-09-17", rating: "not_yet", year_label: "2026-27" },
      { session_date: "2027-09-16", rating: "owns", year_label: "2027-28" },
    ],
  },
  {
    slug: "step-hop",
    name: "Step hop",
    latest: "getting",
    history: [{ session_date: "2026-09-17", rating: "getting", year_label: "2026-27" }],
  },
];

const PROGRESSION: ProgressionPayload = {
  years: [
    { id: 1, label: "2026-27", starts_on: "2026-09-14", ends_on: "2027-08-15", status: "active" },
    { id: 2, label: "2027-28", starts_on: "2027-09-13", ends_on: "2028-08-13", status: "draft" },
  ],
  ranks: RANKS,
  battery: [SPRINT, JUMP, CONTRADICTED],
  height: HEIGHT,
  drills: DRILLS,
};

function renderProgress() {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  return {
    store,
    ...render(
      <Provider store={store}>
        <Progress />
      </Provider>,
    ),
  };
}

describe("the Progress view", () => {
  it("fetches the progression once on mount", () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const dispatched: { type: string; payload?: unknown }[] = [];
    const realDispatch = store.dispatch;
    store.dispatch = ((action: never) => {
      dispatched.push(action as { type: string; payload?: unknown });
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { rerender } = render(
      <Provider store={store}>
        <Progress />
      </Provider>,
    );

    const fetches = () => dispatched.filter((a) => a.type === "progression/FETCH");
    expect(fetches()).toHaveLength(1);

    // A rerender with nothing changed must not ask again. This endpoint
    // takes no year id to wait on, so there is nothing here that should
    // ever fire the fetch a second time on its own.
    rerender(
      <Provider store={store}>
        <Progress />
      </Provider>,
    );
    expect(fetches()).toHaveLength(1);
  });

  it("says the server may be waking rather than showing a blank page", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/FETCH", payload: undefined });
    });

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/FAILED", payload: "That could not be reached." });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That could not be reached.");
  });

  it("draws height across every year, in window order", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /height/i });
    const items = within(region).getAllByRole("listitem").map((el) => el.textContent ?? "");

    // Sorted by window (2026-09, 2027-09, 2028-03), not the shuffled order
    // HEIGHT above hands the store.
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/2026-09/);
    expect(items[0]).toMatch(/128/);
    expect(items[1]).toMatch(/2027-09/);
    expect(items[1]).toMatch(/140/);
    expect(items[2]).toMatch(/2028-03/);
    expect(items[2]).toMatch(/142\.5/);
  });

  it("shows the growth pace when there is one", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /height/i });
    expect(within(region).getByText(/9\.7/)).toBeInTheDocument();
    expect(within(region).getByText(/cm a year/i)).toBeInTheDocument();
  });

  it("says nothing rather than zero when the growth pace cannot be worked out", () => {
    // cm_per_year is null when there are fewer than two heights or the
    // dates recorded do not span enough time to say. Nil is the safe
    // answer; it must not render as 0, which would be a real, different
    // claim (that growth has stopped).
    const { store } = renderProgress();
    act(() => {
      store.dispatch({
        type: "progression/SUCCEEDED",
        payload: { ...PROGRESSION, height: { series: HEIGHT.series, cm_per_year: null } },
      });
    });

    const region = screen.getByRole("region", { name: /height/i });
    expect(within(region).queryByText(/cm a year/i)).not.toBeInTheDocument();
    expect(within(region).queryByText(/(^|\s)0(\s|$)/)).not.toBeInTheDocument();
  });

  it("shows a measure where lower is better as improving when the number falls", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /quick sprint/i });
    expect(within(region).getByText(/lower is better/i)).toBeInTheDocument();
    expect(within(region).getByText(/right way/i)).toBeInTheDocument();
    expect(within(region).queryByText(/wrong way/i)).not.toBeInTheDocument();
  });

  it("shows a measure where higher is better as improving when the number rises", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /standing jump/i });
    expect(within(region).getByText(/higher is better/i)).toBeInTheDocument();
    expect(within(region).getByText(/right way/i)).toBeInTheDocument();
    expect(within(region).queryByText(/wrong way/i)).not.toBeInTheDocument();
  });

  it("renders the server's own verdict rather than computing one", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    // Balance hold rose (10.0 -> 20.0) on a higher-is-better measure, which
    // looks like an improvement by raw arithmetic, but change says
    // "worse". Only the server's own word may show up here.
    const region = screen.getByRole("region", { name: /balance hold/i });
    expect(within(region).getByText(/not as good as before/i)).toBeInTheDocument();
    expect(within(region).queryByText(/better than before/i)).not.toBeInTheDocument();
    expect(within(region).queryByText(/about the same/i)).not.toBeInTheDocument();
  });

  it("lists rank history across years, newest or oldest first, consistently", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /rank/i });
    const items = within(region).getAllByRole("listitem");
    const names = items.map((el) => el.querySelector("strong")?.textContent);

    // RANKS above hands the store Third, First, Second (awarded_on
    // 2027-11-08, 2026-11-08, 2027-03-01). Newest first is
    // Third (2027-11-08), Second (2027-03-01), First (2026-11-08).
    expect(names).toEqual(["Third Rank", "Second Rank", "First Rank"]);
  });

  it("shows how many patches earned each rank", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /rank/i });
    // Seven of nine is the normal bar to rank up (CLAUDE.md), not a rank
    // earned short of complete, so all three counts appear plainly,
    // including the seven.
    expect(within(region).getByText(/7 of 9/)).toBeInTheDocument();
    expect(within(region).getByText(/8 of 9/)).toBeInTheDocument();
    expect(within(region).getByText(/9 of 9/)).toBeInTheDocument();
  });

  it("shows each drill's latest rating and its history", () => {
    const { store } = renderProgress();
    act(() => {
      store.dispatch({ type: "progression/SUCCEEDED", payload: PROGRESSION });
    });

    const region = screen.getByRole("region", { name: /drill/i });

    const wallTapsItem = within(region).getByText("Wall taps").closest("li");
    expect(wallTapsItem).not.toBeNull();
    expect(within(wallTapsItem as HTMLElement).getByText(/where he is now: owns it/i)).toBeInTheDocument();

    const wallTapsHistory = within(wallTapsItem as HTMLElement).getByRole("list", { name: /wall taps history/i });
    const wallTapsEntries = within(wallTapsHistory).getAllByRole("listitem").map((el) => el.textContent ?? "");
    expect(wallTapsEntries).toHaveLength(2);
    expect(wallTapsEntries[0]).toMatch(/2026-09-17/);
    expect(wallTapsEntries[0]).toMatch(/not yet/i);
    expect(wallTapsEntries[1]).toMatch(/2027-09-16/);
    expect(wallTapsEntries[1]).toMatch(/owns it/i);

    const stepHopItem = within(region).getByText("Step hop").closest("li");
    expect(stepHopItem).not.toBeNull();
    expect(within(stepHopItem as HTMLElement).getByText(/where he is now: getting it/i)).toBeInTheDocument();
  });

  it("says plainly when nothing has been measured yet", () => {
    // This is what Jeff sees today: production has no awards or results
    // yet. Empty battery, empty ranks, empty drills, empty height series.
    // height itself is still present, per the payload's own shape, just
    // with an empty series and a null pace.
    const { store } = renderProgress();
    act(() => {
      store.dispatch({
        type: "progression/SUCCEEDED",
        payload: {
          years: PROGRESSION.years,
          ranks: [],
          battery: [],
          height: { series: [], cm_per_year: null },
          drills: [],
        },
      });
    });

    expect(screen.getByText(/nothing has been measured/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /height/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /rank/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /drill/i })).not.toBeInTheDocument();
  });

  it("renders nothing rather than throwing before anything has loaded", () => {
    // The fetch dispatched on mount is intercepted before it can reach the
    // reducer, freezing the component in the instant between "mounted" and
    // "the resulting fetch updated loading" - the exact gap the
    // component's own fallback (return null) is for.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "progression/FETCH") return action;
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <Progress />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
