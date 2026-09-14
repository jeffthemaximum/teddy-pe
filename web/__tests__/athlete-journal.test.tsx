import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import {
  createCoreStore,
  journalActions,
  journalSelectors,
  memoryStorage,
  outboxActions,
} from "@teddy-pe/core";
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

// What a save actually carries. `shared` is on this type for the same reason
// the two fixtures above exist: it is the one field on the payload that is a
// promise rather than a value, and a save that quietly flipped it would hand
// Dad a day Teddy meant to keep.
interface SavePayload {
  felt: number | null;
  best: string | null;
  hard: string | null;
  note: string;
  shared: boolean;
}

// Puts a known current program year id in front of the screen without a
// real /me round trip, the same action core's own restoreSessionSaga
// dispatches (see this-week.test.tsx's identical helper).
// `role` is a parameter because this screen is open to Jeff as well
// (routes.tsx: /journal is roles ["coach", "athlete"]), and what the screen
// offers differs by who is holding it.
// The athlete /api/v1/me reports. Deliberately not the real child's name:
// the heading that shows it must read it out of this payload, and a fixture
// carrying the name the app is actually about would pass either way. It also
// keeps his name out of a file that has no reason to hold it.
const ATHLETE = { id: 7, name: "Robin", birthday: "2019-01-09" };

function seedAuth(
  store: ReturnType<typeof createCoreStore>,
  currentProgramYearId: number | null,
  role: "athlete" | "coach" = "athlete",
  athlete: typeof ATHLETE | null = ATHLETE,
) {
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "teddy@example.com", name: "Teddy", role },
      athlete,
      current_program_year_id: currentProgramYearId,
    },
  });
}

function renderJournal(
  currentProgramYearId: number | null = 555,
  role: "athlete" | "coach" = "athlete",
  athlete: typeof ATHLETE | null = ATHLETE,
) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId, role, athlete);
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

