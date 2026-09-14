import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { AthleteEntry } from "@teddy-pe/core";
import { AthleteJournal } from "../src/screens/AthleteJournal";

// Pinned so "today" is a fixed date regardless of which day the suite
// actually runs on, the same reasoning as this-week.test.tsx.
const TODAY = "2026-09-16";

// A full entry, built from the real shape (core/src/types.ts's AthleteEntry,
// verified against backend/app/serializers/athlete_entry_serializer.rb).
// `shared` is deliberately false here and flipped to true in its own,
// separate fixture below, rather than one fixture mutated in place: the
// pair has to be able to disagree, or a screen that always prints one of
// the two states could still pass both tests that read from it.
function entry(overrides: Partial<AthleteEntry> = {}): AthleteEntry {
  return {
    id: 9001,
    session_date: TODAY,
    program_year_id: 555,
    day_card_id: 42,
    felt: 4,
    best: "The wall rally",
    hard: "Staying low",
    note: "Good day at the wall.",
    shared: false,
    updated_at: "2026-09-16T18:00:00.000Z",
    ...overrides,
  };
}

const UNSHARED_ENTRY = entry({ shared: false });
const SHARED_ENTRY = entry({ shared: true });

// Puts a known current program year id in front of the screen without a
// real /me round trip, the same action core's own restoreSessionSaga
// dispatches (see this-week.test.tsx's identical helper).
function seedAuth(store: ReturnType<typeof createCoreStore>, currentProgramYearId: number | null) {
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "teddy@example.com", name: "Teddy", role: "athlete" },
      athlete: null,
      current_program_year_id: currentProgramYearId,
    },
  });
}

function renderJournal(currentProgramYearId: number | null = 555) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  return {
    store,
    ...render(
      <Provider store={store}>
        <AthleteJournal />
      </Provider>,
    ),
  };
}

// Renders with a dispatch wrapper that records every action passed to
// store.dispatch directly (what the screen itself dispatches), the same
// technique this-week.test.tsx uses. Actions a saga puts as a further
// consequence of one of those go through a different, uncaptured dispatch
// reference, so this only ever sees what the component asked for.
function renderJournalRecording(currentProgramYearId: number | null = 555) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  const dispatched: { type: string; payload?: unknown }[] = [];
  const realDispatch = store.dispatch;
  store.dispatch = ((action: never) => {
    dispatched.push(action as { type: string; payload?: unknown });
    return realDispatch(action);
  }) as typeof store.dispatch;

  const result = render(
    <Provider store={store}>
      <AthleteJournal />
    </Provider>,
  );
  return { store, dispatched, ...result };
}

function hydrateEmpty(store: ReturnType<typeof createCoreStore>) {
  act(() => {
    store.dispatch({ type: "journal/ATHLETE_ENTRIES_FETCHED", payload: [] });
  });
}

