import { reducer, actions } from "../src/ducks/outbox";
import type { QueueableAction } from "../src/ducks/outbox";
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

  it("clears replaying when the replay loop stops at a failure", () => {
    // A UI reading this flag to show a syncing spinner needs it to come back
    // down when the loop actually stops, not just to go up when it starts.
    const queued = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const id = queued.queue[0]!.id;
    const started = reducer(queued, actions.replay());
    expect(started.replaying).toBe(true);
    const stopped = reducer(
      started,
      actions.replayFailed({
        id,
        dedupeKey: "day:2026-09-17",
        permanent: false,
        message: "No connection.",
      }),
    );
    expect(stopped.replaying).toBe(false);
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

  it("counts attempts, and drops a write the server permanently rejected", () => {
    // A 422 will fail identically forever. Keeping it would block everything
    // behind it and never resolve.
    const queued = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const id = queued.queue[0]!.id;
    const failure = { id, dedupeKey: "day:2026-09-17", message: "A note cannot be blank." };
    const retried = reducer(queued, actions.replayFailed({ ...failure, permanent: false }));
    expect(retried.queue[0]!.attempts).toBe(1);
    const dropped = reducer(retried, actions.replayFailed({ ...failure, permanent: true }));
    expect(dropped.queue).toHaveLength(0);
  });

  it("replaces the whole queue on restore, whatever storage handed back", () => {
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
    [authActionTypes.RESTORE_FINISHED]: authActions.restoreFinished({ jwt: "j", user: jeff }),
    [authActionTypes.SESSION_EXPIRED]: authActions.sessionExpired(),
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
