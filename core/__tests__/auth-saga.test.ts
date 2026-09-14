import { runSaga } from "redux-saga";
import { authWorkers } from "../src/ducks/auth/sagas";
import * as actions from "../src/ducks/auth/actions";
import { SESSION_KEY } from "../src/ducks/auth/api";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";

const jeff = { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" as const };

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

describe("the auth saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("signs in, and writes the session to storage so a reload keeps it", async () => {
    jest.spyOn(client, "apiRequest").mockResolvedValue({ jwt: "a.b.c", user: jeff });
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
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(
        new ApiError(401, "unauthorized", "That email and password do not match."),
      );
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
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "no"));
    const h = harness();

    await h.run(authWorkers.signInSaga, actions.signIn({ email: jeff.email, password: "wrong" }));

    expect(await h.storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("restores a stored session", async () => {
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
    const h = harness(storage);

    await h.run(authWorkers.restoreSessionSaga, actions.restoreSession());

    expect(h.dispatched).toContainEqual(actions.restoreFinished({ jwt: "a.b.c", user: jeff }));
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
});
