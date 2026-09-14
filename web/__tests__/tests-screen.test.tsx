import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage, testResultsActions } from "@teddy-pe/core";
import type { ProgramYearDetail, TestResult } from "@teddy-pe/core";
import { Tests } from "../src/screens/Tests";

// Three measures, deliberately out of position order (position 3 listed
// first): a fixture already in order passes against a component that never
// sorts, which is the defect this project keeps finding.
const MEASURES: ProgramYearDetail["battery"]["measures"] = [
  {
    id: 3,
    test_id: "balance_l",
    position: 3,
    label: "Balance hold, left",
    unit: "sec",
    direction: "higher",
    battery_test_id: 103,
  },
  {
    id: 1,
    test_id: "sprint10",
    position: 1,
    label: "10-yard sprint",
    unit: "sec",
    direction: "lower",
    battery_test_id: 101,
  },
  {
    id: 2,
    test_id: "broad_jump",
    position: 2,
    label: "Broad jump",
    unit: "in",
    direction: "higher",
    battery_test_id: 102,
  },
];

// Three windows, also shuffled, with the pinned clock (see beforeEach below)
// landing inside the first one. A fixture with only one window could not
// prove selectDefaultWindow is actually being used rather than "whatever
// test date happens to be first."
const TEST_DATES: ProgramYearDetail["test_dates"] = [
  { id: 3, window: "2027-03", label: "Retest 2", display: "Mid March", position: 3 },
  { id: 1, window: "2026-09", label: "Baseline", display: "Mid September", position: 1 },
  { id: 2, window: "2026-12", label: "Retest 1", display: "Mid December", position: 2 },
];

function yearFixture(overrides: Partial<ProgramYearDetail> = {}): ProgramYearDetail {
  return {
    id: 42,
    label: "2026-27",
    starts_on: "2026-09-14",
    ends_on: "2027-08-15",
    status: "active",
    ball_now: "green",
    rank_rule: "Earn 7 of 9",
    north_star: "Move well, on his own terms.",
    blocks: [],
    areas: [],
    patches: [],
    ball_gates: [],
    battery: {
      tests: [],
      measures: MEASURES,
      // A decoy, on purpose: the year payload's own copy of results, taken
      // once at fetch time and never refreshed after. If this screen ever
      // read a measure's value from here instead of from the test-results
      // duck, this stale "2.7" would go on showing forever, including after
      // a clear the duck itself correctly took down (see the clearing test
      // below).
      results: [{ window: "2026-09", test_id: "sprint10", raw_value: "2.7", numeric_value: "2.7" }],
      progress: [],
    },
    test_dates: TEST_DATES,
    day_roles: [],
    current_block_key: "coyote",
    current_week_id: 1,
    patch_awards: [],
    rank_awards: [],
    ...overrides,
  };
}

// sprint10 and broad_jump both have a result at the baseline window;
// balance_l does not, the fixture trap for the empty-box test. At the
// December window the numbers differ from baseline (not just present or
// absent), which is what proves changing the window actually reads a
// different window rather than redrawing the same one.
const RESULTS: TestResult[] = [
  {
    id: 501,
    test_id: "sprint10",
    window: "2026-09",
    raw_value: "2.7",
    numeric_value: "2.7",
    recorded_at: "2026-09-14T10:00:00.000Z",
    updated_at: "2026-09-14T10:00:00.000Z",
  },
  {
    id: 502,
    test_id: "broad_jump",
    window: "2026-09",
    raw_value: "38",
    numeric_value: "38",
    recorded_at: "2026-09-14T10:05:00.000Z",
    updated_at: "2026-09-14T10:05:00.000Z",
  },
  {
    id: 503,
    test_id: "sprint10",
    window: "2026-12",
    raw_value: "2.5",
    numeric_value: "2.5",
    recorded_at: "2026-12-14T10:00:00.000Z",
    updated_at: "2026-12-14T10:00:00.000Z",
  },
  {
    id: 504,
    test_id: "balance_l",
    window: "2026-12",
    raw_value: "20",
    numeric_value: "20",
    recorded_at: "2026-12-14T10:10:00.000Z",
    updated_at: "2026-12-14T10:10:00.000Z",
  },
];

