import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import { ThisWeek } from "../src/screens/ThisWeek";
import { createAppStore } from "../src/bootstrap";
import { stubMe, ME_PROGRAM_YEAR_ID } from "../vitest.setup";
import { WEEK } from "./fixtures/week";

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
