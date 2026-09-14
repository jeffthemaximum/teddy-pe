import { authActions, useAppDispatch } from "@teddy-pe/core";
import { Loading } from "./Loading";

// Shown by Year, Month and ThisWeek while the current program year id is
// still null. Most of the time this clears itself in a few seconds, the
// moment /api/v1/me answers. But core deliberately keeps a person signed in
// on a cached session even when /me could not answer for a reason that says
// nothing about the token (a cold server, no connection, a dropped tunnel),
// and when that is what actually happened, nothing here ever asks /me
// again on its own: the id stays null and the "a few seconds" label would
// go on being read by someone for whom it was never going to become true.
//
// A retry is the plain fix. `authActions.restoreSession()` is the same
// action every launch already dispatches once (see src/bootstrap.ts); this
// just gives a person a way to ask for it again without reloading the whole
// page. It briefly shows the app's own "Checking who's signed in" screen
// while it runs (the same one a normal launch shows), then lands back here,
// this time with an id if /me managed to answer.
export function WaitingForYearId({ label }: { label: string }) {
  const dispatch = useAppDispatch();

  return (
    <>
      <Loading label={label} />
      <button type="button" onClick={() => dispatch(authActions.restoreSession())}>
        Try again
      </button>
    </>
  );
}
