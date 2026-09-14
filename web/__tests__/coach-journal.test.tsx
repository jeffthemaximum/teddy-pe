import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, journalActions, memoryStorage } from "@teddy-pe/core";
import type { CoachEntry, Drill } from "@teddy-pe/core";
import { CoachJournal } from "../src/screens/CoachJournal";

// Three drills, each rated to a different one of the three named values (or
// left alone) on purpose. A form built against one drill cannot prove
// ratings are keyed at all, and a fixture that gave every drill the same
// value could not tell a per-drill map from one shared value either: two of
// these three carry different values below, and the third is never touched.
const STAR_JUMP: Drill = {
  slug: "star-jump",
  name: "Star Jump",
  area_name: "Explosiveness",
  aliases: ["moonwalk"],
  short: "Jump like a star and land like a cat.",
  how: ["Load low, arms back.", "Explode up, arms and legs wide.", "Land soft, knees soft."],
  watch: "Knees should track over his toes on the landing, not cave in.",
  cue: "Explode, then freeze.",
  video: null,
};

const WALL_TAPS: Drill = {
  slug: "wall-taps",
  name: "Wall Taps",
  area_name: "Touch",
  aliases: ["quick feet"],
  short: "Fast feet against the wall, low and light.",
  how: ["Stand close to the wall.", "Tap fast, both feet.", "Keep the hips still."],
  watch: "Heels should barely touch the floor between taps.",
  cue: "Light feet, quiet floor.",
  video: null,
};

const BALANCE_BEAM_WALK: Drill = {
  slug: "balance-beam-walk",
  name: "Balance Beam Walk",
  area_name: "Balance",
  aliases: ["tightrope"],
  short: "Walk a straight line without wobbling.",
  how: ["Arms out to the sides.", "Eyes on the far wall.", "One slow step at a time."],
  watch: "Watch for his hips swinging side to side to catch balance.",
  cue: "Eyes up, feet quiet.",
  video: null,
};

const DRILLS: Drill[] = [STAR_JUMP, WALL_TAPS, BALANCE_BEAM_WALK];

// A minimal, otherwise-blank save payload, spread with a `date` override
// wherever a test only cares about which day is saving. Building a real
// payload (rather than a bare `{date}`) matters here specifically because
// SAVE_COACH_ENTRY is watched by core's own saga regardless of how the
// action reached the store, and a payload with no `request` on it sends
// that saga chasing a call it cannot make.
const BASE_SAVE_PAYLOAD = {
  programYearId: 42,
  note: null,
  overall: null,
  energy: null,
  flag_pain: false,
  pain_note: null,
  challenge_num: null,
  ratings: {},
};

// An entry already on record for a day that is not the day the form opens
// on by default, so every "opens filled in" test has to change the date
// itself rather than happening to land on it. Two of its three ratings
// differ (owns vs getting), the same trap as the fixture above, and the
// third drill carries none, so a filled-in form can be told apart from one
// that collapsed every drill to a single shared value.
const EXISTING_ENTRY: CoachEntry = {
  id: 501,
  session_date: "2026-09-16",
  program_year_id: 42,
  day_card_id: 1003,
  overall: 4,
  energy: 3,
  flag_pain: true,
  pain_note: "Tight right calf, iced after.",
  note: "Good focus today. Landing was much cleaner.",
  challenge_num: "1",
  ratings: {
    "star-jump": "owns",
    "wall-taps": "getting",
  },
  updated_at: "2026-09-16T20:00:00.000Z",
};

// Puts a known current program year id and a known signed-in coach in front
// of CoachJournal without a real /me round trip, the same way
// this-week.test.tsx's own seedAuth does. `auth/RESTORE_FINISHED` is the
// same action core's own restoreSessionSaga dispatches once /api/v1/me
// answers.
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

function renderCoachJournal(currentProgramYearId: number | null = 42) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  return {
    store,
    ...render(
      <Provider store={store}>
        <CoachJournal />
      </Provider>,
    ),
  };
}

