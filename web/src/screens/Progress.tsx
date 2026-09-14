import { useEffect } from "react";
import { progression, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import type { ProgressionPayload, DrillRatingValue } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { Sparkline, type SparklinePoint } from "../components/Sparkline";

// This endpoint takes no year id (progression.actions.fetch takes no
// argument), so unlike Year, Month and ThisWeek there is no id to wait on
// before the first fetch can go out, and no WaitingForYearId branch here.
const WAKING_LABEL = "Waking up the server. Progress can take a few seconds to load.";

type BatteryMeasure = ProgressionPayload["battery"][number];
type SeriesPoint = { window: string; value: string | null };

// Every number this endpoint sends is a string on the wire, first, latest
// and every series value, height's included (core/src/types.ts's own
// comment on Progression says why: numeric_value&.to_s, the same choice
// test_results_controller.rb makes for the same reason). This is the one
// place that turns one of those strings into a number, and it is only ever
// used to plot a point's position on the chart. first and latest reach the
// screen printed exactly as the server sent them; nothing here does
// arithmetic on them (see changeLabel below for why).
function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// window is a sortable "YYYY-MM" string, so ascending string order is
// chronological order. Sorted here rather than trusted from the payload:
// the API groups battery results by test and height by athlete, neither of
// which guarantees window order, and a chart that silently drew points out
// of order would be worse than one that took the trouble to sort them.
function byWindow<T extends SeriesPoint>(series: T[]): T[] {
  return [...series].sort((a, b) => (a.window < b.window ? -1 : a.window > b.window ? 1 : 0));
}

function toPoints(series: SeriesPoint[]): SparklinePoint[] {
  return byWindow(series)
    .map((entry) => ({ label: entry.window, value: parseNumeric(entry.value) }))
    .filter((entry): entry is SparklinePoint => entry.value !== null);
}

// The verdict is the server's own word (see core/src/types.ts's comment on
// Progression: "change" is "better" | "worse" | "same" | null, not a
// number). This only translates that word into a sentence; it never looks
// at first, latest or direction to decide which word to show.
//
// An earlier version of this screen also rendered a second, independently
// computed verdict here (a "trendTone" derived from direction, first and
// latest, used to color the chart). A contrived fixture proved it could
// disagree with the server's own change: two verdicts about the same
// number that can contradict each other is worse than either alone, since
// a reader has no way to know which to believe. The server is the one that
// knows which direction counts, what a meaningful change is for that
// measure, and what the whole year's data says rather than two endpoints
// of it, so this renders only its word, never a second one of its own.
function changeLabel(change: BatteryMeasure["change"]): string | null {
  switch (change) {
    case "better":
      return "Better than before.";
    case "worse":
      return "Not as good as before.";
    case "same":
      return "About the same as before.";
    default:
      return null;
  }
}

function ratingLabel(rating: DrillRatingValue): string {
  switch (rating) {
    case "not_yet":
      return "Not yet";
    case "getting":
      return "Getting it";
    case "owns":
      return "Owns it";
  }
}

export function Progress() {
  const dispatch = useAppDispatch();
  const data = useAppSelector(progression.selectors.selectData);
  const loading = useAppSelector(progression.selectors.selectIsLoading);
  const error = useAppSelector(progression.selectors.selectError);

  // Fires once, on mount. Nothing here depends on a year id, so unlike
  // Year, Month and ThisWeek there is nothing to wait on before dispatching
  // it, and no dependency that would fire it again.
  useEffect(() => {
    dispatch(progression.actions.fetch());
  }, [dispatch]);

  if (!data) {
    if (loading) {
      return (
        <div className="progress">
          <Loading label={WAKING_LABEL} />
        </div>
      );
    }
    if (error) {
      return (
        <div className="progress">
          <ErrorNote message={error} />
        </div>
      );
    }
    // The fetch above has been dispatched but the store has not caught up
    // in this render yet. Every screen can be asked to render before its
    // own data arrives.
    return null;
  }

  const heightPoints = toPoints(data.height.series);

  // Newest first. A history is read the way a feed is: what happened most
  // recently belongs at the top. Sorted here rather than trusted off the
  // payload for the same reason height and battery windows are: nothing
  // about ranks guarantees an order across two years' worth of awards.
  const ranksByNewest = [...data.ranks].sort((a, b) => (a.awarded_on < b.awarded_on ? 1 : a.awarded_on > b.awarded_on ? -1 : 0));

  // battery only ever holds a measure with at least one recorded result
  // (core/src/types.ts: a battery_measure with zero results is absent from
  // the array entirely), so its own length answers "has anything been
  // tested" without guessing at the full list of measures the program
  // defines. height is the one payload key that is always present even
  // with nothing recorded, so it is judged by its series rather than by
  // whether the height key exists at all.
  const isEmpty =
    data.ranks.length === 0 &&
    data.battery.length === 0 &&
    data.drills.length === 0 &&
    data.height.series.length === 0;

  return (
    <div className="progress">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>Progress</h1>

      {isEmpty ? (
        <p className="progress__empty">Nothing has been measured yet.</p>
      ) : (
        <>
          <section aria-labelledby="progress-height-heading" className="progress__section">
            <h2 id="progress-height-heading">Height</h2>
            {heightPoints.length > 0 ? (
              <Sparkline title="Height over time, in cm" points={heightPoints} />
            ) : (
              <p>No height recorded yet.</p>
            )}
            {/* cm_per_year is null whenever there are fewer than two
                heights, or the dates recorded do not span enough time to
                say. Null is the safe answer here and it renders as
                nothing, never as 0: a pace of zero is a real, different
                claim about a child who has stopped growing. */}
            {data.height.cm_per_year !== null && (
              <p className="progress__pace">Growing about {data.height.cm_per_year} cm a year.</p>
            )}
          </section>

          {data.battery.length > 0 && (
            <section aria-labelledby="progress-battery-heading" className="progress__section">
              <h2 id="progress-battery-heading">Test results</h2>
              {data.battery.map((measure) => (
                <BatteryCard key={measure.test_id} measure={measure} />
              ))}
            </section>
          )}

          {data.ranks.length > 0 && (
            <section aria-labelledby="progress-ranks-heading" className="progress__section">
              <h2 id="progress-ranks-heading">Ranks earned</h2>
              <ol aria-label="Rank history">
                {ranksByNewest.map((rank, index) => (
                  <li key={`${rank.block_key}-${rank.year_label}-${index}`}>
                    <strong>{rank.block_name}</strong>
                    <span>
                      {" "}
                      {rank.year_label}, awarded {rank.awarded_on}
                    </span>
                    {/* Seven of nine patches is the normal bar to rank up
                        (per the program's own rule), not a rank earned
                        short of complete, so this states the count plainly
                        rather than as a fraction of some other total. */}
                    <p>{rank.patch_count} of 9 patches.</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data.drills.length > 0 && (
            <section aria-labelledby="progress-drills-heading" className="progress__section">
              <h2 id="progress-drills-heading">Drills</h2>
              <ul aria-label="Drills">
                {data.drills.map((drill) => (
                  <li key={drill.slug}>
                    <strong>{drill.name}</strong>
                    <p>Where he is now: {ratingLabel(drill.latest)}</p>
                    <ul aria-label={`${drill.name} history`}>
                      {drill.history.map((entry, index) => (
                        <li key={`${drill.slug}-${entry.session_date}-${index}`}>
                          {entry.session_date}: {ratingLabel(entry.rating)} ({entry.year_label})
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BatteryCard({ measure }: { measure: BatteryMeasure }) {
  const headingId = `progress-battery-${measure.test_id}-heading`;
  const points = toPoints(measure.series);
  const verdict = changeLabel(measure.change);

  return (
    <section aria-labelledby={headingId} className="progress__measure">
      <h3 id={headingId}>{measure.label}</h3>
      {/* direction says which way is good for this one measure and it is
          never absent on a battery entry. Between this caption and the
          chart's own shape (falling or rising, drawn straight from the
          numbers with no judgment of its own), the reader has what they
          need to read the chart correctly, without a second sentence
          telling them what to think about it. */}
      <p className="progress__scale">{measure.direction === "lower" ? "Lower is better." : "Higher is better."}</p>
      {points.length > 0 && (
        <Sparkline title={`${measure.label} over time, in ${measure.unit}`} points={points} />
      )}
      <p className="progress__first-latest">
        First: {measure.first ?? "not recorded"} {measure.unit}. Latest: {measure.latest ?? "not recorded"}{" "}
        {measure.unit}.
      </p>
      {verdict && <p className="progress__verdict">{verdict}</p>}
    </section>
  );
}
