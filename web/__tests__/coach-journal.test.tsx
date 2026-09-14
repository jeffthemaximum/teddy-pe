import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, journalActions, memoryStorage } from "@teddy-pe/core";
import type { CoachEntry, DayCard, Drill, WeekPayload } from "@teddy-pe/core";
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

// The current week. This screen needs it before it can know which drills
// belong to the day he is writing up, so every test that expects a filtered
// list loads this the same way this-week.test.tsx loads its own.
//
// The seven cards deliberately disagree about which drills they carry. A
// week where every card listed the same three could not tell a filtered
// list apart from an unfiltered one:
//   Mon carries two, in the reverse of the order the glossary lists them,
//     so card order can be told apart from glossary order.
//   Tue and Fri each carry exactly one, and a different one.
//   Wed and Thu carry all three, which is what every test written before
//     this filter existed already assumes about the day it opens.
//   Sat is Game Day and carries none at all.
function day(
  overrides: Partial<DayCard> &
    Pick<DayCard, "id" | "dow" | "date" | "name" | "role" | "drill_slugs">,
): DayCard {
  return {
    minutes: "60 to 90",
    intensity: 2,
    hie: 0,
    summary_lines: [`${overrides.name} notes`],
    ...overrides,
  };
}

const ALL_SLUGS = ["star-jump", "wall-taps", "balance-beam-walk"];

const WEEK: WeekPayload = {
  id: 201,
  number: 1,
  position_in_block: 1,
  theme: "Baseline & Land",
  dates_display: "Sep 14 to Sep 20",
  targets: ["Tennis: drop-feed rally"],
  challenge:
    "Silent Landings. 10 jumps off a step, count the silent ones. Monday number, Friday number.",
  trials: false,
  block_key: "cub",
  high_intent_efforts: 32,
  budget: 40,
  days: [
    day({ id: 1001, dow: "mon", date: "2026-09-14", name: "Land Like a Cat", role: "Floor Day", drill_slugs: ["wall-taps", "star-jump"] }),
    day({ id: 1002, dow: "tue", date: "2026-09-15", name: "Rings Work", role: "Rings Day", drill_slugs: ["balance-beam-walk"] }),
    day({ id: 1003, dow: "wed", date: "2026-09-16", name: "Test Day", role: "Fast Day", drill_slugs: ALL_SLUGS }),
    day({ id: 1004, dow: "thu", date: "2026-09-17", name: "Wall & Ball", role: "Wall Day", drill_slugs: ALL_SLUGS }),
    day({ id: 1005, dow: "fri", date: "2026-09-18", name: "Skate & Stick", role: "Skate Day", drill_slugs: ["wall-taps"] }),
    day({ id: 1006, dow: "sat", date: "2026-09-19", name: "Game Day", role: "Game Day", minutes: "0", summary_lines: ["Home program off"], drill_slugs: [] }),
    day({ id: 1007, dow: "sun", date: "2026-09-20", name: "Ceremony", role: "Court Day", minutes: "30 to 45", drill_slugs: ["star-jump"] }),
  ],
};

// An entry on the Friday card, which lists wall-taps and nothing else,
// carrying a rating for a drill that card does not list. A rating made
// before a plan changed has to stay on screen: the save sends the whole
// ratings map either way, so a form that hid it would look like it had
// dropped a rating it was in fact still writing.
const FRIDAY_ENTRY: CoachEntry = {
  id: 502,
  session_date: "2026-09-18",
  program_year_id: 42,
  day_card_id: 1005,
  overall: null,
  energy: null,
  flag_pain: false,
  pain_note: null,
  note: null,
  challenge_num: null,
  ratings: { "star-jump": "owns" },
  updated_at: "2026-09-18T20:00:00.000Z",
};

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

function loadWeek(store: ReturnType<typeof createCoreStore>, payload: WeekPayload = WEEK) {
  act(() => {
    store.dispatch({ type: "week/SUCCEEDED", payload });
  });
}

