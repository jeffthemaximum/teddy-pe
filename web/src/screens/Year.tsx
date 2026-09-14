import { useEffect } from "react";
import { authSelectors, programYear, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";

// The Year payload is the heaviest single call in the app (six blocks, nine
// areas each with a cell per block, patches, gates, test dates, day roles),
// so a cold Fly machine plus a suspended Neon branch is most likely to be
// felt right here. Same 6.6 to 7.6 second wake as sign in (see SignIn.tsx).
const WAKING_LABEL = "Waking up the server. The year can take a few seconds to load.";

// Shown while the id itself is still unknown. `selectCurrentProgramYearId`
// is null both while /api/v1/me is still in flight right after sign-in (it
// is fetched in the background, not waited on) and, more lastingly, when a
// restore succeeded on a cached session because /me could not answer for a
// reason that says nothing about the token (a cold server, no connection).
// core deliberately lets that restore succeed rather than sign someone out
// over a slow tunnel, so a signed-in person can genuinely sit at this
// screen with no id yet. Saying so, in the same waking voice as everywhere
// else, beats a content area that just stays empty with no explanation.
const FINDING_YEAR_LABEL = "Waking up the server. Finding this year can take a few seconds too.";

function byPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export function Year() {
  const dispatch = useAppDispatch();

  // core now carries the current program year id itself, read at sign-in
  // and at restore from /api/v1/me (see core/src/ducks/auth). This used to
  // be a gap: core had no such id on its exported surface, so this screen
  // fetched the whole programYears list and picked out the one marked
  // is_current, a second full round trip against a server that measured
  // 6.6 to 7.6 seconds cold. authSelectors.selectCurrentProgramYearId
  // exists now precisely because that was reported, so this reads it
  // directly instead.
  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);

  const data = useAppSelector(programYear.selectors.selectData);
  const loading = useAppSelector(programYear.selectors.selectIsLoading);
  const error = useAppSelector(programYear.selectors.selectError);

  // Fires once currentId is known, and again only if it ever changes. A
  // screen that asked again on every render would hammer a server that
  // takes seven seconds to wake.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(programYear.actions.fetch(currentId));
    }
  }, [dispatch, currentId]);

  if (!data) {
    if (currentId === null) {
      return (
        <main className="year">
          <Loading label={FINDING_YEAR_LABEL} />
        </main>
      );
    }
    if (loading) {
      return (
        <main className="year">
          <Loading label={WAKING_LABEL} />
        </main>
      );
    }
    if (error) {
      return (
        <main className="year">
          <ErrorNote message={error} />
        </main>
      );
    }
    // The id is known, nothing has loaded and nothing has failed: the
    // fetch above has been dispatched but the store has not caught up in
    // this render yet. Every screen can be asked to render before its own
    // data arrives.
    return null;
  }

  const blocks = byPosition(data.blocks);
  const areas = byPosition(data.areas);
  const dayRoles = byPosition(data.day_roles);
  const testDates = byPosition(data.test_dates);
  const gates = byPosition(data.ball_gates);

  // The payload's own patches are already the current rank's nine; ordering
  // them by their area's position keeps them lined up with the areas table
  // above rather than whatever order the API happened to return.
  const areaPositionBySlug = new Map(data.areas.map((area) => [area.slug, area.position]));
  const patches = [...data.patches].sort(
    (a, b) => (areaPositionBySlug.get(a.area_slug) ?? 0) - (areaPositionBySlug.get(b.area_slug) ?? 0),
  );

  return (
    <main className="year">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>{data.label}</h1>
      <p className="year__status">Status: {data.status}</p>
      <p className="year__north-star">{data.north_star}</p>
      <p className="year__ball">Now: {data.ball_now}</p>
      <p className="year__rank-rule">{data.rank_rule}</p>

      <section aria-labelledby="year-blocks-heading">
        <h2 id="year-blocks-heading">Sections of the year</h2>
        <ol>
          {blocks.map((block) => (
            <li key={block.key}>
              <strong>{block.name}</strong>
              {block.current && <span> Current block</span>}
              <span className="year__block-dates">
                {" "}
                {block.starts_on} to {block.ends_on}
              </span>
              <p>{block.focus}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="year-area-list-heading">
        <h2 id="year-area-list-heading">What this covers</h2>
        <dl>
          {areas.map((area) => (
            <div key={area.slug}>
              <dt>{area.name}</dt>
              <dd>{area.summary}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="year-areas-heading">
        <h2 id="year-areas-heading">Coverage by section</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Area</th>
              {blocks.map((block) => (
                <th scope="col" key={block.key}>
                  {block.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.slug}>
                <th scope="row">{area.name}</th>
                {blocks.map((block) => {
                  const cell = area.cells.find((c) => c.block_key === block.key);
                  return <td key={block.key}>{cell?.body ?? ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="year-patches-heading">
        <h2 id="year-patches-heading">Awards to earn</h2>
        <ul>
          {patches.map((patch) => (
            <li key={patch.id}>
              <strong>{patch.name}</strong>: {patch.requirement}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="year-gates-heading">
        <h2 id="year-gates-heading">Steps</h2>
        <ul>
          {gates.map((gate) => (
            <li key={gate.position}>
              <strong>{gate.label}</strong>
              <span>
                {" "}
                {gate.from_ball} to {gate.to_ball}.
              </span>
              <span> Status: {gate.status}.</span>
              {gate.status === "active" && <span> Working on this now.</span>}
              <p>{gate.requirement}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="year-tests-heading">
        <h2 id="year-tests-heading">Test dates</h2>
        <ul>
          {testDates.map((testDate) => (
            <li key={testDate.id}>
              {testDate.label}: {testDate.display} ({testDate.window})
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="year-days-heading">
        <h2 id="year-days-heading">Each day of the week</h2>
        <ol>
          {dayRoles.map((role) => (
            <li key={role.dow}>
              <strong>{role.name}</strong>
              <span>
                {" "}
                {role.minutes} minutes, intensity {role.intensity}
              </span>
              {role.organized.length > 0 && <p>{role.organized.join(", ")}</p>}
              <p>{role.note}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
