import { reducer, actions } from "../src/ducks/auth";

const jeff = { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" as const };

describe("the auth reducer", () => {
  it("starts anonymous with nothing in it", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      status: "anonymous",
      user: null,
      token: null,
      error: null,
    });
  });

  it("holds the token and the user once signed in", () => {
    const state = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    expect(state.status).toBe("signedIn");
    expect(state.token).toBe("a.b.c");
    expect(state.user).toEqual(jeff);
    expect(state.error).toBeNull();
  });

  it("keeps the message from a failed sign in and stays anonymous", () => {
    const state = reducer(undefined, actions.signInFailed("That email and password do not match."));
    expect(state.status).toBe("anonymous");
    expect(state.error).toBe("That email and password do not match.");
    expect(state.token).toBeNull();
  });

  it("clears the previous error when a new attempt starts", () => {
    // Otherwise the old failure sits under the spinner while the new attempt
    // runs, which reads as the new one having already failed.
    const failed = reducer(undefined, actions.signInFailed("nope"));
    const retrying = reducer(failed, actions.signIn({ email: "a@b.c", password: "x" }));
    expect(retrying.status).toBe("signingIn");
    expect(retrying.error).toBeNull();
  });

  it("drops the token on sign out", () => {
    const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    const out = reducer(signedIn, actions.signOut());
    expect(out).toEqual({ status: "anonymous", user: null, token: null, error: null });
  });

  it("drops the token when the session expires, and says why", () => {
    // The API's pwd claim kills a token when the password changes. The person
    // needs to know it was the password, not that they typed something wrong.
    const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    const expired = reducer(signedIn, actions.sessionExpired());
    expect(expired.token).toBeNull();
    expect(expired.user).toBeNull();
    expect(expired.error).toBe("You were signed out. Sign in again.");
  });
});