// Puts a known current program year id and a known signed-in coach in front
// of Tests without a real /me round trip, the same way every other screen's
// test file seeds it. `auth/RESTORE_FINISHED` is the same action core's own
// restoreSessionSaga dispatches once /api/v1/me answers.
function seedAuth(store: ReturnType<typeof createCoreStore>, currentProgramYearId: number | null) {
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "coach@example.com", name: "Jeff", role: "coach" },
      athlete: null,
      current_program_year_id: currentProgramYearId,
    },
  });
}

function renderTests(currentProgramYearId: number | null = 42) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  return {
    store,
    ...render(
      <Provider store={store}>
        <Tests />
      </Provider>,
    ),
  };
}

function loadYear(store: ReturnType<typeof createCoreStore>, year: ProgramYearDetail = yearFixture()) {
  act(() => {
    store.dispatch({ type: "programYear/SUCCEEDED", payload: year });
  });
}

function loadResults(store: ReturnType<typeof createCoreStore>, results: TestResult[] = RESULTS) {
  act(() => {
    store.dispatch({ type: "testResults/RESULTS_FETCHED", payload: results });
  });
}

// Every dispatched action, in order, so a test can assert on how many times
// a particular type went out and on the exact payload the last one carried.
function trackDispatch(store: ReturnType<typeof createCoreStore>) {
  const dispatched: { type: string; payload?: unknown }[] = [];
  const realDispatch = store.dispatch;
  store.dispatch = ((action: never) => {
    dispatched.push(action as { type: string; payload?: unknown });
    return realDispatch(action);
  }) as typeof store.dispatch;
  return dispatched;
}

function windowSelect(): HTMLSelectElement {
  return screen.getByLabelText(/test date/i) as HTMLSelectElement;
}

