import { useEffect, useState } from "react";
import { drills, selectDrillsMatching, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { DrillPanel } from "../components/DrillPanel";

// Same cold-Fly-machine wait as Year, Month and This Week: 6.6 to 7.6
// seconds. Unlike those three, the glossary is not scoped to a program
// year at all: GET /api/v1/drills takes no id (core/src/ducks/drills
// dispatches `drills.actions.fetch()` with no payload, the duck is typed
// `void`), so there is no "waiting to learn the year id" gap for this
// screen to cover the way Year.tsx and Month.tsx do. The only two states
// worth telling Teddy or Jeff apart are "still loading" and "went wrong".
const WAKING_LABEL = "Waking up the server. The drill list can take a few seconds to load.";

export function Glossary() {
  const dispatch = useAppDispatch();
  const data = useAppSelector(drills.selectors.selectData);
  const loading = useAppSelector(drills.selectors.selectIsLoading);
  const error = useAppSelector(drills.selectors.selectError);

  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // selectDrillsMatching already does the search (name, slug and aliases),
  // and an empty query returns every drill rather than none. Filtering
  // again here would be a second copy of that behavior for the two of them
  // to drift apart, so this reads the one core already tested.
  const matches = useAppSelector(selectDrillsMatching(query));

  // Fires once, on mount, and never again: nothing this screen depends on
  // ever changes after that (no year id, no other id), so asking again
  // would only hammer a server that can take seven seconds to answer.
  useEffect(() => {
    dispatch(drills.actions.fetch());
  }, [dispatch]);

  if (!data) {
    if (loading) {
      return (
        <main className="glossary">
          <Loading label={WAKING_LABEL} />
        </main>
      );
    }
    if (error) {
      return (
        <main className="glossary">
          <ErrorNote message={error} />
        </main>
      );
    }
    // Nothing has loaded and nothing has failed: the fetch above has been
    // dispatched but the store has not caught up in this render yet. Every
    // screen can be asked to render before its own data arrives.
    return null;
  }

  const openDrill = openSlug ? (data.drills.find((d) => d.slug === openSlug) ?? null) : null;

  if (openDrill) {
    return (
      <main className="glossary">
        <DrillPanel drill={openDrill} onClose={() => setOpenSlug(null)} />
      </main>
    );
  }

  return (
    <main className="glossary">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>Drills</h1>

      <label htmlFor="glossary-search">Find a drill</label>
      <input
        id="glossary-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Type its name"
      />

      {matches.length === 0 ? (
        <p className="glossary__empty">No drill called that. Try another word.</p>
      ) : (
        <ul aria-label="Drills" className="glossary__list">
          {matches.map((drill) => (
            <li key={drill.slug}>
              <button type="button" onClick={() => setOpenSlug(drill.slug)}>
                {drill.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
