import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { WeekPayload, DayCard } from "@teddy-pe/core";
import { ThisWeek } from "../src/screens/ThisWeek";
import { createAppStore } from "../src/bootstrap";
import { stubMe, ME_PROGRAM_YEAR_ID } from "../vitest.setup";

// Built from the real shape (core/src/types.ts's Week and DayCard, verified
// against backend/app/services/week_payload.rb, which is the one place
// that fills in blocks, dad_note, coach_entry and athlete_entry: only when
// called with detailed: true, which is what weeks_controller.rb's
// #current does and plans_controller.rb does not).
//
// The seven days are deliberately spread one concern per day rather than
// piled onto one or two, so each test's day is not incidentally also the
// fixture for a different test: Wednesday is the only day pinned as
// "today" and carries no dad_note and no blocks; Thursday is the only day
// with blocks; Friday is the only day with a dad_note; Saturday is Game
// Day, blocks: [] and no dad_note, carrying only the summary line the API
// sends for a day with nothing organized. A bug that only showed up when
// two of these lived on the same day would not be caught otherwise.
//
// Spend (32) and budget (40) are different numbers, on purpose, so a
// component that printed one of them twice cannot pass the spend/budget
// test by accident (the same defect noted in month.test.tsx). Neither
// number reappears elsewhere in the fixture (no day's hie, minutes, or
// block minutes is 32 or 40), so the assertion cannot match the wrong
// thing either.

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

// `name` deliberately differs from what `name_tokens` renders. Both are
// real columns on the block (backend/app/services/week_payload.rb tokenizes
// `name` and `body` into `name_tokens` and `body_tokens` at read time, and
// the raw column still carries whatever markup the tokenizer strips), so a
// fixture where they read the same lets a component that renders the raw
// `name` instead of `<Tokens tokens={name_tokens} />` pass by accident. The
// body half of this block has no such trap: DayBlock carries no plain
// `body` field to fall back to, only `body_tokens`.
const TODAY_BLOCK = {
  id: 501,
  position: 1,
  minutes: "20",
  name: "<b>Rings Intro</b>",
  tag: null,
  name_tokens: [{ text: "Rings Intro", type: "text", style: "bold" }],
  body_tokens: [
    { text: "Hang and swing, ", type: "text", style: "plain" },
    { text: "both hands", type: "text", style: "plain" },
    // A drill token, the one type Tokens.tsx renders as something tappable
    // (see tokens.test.tsx). This is what "takes you to the glossary when
    // you tap a drill token" below actually taps.
    { text: "Rings Hang", type: "drill", style: "plain", slug: "rings-hang" },
  ],
  drill_slugs: ["rings-hang"],
};

// Shuffled out of weekday order on purpose, the same reasoning as
// month.test.tsx: a component that forgot to sort can only fail this way.
const WEEK: WeekPayload = {
  id: 201,
  number: 1,
  position_in_block: 1,
  theme: "Baseline & Land",
  dates_display: "Sep 14 to Sep 20",
  targets: ["Tennis: drop-feed rally", "Basketball: 200 dribbles", "Soccer: 300 touches"],
  challenge: "Silent Landings.",
  trials: false,
  block_key: "cub",
  high_intent_efforts: 32,
  budget: 40,
  days: [
    day({ id: 1006, dow: "sat", date: "2026-09-19", name: "Game Day", role: "Game Day", minutes: "0", hie: 0, summary_lines: ["Home program off"], blocks: [] }),
    day({ id: 1001, dow: "mon", date: "2026-09-14", name: "Land Like a Cat", role: "Floor Day", hie: 5 }),
    day({ id: 1004, dow: "thu", date: "2026-09-17", name: "Wall & Ball", role: "Wall Day", hie: 8, blocks: [TODAY_BLOCK] }),
    day({ id: 1002, dow: "tue", date: "2026-09-15", name: "Rings Work", role: "Rings Day", hie: 3 }),
    day({ id: 1007, dow: "sun", date: "2026-09-20", name: "Ceremony", role: "Court Day", minutes: "30 to 45", hie: 0 }),
    day({
      id: 1005,
      dow: "fri",
      date: "2026-09-18",
      name: "Skate & Stick",
      role: "Skate Day",
      minutes: "45 to 60",
      hie: 4,
      dad_note: "Watch his front foot on the plant.",
    }),
    day({ id: 1003, dow: "wed", date: "2026-09-16", name: "Test Day", role: "Fast Day", hie: 9 }),
  ],
};

function daysList() {
  return screen.getByRole("list", { name: "Days" });
}

function dayCards() {
  return Array.from(daysList().querySelectorAll(":scope > li"));
}