function measureInput(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

// This screen's mount effect fires two fetches, and every selector it reads
// before either one answers hands back a fresh object for an empty window
// rather than the same one twice (see this file's own "Selector ... returned
// a different result" console warning). React checks each selector again
// right after mount to catch exactly that, and schedules one more render
// when it does, outside whatever this test already wrapped in act(). A test
// that never awaits anything else after render sees that render land after
// its own body has finished, which is the console's "not wrapped in act"
// warning, not a sign anything here is actually wrong. This flushes it
// inside act(), the same way an awaited user.click already does for the
// tests below that have one.
async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  // "Today" is pinned inside the baseline window (2026-09), regardless of
  // the real calendar date the suite happens to run on. A window test that
  // depends on when the suite runs passes for eleven months and fails in
  // the twelfth.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the test sheet", () => {
  it("fetches the year and the results once on mount", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const dispatched = trackDispatch(store);

    const { rerender } = render(
      <Provider store={store}>
        <Tests />
      </Provider>,
    );
    await settle();

    const yearFetches = () => dispatched.filter((a) => a.type === "programYear/FETCH");
    const resultFetches = () => dispatched.filter((a) => a.type === "testResults/FETCH_RESULTS");
    expect(yearFetches()).toHaveLength(1);
    expect(resultFetches()).toHaveLength(1);

    // A rerender with nothing changed must not ask again.
    rerender(
      <Provider store={store}>
        <Tests />
      </Provider>,
    );
    await settle();
    expect(yearFetches()).toHaveLength(1);
    expect(resultFetches()).toHaveLength(1);
  });

  it("says the server may be waking rather than showing a blank sheet", async () => {
    // Right after mount, both fetches this screen dispatched are in flight
    // and neither has answered yet.
    renderTests(42);
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", async () => {
    const { store } = renderTests(42);

    act(() => {
      store.dispatch({ type: "programYear/FAILED", payload: "That could not be reached." });
    });
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("That could not be reached.");
  });

  it("opens with the right window already chosen", async () => {
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    await settle();

    expect(windowSelect()).toHaveValue("2026-09");
    expect(measureInput(/10-yard sprint/i)).toHaveValue("2.7");
    expect(measureInput(/broad jump/i)).toHaveValue("38");
  });

  it("lets him change the window, and shows that window's numbers", async () => {
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);

    fireEvent.change(windowSelect(), { target: { value: "2026-12" } });
    await settle();

    expect(windowSelect()).toHaveValue("2026-12");
    expect(measureInput(/10-yard sprint/i)).toHaveValue("2.5");
    expect(measureInput(/balance hold, left/i)).toHaveValue("20");
  });

  it("shows every measure the battery has, with its unit", async () => {
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    await settle();

    expect(screen.getByLabelText(/10-yard sprint \(sec\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/broad jump \(in\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/balance hold, left \(sec\)/i)).toBeInTheDocument();
  });

  it("gives the box a keyboard that can type a range, not a numbers-only pad", async () => {
    // userEvent.type does not enforce inputMode the way a real phone
    // keyboard does, so a test that typed "15 to 18" here and checked the
    // save payload would keep passing even with inputMode="decimal" back
    // in place: jsdom has no numeric keypad to refuse the letters and the
    // space. The only thing that actually stands between him and typing a
    // range on a court is this attribute, so this reads that attribute
    // directly rather than what userEvent is willing to fake past it.
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    await settle();

    const input = measureInput(/10-yard sprint/i);
    expect(input).toHaveAttribute("inputmode", "text");
  });

  it("shows a measure with no result as empty, not as zero", async () => {
    const { store } = renderTests(42);
    loadYear(store);
    // balance_l has no result at the baseline window, the window this
    // opens on.
    loadResults(store);
    await settle();

    const input = measureInput(/balance hold, left/i);
    expect(input).toHaveValue("");
    expect(input).not.toHaveValue("0");
  });

  it("saves the raw text he typed, not a parsed number", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    const dispatched = trackDispatch(store);

    // balance_l is the empty box at this window: nothing to clear first,
    // only a range to type into it.
    const input = measureInput(/balance hold, left/i);
    await user.type(input, "15 to 18");
    fireEvent.blur(input);

    const saves = dispatched.filter((a) => a.type === "testResults/SAVE_RESULT");
    expect(saves).toHaveLength(1);
    expect(saves[0]?.payload).toEqual({
      programYearId: 42,
      window: "2026-09",
      testId: "balance_l",
      rawValue: "15 to 18",
    });
  });

  it("saves on blur without needing a save button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    const dispatched = trackDispatch(store);

    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();

    const input = measureInput(/10-yard sprint/i);
    await user.clear(input);
    await user.type(input, "2.6");
    fireEvent.blur(input);

    const saves = dispatched.filter((a) => a.type === "testResults/SAVE_RESULT");
    expect(saves).toHaveLength(1);
    expect((saves[0]?.payload as { rawValue: string }).rawValue).toBe("2.6");
  });

  it("marks only that measure as saving while a save is in flight", async () => {
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);

    act(() => {
      store.dispatch(
        testResultsActions.saveResult({
          programYearId: 42,
          window: "2026-09",
          testId: "sprint10",
          rawValue: "2.6",
        }),
      );
    });
    await settle();

    const sprintRow = measureInput(/10-yard sprint/i).closest("li")!;
    const jumpRow = measureInput(/broad jump/i).closest("li")!;
    expect(within(sprintRow).getByText("Saving.")).toBeInTheDocument();
    expect(within(jumpRow).queryByText("Saving.")).not.toBeInTheDocument();
  });

  it("clears a measure when he empties the box", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    const dispatched = trackDispatch(store);

    const input = measureInput(/10-yard sprint/i);
    expect(input).toHaveValue("2.7");

    await user.clear(input);
    fireEvent.blur(input);

    const saves = dispatched.filter((a) => a.type === "testResults/SAVE_RESULT");
    expect(saves).toHaveLength(1);
    expect(saves[0]?.payload).toEqual({
      programYearId: 42,
      window: "2026-09",
      testId: "sprint10",
      rawValue: "",
    });
    // Reads empty right away, not the 2.7 it had a moment ago.
    expect(measureInput(/10-yard sprint/i)).toHaveValue("");

    // The server's own confirmation of the delete, forwarded to state
    // exactly the shape core's saga hands it. The box must still read
    // empty once this lands, not creep back to its old number.
    act(() => {
      store.dispatch({
        type: "testResults/RESULT_DELETED",
        payload: { window: "2026-09", testId: "sprint10" },
      });
    });
    expect(measureInput(/10-yard sprint/i)).toHaveValue("");
  });

  it("says the value is waiting when it was saved with no connection", async () => {
    const { store } = renderTests(42);
    loadYear(store);
    loadResults(store);
    // Flushed here, before anything is queued: the outbox reads its stored
    // queue back on its own, once, the moment the store is created, and a
    // memory-only store like this one's always answers empty. Queuing a
    // write below and only settling once at the very end would let that
    // read land after the queue already has this write in it, replacing it
    // with the empty one core read from storage a beat too late.
    await settle();

    const payload = {
      programYearId: 42,
      window: "2026-09",
      testId: "sprint10",
      rawValue: "2.6",
    };
    act(() => {
      store.dispatch(testResultsActions.saveResult(payload));
    });
    act(() => {
      // The exact QueueableAction the real save action carries: same
      // dedupeKey, same request, the one this file's dispatch above just
      // built. A queued write that did not match what was actually
      // attempted would prove nothing about what the screen does with a
      // real one.
      store.dispatch({
        type: "outbox/ENQUEUE",
        payload: testResultsActions.saveResult(payload),
      });
    });
    act(() => {
      store.dispatch({
        type: "testResults/SAVE_QUEUED",
        payload: { window: "2026-09", testId: "sprint10" },
      });
    });
    await settle();

    const row = measureInput(/10-yard sprint/i).closest("li")!;
    expect(within(row).getByText(/waiting to send/i)).toBeInTheDocument();
    expect(within(row).queryByText("Saving.")).not.toBeInTheDocument();
  });

  it("renders nothing rather than throwing before anything has loaded", async () => {
    // The id is known, but the year fetch and the results fetch this
    // screen dispatches on mount are both intercepted before either can
    // reach its own reducer, freezing the component in the instant between
    // "the id arrived" and "a fetch updated loading" — the exact gap the
    // component's own fallback (`return null`) is for.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "programYear/FETCH" || action.type === "testResults/FETCH_RESULTS") {
        return action;
      }
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <Tests />
      </Provider>,
    );
    await settle();

    expect(container).toBeEmptyDOMElement();
  });
});