function hydrateWith(store: ReturnType<typeof createCoreStore>, fixture: AthleteEntry) {
  act(() => {
    store.dispatch({ type: "journal/ATHLETE_ENTRIES_FETCHED", payload: [fixture] });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the athlete journal", () => {
  it("fetches his entries once on mount", () => {
    const { store, dispatched, rerender } = renderJournalRecording();

    const fetches = () => dispatched.filter((a) => a.type === "journal/FETCH_ATHLETE_ENTRIES");
    expect(fetches()).toHaveLength(1);

    // A rerender with nothing changed must not ask again.
    rerender(
      <Provider store={store}>
        <AthleteJournal />
      </Provider>,
    );
    expect(fetches()).toHaveLength(1);
  });

  it("says the server may be waking rather than showing a blank page", () => {
    renderJournal();

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderJournal();

    act(() => {
      store.dispatch({
        type: "journal/FETCH_ENTRIES_FAILED",
        payload: { side: "athlete", message: "That day could not be reached." },
      });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That day could not be reached.");
  });

  it("opens today's entry already filled in when he has written one", () => {
    const { store } = renderJournal();
    hydrateWith(store, UNSHARED_ENTRY);

    expect(screen.getByLabelText(/what went best today/i)).toHaveValue("The wall rally");
    expect(screen.getByLabelText(/what was hard today/i)).toHaveValue("Staying low");
    expect(screen.getByLabelText(/tell me about today/i)).toHaveValue("Good day at the wall.");
    expect(screen.getByRole("button", { name: "4", pressed: true })).toBeInTheDocument();
  });

  it("opens empty when he has not", () => {
    const { store } = renderJournal();
    hydrateEmpty(store);

    expect(screen.getByLabelText(/what went best today/i)).toHaveValue("");
    expect(screen.getByLabelText(/what was hard today/i)).toHaveValue("");
    expect(screen.getByLabelText(/tell me about today/i)).toHaveValue("");
    for (const value of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: String(value) })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  it("says plainly that an entry is not shared, in words a 7 year old reads", () => {
    const { store } = renderJournal();
    hydrateWith(store, UNSHARED_ENTRY);

    expect(screen.getByText(/only you can see this/i)).toBeInTheDocument();
    expect(screen.queryByText(/dad can see this/i)).not.toBeInTheDocument();
  });

  it("says plainly that a shared entry is shared", () => {
    // Its own fixture, not the unshared one flipped in place: the two
    // renders must actually disagree, or a screen that always says "only
    // you can see this" would pass the test above and this one both.
    const { store } = renderJournal();
    hydrateWith(store, SHARED_ENTRY);

    expect(screen.getByText(/dad can see this/i)).toBeInTheDocument();
    expect(screen.queryByText(/only you can see this/i)).not.toBeInTheDocument();
  });

  it("dispatches setShared when he taps to share, and changes nothing else", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store, dispatched } = renderJournalRecording();
    hydrateEmpty(store);

    // Only the toggle tap itself matters here, not the fetch and hydration
    // dispatches already made above.
    dispatched.length = 0;

    await user.click(screen.getByRole("button", { name: /let dad see this/i }));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.type).toBe("journal/SET_SHARED");
    expect(dispatched.some((a) => a.type === "journal/SAVE_ATHLETE_ENTRY")).toBe(false);
  });

  it("keeps what he wrote when he toggles", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store } = renderJournal();
    hydrateEmpty(store);

    await user.type(screen.getByLabelText(/tell me about today/i), "Rope climb went well.");
    await user.click(screen.getByRole("button", { name: /let dad see this/i }));

    expect(screen.getByLabelText(/tell me about today/i)).toHaveValue("Rope climb went well.");
  });

  it("saves what he typed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store, dispatched } = renderJournalRecording();
    hydrateEmpty(store);
    dispatched.length = 0;

    await user.click(screen.getByRole("button", { name: "4" }));
    await user.type(screen.getByLabelText(/what went best today/i), "The wall rally");
    await user.type(screen.getByLabelText(/what was hard today/i), "Staying low");
    await user.type(screen.getByLabelText(/tell me about today/i), "Good day at the wall.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_ATHLETE_ENTRY");
    expect(saves).toHaveLength(1);
    const payload = saves[0]!.payload as {
      felt: number | null;
      best: string | null;
      hard: string | null;
      note: string;
    };
    expect(payload.felt).toBe(4);
    expect(payload.best).toBe("The wall rally");
    expect(payload.hard).toBe("Staying low");
    expect(payload.note).toBe("Good day at the wall.");
  });

  it("can save just one thing, leaving the others empty", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store, dispatched } = renderJournalRecording();
    hydrateEmpty(store);
    dispatched.length = 0;

    // He only wrote what was hard. felt is never tapped, best and note are
    // never typed into.
    await user.type(screen.getByLabelText(/what was hard today/i), "Staying low");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_ATHLETE_ENTRY");
    expect(saves).toHaveLength(1);
    const payload = saves[0]!.payload as {
      felt: number | null;
      best: string | null;
      hard: string | null;
      note: string;
    };
    // Empty must be null, not the empty string a careless default would
    // send: "" is a real (if odd) thing he could type, and would be
    // indistinguishable from "he wrote nothing" on the other end.
    expect(payload.felt).toBeNull();
    expect(payload.best).toBeNull();
    expect(payload.hard).toBe("Staying low");
  });

  it("marks only today as saving while a save is in flight", () => {
    const { store } = renderJournal();
    hydrateEmpty(store);

    act(() => {
      store.dispatch({ type: "journal/SAVE_ATHLETE_ENTRY", payload: { date: TODAY } });
    });
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();

    act(() => {
      store.dispatch({ type: "journal/SAVE_QUEUED", payload: { date: TODAY } });
      // A different day saving must never mark this one.
      store.dispatch({ type: "journal/SAVE_ATHLETE_ENTRY", payload: { date: "2026-01-01" } });
    });
    expect(screen.queryByRole("button", { name: /saving/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("says the entry is waiting when it was saved with no connection", () => {
    const { store } = renderJournal();
    hydrateEmpty(store);

    act(() => {
      store.dispatch({ type: "journal/SAVE_ATHLETE_ENTRY", payload: { date: TODAY } });
    });
    act(() => {
      store.dispatch({ type: "journal/SAVE_QUEUED", payload: { date: TODAY } });
    });

    expect(screen.getByText(/saved on your device/i)).toBeInTheDocument();
  });

  it("renders nothing rather than throwing before anything has loaded", () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 555);
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "journal/FETCH_ATHLETE_ENTRIES") return action;
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <AthleteJournal />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
