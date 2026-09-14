import { useEffect, useMemo } from "react";
import { programYear, programYears, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";

// The Year payload is the heaviest single call in the app (six blocks, nine
// areas each with a cell per block, patches, gates, test dates, day roles),
// so a cold Fly machine plus a suspended Neon branch is most likely to be
// felt right here. Same 6.6 to 7.6 second wake as sign in (see SignIn.tsx).
const WAKING_LABEL = "Waking up the server. The year can take a few seconds to load.";

function byPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export function Year() {
  const dispatch = useAppDispatch();

  // core has no notion of "the current program year id" on its own public
  // surface. The auth duck's User is only { id, email, name, role }: it
  // never calls /api/v1/me, and authSelectors has no year id to read
  // (checked ducks/auth/selectors.ts, reducer.ts and types.ts directly).
  // The backend's MeController does send `current_program_year_id`, but
  // nothing in core fetches or exposes it, and this task cannot change
  // core. The one place "current" does appear on core's exported surface
  // is ProgramYearSummary.is_current, on the programYears (plural) list
  // duck, so that is what this screen uses to find the id, rather than
  // reaching around core with a raw request of its own or guessing one.
  const yearsData = useAppSelector(programYears.selectors.selectData);
  const currentId = useMemo(() => {
    const list = yearsData?.program_years ?? [];
    return list.find((year) => year.is_current)?.id ?? null;
  }, [yearsData]);

  const data = useAppSelector(programYear.selectors.selectData);
  const loading = useAppSelector(programYear.selectors.selectIsLoading);
  const error = useAppSelector(programYear.selectors.selectError);

  useEffect(() => {
    dispatch(programYears.actions.fetch());
  }, [dispatch]);

  // Fires once currentId is known, and again only if it ever changes. A
  // screen that asked again on every render would hammer a server that
  // takes seven seconds to wake.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(programYear.actions.fetch(currentId));
    }
  }, [dispatch, currentId]);

  if (!data) {
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
    // Nothing has loaded and nothing has failed. There is nothing true to
    // say about the year yet, so there is nothing to render. Every screen
    // can be asked to render before its own data arrives.
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
      <p className="year__ball">Rally ball now: {data.ball_now}</p>
      <p className="year__rank-rule">{data.rank_rule}</p>

      <section aria-labelledby="year-blocks-heading">
        <h2 id="year-blocks-heading">The six blocks</h2>
        <ol>
          {blocks.map((block) => (
            <li key={block.key}>
              <strong>{block.name}</strong>
              {block.current && <span> Current block</span>}
              <p>{block.focus}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="year-areas-heading">
        <h2 id="year-areas-heading">Nine areas, block by block</h2>
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
        <h2 id="year-patches-heading">Nine patches for this rank</h2>
        <ul>
          {patches.map((patch) => (
            <li key={patch.id}>
              <strong>{patch.name}</strong>: {patch.requirement}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="year-gates-heading">
        <h2 id="year-gates-heading">Tennis ball gates</h2>
        <ul>
          {gates.map((gate) => (
            <li key={gate.position}>
              <strong>{gate.label}</strong>
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
              {testDate.label}: {testDate.display}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="year-days-heading">
        <h2 id="year-days-heading">The week's seven day roles</h2>
        <ol>
          {dayRoles.map((role) => (
            <li key={role.dow}>
              <strong>{role.name}</strong>
              <p>{role.note}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