// The legends of the per-drill fieldsets inside "Rate each drill", in the
// order they render. Read off that fieldset's own children rather than off
// the page, so the overall and energy fieldsets are never counted, and as
// an ordered list rather than a set, so a test can assert the order the
// card runs them in.
function ratedDrillNames(): string[] {
  const fieldset = screen.queryByRole("group", { name: "Rate each drill" });
  if (!fieldset) return [];
  return Array.from(fieldset.querySelectorAll(":scope > fieldset > legend")).map(
    (el) => el.textContent ?? "",
  );
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

// This screen's mount effect fires two fetches, and a selector it reads
// before either answers hands back a fresh object rather than the same one
// twice (see this file's own "Selector ... returned a different result"
// console warning). React checks each selector again right after mount to
// catch exactly that, and schedules one more render when it does, outside
// whatever this test already wrapped in act(). A test that never awaits
// anything else after render sees that render land after its own body has
// finished, which is the console's "not wrapped in act" warning, not a sign
// anything here is actually wrong. This flushes it inside act(), the same
// way an awaited user.click already does for the tests below that have one.
async function settle() {
  await act(async () => {});
}

describe("the coach's journal", () => {
  it("fetches his entries once on mount", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const dispatched = trackDispatch(store);

    const { rerender } = render(
      <Provider store={store}>
        <CoachJournal />
      </Provider>,
    );
    await settle();

    const fetches = () => dispatched.filter((a) => a.type === "journal/FETCH_COACH_ENTRIES");
    expect(fetches()).toHaveLength(1);

    // A rerender with nothing changed must not ask again.
    rerender(
      <Provider store={store}>
        <CoachJournal />
      </Provider>,
    );
    await settle();
    expect(fetches()).toHaveLength(1);
  });

  it("says the server may be waking rather than showing a blank page", async () => {
    // Right after mount, both the entries fetch and the drill list fetch
    // this screen dispatched are in flight and neither has answered, the
    // same gap Year, Month and This Week each have their own version of.
    renderCoachJournal(42);
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", async () => {
    const { store } = renderCoachJournal(42);

    act(() => {
      store.dispatch({
        type: "journal/FETCH_ENTRIES_FAILED",
        payload: { side: "coach", message: "That could not be reached." },
      });
    });
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("That could not be reached.");
  });

  it("opens a day's entry filled in when one exists", () => {
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    loadWeek(store);
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
    expect(screen.getByLabelText(/challenge number/i)).toHaveValue("1");

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
    loadWeek(store);
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
    expect(screen.getByLabelText(/challenge number/i)).toHaveValue("");
    for (const drill of DRILLS) {
      expect(within(ratingGroup(drill.name)).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    }
  });

  it("saves the note, the scores and the pain flag together", async () => {
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    loadWeek(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.type(screen.getByLabelText(/what did you see/i), "Great touch on the wall today.");
    await user.click(within(ratingGroup("How the session went overall")).getByRole("radio", { name: "4" }));
    await user.click(within(ratingGroup("Energy")).getByRole("radio", { name: "5" }));
    await user.click(screen.getByLabelText(/something hurt/i));
    await user.type(screen.getByLabelText(/what hurt, and where/i), "Sore left ankle, iced after.");
    await user.type(screen.getByLabelText(/challenge number/i), "2");
    await user.click(screen.getByRole("button", { name: /save/i }));

    // Autosave fires its own save on every field he leaves and every radio
    // he taps, so more than one SAVE_COACH_ENTRY goes out before Save is
    // ever clicked, and the earliest of those already sets `saving` true.
    // commit() has no guard on that flag, so the Save click itself never
    // reaches the submit handler: the button is already disabled by the
    // time it lands. What that click does do is blur the challenge number
    // field he was last in, and that field's own text changed, so its blur
    // fires the actual last save, carrying everything merged in by then.
    // Every save carries the whole entry, so the last one is the complete
    // picture regardless of which control sent it.
    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    expect(saves.length).toBeGreaterThan(0);
    expect(saves.at(-1)?.payload).toEqual({
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
    loadWeek(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.type(screen.getByLabelText(/what did you see/i), "Walked home happy. Will score later.");
    await user.click(screen.getByRole("button", { name: /save/i }));

    // Clicking Save blurs the note field he was still in, and that field's
    // own text changed, so its blur fires the one save that actually goes
    // out here. Save's own submit handler never runs: that same blur sets
    // `saving` true before the click reaches the button, so it lands
    // disabled. One save, not two, and it is the whole form as it stood.
    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    expect(saves.length).toBeGreaterThan(0);
    const payload = saves.at(-1)?.payload as { overall: unknown; energy: unknown; note: unknown };
    expect(payload.overall).toBeNull();
    expect(payload.energy).toBeNull();
    expect(payload.note).toBe("Walked home happy. Will score later.");
  });

  it("rates a drill with one of the three named values and never a number", async () => {
    // Assert the payload carries "getting", not 2. A number passes a mocked
    // API and fails every real save.
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    // Tracked before the form has mounted (see "saving as you go" above):
    // dispatch is read fresh at mount, so installing this any later would
    // miss the tap's own save.
    const dispatched = trackDispatch(store);
    loadDrills(store);
    loadWeek(store);
    setDate("2026-09-16");

    await user.click(within(ratingGroup("Wall Taps")).getByRole("radio", { name: "getting" }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    // The tap itself already carries the whole entry; the last save is read
    // here rather than the first because autosave, not this Save click, is
    // what actually put it on the wire.
    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    const payload = saves.at(-1)?.payload as { ratings: Record<string, unknown> };
    expect(payload.ratings["wall-taps"]).toBe("getting");
    expect(typeof payload.ratings["wall-taps"]).toBe("string");
    expect(payload.ratings["wall-taps"]).not.toBe(2);
  });

  it("keeps ratings separate per drill", async () => {
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    loadWeek(store);
    setDate("2026-09-16");
    const dispatched = trackDispatch(store);

    await user.click(within(ratingGroup("Star Jump")).getByRole("radio", { name: "owns" }));
    await user.click(within(ratingGroup("Wall Taps")).getByRole("radio", { name: "not yet" }));
    // Balance Beam Walk is left untouched on purpose.
    await user.click(screen.getByRole("button", { name: /save/i }));

    // Each tap already saves on its own, and the second carries both
    // ratings because set() merges into whatever the first tap already put
    // in state. Save's own click never fires: the first tap already set
    // `saving` true, disabling the button before this click lands, so the
    // second tap's own save is genuinely the last one, not Save's.
    const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
    const payload = saves.at(-1)?.payload as { ratings: Record<string, unknown> };
    expect(payload.ratings).toEqual({
      "star-jump": "owns",
      "wall-taps": "not_yet",
    });
  });

  it("shows the pain note only when something hurt", async () => {
    const user = userEvent.setup();
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    loadWeek(store);

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
    loadWeek(store);
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

  it("says the entry is waiting when it was saved with no connection", async () => {
    const { store } = renderCoachJournal(42);
    loadDrills(store);
    loadWeek(store);
    setDate("2026-09-16");
    // Flushed here, before anything is queued: the outbox reads its stored
    // queue back on its own, once, the moment the store is created, and a
    // memory-only store like this one's always answers empty. Queuing a
    // write below and only settling once at the very end would let that
    // read land after the queue already has this write in it, replacing it
    // with the empty one core read from storage a beat too late.
    await settle();

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
    await settle();

    expect(screen.getByText(/waiting to send/i)).toBeInTheDocument();
  });

  it("renders nothing rather than throwing before anything has loaded", async () => {
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
    await settle();

    expect(container).toBeEmptyDOMElement();
  });

  // ---- deleting an entry --------------------------------------------------
  describe("deleting an entry", () => {
    function openExistingEntry() {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);
      act(() => {
        store.dispatch({ type: "journal/COACH_ENTRIES_FETCHED", payload: [EXISTING_ENTRY] });
      });
      setDate("2026-09-16");
      return store;
    }

    it("offers nothing to delete on a day with no entry", () => {
      const store = renderCoachJournal(42);
      loadDrills(store.store);
      loadWeek(store.store);
      setDate("2026-09-15");

      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("offers a delete on a day that has one", () => {
      openExistingEntry();

      expect(screen.getByRole("button", { name: "Delete this entry" })).toBeInTheDocument();
    });

    it("asks before it does anything", async () => {
      const user = userEvent.setup();
      const store = openExistingEntry();
      const dispatched = trackDispatch(store);

      await user.click(screen.getByRole("button", { name: "Delete this entry" }));

      expect(screen.getByText("Delete this entry?")).toBeInTheDocument();
      expect(dispatched.filter((a) => a.type === "journal/DELETE_ENTRY")).toHaveLength(0);
    });

    it("puts the question away again when he says keep it", async () => {
      const user = userEvent.setup();
      const store = openExistingEntry();
      const dispatched = trackDispatch(store);

      await user.click(screen.getByRole("button", { name: "Delete this entry" }));
      await user.click(screen.getByRole("button", { name: "Keep it" }));

      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete this entry" })).toBeInTheDocument();
      expect(dispatched.filter((a) => a.type === "journal/DELETE_ENTRY")).toHaveLength(0);
    });

    // The route is asserted here, not just the action name: the request the
    // screen's own dispatch carries is what actually goes on the wire.
    // /api/v1/coach_entries/501 and DELETE are transcribed from routes.rb
    // (`resources :coach_entries, only: %i[index create update destroy]`),
    // not read back off anything in this app.
    it("deletes the entry on screen, by its id, once he confirms", async () => {
      const user = userEvent.setup();
      const store = openExistingEntry();
      const dispatched = trackDispatch(store);

      await user.click(screen.getByRole("button", { name: "Delete this entry" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete it" }));

      const deletes = dispatched.filter((a) => a.type === "journal/DELETE_ENTRY");
      expect(deletes).toHaveLength(1);
      expect(deletes[0]!.payload).toEqual({ side: "coach", date: "2026-09-16", id: 501 });
      expect((deletes[0] as unknown as { request: { path: string; method: string } }).request).toEqual(
        { path: "/api/v1/coach_entries/501", method: "DELETE" },
      );
    });

    it("clears the form and the control once the entry is gone", () => {
      const store = openExistingEntry();
      expect(screen.getByLabelText(/what did you see/i)).toHaveValue(EXISTING_ENTRY.note);

      act(() => {
        store.dispatch({
          type: "journal/ENTRY_DELETED",
          payload: { side: "coach", date: "2026-09-16" },
        });
      });

      expect(screen.getByLabelText(/what did you see/i)).toHaveValue("");
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("says the delete is still waiting when it was made with no connection", async () => {
      const user = userEvent.setup();
      const store = openExistingEntry();

      await user.click(screen.getByRole("button", { name: "Delete this entry" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete it" }));

      act(() => {
        // The exact QueueableAction a real offline delete queues, built the
        // same way the screen built the one it just dispatched, so a queued
        // write that did not match a real one would prove nothing.
        store.dispatch({
          type: "outbox/ENQUEUE",
          payload: journalActions.deleteEntry({ side: "coach", date: "2026-09-16", id: 501 }),
        });
        store.dispatch({
          type: "journal/ENTRY_DELETED",
          payload: { side: "coach", date: "2026-09-16" },
        });
      });

      expect(screen.getByText(/deleted here/i)).toBeInTheDocument();
    });
  });
  // ---- which drills it asks about -----------------------------------------
  describe("the drills it asks him to rate", () => {
    it("asks for this week once on mount", async () => {
      const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
      seedAuth(store, 42);
      const dispatched = trackDispatch(store);

      const { rerender } = render(
        <Provider store={store}>
          <CoachJournal />
        </Provider>,
      );
      await settle();

      const fetches = () => dispatched.filter((a) => a.type === "week/FETCH");
      expect(fetches()).toHaveLength(1);

      rerender(
        <Provider store={store}>
          <CoachJournal />
        </Provider>,
      );
      await settle();
      expect(fetches()).toHaveLength(1);
    });

    it("lists only the drills on that day's card", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      // Tuesday's card carries balance-beam-walk and nothing else.
      setDate("2026-09-15");

      expect(ratedDrillNames()).toEqual(["Balance Beam Walk"]);
    });

    it("puts them in the order the card runs them", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      // Monday's card runs wall-taps first, which is the reverse of the
      // order the glossary lists the two in.
      setDate("2026-09-14");

      expect(ratedDrillNames()).toEqual(["Wall Taps", "Star Jump"]);
    });

    it("swaps the list when he picks another day", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      setDate("2026-09-15");
      expect(ratedDrillNames()).toEqual(["Balance Beam Walk"]);

      setDate("2026-09-18");
      expect(ratedDrillNames()).toEqual(["Wall Taps"]);
    });

    it("keeps a drill he has already rated even when that day's card has dropped it", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);
      act(() => {
        store.dispatch({ type: "journal/COACH_ENTRIES_FETCHED", payload: [FRIDAY_ENTRY] });
      });

      // Friday's card lists wall-taps only. The entry rates star-jump.
      setDate("2026-09-18");

      expect(ratedDrillNames()).toEqual(["Wall Taps", "Star Jump"]);
      expect(within(ratingGroup("Star Jump")).getByRole("radio", { name: "owns" })).toBeChecked();
    });

    it("says so when the day's card has no drills at all", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      // Saturday is Game Day: the home program is off and the card carries
      // no drills, so there is nothing here to rate.
      setDate("2026-09-19");

      expect(ratedDrillNames()).toEqual([]);
      expect(screen.getByText("This day's card lists no drills.")).toBeInTheDocument();
    });

    it("lists every drill when the date is outside this week", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      setDate("2026-09-07");

      expect(ratedDrillNames()).toEqual(["Star Jump", "Wall Taps", "Balance Beam Walk"]);
      expect(
        screen.getByText("This date is outside this week, so every drill is listed."),
      ).toBeInTheDocument();
    });

    it("lists every drill when this week could not be reached", () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      act(() => {
        store.dispatch({ type: "week/FAILED", payload: "That could not be reached." });
      });

      setDate("2026-09-15");

      expect(ratedDrillNames()).toEqual(["Star Jump", "Wall Taps", "Balance Beam Walk"]);
      expect(
        screen.getByText("This week could not be reached, so every drill is listed."),
      ).toBeInTheDocument();
    });

    it("says it is finding the day's drills rather than listing all of them", async () => {
      // The week fetch is still in flight, which on a cold Fly machine is
      // around seven seconds. Listing all 84 for that long and then
      // collapsing to the day's handful is worse than saying what it is
      // waiting for, and he can type the note meanwhile.
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      await settle();

      expect(ratedDrillNames()).toEqual([]);
      expect(screen.getByText("Finding this day's drills.")).toBeInTheDocument();
      expect(screen.getByLabelText(/what did you see/i)).toBeInTheDocument();
    });

    it("still saves a rating made before the card dropped the drill", async () => {
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      // Tracked before the form has mounted (see "saving as you go" above):
      // dispatch is read fresh at mount, so installing this any later would
      // miss the tap's own save.
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      act(() => {
        store.dispatch({ type: "journal/COACH_ENTRIES_FETCHED", payload: [FRIDAY_ENTRY] });
      });
      setDate("2026-09-18");

      await user.click(within(ratingGroup("Wall Taps")).getByRole("radio", { name: "getting" }));
      await user.click(screen.getByRole("button", { name: /save/i }));

      // The tap itself already carries the whole entry; the last save is
      // read here rather than the first because autosave, not this Save
      // click, is what actually put it on the wire.
      const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
      const payload = saves.at(-1)?.payload as { ratings: Record<string, unknown> };
      expect(payload.ratings).toEqual({ "star-jump": "owns", "wall-taps": "getting" });
    });
  });
  // ---- the Challenge of the Week ------------------------------------------
  describe("the challenge", () => {
    const CHALLENGE =
      "Silent Landings. 10 jumps off a step, count the silent ones. Monday number, Friday number.";

    it("shows this week's challenge above the number he types" , () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      setDate("2026-09-16");

      expect(screen.getByText(CHALLENGE)).toBeInTheDocument();
    });

    it("asks for the number he got rather than which attempt it was", async () => {
      // challenge_num is the score: week 1 says "count the silent ones,
      // Monday number, Friday number", and docs_exporter writes it out as
      // "Challenge number". The label used to ask which attempt it was,
      // which is a different question with a different answer.
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");
      const dispatched = trackDispatch(store);

      await user.type(screen.getByLabelText(/challenge number/i), "7");
      await user.click(screen.getByRole("button", { name: /save/i }));

      // Clicking Save blurs the challenge field he was still in, and that
      // field's own text changed, so its blur fires the one save that goes
      // out here. Save's own submit never runs: that blur sets `saving`
      // true before the click reaches the button, so it lands disabled.
      const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
      expect((saves.at(-1)?.payload as { challenge_num: unknown }).challenge_num).toBe("7");
    });

    it("shows no challenge for a date outside this week", () => {
      // The week payload only ever holds the current week, so showing its
      // challenge beside an older date would name the wrong one. The drill
      // fieldset below already says the date is outside the week, so this
      // says nothing a second time and simply shows no challenge.
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      loadWeek(store);

      setDate("2026-09-07");

      expect(screen.queryByText(CHALLENGE)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/challenge number/i)).toBeInTheDocument();
    });

    it("shows no challenge while the week is still on its way", async () => {
      const { store } = renderCoachJournal(42);
      loadDrills(store);
      await settle();

      expect(screen.queryByText(CHALLENGE)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/challenge number/i)).toBeInTheDocument();
    });
  });
  // ---- saving as he goes --------------------------------------------------
  describe("saving as you go", () => {
    // Autosave is the whole reason this screen changed. A session written up
    // on a phone that locks must not lose what was typed, and the only way
    // that holds is if nothing waits for a button.
    it("saves a text field when it loses focus", async () => {
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      // Tracked before the form itself has mounted: the form only appears
      // once drillsData arrives, and dispatch is read fresh at mount, so
      // installing this after that point would miss every save below.
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");
      const note = screen.getByLabelText(/what did you see/i);

      await user.type(note, "Landed quiet on eight of ten.");
      fireEvent.blur(note);

      const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
      expect(saves).toHaveLength(1);
      expect((saves[0]?.payload as { note: unknown }).note).toBe(
        "Landed quiet on eight of ten.",
      );
    });

    // The guard MeasureRow.commit already uses on the test sheet's own
    // boxes. A field tabbed past is not an edit, and firing a write for one
    // would put a request on the wire for every field he walks through.
    it("does not save a text field he only passed through", () => {
      const { store } = renderCoachJournal(42);
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");
      const note = screen.getByLabelText(/what did you see/i);

      fireEvent.focus(note);
      fireEvent.blur(note);

      expect(dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY")).toHaveLength(0);
    });

    it("saves the moment a radio is tapped", async () => {
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");

      await user.click(within(ratingGroup("Energy")).getByRole("radio", { name: "4" }));

      const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
      expect(saves).toHaveLength(1);
      expect((saves[0]?.payload as { energy: unknown }).energy).toBe(4);
    });

    it("saves the moment a drill rating is tapped", async () => {
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");

      await user.click(within(ratingGroup("Star Jump")).getByRole("radio", { name: "owns" }));

      const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
      expect((saves.at(-1)?.payload as { ratings: Record<string, unknown> }).ratings).toEqual({
        "star-jump": "owns",
      });
    });

    // Save is the retry, and it is the one thing autosave cannot be. A write
    // the queue gave up on will not go again until a field is touched, so
    // this must send even when nothing has changed.
    it("re-sends on Save when nothing has changed", async () => {
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");

      await user.click(screen.getByRole("button", { name: /save/i }));

      expect(dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY")).toHaveLength(1);
    });

    it("sends the whole entry on every save, not just the field that changed", async () => {
      const user = userEvent.setup();
      const { store } = renderCoachJournal(42);
      const dispatched = trackDispatch(store);
      loadDrills(store);
      loadWeek(store);
      setDate("2026-09-16");

      await user.click(within(ratingGroup("Energy")).getByRole("radio", { name: "4" }));
      const note = screen.getByLabelText(/what did you see/i);
      await user.type(note, "Good session.");
      fireEvent.blur(note);

      // saveCoachEntry is a whole-entry upsert, so the second write has to
      // carry the first one's energy or tapping a radio then typing a note
      // would erase the radio.
      const saves = dispatched.filter((a) => a.type === "journal/SAVE_COACH_ENTRY");
      const last = saves.at(-1)?.payload as { energy: unknown; note: unknown };
      expect(last.energy).toBe(4);
      expect(last.note).toBe("Good session.");
    });
  });
});
