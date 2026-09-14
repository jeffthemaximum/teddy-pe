import { reducer, actions } from "../src/ducks/auth";

const jeff = { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" as const };
const freshJeff = { id: 1, email: "jeff@teddy-pe.test", name: "Jeff Maxim", role: "coach" as const };

describe("the auth reducer", () => {
  it("starts anonymous with nothing in it", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      status: "anonymous",
      user: null,
      token: null,
      athlete: null,
      currentProgramYearId: null,
      error: null,
    });
  });

  it("holds the token and the user once signed in, with athlete and current_program_year_id still unknown", () => {
    // /me has not answered yet at this point: signInSaga reports success
    // before it even asks (see sagas.ts). A session that read as signed in
    // but already carried made-up athlete data would be worse than one that
    // honestly says it does not know yet.
    const state = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    expect(state.status).toBe("signedIn");
    expect(state.token).toBe("a.b.c");
    expect(state.user).toEqual(jeff);
    expect(state.athlete).toBeNull();
    expect(state.currentProgramYearId).toBeNull();
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
    expect(out).toEqual({
      status: "anonymous",
      user: null,
      token: null,
      athlete: null,
      currentProgramYearId: null,
      error: null,
    });
  });

  it("drops the token when the session expires, and says why", () => {
    // The API's pwd claim kills a token when the password changes. The person
    // needs to know it was the password, not that they typed something wrong.
    const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    const expired = reducer(signedIn, actions.sessionExpired());
    expect(expired.status).toBe("anonymous");
    expect(expired.token).toBeNull();
    expect(expired.user).toBeNull();
    expect(expired.athlete).toBeNull();
    expect(expired.currentProgramYearId).toBeNull();
    expect(expired.error).toBe("You were signed out. Sign in again.");
  });

  describe("folding in what /me answered", () => {
    it("fills athlete and current_program_year_id onto an already signed-in session, and refreshes the user with /me's own copy", () => {
      const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
      const enriched = reducer(
        signedIn,
        actions.meSucceeded({
          user: freshJeff,
          athlete: { id: 3, name: "Teddy Maxim", birthday: "2019-01-09" },
          current_program_year_id: 7,
        }),
      );
      expect(enriched.status).toBe("signedIn");
      expect(enriched.token).toBe("a.b.c");
      expect(enriched.user).toEqual(freshJeff);
      expect(enriched.athlete).toEqual({ id: 3, name: "Teddy Maxim", birthday: "2019-01-09" });
      expect(enriched.currentProgramYearId).toBe(7);
    });

    it("does not revive a session a sign-out already ended", () => {
      // The race this guards: sign in, sign out immediately, and only then
      // does the background /me call from the first sign-in land. Without
      // the guard, a late ME_SUCCEEDED would put a token and an athlete back
      // into a state SIGN_OUT had just deliberately cleared.
      const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
      const signedOut = reducer(signedIn, actions.signOut());
      const late = reducer(
        signedOut,
        actions.meSucceeded({
          user: jeff,
          athlete: { id: 3, name: "Teddy Maxim", birthday: "2019-01-09" },
          current_program_year_id: 7,
        }),
      );
      expect(late).toEqual(signedOut);
    });

    it("does not apply while a fresh sign-in attempt is only in flight", () => {
      // Same shape of race, from the other side: a first sign-in's /me
      // answer must not land on top of a *second* signIn() that has already
      // started (status back to "signingIn") before the first one's
      // background fetch resolved.
      const signingIn = reducer(
        reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff })),
        actions.signIn({ email: jeff.email, password: "x" }),
      );
      const late = reducer(
        signingIn,
        actions.meSucceeded({ user: jeff, athlete: null, current_program_year_id: 7 }),
      );
      expect(late).toEqual(signingIn);
    });
  });

  describe("restoreFinished carrying what /me confirmed", () => {
    it("signs in with the fresh athlete and current_program_year_id /me sent back", () => {
      const state = reducer(
        undefined,
        actions.restoreFinished({
          jwt: "a.b.c",
          user: jeff,
          athlete: { id: 3, name: "Teddy Maxim", birthday: "2019-01-09" },
          current_program_year_id: 7,
        }),
      );
      expect(state.status).toBe("signedIn");
      expect(state.user).toEqual(jeff);
      expect(state.athlete).toEqual({ id: 3, name: "Teddy Maxim", birthday: "2019-01-09" });
      expect(state.currentProgramYearId).toBe(7);
    });

    it("still signs in on the cached user when /me could not be reached, with athlete and current_program_year_id left unknown", () => {
      // This is what a restore against a cold or unreachable server looks
      // like: the saga still calls restoreFinished, just with nulls for the
      // two fields only /me could have confirmed.
      const state = reducer(
        undefined,
        actions.restoreFinished({ jwt: "a.b.c", user: jeff, athlete: null, current_program_year_id: null }),
      );
      expect(state.status).toBe("signedIn");
      expect(state.user).toEqual(jeff);
      expect(state.athlete).toBeNull();
      expect(state.currentProgramYearId).toBeNull();
    });

    it("goes back to anonymous with nothing held when there was no session to restore", () => {
      const state = reducer(undefined, actions.restoreFinished(null));
      expect(state).toEqual({
        status: "anonymous",
        user: null,
        token: null,
        athlete: null,
        currentProgramYearId: null,
        error: null,
      });
    });
  });
});
