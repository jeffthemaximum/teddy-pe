import { runSaga } from "redux-saga";
import { authWorkers } from "../src/ducks/auth/sagas";
import * as actions from "../src/ducks/auth/actions";
import * as actionTypes from "../src/ducks/auth/actionTypes";
import { SESSION_KEY } from "../src/ducks/auth/api";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import type { ApiRequest } from "../src/types";

const jeff = { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" as const };
const teddyAthlete = { id: 3, name: "Teddy Maxim", birthday: "2019-01-09" };

// The harness drives one worker at a time, never the `authSaga` watcher.
// `takeLatest` inside the watcher runs forever, so `runSaga(authSaga)` would
// never resolve and the test would hang instead of failing.
function harness(storage = memoryStorage()) {
  const dispatched: unknown[] = [];
  const config = { baseUrl: "https://api.test", storage, logger: silentLogger, timeoutMs: 15000 };
  const run = (worker: (...args: never[]) => unknown, action: unknown) =>
    runSaga(
      {
        dispatch: (a) => dispatched.push(a),
        getState: () => ({ auth: { token: null } }),
        context: { config },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      worker as any,
      action,
    ).toPromise();
  return { dispatched, run, storage };
}

// Answers each request by its path, the way the real API tells /auth/login
// and /me apart. Every fixture below is explicit about which endpoint gets
// which answer, rather than one blanket mock standing in for both: a test
// that can't tell "the login response" from "the /me response" also can't
// tell a 401 from a /me call that was never made.
function mockApi(byPath: Record<string, () => unknown>) {
  return jest.spyOn(client, "apiRequest").mockImplementation((_config, req: ApiRequest) => {
    const respond = byPath[req.path];
    if (!respond) throw new Error(`no fixture for ${req.path}`);
    const value = respond();
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}

function flushMicrotasks(): Promise<void> {
  // A macrotask, not another microtask: it only runs once every promise
  // chain already queued (redux-saga's own continuations included) has
  // drained, so this is a genuine "wait for everything that has happened
  // so far," not a fixed guess at how many `await`s a saga takes.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the auth saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("signs in, and writes the session to storage so a reload keeps it", async () => {
    mockApi({
      "/api/v1/auth/login": () => ({ jwt: "a.b.c", user: jeff }),
      "/api/v1/me": () => ({ user: jeff, athlete: null, current_program_year_id: null }),
    });
    const h = harness();

    await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "right" }));

    expect(h.dispatched).toContainEqual(actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    expect(JSON.parse((await h.storage.getItem(SESSION_KEY))!)).toEqual({
      jwt: "a.b.c",
      user: jeff,
    });
  });

  it("passes the API's own message through on a bad password", async () => {
    // The API says "That email and password do not match." and deliberately
    // does not say which. Inventing our own copy here would leak that.
    mockApi({
      "/api/v1/auth/login": () =>
        new ApiError(401, "unauthorized", "That email and password do not match."),
    });
    const h = harness();

    await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "wrong" }));

    expect(h.dispatched).toContainEqual(
      actions.signInFailed("That email and password do not match."),
    );
  });

  it("writes nothing to storage when sign in fails", async () => {
    // This passes trivially if storage is never written on any path. See the
    // task report for the mutation proof: moving the setItem call above the
    // try (so it runs before the failing request even settles) is what this
    // test has to catch, and it does.
    mockApi({ "/api/v1/auth/login": () => new ApiError(401, "unauthorized", "no") });
    const h = harness();

    await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "wrong" }));

    expect(await h.storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("restores nothing, and clears the key, when what is stored is garbage", async () => {
    // A half-written or hand-edited value must not wedge the app on every
    // launch forever. Both halves matter: the dispatch, and the removal.
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, "{not json");
    const h = harness(storage);

    await h.run(authWorkers.restoreSessionSaga, actions.restoreSession());

    expect(h.dispatched).toContainEqual(actions.restoreFinished(null));
    expect(await storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("clears storage on sign out", async () => {
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
    const h = harness(storage);

    await h.run(authWorkers.forgetSessionSaga, actions.signOut());

    expect(await storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("clears storage when the session expires", async () => {
    // A dead token left on disk gets restored on the next launch and fails
    // every request, which looks like the app being broken. The fixture sets
    // the key first so this fails if forgetSessionSaga ever stops clearing it
    // (it would pass trivially against an empty store).
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "dead", user: jeff }));
    const h = harness(storage);

    await h.run(authWorkers.forgetSessionSaga, actions.sessionExpired());

    expect(await storage.getItem(SESSION_KEY)).toBeNull();
  });

  // --- fetchMeSaga on its own: the one place a 401 is told apart from every
  // other way /me can fail. signInSaga and restoreSessionSaga both build on
  // this, so its three outcomes are proven here once, directly, before
  // trusting either caller's use of them.
  describe("fetchMeSaga", () => {
    it("confirms who is signed in", async () => {
      mockApi({
        "/api/v1/me": () => ({ user: jeff, athlete: teddyAthlete, current_program_year_id: 7 }),
      });
      const h = harness();

      const outcome = await h.run(authWorkers.fetchMeSaga, "a.b.c" as never);

      expect(outcome).toEqual({
        ok: true,
        me: { user: jeff, athlete: teddyAthlete, current_program_year_id: 7 },
      });
      expect(h.dispatched).not.toContainEqual(actions.sessionExpired());
    });

    it("says the session is dead on a 401, and signs it out", async () => {
      mockApi({ "/api/v1/me": () => new ApiError(401, "unauthorized", "Token invalid.") });
      const h = harness();

      const outcome = await h.run(authWorkers.fetchMeSaga, "dead-token" as never);

      expect(outcome).toEqual({ ok: false, reason: "unauthorized" });
      expect(h.dispatched).toContainEqual(actions.sessionExpired());
    });

    it("does not sign anyone out for a timeout, a cold server, not a dead token", async () => {
      mockApi({ "/api/v1/me": () => new ApiError(0, "timeout", "That took too long. Try again.") });
      const h = harness();

      const outcome = await h.run(authWorkers.fetchMeSaga, "a.b.c" as never);

      expect(outcome).toEqual({ ok: false, reason: "unknown" });
      expect(h.dispatched).not.toContainEqual(actions.sessionExpired());
    });

    it("does not sign anyone out for no connection either", async () => {
      mockApi({
        "/api/v1/me": () => new ApiError(0, "offline", "No connection. Check the network and try again."),
      });
      const h = harness();

      const outcome = await h.run(authWorkers.fetchMeSaga, "a.b.c" as never);

      expect(outcome).toEqual({ ok: false, reason: "unknown" });
      expect(h.dispatched).not.toContainEqual(actions.sessionExpired());
    });
  });

  // --- Decision 3: sign-in reports success before /me has answered, and
  // only folds in athlete / current_program_year_id once it does.
  describe("signInSaga's own /me check", () => {
    it("reports sign-in success while /me is still in flight, not after", async () => {
      let resolveMe!: (value: unknown) => void;
      const mePromise = new Promise((resolve) => {
        resolveMe = resolve;
      });
      jest.spyOn(client, "apiRequest").mockImplementation((_config, req: ApiRequest) => {
        if (req.path === "/api/v1/auth/login") return Promise.resolve({ jwt: "a.b.c", user: jeff });
        if (req.path === "/api/v1/me") return mePromise;
        throw new Error(`no fixture for ${req.path}`);
      });
      const h = harness();

      const running = h.run(
        authWorkers.signInSaga,
        actions.signIn({ email: jeff.email, password: "right" }),
      );

      // Give the login round trip every chance to settle, while /me is
      // still deliberately held open.
      await flushMicrotasks();
      expect(h.dispatched).toContainEqual(actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
      expect(
        h.dispatched.some((a) => (a as { type: string }).type === actionTypes.ME_SUCCEEDED),
      ).toBe(false);

      resolveMe({ user: jeff, athlete: teddyAthlete, current_program_year_id: 7 });
      await running;

      expect(h.dispatched).toContainEqual(
        actions.meSucceeded({ user: jeff, athlete: teddyAthlete, current_program_year_id: 7 }),
      );
    });

    it("folds in the athlete and current year /me sends back", async () => {
      mockApi({
        "/api/v1/auth/login": () => ({ jwt: "a.b.c", user: jeff }),
        "/api/v1/me": () => ({ user: jeff, athlete: teddyAthlete, current_program_year_id: 7 }),
      });
      const h = harness();

      await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "right" }));

      expect(h.dispatched).toContainEqual(
        actions.meSucceeded({ user: jeff, athlete: teddyAthlete, current_program_year_id: 7 }),
      );
    });

    it("does not sign out a fresh sign-in just because /me could not be reached", async () => {
      mockApi({
        "/api/v1/auth/login": () => ({ jwt: "a.b.c", user: jeff }),
        "/api/v1/me": () => new ApiError(0, "timeout", "That took too long. Try again."),
      });
      const h = harness();

      await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "right" }));

      expect(h.dispatched).toContainEqual(actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
      expect(h.dispatched).not.toContainEqual(actions.sessionExpired());
      expect(
        h.dispatched.some((a) => (a as { type: string }).type === actionTypes.ME_SUCCEEDED),
      ).toBe(false);
    });

    it("signs the session out if the token it was just issued already answers 401 on /me", async () => {
      // Vanishingly unlikely against a real server (the token is seconds
      // old), but the rule this package uses everywhere else is uniform: a
      // 401 means the bearer token is dead, full stop, not "dead unless it
      // just arrived."
      mockApi({
        "/api/v1/auth/login": () => ({ jwt: "a.b.c", user: jeff }),
        "/api/v1/me": () => new ApiError(401, "unauthorized", "Token invalid."),
      });
      const h = harness();

      await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "right" }));

      expect(h.dispatched).toContainEqual(actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
      expect(h.dispatched).toContainEqual(actions.sessionExpired());
    });
  });

  // --- Decisions 1 and 2: what a restore does with /me's answer. Each
  // failure gets its own fixture and its own assertion of what did NOT
  // happen, so a 401 and a timeout can't quietly collapse into the same
  // passing test.
  describe("restoreSessionSaga's own /me check", () => {
    it("signs in with the fresh athlete and current_program_year_id /me confirms", async () => {
      const storage = memoryStorage();
      await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
      mockApi({
        "/api/v1/me": () => ({ user: jeff, athlete: teddyAthlete, current_program_year_id: 7 }),
      });
      const h = harness(storage);

      await h.run(authWorkers.restoreSessionSaga, actions.restoreSession());

      expect(h.dispatched).toContainEqual(
        actions.restoreFinished({
          jwt: "a.b.c",
          user: jeff,
          athlete: teddyAthlete,
          current_program_year_id: 7,
        }),
      );
      expect(await storage.getItem(SESSION_KEY)).not.toBeNull();
    });

    it("signs out with the session-expired message, and clears the dead token, on a 401", async () => {
      // This is the gap the whole task exists to close: a stored token from
      // before a password change must not render a signed-in shell that a
      // screen's first real fetch tears down a moment later.
      const storage = memoryStorage();
      await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "dead-token", user: jeff }));
      mockApi({ "/api/v1/me": () => new ApiError(401, "unauthorized", "Token invalid.") });
      const h = harness(storage);

      await h.run(authWorkers.restoreSessionSaga, actions.restoreSession());

      expect(h.dispatched).toContainEqual(actions.sessionExpired());
      // Not signed in on the cached data either: no RESTORE_FINISHED at all
      // for this run, signed-in payload or otherwise.
      expect(
        h.dispatched.some((a) => (a as { type: string }).type === actionTypes.RESTORE_FINISHED),
      ).toBe(false);
      expect(await storage.getItem(SESSION_KEY)).toBeNull();
    });

    it("keeps the cached session on a timeout: a cold server is not a dead token", async () => {
      const storage = memoryStorage();
      await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
      mockApi({ "/api/v1/me": () => new ApiError(0, "timeout", "That took too long. Try again.") });
      const h = harness(storage);

      await h.run(authWorkers.restoreSessionSaga, actions.restoreSession());

      expect(h.dispatched).toContainEqual(
        actions.restoreFinished({ jwt: "a.b.c", user: jeff, athlete: null, current_program_year_id: null }),
      );
      expect(h.dispatched).not.toContainEqual(actions.sessionExpired());
      // The token might be perfectly good; a train going into a tunnel does
      // not get a person's session deleted out from under them.
      expect(await storage.getItem(SESSION_KEY)).not.toBeNull();
    });

    it("keeps the cached session with no connection, the same as a timeout", async () => {
      const storage = memoryStorage();
      await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
      mockApi({
        "/api/v1/me": () => new ApiError(0, "offline", "No connection. Check the network and try again."),
      });
      const h = harness(storage);

      await h.run(authWorkers.restoreSessionSaga, actions.restoreSession());

      expect(h.dispatched).toContainEqual(
        actions.restoreFinished({ jwt: "a.b.c", user: jeff, athlete: null, current_program_year_id: null }),
      );
      expect(h.dispatched).not.toContainEqual(actions.sessionExpired());
      expect(await storage.getItem(SESSION_KEY)).not.toBeNull();
    });
  });
});
