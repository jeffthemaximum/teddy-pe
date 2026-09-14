import { call, getContext, put, takeLatest } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import { fetchMe, login, SESSION_KEY } from "./api";
import { ApiError, isUnauthorized } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { MeResponse, User } from "../../types";

// What calling /me came back to, once, for a token the caller already had.
// A shared shape so signInSaga and restoreSessionSaga can each make their
// own decision about what to do with the same outcome, rather than /me's
// own saga baking in one decision for both.
type MeOutcome =
  | { ok: true; me: MeResponse }
  | { ok: false; reason: "unauthorized" }
  | { ok: false; reason: "unknown" };

// Fetches /api/v1/me for a token whichever caller already has, and makes
// the one decision that does not depend on why it was called: a 401 means
// the token itself is dead (this is the pwd-claim fingerprint check, the
// same one a password change trips), so that always signs the session out,
// here, once, rather than each caller re-deciding it. Everything else
// (timeout, no connection, a sleeping Fly machine) says nothing about the
// token and is handed back as "unknown" for the caller to shrug off; there
// is no action for that case, because there is nothing for a reducer to do
// with it — the session this call was for is already exactly as signed in
// as it was a moment ago, and stays that way.
function* fetchMeSaga(token: string) {
  const config: CoreConfig = yield getContext("config");
  try {
    const me: MeResponse = yield call(fetchMe, config, token);
    return { ok: true, me } as const;
  } catch (e) {
    if (isUnauthorized(e)) {
      yield put(actions.sessionExpired());
      return { ok: false, reason: "unauthorized" } as const;
    }
    return { ok: false, reason: "unknown" } as const;
  }
}

function* signInSaga(action: ReturnType<typeof actions.signIn>) {
  const config: CoreConfig = yield getContext("config");
  let response: { jwt: string; user: User };
  try {
    response = yield call(login, config, action.payload);
  } catch (e) {
    // Pass the API's own message through. It deliberately does not say
    // whether the email or the password was wrong, and inventing our own
    // copy here would leak exactly what it is careful not to.
    const message = e instanceof ApiError ? e.message : "Something went wrong.";
    yield put(actions.signInFailed(message));
    return;
  }
  yield call([config.storage, "setItem"], SESSION_KEY, JSON.stringify(response));
  // Reported now, before /me: a person watching this spinner has already
  // waited out one round trip on a server that measured 6.6 to 7.6 seconds
  // cold. Making them wait for a second one, for data no sign-in screen
  // shows, would be watching a spinner for a long time for nothing they
  // asked to see.
  yield put(actions.signInSucceeded(response));
  const outcome: MeOutcome = yield call(fetchMeSaga, response.jwt);
  if (outcome.ok) yield put(actions.meSucceeded(outcome.me));
  // Not ok: fetchMeSaga already dispatched sessionExpired for a dead token,
  // or did nothing for a network failure. Either way there is nothing left
  // for signInSaga itself to do; the session this call was for is either
  // already ended, or already signed in and just short one background
  // fetch it can live without.
}

function* restoreSessionSaga() {
  const config: CoreConfig = yield getContext("config");
  const raw: string | null = yield call([config.storage, "getItem"], SESSION_KEY);
  if (!raw) {
    yield put(actions.restoreFinished(null));
    return;
  }
  let session: { jwt: string; user: User };
  try {
    session = JSON.parse(raw) as { jwt: string; user: User };
    if (!session?.jwt || !session?.user) throw new Error("incomplete session");
  } catch {
    // Whatever is in there is not a usable session. A dead token carries the
    // API's pwd claim from before a password change and fails every request,
    // so remove it now rather than let the next launch fail the same way
    // forever.
    yield call([config.storage, "removeItem"], SESSION_KEY);
    yield put(actions.restoreFinished(null));
    return;
  }

  // A stored token is trusted only as far as /me still says it is good.
  // Without this call, a dead token (any password change invalidates its
  // own fingerprint check) restored a signed-in shell that looked correct
  // until the first real screen fetched something and got a 401 back, no
  // sooner and no more clearly than that.
  const outcome: MeOutcome = yield call(fetchMeSaga, session.jwt);

  if (!outcome.ok && outcome.reason === "unauthorized") {
    // fetchMeSaga already dispatched sessionExpired, which sets the same
    // "You were signed out. Sign in again." message a token that dies
    // mid-session already uses. Landing on the sign-in screen with no
    // explanation would read as this app being broken; this is the
    // explanation the person can actually read.
    yield call([config.storage, "removeItem"], SESSION_KEY);
    return;
  }

  if (!outcome.ok) {
    // /me could not answer for a reason that says nothing about the token:
    // a cold server, no connection. Restore succeeds anyway, on the cached
    // user; athlete and current_program_year_id stay null until the next
    // successful /me call, the same "unknown, not absent" a screen already
    // has to handle for a fetch it runs itself.
    yield put(
      actions.restoreFinished({
        jwt: session.jwt,
        user: session.user,
        athlete: null,
        current_program_year_id: null,
      }),
    );
    return;
  }

  yield put(
    actions.restoreFinished({
      jwt: session.jwt,
      user: outcome.me.user,
      athlete: outcome.me.athlete,
      current_program_year_id: outcome.me.current_program_year_id,
    }),
  );
}

function* forgetSessionSaga() {
  const config: CoreConfig = yield getContext("config");
  yield call([config.storage, "removeItem"], SESSION_KEY);
}

export function* authSaga() {
  yield takeLatest(t.SIGN_IN, signInSaga);
  yield takeLatest(t.RESTORE_SESSION, restoreSessionSaga);
  yield takeLatest([t.SIGN_OUT, t.SESSION_EXPIRED], forgetSessionSaga);
}

// The tests drive one worker at a time rather than the watcher, because a
// watcher started through `runSaga` never resolves: `takeLatest` runs
// forever. Every duck exports its workers under `<duck>Workers` for exactly
// this, so the test harness always takes a worker as its first argument.
export const authWorkers = {
  signInSaga,
  restoreSessionSaga,
  forgetSessionSaga,
  fetchMeSaga,
};
