import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import {
  createCoreStore,
  memoryStorage,
  journalActions,
  week,
} from "@teddy-pe/core";
import type { Role, WeekPayload, ProgramYearDetail } from "@teddy-pe/core";
import { Today } from "../src/screens/Today";
import { WEEK } from "./fixtures/week";

// Three measures, deliberately out of position order (position 3 listed
// first), the same trap tests-screen.test.tsx's own MEASURES sets: a
// fixture already in order would pass against a component that never
// sorts, which is the defect this project keeps finding. TestSheet itself
// deliberately does not sort (see its own comment), so Today is the one
// responsible for handing it measures already in order; a shuffled fixture
// is what would catch Today forgetting to.
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

// One test window, dated: 15 to 17 September is the Baseline window, so the
// 16th falls inside it and the 18th does not. This is the fixture the test
// sheet examples below need, and it is deliberately not tests-screen's own
// TEST_DATES: that array predates starts_on/ends_on and still has neither,
// on purpose, which is what makes it the right fixture for the
// deploy-window example there rather than for the test-day examples here.
const TEST_DATES: ProgramYearDetail["test_dates"] = [
  {
    id: 1,
    window: "2026-09",
    label: "Baseline",
    // An en dash, not a hyphen: the real display string this fixture is
    // standing in for is written that way, and copying it as a hyphen
    // would make this fixture quietly untrue to what the API actually
    // sends.
    display: "Sep 15–17",
    starts_on: "2026-09-15",
    ends_on: "2026-09-17",
    position: 1,
  },
];

// Copied from tests-screen.test.tsx's own yearFixture rather than imported:
// importing a *.test.tsx file runs every describe/it it holds a second
// time, once under its own file and once again here (checked against this
// repo's own vitest before this file was written; see WEEK's own fixture
// module for the one piece that is shared instead of copied, and why a
// plain module is what makes that safe). A factory function has no such
// hazard, so it is copied, not shared.
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
      results: [],
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

// The deploy window: Vercel is ahead of Fly, and the payload omits the
// dates entirely (see TestDate's own comment in core/src/types.ts). No
// section beats a wrong one, and beats a crash by more.
function yearWithUndatedWindows(): ProgramYearDetail {
  const year = yearFixture();
  return {
    ...year,
    test_dates: year.test_dates.map(({ starts_on, ends_on, ...rest }) => rest),
  };
}

// A week whose seven cards cover 14 to 20 September but whose Thursday has
// been removed, so "today" falls inside the loaded week and still has no
// card. That is the shape the real gap takes: a week that loaded fine and
// does not hold today, not a week that has not loaded at all.
function weekWithoutToday(): WeekPayload {
  return { ...WEEK, days: WEEK.days.filter((d) => d.date !== "2026-09-17") };
}

// Puts a known current program year id and a known signed-in person in
// front of Today without a real /me round trip. Copied from
// tests-screen.test.tsx's own seedAuth, widened there with a third, role,
// argument so this file's callers can say who is signed in: half of what
// this file asserts is that the three accounts see three different
// screens.
function seedAuth(
  store: ReturnType<typeof createCoreStore>,
  currentProgramYearId: number | null,
  role: Role = "coach",
) {
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "coach@example.com", name: "Jeff", role },
      athlete: null,
      current_program_year_id: currentProgramYearId,
    },
  });
}

// Every dispatched action, in order. Copied from tests-screen.test.tsx's own
// trackDispatch.
function trackDispatch(store: ReturnType<typeof createCoreStore>) {
  const dispatched: { type: string; payload?: unknown }[] = [];
  const realDispatch = store.dispatch;
  store.dispatch = ((action: never) => {
    dispatched.push(action as { type: string; payload?: unknown });
    return realDispatch(action);
  }) as typeof store.dispatch;
  return dispatched;
}

