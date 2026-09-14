import { reducer, actions } from "../src/ducks/outbox";
import type { QueueableAction, QueuedWrite } from "../src/ducks/outbox";
import * as authActions from "../src/ducks/auth/actions";
import * as authActionTypes from "../src/ducks/auth/actionTypes";
import { reducer as authReducer } from "../src/ducks/auth/reducer";
import type { User } from "../src/types";

// A stand-in for a real duck's save action (journal's saveAthleteEntry is
// Task 7's job, not this one's). The outbox must not need to know this
// shape: it groups queued writes on `dedupeKey` alone and replays only
// `request`, never anything it infers from `payload`.
function testWrite(dedupeKey: string, note: string): QueueableAction {
  return {
    type: "TEST/WRITE",
    payload: { note },
    dedupeKey,
    request: { path: "/test", method: "POST", body: { note } },
  };
}

// A write as storage hands it back: it has an id and a `queuedAt` from a
// previous run, which a write queued in this run cannot have. Every field is
// named here rather than spread from a base, because what these fixtures
// exist to do is differ from the in-memory writes beside them.
function restoredWrite(
  id: string,
  dedupeKey: string,
  note: string,
  queuedAt: string,
  userId: number | null,
): QueuedWrite {
  return { id, action: testWrite(dedupeKey, note), queuedAt, attempts: 0, userId };
}

const teddy: User = { id: 7, email: "teddy@example.test", name: "Teddy", role: "athlete" };
const jeff: User = { id: 1, email: "jeff@example.test", name: "Jeff", role: "coach" };

// Signing in is an auth action, and the outbox reducer watches for it so a
// write can be stamped with its author the moment it is queued. Both
// reducers see every action, so this is the same dispatch a store makes.
const signedIn = (user: User) => authActions.signInSucceeded({ jwt: `jwt-${user.id}`, user });

