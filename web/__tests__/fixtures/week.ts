import type { WeekPayload, DayCard } from "@teddy-pe/core";

// The current week's fixture, shared by this-week.test.tsx and today.test
// .tsx. It lives in its own module, not inside either test file, because a
// module that both files import runs once per file that pulls it in; a
// module that is itself a *.test.tsx file runs its own describe/it blocks a
// second time wherever it is imported, which is not something either suite
// wants of the other. One file, imported by both, is the only way to reuse
// this without writing a second week that has to be kept in step with the
// first (the reason today.test.tsx needs it at all: see its own header).
//
// Built from the real shape (core/src/types.ts's Week and DayCard, verified
// against backend/app/services/week_payload.rb, which is the one place
// that fills in blocks, dad_note, coach_entry and athlete_entry: only when
// called with detailed: true, which is what weeks_controller.rb's
// #current does and plans_controller.rb does not).
//
// The seven days are deliberately spread one concern per day rather than
// piled onto one or two, so each test's day is not incidentally also the
// fixture for a different test: Wednesday is the only day pinned as
// "today" and carries no dad_note and no blocks; Thursday is the only day
// with blocks; Friday is the only day with a dad_note; Saturday is Game
// Day, blocks: [] and no dad_note, carrying only the summary line the API
// sends for a day with nothing organized. A bug that only showed up when
// two of these lived on the same day would not be caught otherwise.
//
// Spend (32) and budget (40) are different numbers, on purpose, so a
// component that printed one of them twice cannot pass the spend/budget
// test by accident (the same defect noted in month.test.tsx). Neither
// number reappears elsewhere in the fixture (no day's hie, minutes, or
// block minutes is 32 or 40), so the assertion cannot match the wrong
// thing either.

function day(overrides: Partial<DayCard> & Pick<DayCard, "id" | "dow" | "date" | "name" | "role">): DayCard {
  return {
    minutes: "60 to 90",
    intensity: 2,
    hie: 0,
    summary_lines: [`${overrides.name} notes`],
    drill_slugs: [],
    ...overrides,
  };
}

// `name` deliberately differs from what `name_tokens` renders. Both are
// real columns on the block (backend/app/services/week_payload.rb tokenizes
// `name` and `body` into `name_tokens` and `body_tokens` at read time, and
// the raw column still carries whatever markup the tokenizer strips), so a
// fixture where they read the same lets a component that renders the raw
// `name` instead of `<Tokens tokens={name_tokens} />` pass by accident. The
// body half of this block has no such trap: DayBlock carries no plain
// `body` field to fall back to, only `body_tokens`.
const TODAY_BLOCK = {
  id: 501,
  position: 1,
  minutes: "20",
  name: "<b>Rings Intro</b>",
  tag: null,
  name_tokens: [{ text: "Rings Intro", type: "text", style: "bold" }],
  body_tokens: [
    { text: "Hang and swing, ", type: "text", style: "plain" },
    { text: "both hands", type: "text", style: "plain" },
    // A drill token, the one type Tokens.tsx renders as something tappable
    // (see tokens.test.tsx). This is what "takes you to the glossary when
    // you tap a drill token" tests (in both files) actually taps.
    { text: "Rings Hang", type: "drill", style: "plain", slug: "rings-hang" },
  ],
  drill_slugs: ["rings-hang"],
};

// Shuffled out of weekday order on purpose, the same reasoning as
// month.test.tsx: a component that forgot to sort can only fail this way.
export const WEEK: WeekPayload = {
  id: 201,
  number: 1,
  position_in_block: 1,
  theme: "Baseline & Land",
  dates_display: "Sep 14 to Sep 20",
  targets: ["Tennis: drop-feed rally", "Basketball: 200 dribbles", "Soccer: 300 touches"],
  challenge: "Silent Landings.",
  trials: false,
  block_key: "cub",
  high_intent_efforts: 32,
  budget: 40,
  days: [
    day({ id: 1006, dow: "sat", date: "2026-09-19", name: "Game Day", role: "Game Day", minutes: "0", hie: 0, summary_lines: ["Home program off"], blocks: [] }),
    day({ id: 1001, dow: "mon", date: "2026-09-14", name: "Land Like a Cat", role: "Floor Day", hie: 5 }),
    day({ id: 1004, dow: "thu", date: "2026-09-17", name: "Wall & Ball", role: "Wall Day", hie: 8, blocks: [TODAY_BLOCK] }),
    day({ id: 1002, dow: "tue", date: "2026-09-15", name: "Rings Work", role: "Rings Day", hie: 3 }),
    day({ id: 1007, dow: "sun", date: "2026-09-20", name: "Ceremony", role: "Court Day", minutes: "30 to 45", hie: 0 }),
    day({
      id: 1005,
      dow: "fri",
      date: "2026-09-18",
      name: "Skate & Stick",
      role: "Skate Day",
      minutes: "45 to 60",
      hie: 4,
      dad_note: "Watch his front foot on the plant.",
    }),
    day({ id: 1003, dow: "wed", date: "2026-09-16", name: "Test Day", role: "Fast Day", hie: 9 }),
  ],
};