// The one helper every example here goes through. It takes the four things
// a Today example ever needs to vary (who is signed in, what the week duck
// holds, whether the year id is known, and what the program year holds) and
// hands back the tracked dispatches and the router, so an example asserts
// on what went out and where it navigated rather than on store internals.
//
// `week` and `programYear` are destructured under different local names
// (`weekPayload`, `year`): this file also needs the `week` duck itself, to
// build the loading action below, and a parameter of the same name would
// shadow it.
function renderToday({
  role = "coach",
  currentProgramYearId = 42,
  week: weekPayload = WEEK,
  loading = false,
  error = null,
  programYear: year = yearFixture(),
}: {
  role?: Role;
  currentProgramYearId?: number | null;
  week?: WeekPayload | null;
  loading?: boolean;
  error?: string | null;
  programYear?: ProgramYearDetail;
} = {}) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId, role);
  const dispatched = trackDispatch(store);

  const router = createMemoryRouter([{ path: "*", element: <Today /> }], {
    initialEntries: ["/today"],
  });

  const rendered = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  act(() => {
    if (weekPayload) store.dispatch({ type: "week/SUCCEEDED", payload: weekPayload });
    if (loading) store.dispatch(week.actions.fetch(currentProgramYearId as number));
    if (error) store.dispatch({ type: "week/FAILED", payload: error });
    if (currentProgramYearId !== null) {
      store.dispatch({ type: "programYear/SUCCEEDED", payload: year });
    }
  });

  return { store, dispatched, router, ...rendered };
}

// "Today" is pinned to Thursday the 17th, WEEK's own Wall Day, regardless of
// the real calendar date the suite happens to run on. Only Date is faked
// (not setTimeout/setInterval), the same reasoning this-week.test.tsx's own
// beforeEach documents: nothing here awaits a real timer, but a fully faked
// clock is the smaller, safer thing to reach for only once it is actually
// needed.
const THURSDAY = new Date("2026-09-17T10:00:00");

