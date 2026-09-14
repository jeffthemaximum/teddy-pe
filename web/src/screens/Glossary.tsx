import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { drills, selectDrillBySlug, selectDrills, selectDrillsMatching, useAppDispatch, useAppSelector } from "@teddy-pe/core";
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

// The open drill lives in the URL (/glossary/:slug), not in a useState
// here. Two things made that the right call over local state: a day card's
// drill token (Tokens.tsx) is the one other place that needs to say which
// drill to open, and a URL is the only way for that screen to hand this
// one an answer without either screen reaching into the other's state. And
// once it is a URL, Jeff can bookmark a drill he keeps looking up, and
// Teddy can use the back button to leave one, both for free, neither of
// which local state can do.
export function Glossary() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();

  const data = useAppSelector(drills.selectors.selectData);
  const loading = useAppSelector(drills.selectors.selectIsLoading);
  const error = useAppSelector(drills.selectors.selectError);

  const [query, setQuery] = useState("");

  // The full list, unfiltered, so "the API sent nothing" can be told apart
  // from "nothing matched what was typed" below. selectDrillsMatching
  // already does that filtering (name, slug and aliases), and an empty
  // query returns every drill rather than none; this reads the same list
  // it filters from, not a second copy of it.
  const allDrills = useAppSelector(selectDrills);
  const matches = useAppSelector(selectDrillsMatching(query));

  // selectDrillBySlug is the one place "find the drill with this slug" is
  // implemented. Called unconditionally (an empty string when the URL has
  // no slug) so this stays a hook called in the same order on every
  // render; no real drill has an empty slug, so it resolves to null
  // exactly when there is no slug in the URL.
  const openDrill = useAppSelector(selectDrillBySlug(slug ?? ""));

  // Fires once, on mount, and never again: nothing this screen depends on
  // ever changes after that (no year id, no other id), so asking again
  // would only hammer a server that can take seven seconds to answer.
  useEffect(() => {
    dispatch(drills.actions.fetch());
  }, [dispatch]);

  if (!data) {
    if (loading) {
      return (
        <div className="glossary">
          <Loading label={WAKING_LABEL} />
        </div>
      );
    }
    if (error) {
      return (
        <div className="glossary">
          <ErrorNote message={error} />
        </div>
      );
    }
    // Nothing has loaded and nothing has failed: the fetch above has been
    // dispatched but the store has not caught up in this render yet. Every
    // screen can be asked to render before its own data arrives.
    return null;
  }

  if (slug) {
    if (openDrill) {
      return (
        <div className="glossary">
          <DrillPanel drill={openDrill} onClose={() => navigate("/glossary")} />
        </div>
      );
    }
    // The drills loaded, and none of them carries this slug: a stale
    // bookmark, or a link typed by hand. Something true to say here beats
    // silently falling back to the list with no explanation for why the
    // drill it was pointed at never showed up.
    return (
      <div className="glossary">
        <p className="glossary__empty">That link does not point to a drill on this list anymore.</p>
        <button type="button" onClick={() => navigate("/glossary")}>
          Back to the list
        </button>
      </div>
    );
  }

  return (
    <div className="glossary">
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

      {allDrills.length === 0 ? (
        <p className="glossary__empty">Nothing has come back from the drill list yet.</p>
      ) : matches.length === 0 ? (
        <p className="glossary__empty">No drill called that. Try another word.</p>
      ) : (
        <ul aria-label="Drills" className="glossary__list">
          {matches.map((drill) => (
            <li key={drill.slug}>
              <button type="button" onClick={() => navigate(`/glossary/${drill.slug}`)}>
                {drill.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