describe("the outbox reducer", () => {
  it("starts empty", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      queue: [],
      replaying: false,
      signedInUserId: null,
    });
  });

  it("keeps the action verbatim so replay is the same request", () => {
    const write = testWrite("day:2026-09-17", "Landed three.");
    const s = reducer(undefined, actions.enqueue(write));
    expect(s.queue[0]!.action).toEqual(write);
  });

  it("records who typed a write at the moment it is queued", () => {
    // Not at replay time, which is the whole bug: the person holding the
    // iPad when the connection comes back is not necessarily the person who
    // typed the words.
    const withTeddy = reducer(undefined, signedIn(teddy));
    const queued = reducer(withTeddy, actions.enqueue(testWrite("athlete:2026-09-17", "x")));
    expect(queued.queue[0]!.userId).toBe(teddy.id);
  });

  it("files a signed-out write under nobody rather than under the next person in", () => {
    const queued = reducer(undefined, actions.enqueue(testWrite("athlete:2026-09-17", "x")));
    expect(queued.queue[0]!.userId).toBeNull();
    // And signing in afterwards does not adopt it.
    const withJeff = reducer(queued, signedIn(jeff));
    expect(withJeff.queue[0]!.userId).toBeNull();
  });

  it("replaces an earlier queued write sharing a dedupeKey, keeping the later one", () => {
    // Teddy edits his entry three times offline. Replaying three writes to
    // the same upsert endpoint is three requests for one outcome, and the
    // order decides which wins. Keep the last.
    //
    // The two writes below differ only in `note`, on purpose: a dedupe test
    // whose two fixtures are otherwise identical passes whether the queue
    // holds one entry or two, as long as nobody looks at which one. The
    // second assertion is what makes that impossible to fake.
    const older = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "Landed three.")));
    const newer = reducer(older, actions.enqueue(testWrite("day:2026-09-17", "Landed five.")));

    expect(newer.queue).toHaveLength(1);
    expect((newer.queue[0]!.action.payload as { note: string }).note).toBe("Landed five.");
  });

  it("never lets one person's write replace another person's, even under the same key", () => {
    // `athlete:2026-09-17` is one key per day, not one key per day per
    // person, and the schema already allows a second athlete. Collapsing
    // two people's writes into one would destroy the first person's words
    // in the name of deduping them.
    const teddyQueued = reducer(
      reducer(undefined, signedIn(teddy)),
      actions.enqueue(testWrite("athlete:2026-09-17", "Teddy's words")),
    );
    const both = reducer(
      reducer(teddyQueued, signedIn(jeff)),
      actions.enqueue(testWrite("athlete:2026-09-17", "Jeff's words")),
    );

    expect(both.queue).toHaveLength(2);
    expect(both.queue.map((w) => w.userId)).toEqual([teddy.id, jeff.id]);
    expect(both.queue.map((w) => (w.action.payload as { note: string }).note)).toEqual([
      "Teddy's words",
      "Jeff's words",
    ]);
  });

  it("dedupes on dedupeKey alone, even when the type and payload shape differ entirely", () => {
    // A test result's payload is `{ window, testId, rawValue }` and has no
    // `date`. If the outbox ever inferred identity from payload shape, this
    // pair (different type, unrelated payload keys) would never collapse.
    const older = reducer(
      undefined,
      actions.enqueue({
        type: "TEST/RESULT_A",
        payload: { window: "2026-09", testId: "t1", rawValue: 5.2 },
        dedupeKey: "result:2026-09:t1",
        request: { path: "/results/t1", method: "PATCH", body: { rawValue: 5.2 } },
      }),
    );
    const newer = reducer(
      older,
      actions.enqueue({
        type: "TEST/RESULT_B",
        payload: { window: "2026-09", testId: "t1", rawValue: 4.9 },
        dedupeKey: "result:2026-09:t1",
        request: { path: "/results/t1", method: "PATCH", body: { rawValue: 4.9 } },
      }),
    );

    expect(newer.queue).toHaveLength(1);
    expect(newer.queue[0]!.action.type).toBe("TEST/RESULT_B");
  });

  it("keeps writes for different days separately", () => {
    const a = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const b = reducer(a, actions.enqueue(testWrite("day:2026-09-18", "y")));
    expect(b.queue).toHaveLength(2);
    // Length alone would also pass a coincidental duplication bug. Naming
    // which two entries survived, and in which order, is what rules that out.
    expect(b.queue.map((w) => w.action.dedupeKey)).toEqual(["day:2026-09-17", "day:2026-09-18"]);
    expect(b.queue.map((w) => (w.action.payload as { note: string }).note)).toEqual(["x", "y"]);
  });

  it("takes a write off the queue when it lands", () => {
    const queued = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const write = queued.queue[0]!;
    const done = reducer(
      queued,
      actions.replaySucceeded({ id: write.id, dedupeKey: write.action.dedupeKey, response: {} }),
    );
    expect(done.queue).toHaveLength(0);
  });

  it("clears replaying when the replay loop stops at a non-permanent failure, even though this session still owes a write", () => {
    // A UI reading this flag to show a syncing spinner needs it to come back
    // down when the loop actually stops, not just to go up when it starts.
    //
    // Two writes, both Teddy's, so this can't be satisfied by a hardcoded
    // `false` that happens to agree with an empty or fully-sent queue: after
    // the failure, Teddy still owes both writes (a non-permanent failure
    // keeps the write, it only bumps its attempts), so a reducer that
    // recomputed this flag from `stillOwing` would say `true` here. This
    // branch says `false` regardless, because the loop genuinely stopped and
    // nothing behind the failed write got a turn either.
    const teddyQueued = reducer(
      reducer(undefined, signedIn(teddy)),
      actions.enqueue(testWrite("athlete:2026-09-17", "first")),
    );
    const twoQueued = reducer(
      teddyQueued,
      actions.enqueue(testWrite("athlete:2026-09-18", "second")),
    );
    const id = twoQueued.queue[0]!.id;
    const started = reducer(twoQueued, actions.replay());
    expect(started.replaying).toBe(true);
    const stopped = reducer(
      started,
      actions.replayFailed({
        id,
        dedupeKey: "athlete:2026-09-17",
        permanent: false,
        message: "No connection.",
      }),
    );
    expect(stopped.replaying).toBe(false);
    // Both writes are still there: the failed one (retried once) and the one
    // behind it that the loop never reached.
    expect(stopped.queue).toHaveLength(2);
    expect(stopped.queue[0]!.attempts).toBe(1);
    expect(stopped.queue[1]!.attempts).toBe(0);
  });

  it("does not start replaying when there is nothing queued", () => {
    // An app that dispatches replay() every time connectivity returns
    // otherwise pins a syncing spinner on forever the first time it comes
    // back with an empty queue, since nothing else can ever clear the flag.
    const s = reducer(undefined, actions.replay());
    expect(s.replaying).toBe(false);
  });

  it("does not start replaying over writes this session cannot send", () => {
    // Jeff is signed in and the only queued write is Teddy's. There is
    // nothing for this session to send, so there is nothing to spin about.
    const teddyQueued = reducer(
      reducer(undefined, signedIn(teddy)),
      actions.enqueue(testWrite("athlete:2026-09-17", "Teddy's words")),
    );
    const jeffReplays = reducer(reducer(teddyQueued, signedIn(jeff)), actions.replay());
    expect(jeffReplays.replaying).toBe(false);
  });

  it("clears replaying when the last of my writes lands, with someone else's still queued", () => {
    // The queue is not empty at the end of Jeff's replay: Teddy's write is
    // still in it and always will be until Teddy signs back in. A "queue is
    // empty" check would leave Jeff's spinner running forever.
    const teddyQueued = reducer(
      reducer(undefined, signedIn(teddy)),
      actions.enqueue(testWrite("athlete:2026-09-17", "Teddy's words")),
    );
    const jeffQueued = reducer(
      reducer(teddyQueued, signedIn(jeff)),
      actions.enqueue(testWrite("coach:2026-09-17", "Jeff's words")),
    );
    const jeffsWrite = jeffQueued.queue.find((w) => w.userId === jeff.id)!;
    const started = reducer(jeffQueued, actions.replay());
    expect(started.replaying).toBe(true);

    const landed = reducer(
      started,
      actions.replaySucceeded({
        id: jeffsWrite.id,
        dedupeKey: jeffsWrite.action.dedupeKey,
        response: {},
      }),
    );

    expect(landed.replaying).toBe(false);
    expect(landed.queue).toHaveLength(1);
    expect(landed.queue[0]!.userId).toBe(teddy.id);
  });

  it("counts attempts on the write that failed, and drops only the one the server permanently rejected", () => {
    // A 422 will fail identically forever. Keeping it would block everything
    // behind it and never resolve. Two writes in the queue, not one: a
    // one-item fixture would pass just as well against a bug that bumped
    // every write's attempts, or dropped the whole queue instead of the one
    // write that was actually rejected.
    const first = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const both = reducer(first, actions.enqueue(testWrite("day:2026-09-18", "y")));
    const id = both.queue[0]!.id;
    const otherId = both.queue[1]!.id;
    const failure = { id, dedupeKey: "day:2026-09-17", message: "A note cannot be blank." };
    const retried = reducer(both, actions.replayFailed({ ...failure, permanent: false }));
    expect(retried.queue[0]!.attempts).toBe(1);
    // The other write is untouched by a failure that was not its own.
    expect(retried.queue[1]!.attempts).toBe(0);
    expect(retried.queue).toHaveLength(2);

    const dropped = reducer(retried, actions.replayFailed({ ...failure, permanent: true }));
    // Only the rejected write comes off. The other one is still owed.
    expect(dropped.queue).toHaveLength(1);
    expect(dropped.queue[0]!.id).toBe(otherId);
  });

  it("takes the whole stored queue when nothing was queued before it landed", () => {
    // The ordinary launch: an app opening with words on disk and nothing in
    // memory yet. Every field comes back exactly as it was stored, attempts
    // included, so a write that has already failed twice does not start
    // over.
    const restored = [
      {
        id: "x",
        action: testWrite("day:2026-09-01", "old"),
        queuedAt: "2026-09-01T00:00:00Z",
        attempts: 2,
        userId: 7,
      },
    ];
    const s = reducer(undefined, actions.queueRestored(restored));
    expect(s.queue).toEqual(restored);
  });

  it("keeps a write made while the restore was still in flight, under the writes from disk", () => {
    // The race. Storage is read once, asynchronously, at boot, and Teddy can
    // type an entry and save it before that read answers. A restore that
    // replaced the queue erased his words with the older contents of disk,
    // with nothing shown and nothing left owed.
    const onDisk = [
      restoredWrite("disk-1", "athlete:2026-09-16", "Landed one.", "2026-09-16T18:00:00Z", 7),
      restoredWrite("disk-2", "athlete:2026-09-17", "Landed three.", "2026-09-17T18:00:00Z", 7),
    ];
    const typedNow = reducer(
      reducer(undefined, signedIn(teddy)),
      actions.enqueue(testWrite("athlete:2026-09-18", "Landed five.")),
    );

    const merged = reducer(typedNow, actions.queueRestored(onDisk));

    // Written out as literals rather than assembled from `onDisk` and
    // `typedNow`. An expectation built by the same concatenation the reducer
    // performs would agree with it whichever way round it put them, which is
    // the whole of what this test is here to decide.
    expect(merged.queue.map((w) => w.action.dedupeKey)).toEqual([
      "athlete:2026-09-16",
      "athlete:2026-09-17",
      "athlete:2026-09-18",
    ]);
    expect(merged.queue.map((w) => (w.action.payload as { note: string }).note)).toEqual([
      "Landed one.",
      "Landed three.",
      "Landed five.",
    ]);
  });

  it("discards a restored write the in-memory queue already holds a later edit of", () => {
    // The other half of the merge, and the reason it cannot simply keep
    // everything: two writes under one key replay twice to the same upsert
    // endpoint, and the stale one from disk would land last and overwrite
    // what Teddy typed a moment ago with what he typed yesterday.
    const typedNow = reducer(
      reducer(undefined, signedIn(teddy)),
      actions.enqueue(testWrite("athlete:2026-09-17", "Landed five.")),
    );

    const merged = reducer(
      typedNow,
      actions.queueRestored([
        restoredWrite("disk-1", "athlete:2026-09-17", "Landed three.", "2026-09-17T18:00:00Z", 7),
      ]),
    );

    expect(merged.queue).toHaveLength(1);
    // Which one survived, by its words. A length check alone passes whether
    // the merge kept the right one or the wrong one.
    expect((merged.queue[0]!.action.payload as { note: string }).note).toBe("Landed five.");
    expect(merged.queue[0]!.id).not.toBe("disk-1");
  });

  it("keeps a restored write under the same key that somebody else typed", () => {
    // `athlete:2026-09-17` is one key per day, not one key per day per
    // person, and the schema already allows a second athlete. The merge
    // matches on author as well as key for the same reason ENQUEUE does:
    // collapsing these two would throw away Teddy's words because Jeff
    // happened to write about the same day.
    const jeffsWrite = reducer(
      reducer(undefined, signedIn(jeff)),
      actions.enqueue(testWrite("athlete:2026-09-17", "Jeff's words.")),
    );

    const merged = reducer(
      jeffsWrite,
      actions.queueRestored([
        restoredWrite("disk-1", "athlete:2026-09-17", "Teddy's words.", "2026-09-17T18:00:00Z", 7),
      ]),
    );

    expect(
      merged.queue.map((w) => [w.userId, (w.action.payload as { note: string }).note]),
    ).toEqual([
      [7, "Teddy's words."],
      [1, "Jeff's words."],
    ]);
  });
});

