import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import type { User } from "@teddy-pe/core";

// No test in this app should depend on a real network round trip. Left
// unstubbed, a sign in attempt here would call the real fetch, which for a
// fake host like "https://api.test" fails on DNS lookup in a handful of
// milliseconds: fast enough to race React's own render scheduling and make
// the transient "signingIn" state disappear before a test ever observes it.
// A test that wants a specific response (success, a rejection, a timeout)
// stubs fetch itself for that one case; this default just keeps everyone
// else from resolving mid-test.
const neverResolves = () => new Promise<never>(() => {});

vi.stubGlobal("fetch", vi.fn(neverResolves));

// core now fetches GET /api/v1/me after both a sign-in and a restore, and
// holds status "restoring" until it answers (see
// core/src/ducks/auth/sagas.ts). Every test that renders a signed-in shell
// therefore needs /me to resolve, or it hangs against the default above
// forever. stubMe() and stubMeUnauthorized() are how a test turns that one
// route on, one way or the other.
//
// Role arrives off the API as a plain string; TypeScript's Role union
// checks nothing at runtime (see the "role this app has never heard of"
// test in shell.test.tsx), so the stub accepts any string role rather than
// only the three this app currently knows how to render.
type MeUser = Omit<User, "role"> & { role: string };

// The shape backend/app/controllers/api/v1/me_controller.rb answers with.
// Not reached for from @teddy-pe/core: MeResponse is duck-internal, not
// part of core's public surface, so it is written out here instead.
interface MeResponse {
  user: MeUser;
  athlete: { id: number; name: string; birthday: string } | null;
  current_program_year_id: number | null;
}

// Teddy's own record, captured from the deployed API. Exported, not just
// used internally, so a test that wants to assert /me's athlete and
// current_program_year_id actually landed in state can check against the
// same fixture the stub answered with, rather than a second copy that could
// drift from it.
export const ME_ATHLETE = { id: 1, name: "Teddy Maxim", birthday: "2019-01-09" };
export const ME_PROGRAM_YEAR_ID = 1;

// Routes exactly one path, GET /api/v1/me, to `respond()`; everything else
// keeps hanging forever, same as the file-level default above. A test that
// reaches some other real endpoint this stub was not told about still hangs
// and times out, visibly, instead of quietly passing against invented data.
// This does not check method or headers, only the URL: a core regression
// that dropped the Authorization header or requested the wrong path would
// still get an answer here. See the task report for that gap.
function installMeStub(respond: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/v1/me")) {
        return Promise.resolve(respond());
      }
      return neverResolves();
    }),
  );
}

/**
 * Installs a fetch stub that answers GET /api/v1/me as `user`, signed in
 * successfully, alongside Teddy's fixed athlete record.
 *
 * The `user` /me answers with has to be the same person the test put in
 * storage or dispatched signIn as. A stub that always answered "Jeff,
 * coach" would pass the athlete and viewer shell tests for the wrong
 * reason, or fail them on a role mismatch nobody wrote. So this is a
 * function a test calls with its own user, right before rendering, rather
 * than one global answer installed once for the whole file.
 */
export function stubMe(user: MeUser) {
  const me: MeResponse = {
    user,
    athlete: ME_ATHLETE,
    current_program_year_id: ME_PROGRAM_YEAR_ID,
  };
  installMeStub(() => new Response(JSON.stringify(me), { status: 200 }));
}

/**
 * Installs a fetch stub that answers GET /api/v1/me with a 401, the way a
 * dead token does: the JWT carries a digest of the password it was issued
 * under, and any password change invalidates every token issued before it,
 * on restore as much as on any other request. Before core fetched /me on
 * restore, a dead token like this rendered a signed-in shell that collapsed
 * the moment a real screen's own fetch came back 401; this is the stub for
 * proving that no longer happens.
 */
export function stubMeUnauthorized() {
  installMeStub(
    () =>
      new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Token invalid." } }),
        { status: 401 },
      ),
  );
}
