import { useEffect, useState } from "react";
import type { DayCard as DayCardPayload } from "@teddy-pe/core";
import { Tokens } from "./Tokens";

// Today's card, on a phone, with a ball in his other hand. Eight blocks of
// prose all open at once is what This Week gives him and it is a long scroll
// with the one he is on somewhere inside it, so this lists all eight and
// opens one.
//
// Controlled by React state rather than by <details name="today-block">,
// which would give exclusive opening for free. Phone browsers a version or
// two back ignore the name attribute and open all eight, which is the exact
// thing this exists to stop, and the degradation would be silent.
//
// `onSelectDrill` passes straight through to Tokens, the same plain callback
// DayCard uses, for the same reason: this file has no more business calling
// useNavigate() than Tokens does, and doing so here would be exactly as
// unportable to the Phase 4 native app.
export function TodayCard({
  day,
  theme,
  onSelectDrill,
}: {
  day: DayCardPayload;
  // The week's theme, handed in rather than reached for: it belongs to the
  // week around this day, not to the day, and this component is meant to
  // lift into the Phase 4 native app on props alone. Optional because a
  // month payload carries no week to take one from.
  theme?: string;
  onSelectDrill: (slug: string) => void;
}) {
  // Undefined, not just empty, is a real shape here: the month payload
  // omits `blocks` entirely, only the week payload fills it in (and only
  // when called with detailed: true), so this has to cover a day that
  // never carried the field, not only one that carried an empty array.
  const blocks = day.blocks ?? [];
  // The first block, open on arrival, because Wake Up is where a session
  // starts and he should not have to tap to begin. Null once he closes it.
  const [openId, setOpenId] = useState<number | null>(blocks[0]?.id ?? null);

  // A parent that swaps `day` without unmounting this component (paging
  // between today and tomorrow, say) keeps whatever `openId` was last set
  // to. Block ids are per-record, so that id almost never belongs to the
  // new day, every block reads closed, and the accordion silently opens
  // nothing on arrival, breaking its own contract for the new day. Resync
  // on `day.id` rather than asking every future call site, web or native,
  // to remember to key this component by day: the same idiom CoachNoteForm
  // and AthleteNoteForm use to reset on a date change.
  useEffect(() => {
    setOpenId(blocks[0]?.id ?? null);
    // Keyed on day.id alone, not on blocks: it is the day changing, not the
    // blocks array's identity, that makes the previous openId stale.
  }, [day.id]);

  return (
    <article className="today-card">
      <p className="today-card__role">
        {day.role} &middot; {day.minutes} min
      </p>

      {/* Under the role and the minutes, and quieter than both. Standing on a
          court he is reading what today is and how long it runs; the theme is
          the frame those sit in, which is worth having on the page and not
          worth having first. */}
      {theme && <p className="today-card__theme">This week: {theme}</p>}

      {day.summary_lines.length > 0 && (
        <ul aria-label="Today's summary" className="today-card__summary">
          {day.summary_lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {day.dad_note && (
        <p className="today-card__dad-note">
          <strong>Note:</strong> {day.dad_note}
        </p>
      )}

      {blocks.length > 0 && (
        <ol aria-label="Today's blocks" className="today-card__blocks">
          {blocks.map((b) => {
            const isOpen = b.id === openId;
            const panelId = `today-block-${b.id}`;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className="today-card__block-toggle"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? null : b.id)}
                >
                  {/* Flattened to plain text, not <Tokens tokens={b.name_tokens} />: the
                      tokenizer runs on block names as well as bodies
                      (body_tokenizer.rb tokenizes both name and body), so a name can
                      carry a drill token, which Tokens renders as a <button>. This
                      toggle is already a button, and a button cannot nest another one
                      without breaking HTML (and this accordion's own button count).
                      Drill links stay live in the block body below, which is where
                      they carry their weight; docs_exporter.rb's `plain` helper flattens
                      tokens the same way for the same reason, run-time here instead of
                      export-time there. */}
                  <span className="today-card__block-name">{b.name_tokens.map((t) => t.text).join("")}</span>
                  <span className="today-card__block-minutes">{b.minutes} min</span>
                </button>
                {isOpen && (
                  <div id={panelId} className="today-card__block-body">
                    <Tokens tokens={b.body_tokens} onSelectDrill={onSelectDrill} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