function loadDrills(store: ReturnType<typeof createCoreStore>, drills: Drill[] = DRILLS) {
  act(() => {
    store.dispatch({ type: "drills/SUCCEEDED", payload: { drills } });
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

function dateInput(): HTMLInputElement {
  return screen.getByLabelText(/session date/i) as HTMLInputElement;
}

function setDate(value: string) {
  fireEvent.change(dateInput(), { target: { value } });
}

function ratingGroup(drillName: string) {
  return screen.getByRole("group", { name: drillName });
}

describe("the coach's journal", () => {
  it("fetches his entries once on mount", () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const dispatched = trackDispatch(store);

    const { rerender } = render(
      <Provider store={store}>
        <CoachJournal />
      </Provider>,
    );

    const fetches = () => dispatched.filter((a) => a.type === "journal/FETCH_COACH_ENTRIES");
    expect(fetches()).toHaveLength(1);

    // A rerender with nothing changed must not ask again.
    rerender(
      <Provider store={store}>
        <CoachJournal />
      </Provider>,
    );
    expect(fetches()).toHaveLength(1);
  });

  it("says the server may be waking rather than showing a blank page", () => {
    // Right after mount, both the entries fetch and the drill list fetch
    // this screen dispatched are in flight and neither has answered, the
    // same gap Year, Month and This Week each have their own version of.
    renderCoachJournal(42);

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderCoachJournal(42);

    act(() => {
      store.dispatch({
        type: "journal/FETCH_ENTRIES_FAILED",
        payload: { side: "coach", message: "That could not be reached." },
      });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That could not be reached.");
  });

  it("opens a day's entry filled in when one exists", () => {
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    act(() => {
      store.dispatch({ type: "journal/COACH_ENTRIES_FETCHED", payload: [EXISTING_ENTRY] });
    });

    setDate("2026-09-16");

    expect(screen.getByLabelText(/what did you see/i)).toHaveValue(
      "Good focus today. Landing was much cleaner.",
    );
    expect(within(ratingGroup("How the session went overall")).getByRole("radio", { name: "4" })).toBeChecked();
    expect(within(ratingGroup("Energy")).getByRole("radio", { name: "3" })).toBeChecked();
    expect(screen.getByLabelText(/something hurt/i)).toBeChecked();
    expect(screen.getByLabelText(/what hurt, and where/i)).toHaveValue(
      "Tight right calf, iced after.",
    );
    expect(screen.getByLabelText(/which challenge attempt/i)).toHaveValue("1");

    expect(within(ratingGroup("Star Jump")).getByRole("radio", { name: "owns" })).toBeChecked();
    expect(within(ratingGroup("Wall Taps")).getByRole("radio", { name: "getting" })).toBeChecked();
    // The third drill was never rated on this entry: neither of its three
    // options should be checked, which is not the same thing as it having
    // been rated "not yet".
    const beamGroup = ratingGroup("Balance Beam Walk");
    expect(within(beamGroup).getByRole("radio", { name: "not yet" })).not.toBeChecked();
    expect(within(beamGroup).getByRole("radio", { name: "getting" })).not.toBeChecked();
    expect(within(beamGroup).getByRole("radio", { name: "owns" })).not.toBeChecked();
  });

  it("opens empty when none does", () => {
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    act(() => {
      store.dispatch({ type: "journal/COACH_ENTRIES_FETCHED", payload: [EXISTING_ENTRY] });
    });

    // A date with no entry of its own, sitting right next to one that has
    // one, so this is not just "the form was never filled in yet".
    setDate("2026-09-17");

    expect(screen.getByLabelText(/what did you see/i)).toHaveValue("");
    expect(within(ratingGroup("How the session went overall")).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(within(ratingGroup("Energy")).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(screen.getByLabelText(/something hurt/i)).not.toBeChecked();
    expect(screen.queryByLabelText(/what hurt, and where/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/which challenge attempt/i)).toHaveValue("");
    for (const drill of DRILLS) {
      expect(within(ratingGroup(drill.name)).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    }
  });

  it("saves the note, the scores and the pain flag together", async () => {
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.type(screen.getByLabelText(/what did you see/i), "Great touch on the wall today.");
    await user.click(within(ratingGroup("How the session went overall")).getByRole("radio", { name: "4" }));
    await user.click(within(ratingGroup("Energy")).getByRole("radio", { name: "5" }));
    await user.click(screen.getByLabelText(/something hurt/i));
    await user.type(screen.getByLabelText(/what hurt, and where/i), "Sore left ankle, iced after.");
    await user.type(screen.getByLabelText(/which challenge attempt/i), "2");
    await user.click(screen.getByRole("button", { name: /save/i }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    expect(saves).toHaveLength(1);
    expect(saves[0]?.payload).toEqual({
      programYearId: 42,
      date: "2026-09-16",
      note: "Great touch on the wall today.",
      overall: 4,
      energy: 5,
      flag_pain: true,
      pain_note: "Sore left ankle, iced after.",
      challenge_num: "2",
      ratings: {},
    });
  });

  it("can save a note before anything has been scored", async () => {
    // overall and energy stay null rather than becoming 0. He writes the
    // note on the walk home and scores it later.
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.type(screen.getByLabelText(/what did you see/i), "Walked home happy. Will score later.");
    await user.click(screen.getByRole("button", { name: /save/i }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    expect(saves).toHaveLength(1);
    const payload = saves[0]?.payload as { overall: unknown; energy: unknown; note: unknown };
    expect(payload.overall).toBeNull();
    expect(payload.energy).toBeNull();
    expect(payload.note).toBe("Walked home happy. Will score later.");
  });

  it("rates a drill with one of the three named values and never a number", async () => {
    // Assert the payload carries "getting", not 2. A number passes a mocked
    // API and fails every real save.
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.click(within(ratingGroup("Wall Taps")).getByRole("radio", { name: "getting" }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    const payload = saves[0]?.payload as { ratings: Record<string, unknown> };
    expect(payload.ratings["wall-taps"]).toBe("getting");
    expect(typeof payload.ratings["wall-taps"]).toBe("string");
    expect(payload.ratings["wall-taps"]).not.toBe(2);
  });

  it("keeps ratings separate per drill", async () => {
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.click(within(ratingGroup("Star Jump")).getByRole("radio", { name: "owns" }));
    await user.click(within(ratingGroup("Wall Taps")).getByRole("radio", { name: "not yet" }));
    // Balance Beam Walk is left untouched on purpose.
    await user.click(screen.getByRole("button", { name: /save/i }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    const payload = saves[0]?.payload as { ratings: Record<string, unknown> };
    expect(payload.ratings).toEqual({
      "star-jump": "owns",
      "wall-taps": "not_yet",
    });
  });

  it("shows the pain note only when something hurt", async () => {
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);

    expect(screen.queryByLabelText(/what hurt, and where/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/something hurt/i));

    expect(screen.getByLabelText(/what hurt, and where/i)).toBeInTheDocument();
  });

  it("marks only that day as saving while a save is in flight", () => {
    // Dispatched through the real action creator, not a hand-rolled object:
    // this type is also watched by core's own saga, and a bare
    // {type, payload: {date}} has no `request` for it to send, which sent
    // this same assertion chasing an unrelated rejection the first time it
    // was written.
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    setDate("2026-09-16");

    act(() => {
      store.dispatch(journalActions.saveCoachEntry({ ...BASE_SAVE_PAYLOAD, date: "2026-09-17" }));
    });
    expect(screen.queryByText("Saving.")).not.toBeInTheDocument();

    act(() => {
      store.dispatch(journalActions.saveCoachEntry({ ...BASE_SAVE_PAYLOAD, date: "2026-09-16" }));
    });
    expect(screen.getByText("Saving.")).toBeInTheDocument();
  });

  it("says the entry is waiting when it was saved with no connection", () => {
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    setDate("2026-09-16");

    const savePayload = {
      ...BASE_SAVE_PAYLOAD,
      date: "2026-09-16",
      note: "On the walk home, no signal out here.",
    };
    act(() => {
      store.dispatch(journalActions.saveCoachEntry(savePayload));
    });
    act(() => {
      store.dispatch({
        type: "outbox/ENQUEUE",
        // The exact QueueableAction the real save action carries: same
        // dedupeKey, same request, the one this file's dispatch above just
        // built. A queued write that did not match what was actually
        // attempted would prove nothing about what the screen does with a
        // real one.
        payload: journalActions.saveCoachEntry(savePayload),
      });
    });
    act(() => {
      store.dispatch({ type: "journal/SAVE_QUEUED", payload: { date: "2026-09-16" } });
    });

    expect(screen.getByText(/waiting to send/i)).toBeInTheDocument();
  });

  it("renders nothing rather than throwing before anything has loaded", () => {
    // The id is known, but the drill-list fetch and the entries fetch this
    // screen dispatches on mount are both intercepted before either can
    // reach its own reducer, freezing the component in the instant between
    // "the id arrived" and "a fetch updated loading" — the exact gap the
    // component's own fallback (`return null`) is for.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "drills/FETCH" || action.type === "journal/FETCH_COACH_ENTRIES") {
        return action;
      }
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <CoachJournal />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