// Who is signed in lives in the auth slice, and the outbox keeps its own
// copy only so a write can be stamped with its author inside a reducer,
// which cannot read another slice. Two copies of one fact drift, so this is
// the test that stops them: every auth action there is, applied to both
// reducers, must leave them agreeing about who is signed in.
describe("the outbox's idea of who is signed in", () => {
  const SAMPLES: Record<string, { type: string }> = {
    [authActionTypes.SIGN_IN]: authActions.signIn({ email: "t@x.test", password: "p" }),
    [authActionTypes.SIGN_IN_SUCCEEDED]: authActions.signInSucceeded({ jwt: "j", user: jeff }),
    [authActionTypes.SIGN_IN_FAILED]: authActions.signInFailed("Sign-in failed."),
    [authActionTypes.SIGN_OUT]: authActions.signOut(),
    [authActionTypes.RESTORE_SESSION]: authActions.restoreSession(),
    [authActionTypes.RESTORE_FINISHED]: authActions.restoreFinished({
      jwt: "j",
      user: jeff,
      athlete: null,
      current_program_year_id: null,
    }),
    [authActionTypes.SESSION_EXPIRED]: authActions.sessionExpired(),
    // Enriches an already-signed-in session with /me's athlete and
    // current-year data; who is signed in does not change, so the outbox
    // reducer has no case for it and this sample proves that agreement
    // rather than assuming it.
    [authActionTypes.ME_SUCCEEDED]: authActions.meSucceeded({
      user: teddy,
      athlete: null,
      current_program_year_id: null,
    }),
  };

  it("covers every auth action the auth duck has", () => {
    // A new auth transition fails here until someone decides what it means
    // for a queued write's author, rather than silently being missed.
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.values(authActionTypes).sort());
  });

  it("agrees with the auth reducer after every one of them", () => {
    for (const [type, action] of Object.entries(SAMPLES)) {
      // Start from Teddy signed in, so an action that should change nothing
      // and an action that should clear the user are told apart.
      const auth = authReducer(authReducer(undefined, signedIn(teddy)), action);
      const outbox = reducer(reducer(undefined, signedIn(teddy)), action);
      expect([type, outbox.signedInUserId]).toEqual([type, auth.user?.id ?? null]);
    }
  });
});
