import { useState } from "react";
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
  onSelectDrill,
}: {
  day: DayCardPayload;
  onSelectDrill: (slug: string) => void;
}) {
  const blocks = day.blocks ?? [];
  // The first block, open on arrival, because Wake Up is where a session
  // starts and he should not have to tap to begin. Null once he closes it.
  const [openId, setOpenId] = useState<number | null>(blocks[0]?.id ?? null);

  return (
    <article className="today-card">
      <p className="today-card__role">
        {day.role} &middot; {day.minutes} min
      </p>

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