beforeEach(() => {
  // toFake: ["Date"], not the default (everything): findByText/waitFor poll
  // on a real setTimeout under the hood, and a fully faked clock freezes
  // that poll rather than letting it either resolve or time out honestly.
  // The same reasoning this-week.test.tsx's own beforeEach documents.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(THURSDAY);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Today", () => {
  describe("the card", () => {
    it("shows today's card and no other day", async () => {
      renderToday({ role: "coach" });
      expect(await screen.findByText(/wall day/i)).toBeInTheDocument();
      // Wednesday's card is in the same week payload and must not be here.
      expect(screen.queryByText(/fast day/i)).toBeNull();
    });

    it("shows the day's role and minutes", async () => {
      renderToday({ role: "coach" });
      // WEEK's Thursday carries no dad_note of its own (day()'s default
      // and minutes both apply); the dad-note case gets its own example
      // below on a week built just for it, rather than mutating this one.
      expect(await screen.findByText(/60 to 90 min/)).toBeInTheDocument();
    });

    it("shows Dad's note on a day that has one", async () => {
      const weekWithNote: WeekPayload = {
        ...WEEK,
        days: WEEK.days.map((d) =>
          d.date === "2026-09-17" ? { ...d, dad_note: "Watch his contact point." } : d,
        ),
      };
      renderToday({ role: "coach", week: weekWithNote });
      expect(await screen.findByText(/watch his contact point/i)).toBeInTheDocument();
    });

    it("opens a tapped drill in the glossary", async () => {
      // The same assertion this-week.test.tsx already makes about its own
      // tokens: the screen hands the slug to a callback and the callback
      // is the only thing that knows a slug becomes a URL. Thursday's one
      // block (TODAY_BLOCK, inside the WEEK fixture) opens on arrival
      // (TodayCard's own default), so this taps straight into its body.
      const { router } = renderToday({ role: "coach" });
      await userEvent.click(await screen.findByRole("button", { name: /rings hang/i }));

      expect(router.state.location.pathname).toBe("/glossary/rings-hang");
    });
  });

  // The five cases the spec names. Each says which one it is rather than
  // showing nothing, which is what the Notes drill list already does.
  describe("when there is no card", () => {
    it("says so when this week has no card for today", async () => {
      renderToday({ role: "coach", week: weekWithoutToday() });
      expect(
        await screen.findByText(/no card has been written for today yet/i),
      ).toBeInTheDocument();
    });

    it("offers a way to the rest of the week", async () => {
      renderToday({ role: "coach", week: weekWithoutToday() });
      expect(await screen.findByRole("link", { name: /this week/i })).toHaveAttribute(
        "href",
        "/week",
      );
    });

    // The difference that matters most on this screen. "No card for today"
    // while one is still on its way is a guess dressed as a fact, and he
    // would believe it and go and write the session up somewhere else.
    it("waits rather than says no card while the week is loading", async () => {
      renderToday({ role: "coach", week: null, loading: true });

      expect(await screen.findByText(/waking up the server/i)).toBeInTheDocument();
      expect(screen.queryByText(/no card has been written/i)).toBeNull();
    });

    it("shows the error when the week could not be reached", async () => {
      renderToday({ role: "coach", week: null, error: "That could not be reached." });

      expect(await screen.findByText("That could not be reached.")).toBeInTheDocument();
      expect(screen.queryByText(/no card has been written/i)).toBeNull();
    });

    it("waits while the program year id is still unknown", async () => {
      renderToday({ role: "coach", currentProgramYearId: null });

      expect(await screen.findByText(/finding today/i)).toBeInTheDocument();
      expect(screen.queryByText(/no card has been written/i)).toBeNull();
    });
  });

  describe("who sees what", () => {
    it("gives the coach his note and not Teddy's", async () => {
      renderToday({ role: "coach" });
      expect(await screen.findByLabelText("What did you see?")).toBeInTheDocument();
      expect(screen.queryByLabelText(/best/i)).toBeNull();
    });

    it("gives the athlete his journal and not the coach's", async () => {
      renderToday({ role: "athlete" });
      expect(await screen.findByLabelText(/best/i)).toBeInTheDocument();
      expect(screen.queryByLabelText("What did you see?")).toBeNull();
    });

    it("gives the viewer the card and nothing to write", async () => {
      renderToday({ role: "viewer" });
      expect(await screen.findByText(/wall day/i)).toBeInTheDocument();
      expect(screen.queryByLabelText("What did you see?")).toBeNull();
      expect(screen.queryByLabelText(/best/i)).toBeNull();
      expect(screen.queryByLabelText(/20m sprint/i)).toBeNull();
    });

    // A viewer who fired these would get 403s she can do nothing about.
    it("never asks for a viewer's entries or results", async () => {
      const { dispatched } = renderToday({ role: "viewer" });
      const asked = dispatched.map((a) => a.type);
      expect(asked).not.toContain(journalActions.fetchCoachEntries().type);
      expect(asked).not.toContain(journalActions.fetchAthleteEntries().type);
      expect(asked.some((t) => t.includes("testResults"))).toBe(false);
    });
  });

  describe("the test sheet", () => {
    // 15 to 17 September is the Baseline window, so the 16th is inside it
    // and the 18th is not.
    it("shows the sheet on a test day, and says which day of it", async () => {
      vi.setSystemTime(new Date("2026-09-16T10:00:00"));
      renderToday({ role: "coach" });
      expect(await screen.findByText(/Baseline/)).toBeInTheDocument();
      expect(screen.getByText(/day 2 of 3/i)).toBeInTheDocument();
    });

    it("shows no sheet the day after the window closes", async () => {
      vi.setSystemTime(new Date("2026-09-18T10:00:00"));
      renderToday({ role: "coach" });
      // The 18th is Friday, WEEK's Skate Day, not the Thursday used
      // elsewhere in this file.
      await screen.findByText(/skate day/i);
      expect(screen.queryByText(/Baseline/)).toBeNull();
    });

    // The deploy window: Vercel is ahead of Fly and the payload omits the
    // dates. No section beats a wrong one, and beats a crash by more.
    it("shows no sheet when the server has not sent the window's dates", async () => {
      vi.setSystemTime(new Date("2026-09-16T10:00:00"));
      renderToday({ role: "coach", programYear: yearWithUndatedWindows() });
      // The 16th is Wednesday, WEEK's Fast Day.
      await screen.findByText(/fast day/i);
      expect(screen.queryByText(/Baseline/)).toBeNull();
      expect(screen.queryByText(/still blank/i)).toBeNull();
    });

    it("keeps the sheet away from a viewer on a test day", async () => {
      vi.setSystemTime(new Date("2026-09-16T10:00:00"));
      renderToday({ role: "viewer" });
      await screen.findByText(/fast day/i);
      expect(screen.queryByText(/Baseline/)).toBeNull();
      expect(screen.queryByText(/still blank/i)).toBeNull();
    });
  });
});