// Lets the sagas the real store is running finish whatever a dispatch above
// started, so an assertion is never racing a worker.
async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    const payload = saves[0]!.payload as SavePayload;
    expect(payload.felt).toBe(4);
    expect(payload.best).toBe("The wall rally");
    expect(payload.hard).toBe("Staying low");
    expect(payload.note).toBe("Good day at the wall.");
    // The one field on this payload that is a promise rather than a value.
    // He opened a day nobody has shared, so a save of it must not be the
    // thing that hands it to Dad. Every other assertion in this file passed
    // while a screen sent `shared: true` on every single save.
    expect(payload.shared).toBe(false);
  });

  // The two directions of `shared`, each from its own fixture, because a
  // screen that hardcoded either value would pass one of them. The
  // expectation comes from the fixture the store was seeded with, never from
  // anything the screen computed, so the two sources really can disagree.
  it("keeps a day Teddy has not shared unshared when he saves it again", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store, dispatched } = renderJournalRecording();
    hydrateWith(store, UNSHARED_ENTRY);
    expect(UNSHARED_ENTRY.shared).toBe(false);
    dispatched.length = 0;

    await user.type(screen.getByLabelText(/tell me about today/i), " And again.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_ATHLETE_ENTRY");
    expect(saves).toHaveLength(1);
    expect((saves[0]!.payload as SavePayload).shared).toBe(false);
  });

  it("keeps a day he has shared shared when he saves it again", async () => {
    // The other way round: editing a note he already showed Dad must not
    // quietly take it back either.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { store, dispatched } = renderJournalRecording();
    hydrateWith(store, SHARED_ENTRY);
    expect(SHARED_ENTRY.shared).toBe(true);
    dispatched.length = 0;

    await user.type(screen.getByLabelText(/tell me about today/i), " And again.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saves = dispatched.filter((a) => a.type === "journal/SAVE_ATHLETE_ENTRY");
    expect(saves).toHaveLength(1);
    expect((saves[0]!.payload as SavePayload).shared).toBe(true);
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
    const payload = saves[0]!.payload as SavePayload;
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

  it("says the entry is waiting when it was saved with no connection", async () => {
    const { store } = renderJournal();
    hydrateEmpty(store);

    act(() => {
      store.dispatch({ type: "journal/SAVE_ATHLETE_ENTRY", payload: { date: TODAY } });
    });
    act(() => {
      // The write really goes into the outbox, which is the half this
      // fixture used to leave out. The screen used to answer this question
      // by watching `saving` clear with the entry unchanged, and that is
      // true of a queued write and of a write the server threw away alike,
      // so the assertion below passed against an empty queue. It is the
      // exact QueueableAction a real offline save queues.
      store.dispatch({
        type: "outbox/ENQUEUE",
        payload: journalActions.saveAthleteEntry({
          programYearId: 555,
          date: TODAY,
          felt: null,
          best: null,
          hard: null,
          note: "On the walk home, no signal out here.",
          shared: false,
        }),
      });
      store.dispatch({ type: "journal/SAVE_QUEUED", payload: { date: TODAY } });
    });
    await settle();

    expect(screen.getByText(/saved on your device/i)).toBeInTheDocument();
  });

  it("stops saying his words are safe once the server has thrown the save away", async () => {
    // The other half, and the reason the guess was worth replacing. A save
    // rejected for good comes off the queue and is gone; nothing about the
    // entry on screen changes, so the old heuristic went on telling a
    // 7-year-old his writing was waiting safely on the device. He is told
    // his words are safe when they are not.
    const { store } = renderJournal();
    hydrateEmpty(store);

    const queuedSave = journalActions.saveAthleteEntry({
      programYearId: 555,
      date: TODAY,
      felt: null,
      best: null,
      hard: null,
      note: "On the walk home, no signal out here.",
      shared: false,
    });
    act(() => {
      store.dispatch({ type: "journal/SAVE_ATHLETE_ENTRY", payload: { date: TODAY } });
      store.dispatch({ type: "outbox/ENQUEUE", payload: queuedSave });
      store.dispatch({ type: "journal/SAVE_QUEUED", payload: { date: TODAY } });
    });
    await settle();
    // It really did say so first, so what follows is a message going away
    // rather than one that was never there.
    expect(screen.getByText(/saved on your device/i)).toBeInTheDocument();

    const queueId = store.getState().outbox.queue[0]!.id;
    act(() => {
      store.dispatch({
        type: "outbox/REPLAY_FAILED",
        payload: {
          id: queueId,
          dedupeKey: queuedSave.dedupeKey,
          permanent: true,
          message: "A note cannot be blank.",
        },
      });
    });
    await settle();

    expect(screen.queryByText(/saved on your device/i)).not.toBeInTheDocument();
    // And he is told what actually happened, in the server's own words.
    expect(screen.getByRole("alert")).toHaveTextContent("A note cannot be blank.");
  });

  // ---- deleting today's entry ---------------------------------------------
  describe("deleting what he wrote", () => {
    it("offers nothing to delete when there is no entry yet", () => {
      const { store } = renderJournal();
      hydrateEmpty(store);

      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("offers a delete on an entry he has written", () => {
      const { store } = renderJournal();
      hydrateWith(store, UNSHARED_ENTRY);

      expect(screen.getByRole("button", { name: "Delete today" })).toBeInTheDocument();
    });

    // The same line AthleteEntryPolicy#destroy? draws. Jeff opening this
    // screen sees whatever Teddy shared with him, and it is not his to
    // delete, so there is no control offered for it. The server refuses him
    // either way; this is the half that does not invite the tap.
    it("offers Dad no delete on an entry Teddy shared with him", () => {
      const { store } = renderJournal(555, "coach");
      hydrateWith(store, SHARED_ENTRY);

      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
      // And the entry really is on screen, so this is a missing control
      // rather than a missing entry. He reads it; it is not in a box he can
      // type in.
      expect(screen.getByText("The wall rally")).toBeInTheDocument();
    });

    it("asks before it does anything", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { store, dispatched } = renderJournalRecording();
      hydrateWith(store, UNSHARED_ENTRY);
      dispatched.length = 0;

      await user.click(screen.getByRole("button", { name: "Delete today" }));

      expect(screen.getByText("Delete what you wrote today?")).toBeInTheDocument();
      expect(dispatched.filter((a) => a.type === "journal/DELETE_ENTRY")).toHaveLength(0);
      // And what he wrote is still there while he decides.
      expect(screen.getByLabelText(/what went best today/i)).toHaveValue("The wall rally");
    });

    it("puts the question away when he decides to keep it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { store, dispatched } = renderJournalRecording();
      hydrateWith(store, UNSHARED_ENTRY);
      dispatched.length = 0;

      await user.click(screen.getByRole("button", { name: "Delete today" }));
      await user.click(screen.getByRole("button", { name: "Keep it" }));

      expect(screen.queryByText("Delete what you wrote today?")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete today" })).toBeInTheDocument();
      expect(dispatched.filter((a) => a.type === "journal/DELETE_ENTRY")).toHaveLength(0);
      expect(screen.getByLabelText(/what went best today/i)).toHaveValue("The wall rally");
    });

    // The path and the method are transcribed from routes.rb
    // (`resources :athlete_entries, only: %i[index show create update
    // destroy]`), not read back off this app: the request the dispatched
    // action carries is what actually goes on the wire.
    it("deletes it by its id once he says yes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { store, dispatched } = renderJournalRecording();
      hydrateWith(store, UNSHARED_ENTRY);
      dispatched.length = 0;

      await user.click(screen.getByRole("button", { name: "Delete today" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete it" }));

      const deletes = dispatched.filter((a) => a.type === "journal/DELETE_ENTRY");
      expect(deletes).toHaveLength(1);
      expect(deletes[0]!.payload).toEqual({ side: "athlete", date: TODAY, id: 9001 });
      expect(
        (deletes[0] as unknown as { request: { path: string; method: string } }).request,
      ).toEqual({ path: "/api/v1/athlete_entries/9001", method: "DELETE" });
      // Nothing was saved on the way out: a delete that also fired a save
      // would write the entry back a moment after removing it.
      expect(dispatched.filter((a) => a.type === "journal/SAVE_ATHLETE_ENTRY")).toHaveLength(0);
    });

    it("empties the page once the entry is gone", () => {
      const { store } = renderJournal();
      hydrateWith(store, UNSHARED_ENTRY);
      expect(screen.getByLabelText(/what went best today/i)).toHaveValue("The wall rally");

      act(() => {
        store.dispatch({
          type: "journal/ENTRY_DELETED",
          payload: { side: "athlete", date: TODAY },
        });
      });

      expect(screen.getByLabelText(/what went best today/i)).toHaveValue("");
      expect(screen.getByLabelText(/what was hard today/i)).toHaveValue("");
      expect(screen.getByLabelText(/tell me about today/i)).toHaveValue("");
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("tells him plainly when the delete is still waiting for a connection", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { store } = renderJournal();
      hydrateWith(store, UNSHARED_ENTRY);

      await user.click(screen.getByRole("button", { name: "Delete today" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete it" }));

      act(() => {
        // The exact QueueableAction a real offline delete queues.
        store.dispatch({
          type: "outbox/ENQUEUE",
          payload: journalActions.deleteEntry({ side: "athlete", date: TODAY, id: 9001 }),
        });
        store.dispatch({
          type: "journal/ENTRY_DELETED",
          payload: { side: "athlete", date: TODAY },
        });
      });

      expect(screen.getByText(/deleted here/i)).toBeInTheDocument();
    });

    // The ordering that broke, driven through the real store and the real
    // sagas with only fetch mocked, because every piece between the button
    // and the wire gets to be wrong here. Teddy deletes an entry at a court
    // with no signal and reaches straight for the share toggle. The toggle
    // used to still be there and still be enabled, and the save it fired
    // replaced the queued delete under the same key, so the replay upserted
    // the row he had deleted back to `shared: true` with his words blanked
    // out, and a day he took back turned up in his dad's payload.
    it("never gives Dad a day he deleted with no signal, and offers him nothing to share on it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      // No connection: every request fails the way a dead one does.
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new TypeError("Failed to fetch"));

      const { store } = renderJournal();
      hydrateWith(store, UNSHARED_ENTRY);

      await user.click(screen.getByRole("button", { name: "Delete today" }));
      await user.click(screen.getByRole("button", { name: "Yes, delete it" }));
      await settle();

      // The delete is owed to the server and nothing else is.
      expect(
        store.getState().outbox.queue.map((w) => w.action.request.method),
      ).toEqual(["DELETE"]);

      // There is nothing on screen to tap. Both halves matter: with the
      // entry gone from the slice the toggle read `shared` as false and
      // offered to show Dad a day that is not there any more.
      expect(screen.queryByRole("button", { name: /let dad see this/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /keep this to yourself/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      // And he is told what happened, which is the part that makes an empty
      // page different from a deleted one.
      expect(screen.getByText(/deleted here/i)).toBeInTheDocument();
      expect(screen.getByText(/dad cannot see it/i)).toBeInTheDocument();

      // The connection comes back, against a server that records everything
      // it is asked for. Recording the requests rather than asserting a call
      // count is what makes "nothing was shared" checkable at all.
      const sent: { url: string; method?: string; body: string }[] = [];
      fetchMock.mockReset();
      fetchMock.mockImplementation((input, init) => {
        const request = init as RequestInit | undefined;
        sent.push({
          url: String(input),
          method: request?.method,
          body: request?.body === undefined ? "" : String(request.body),
        });
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () =>
            Promise.resolve(JSON.stringify({ deleted: { id: 9001, session_date: TODAY } })),
        } as Response);
      });

      await act(async () => {
        store.dispatch(outboxActions.replay());
      });
      await waitFor(() => expect(store.getState().outbox.queue).toHaveLength(0));

      // One request, and it is the delete. Nothing was created, so there is
      // no row on the server for this day at all.
      expect(sent).toHaveLength(1);
      expect(sent[0]!.method).toBe("DELETE");
      expect(sent[0]!.url).toBe("https://api.test/api/v1/athlete_entries/9001");
      expect(sent.some((r) => r.method === "POST")).toBe(false);
      // And nothing that left this device so much as mentioned sharing.
      expect(sent.map((r) => r.body).join("")).not.toContain("shared");

      // Still gone here too. Nothing is owed any more, so the day is his to
      // start again: an empty form, and nothing shared on it.
      expect(journalSelectors.selectAthleteEntryFor(TODAY)(store.getState())).toBeNull();
      expect(screen.queryByText(/deleted here/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/tell me about today/i)).toHaveValue("");
      expect(screen.getByText(/only you can see this/i)).toBeInTheDocument();
    });
  });

  // ---- what Dad gets on the same route ------------------------------------
  //
  // /journal is open to him on purpose: athlete_entries#index answers him 200
  // and hands him what his son shared. Everything that writes on this page
  // answers him 403, and one of those controls was a button reading "Let Dad
  // see this", shown to Dad.
  describe("Dad reading it", () => {
    it("gives him nothing at all to press", () => {
      // Asserted by role rather than by the words on the controls, so a
      // control added later under a different label is caught too. He is
      // holding a page, not a form.
      const { store } = renderJournal(555, "coach");
      hydrateWith(store, SHARED_ENTRY);

      expect(screen.queryAllByRole("button")).toHaveLength(0);
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
      expect(screen.queryAllByRole("combobox")).toHaveLength(0);
      expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    });

    it("shows him what was shared, as something to read", () => {
      const { store } = renderJournal(555, "coach");
      hydrateWith(store, SHARED_ENTRY);

      expect(screen.getByText("The wall rally")).toBeInTheDocument();
      expect(screen.getByText("Staying low")).toBeInTheDocument();
      expect(screen.getByText("Good day at the wall.")).toBeInTheDocument();
      expect(screen.getByText("4 out of 5")).toBeInTheDocument();
    });

    it("says whose page it is, in the name the API gave it", () => {
      // He has his own journal one tab away and the two tabs read "Journal"
      // and "Notes", so the heading is the only thing telling him which one
      // he is on. The name is asserted against the /me fixture rather than
      // against anything in the app: a heading with a name written into it
      // would ship that name in the bundle to anyone who loads the site.
      const dads = renderJournal(555, "coach");
      hydrateWith(dads.store, SHARED_ENTRY);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${ATHLETE.name}'s`);
      dads.unmount();

      // Teddy's own page never says whose it is, because he already knows,
      // and it must not start saying it: the same heading on both would put
      // his name where a stranger reading the bundle could find it.
      const his = renderJournal(555, "athlete");
      hydrateWith(his.store, SHARED_ENTRY);
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Today");
      expect(heading).not.toHaveTextContent(ATHLETE.name);
    });

    it("still names the page when the session carries no athlete", () => {
      const { store } = renderJournal(555, "coach", null);
      hydrateWith(store, SHARED_ENTRY);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/journal/i);
    });

    // The one that matters. Teddy wrote today and kept it to himself; Teddy
    // wrote nothing at all. Those are different facts about a 7-year-old's
    // day, and which of the two it was is exactly what the toggle exists to
    // keep from his dad. The API is already careful: the Pundit scope hands
    // Jeff the shared rows and no others, so both arrive as the same
    // silence. A screen that said "nothing shared today" for one and
    // "nothing written today" for the other would give it straight back.
    //
    // The unshared entry is seeded into the slice rather than filtered out
    // on the way in, which is the whole strength of the fixture. The journal
    // slice has three sources and one of them is the week payload's inline
    // `athlete_entry`, folded in by core on week/SUCCEEDED, so an entry the
    // index endpoint would never have sent him can still land here. A test
    // that filtered first would prove only that nothing renders nothing.
    it("shows him the same thing for a day kept private as for a day never written", () => {
      const wroteButKeptIt = renderJournal(555, "coach");
      hydrateWith(wroteButKeptIt.store, UNSHARED_ENTRY);
      const withPrivateEntry = wroteButKeptIt.container.innerHTML;

      const neverWrote = renderJournal(555, "coach");
      hydrateEmpty(neverWrote.store);
      const withNothing = neverWrote.container.innerHTML;

      // Identical markup, not merely two renders that each lack a word
      // somebody thought to check for.
      expect(withPrivateEntry).toBe(withNothing);
      // And the private entry really was in the store, so this is the screen
      // refusing to show it rather than a fixture that never held it.
      expect(
        wroteButKeptIt.store.getState().journal.athlete[TODAY]?.note,
      ).toBe(UNSHARED_ENTRY.note);
      // None of what he wrote reached the page.
      expect(withPrivateEntry).not.toContain("The wall rally");
      expect(withPrivateEntry).not.toContain("Staying low");
      expect(withPrivateEntry).not.toContain("Good day at the wall.");
    });

    it("says the same one thing on an empty day, with no second version of it", () => {
      // The leak above would most likely arrive as two empty-state
      // messages, so this pins that there is one. It is worded as a fact
      // about the page rather than about today, and the line explaining what
      // the page is stands whether or not there is an entry, so its presence
      // says nothing either.
      const empty = renderJournal(555, "coach");
      hydrateEmpty(empty.store);
      expect(screen.getByText("Nothing here for today.")).toBeInTheDocument();
      expect(screen.getByText(/chooses to share/i)).toBeInTheDocument();
      empty.unmount();

      const full = renderJournal(555, "coach");
      hydrateWith(full.store, SHARED_ENTRY);
      expect(screen.queryByText("Nothing here for today.")).not.toBeInTheDocument();
      // The same standing line, on a day that is not empty.
      expect(screen.getByText(/chooses to share/i)).toBeInTheDocument();
    });

    it("does not put his son's own questions to him", () => {
      // Every string on Teddy's half of this screen is written for a
      // 7-year-old talking about his dad. "What went best today?" is
      // addressed to the boy writing it, and "Dad can see this too" is the
      // app telling Dad about Dad. Read as Jeff would read them, they are
      // the app talking to the wrong person.
      const { store } = renderJournal(555, "coach");
      hydrateWith(store, SHARED_ENTRY);

      expect(screen.queryByText(/how did today feel/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/what went best today\?/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/what was hard today\?/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/tell me about today/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/let dad see this/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/keep this to yourself/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/only you can see this/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/dad can see this too/i)).not.toBeInTheDocument();
      // What he does get instead: the same four things, named rather than
      // asked.
      expect(screen.getByText("What went best")).toBeInTheDocument();
      expect(screen.getByText("What was hard")).toBeInTheDocument();
    });
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
