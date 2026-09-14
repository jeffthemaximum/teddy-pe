import { runSaga } from "redux-saga";
import { createFetchDuck } from "../src/lib/createFetchDuck";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import { sessionExpired } from "../src/ducks/auth/actions";

const duck = createFetchDuck<{ label: string }, string>({
  name: "thing",
  path: (id) => `/api/v1/things/${id}`,
});

const config = {
  baseUrl: "https://api.test",
  storage: memoryStorage(),
  logger: silentLogger,
  timeoutMs: 15000,
};

function harness(token: string | null = "a.b.c") {
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (action: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        duck.worker as any,
        action,
      ).toPromise(),
  };
}

describe("createFetchDuck", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is empty and not loading before anything happens", () => {
    expect(duck.reducer(undefined, { type: "@@INIT" })).toEqual({
      data: null,
      loading: false,
      error: null,
    });
  });

  it("is loading while the request is out, and keeps the old data", () => {
    // Blanking the screen on every refetch is what makes a sleeping server
    // feel broken. Keep what is on screen and show that it is refreshing.
    const loaded = duck.reducer(undefined, duck.actions.succeeded({ label: "Cub" }));
    const refetching = duck.reducer(loaded, duck.actions.fetch("1"));
    expect(refetching.loading).toBe(true);
    expect(refetching.data).toEqual({ label: "Cub" });
  });

  it("clears a previous error when a new fetch starts", () => {
    const failed = duck.reducer(undefined, duck.actions.failed("No connection."));
    const retrying = duck.reducer(failed, duck.actions.fetch("1"));
    expect(retrying.error).toBeNull();
  });

  it("fetches with the signed-in token", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ label: "Cub" });
    const h = harness("a.b.c");

    await h.run(duck.actions.fetch("7"));

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ path: "/api/v1/things/7", token: "a.b.c" }),
    );
    expect(h.dispatched).toContainEqual(duck.actions.succeeded({ label: "Cub" }));
  });

  it("signs the person out when the API says the token is dead", async () => {
    // Every duck must do this identically. Doing it here once is the reason
    // this helper exists.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness("dead.token");

    await h.run(duck.actions.fetch("7"));

    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("does not sign the person out for an ordinary failure", async () => {
    // A sleeping server timing out is not a dead session, and signing someone
    // out for it would make the app unusable on a bad connection.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(0, "timeout", "That took too long. Try again."));
    const h = harness("a.b.c");

    await h.run(duck.actions.fetch("7"));

    expect(h.dispatched).not.toContainEqual(sessionExpired());
    expect(h.dispatched).toContainEqual(duck.actions.failed("That took too long. Try again."));
  });

  it("does not call the API at all without a token", async () => {
    // Nothing about Teddy is fetchable unauthenticated, so an anonymous fetch
    // is a bug in the caller. It must not reach the network.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ label: "x" });
    const h = harness(null);

    await h.run(duck.actions.fetch("7"));

    expect(spy).not.toHaveBeenCalled();
  });
});