describe("what is left to measure", () => {
  // The battery runs across three days, so what is still blank is the thing
  // worth knowing while standing on a court with a stopwatch.
  it("counts the measures with no result yet", async () => {
    const { store } = renderTests();
    loadYear(store);

    expect(await screen.findByText(/still blank/i)).toHaveTextContent("3 still blank");
  });

  // Counted off the store, which is the point. RESULTS fills two of the
  // three measures in the active window, so the count has to drop to one.
  it("counts down as results arrive", async () => {
    const { store } = renderTests();
    loadYear(store);
    await screen.findByText(/still blank/i);

    loadResults(store);

    expect(screen.getByText(/still blank/i)).toHaveTextContent("1 still blank");
  });

  // Nothing left to say once every box is filled, rather than "0 still
  // blank", which is a sentence nobody needs to read.
  it("says nothing when every measure has a result", async () => {
    const { store } = renderTests();
    loadYear(store);
    loadResults(store, [
      ...RESULTS,
      {
        id: 503,
        test_id: "balance_l",
        window: "2026-09",
        raw_value: "12",
        numeric_value: "12",
        recorded_at: "2026-09-14T10:00:00.000Z",
        updated_at: "2026-09-14T10:00:00.000Z",
      },
    ]);

    expect(screen.queryByText(/still blank/i)).toBeNull();
  });

  // A number typed and not blurred has not been saved. Telling him it had
  // is the one lie this screen must not tell.
  it("does not count a number that has been typed but not committed", async () => {
    const { store } = renderTests();
    loadYear(store);
    await screen.findByText(/still blank/i);

    await userEvent.type(screen.getByLabelText("Balance hold, left (sec)"), "12");

    expect(screen.getByText(/still blank/i)).toHaveTextContent("3 still blank");
  });
});