// Puts a known current program year id in front of ThisWeek without a real
// /me round trip, the same way year.test.tsx's seedAuth does.
// `auth/RESTORE_FINISHED` is the same action core's own restoreSessionSaga
// dispatches once /api/v1/me answers (or, with current_program_year_id
// null, once it could not).
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

function renderThisWeek(currentProgramYearId: number | null = 555) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <ThisWeek />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

beforeEach(() => {
  // "Today" is pinned to Wednesday the 16th, one of WEEK's own days,
  // regardless of the real calendar date the suite happens to run on. A
  // test that instead let ThisWeek call the real `new Date()` would pass
  // for eleven months and fail in the twelfth, the moment the run date
  // stopped landing inside this fixture's week.
  //
  // Only Date is faked (`toFake: ["Date"]`), not setTimeout/setInterval:
  // the "asks for the current week once on mount" test below awaits a
  // real async saga through `waitFor`, which polls on a real timer, and a
  // fully faked clock would freeze that poll and hang the test rather than
  // fail it.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the This Week view", () => {
  it("asks for the current week once on mount", async () => {
    // Signed in the way a real launch does it, through createAppStore, with
    // the real /me round trip stubbed rather than a hand-dispatched
    // currentProgramYearId (same reasoning as month.test.tsx).
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
        <MemoryRouter>
          <ThisWeek />
        </MemoryRouter>
      </Provider>,
    );

    const weekFetches = () => dispatched.filter((a) => a.type === "week/FETCH");

    await waitFor(() => {
      expect(weekFetches()).toHaveLength(1);
    });
    expect(weekFetches()[0].payload).toEqual(ME_PROGRAM_YEAR_ID);

    // A rerender with nothing changed must not ask again.
    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <ThisWeek />
        </MemoryRouter>
      </Provider>,
    );
    expect(weekFetches()).toHaveLength(1);
  });

  it("shows a waiting message rather than a blank panel while the current year id is not known yet", () => {
    // Same gap Year.tsx and Month.tsx already cover, and the same reason:
    // selectCurrentProgramYearId is null both while /api/v1/me is still in
    // flight right after sign-in, and, more lastingly, when a restore
    // succeeded on a cached session because /me could not answer for a
    // reason that says nothing about the token. Before this test existed,
    // ThisWeek had the identical branch Year.tsx and Month.tsx both had a
    // test for, and no test of its own.
    renderThisWeek(null);

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("lets you try again when the year id has not arrived", async () => {
    // The null-id wait is not guaranteed to resolve on its own: core keeps
    // a restored session signed in even when /me could not answer for a
    // reason that says nothing about the token, and does not retry /me by
    // itself. A person stuck here needs a way to ask again, not just a
    // label promising it will only take a few seconds.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, null);
    const dispatched: { type: string }[] = [];
    const realDispatch = store.dispatch;
    store.dispatch = ((action: never) => {
      dispatched.push(action as { type: string });
      return realDispatch(action);
    }) as typeof store.dispatch;

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ThisWeek />
        </MemoryRouter>
      </Provider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(dispatched.some((a) => a.type === "auth/RESTORE_SESSION")).toBe(true);
  });

  it("takes you to the glossary when you tap a drill token", async () => {
    // GlossaryStub stands in for the real Glossary screen: this test is
    // about ThisWeek handing off a slug through DayCard and Tokens into a
    // URL, not about what the glossary itself then does with it (that is
    // glossary.test.tsx's job).
    function GlossaryStub() {
      const { slug } = useParams<{ slug: string }>();
      return <p>Glossary open on {slug}</p>;
    }

    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 555);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/week"]}>
          <Routes>
            <Route path="/week" element={<ThisWeek />} />
            <Route path="/glossary/:slug" element={<GlossaryStub />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    await userEvent.click(screen.getByRole("button", { name: /rings hang/i }));

    expect(screen.getByText(/glossary open on rings-hang/i)).toBeInTheDocument();
  });

  it("says the server may be waking rather than showing a blank panel", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/FETCH", payload: 1 });
    });

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("keeps the week on screen while refetching", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });
    expect(screen.getByRole("heading", { name: /baseline & land/i })).toBeInTheDocument();

    act(() => {
      store.dispatch({ type: "week/FETCH", payload: 1 });
    });

    expect(screen.getByRole("heading", { name: /baseline & land/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/FAILED", payload: "That week could not be found." });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That week could not be found.");
  });

  it("renders all seven days", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    expect(dayCards()).toHaveLength(7);
  });

  it("puts the days in weekday order", () => {
    // WEEK's own days are shuffled above. This fails if the component does
    // not sort them.
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    const firstWords = dayCards().map((li) => {
      const heading = li.querySelector("h3");
      return heading?.textContent?.trim().split(/\s+/)[0];
    });
    expect(firstWords).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("marks today, and only today", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    const marked = dayCards().filter((li) => li.querySelector("[aria-current='date']") !== null);
    expect(marked).toHaveLength(1);

    // The one marked is Wednesday, the pinned date, not an arbitrary day.
    expect(within(marked[0] as HTMLElement).getByRole("heading", { name: /test day/i })).toBeInTheDocument();
    expect(within(marked[0] as HTMLElement).getByText("Today")).toBeInTheDocument();

    // The other six are not marked, and do not say "Today" either.
    const unmarked = dayCards().filter((li) => !marked.includes(li));
    expect(unmarked).toHaveLength(6);
    for (const li of unmarked) {
      expect(within(li as HTMLElement).queryByText("Today")).not.toBeInTheDocument();
    }
  });

  it("shows each day's role and its minutes", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    const monday = dayCards().find((li) => li.querySelector("h3")?.textContent?.startsWith("Mon"));
    expect(within(monday as HTMLElement).getByText(/floor day/i)).toBeInTheDocument();
    expect(within(monday as HTMLElement).getByText(/60 to 90 min/)).toBeInTheDocument();

    const friday = dayCards().find((li) => li.querySelector("h3")?.textContent?.startsWith("Fri"));
    expect(within(friday as HTMLElement).getByText(/skate day/i)).toBeInTheDocument();
    expect(within(friday as HTMLElement).getByText(/45 to 60 min/)).toBeInTheDocument();
  });

  it("shows the week's spend against its budget", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    // Tied to the label, not just the two numbers: "32 of 40" alone would
    // still match if it turned up anywhere for an unrelated reason, and
    // tying it to "Effort spent" is what ties it to spend-against-budget
    // specifically rather than any two numbers in that order.
    expect(screen.getByText(/effort spent:\s*32 of 40/i)).toBeInTheDocument();
  });

  it("shows Saturday as the home program being off, not as an empty day", () => {
    // CLAUDE.md: Sat is Game Day, home off. A blank card reads as missing.
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    const saturday = dayCards().find((li) => li.querySelector("h3")?.textContent?.startsWith("Sat"));
    expect(within(saturday as HTMLElement).getByText(/home program off/i)).toBeInTheDocument();
  });

  it("shows a day's blocks with their names and bodies rendered from tokens", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    const thursday = dayCards().find((li) => li.querySelector("h3")?.textContent?.startsWith("Thu"));
    const scoped = within(thursday as HTMLElement);
    // The block's name comes off name_tokens ("Rings Intro"), not the raw
    // `name` column ("<b>Rings Intro</b>"), which must not reach the screen
    // at all: it is the un-tokenized field the tokenizer strips markup out
    // of, and a component that rendered it directly would put literal tags
    // in front of Teddy.
    expect(scoped.getByText("Rings Intro")).toBeInTheDocument();
    expect(scoped.queryByText("<b>Rings Intro</b>")).not.toBeInTheDocument();
    expect(scoped.getByText("Hang and swing,")).toBeInTheDocument();
    expect(scoped.getByText("both hands")).toBeInTheDocument();
  });

  it("shows Dad's note on a day that has one", () => {
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: WEEK });
    });

    const friday = dayCards().find((li) => li.querySelector("h3")?.textContent?.startsWith("Fri"));
    expect(within(friday as HTMLElement).getByText(/watch his front foot on the plant/i)).toBeInTheDocument();
  });

  it("renders nothing rather than throwing before the week has loaded", () => {
    // Every screen can render before its data arrives. The id is known
    // (seeded, so the effect fires and skips the "waiting for an id"
    // branch), but the FETCH action it dispatches is intercepted before it
    // can reach the reducer, freezing the component in the instant between
    // "the id arrived" and "the resulting fetch updated loading" - the
    // exact gap the component's own fallback (`return null`) is for.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 555);
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "week/FETCH") return action;
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <MemoryRouter>
          <ThisWeek />
        </MemoryRouter>
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing was planned rather than showing an empty list", () => {
    // A week payload with no days is not the transient "not caught up yet"
    // gap above (data has arrived, and it says so), and it should not be
    // possible to confuse with it: the "return null" case has no data at
    // all, and this one has data whose own `days` array is empty.
    const { store } = renderThisWeek();
    act(() => {
      store.dispatch({ type: "week/SUCCEEDED", payload: { ...WEEK, days: [] } });
    });

    expect(screen.queryByRole("list", { name: "Days" })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing has been planned/i)).toBeInTheDocument();
  });
});
