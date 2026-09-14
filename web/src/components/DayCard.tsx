import type { DayCard as DayCardPayload } from "@teddy-pe/core";
import { Tokens } from "./Tokens";
import { dowLabel } from "../lib/scheduling";

// This is the screen Teddy opens. One card, one day, his own cue language:
// big targets, few words. The role and minutes come first because those
// are the two things CLAUDE.md fixes for every day (Mon Floor, Tue Rings,
// Wed Fast, Thu Wall, Fri Skate, Sat Game Day, Sun Court) and the two a
// 7-year-old needs before anything else.
//
// `summary_lines` is what both the month and week payloads always carry,
// even on a day with no blocks at all (Game Day: the home program is off,
// and the API says so right there, the same field Month.tsx already
// renders). Rendering it here means Saturday shows why it is quiet instead
// of showing nothing, without this file ever having to know which day of
// the week that is.
//
// `onSelectDrill` only passes through to Tokens, the same plain callback
// shape, for the same reason: this file has no more business calling
// `useNavigate()` than Tokens does, and doing so here would be exactly as
// unportable to the Phase 4 native app.
export function DayCard({
  day,
  isToday,
  onSelectDrill,
}: {
  day: DayCardPayload;
  isToday: boolean;
  onSelectDrill: (slug: string) => void;
}) {
  const headingId = `day-card-${day.id}-heading`;

  return (
    <article
      className={isToday ? "day-card day-card--today" : "day-card"}
      aria-labelledby={headingId}
      aria-current={isToday ? "date" : undefined}
    >
      {isToday && <p className="day-card__today-flag">Today</p>}
      <h3 id={headingId}>
        {dowLabel(day.dow)} &middot; {day.name}
      </h3>
      <p className="day-card__role">
        {day.role} &middot; {day.minutes} min
      </p>

      {day.summary_lines.length > 0 && (
        <ul aria-label={`${dowLabel(day.dow)} summary`}>
          {day.summary_lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {day.dad_note && (
        <p className="day-card__dad-note">
          <strong>Note:</strong> {day.dad_note}
        </p>
      )}

      {day.blocks && day.blocks.length > 0 && (
        <ul aria-label={`${dowLabel(day.dow)} blocks`} className="day-card__blocks">
          {day.blocks.map((block) => (
            <li key={block.id}>
              <strong>
                <Tokens tokens={block.name_tokens} onSelectDrill={onSelectDrill} />
              </strong>
              <span className="day-card__block-minutes"> {block.minutes} min</span>
              <p>
                <Tokens tokens={block.body_tokens} onSelectDrill={onSelectDrill} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
