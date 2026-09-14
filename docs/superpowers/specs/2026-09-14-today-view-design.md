# Today: the screen Jeff opens on the court

Design, 14 September 2026. Approved in conversation before writing; see
`docs/history/2026-09-14-today-view.md` for the questions and the answers.

## The problem

Jeff is out with Teddy, on his phone, mid-session. He wants three things
and today the app makes each of them a small expedition:

1. **What are we doing.** This Week renders seven day cards, so today's is
   somewhere in a long scroll and eight blocks of prose are all open at once.
2. **Write it up as we go.** Notes is a separate tab, it opens on today but
   nothing is stored until he presses Save at the bottom, so a locked phone
   or a dropped tab loses the session.
3. **Type the test numbers.** Tests is a third tab with a window picker, and
   nothing in the app knows whether a test is due today at all.

He should land on one screen that answers all three, and it should be the
screen the app opens on.

## What Today is

A new route, `/today`, first in the nav, `roles: "any"`, and the app's home.
Sign-in lands there, `/` redirects there, and the `Guarded` fallback in
`routes.tsx` moves from `/year` to `/today`. Both are `"any"` routes, so
that is the same guarantee pointed at the better screen.

Nothing is removed. Year, Month, This Week, Glossary, Progress, Tests,
Journal and Notes all stay exactly where they are and keep doing what they
do. Today is a fourth way into data three existing screens already hold, so
that the common case takes no navigation at all.

Each of the three accounts sees what the API will actually answer for them,
which is the rule `routes.tsx` already follows and documents:

| | activities | coach note | own journal | test sheet |
|---|---|---|---|---|
| Jeff, coach | yes | yes | no | yes |
| Teddy, athlete | yes | no | yes | yes |
| Emily, viewer | yes | no | no | no |

A viewer never fires a fetch that would 403. The role gates the dispatch,
not only the rendering.

## Architecture

The write-forms come out of the three screens that own them today and
become components both Today and those screens render. The alternative was
a self-contained Today that re-types the coach form, and this repo has
already been bitten by hand-copied duplicates twice, both times leaving a
comment saying so: `web/src/lib/scheduling.ts` on `DOW_ORDER` written out
three times, and `web/src/routes.tsx` on the nav and the route guards being
two lists that could only agree by nobody editing one.

```
screens/Today.tsx
  components/TodayCard.tsx        (new: the accordion)
  components/CoachNoteForm.tsx    (out of screens/CoachJournal.tsx)
  components/AthleteNoteForm.tsx  (out of screens/AthleteJournal.tsx)
  components/TestSheet.tsx        (out of screens/Tests.tsx)

screens/CoachJournal.tsx    = date picker + CoachNoteForm + delete
screens/AthleteJournal.tsx  = date picker + AthleteNoteForm + delete
screens/Tests.tsx           = window picker + TestSheet
```

Each extracted component takes the date (or window) it works on as a prop
and owns no opinion about how that date was chosen. That is the whole
difference between the tab and Today: the tab has a picker above it, Today
passes `todayISODate()`.

### Data Today reads

Every payload Today needs is one an existing screen already fetches, so
arriving from This Week or Notes costs no extra round trip.

| duck | what for | role |
|---|---|---|
| `week` | today's day card, via `selectDayByDate` | all |
| `journal` | `fetchCoachEntries` / `fetchAthleteEntries` | coach / athlete |
| `programYear` | `test_dates`, `battery.measures` | coach, athlete |
| `testResults` | `fetchResults` | coach, athlete |

Fetches fire in one effect gated on `currentId !== null`, the same shape
every other screen uses, so a server that takes seven seconds to wake is
asked once.

Emily gets a `currentId` like everyone else, which is worth writing down
because Today is a blank wait without one and she has no athlete record of
her own. `ApiController#athlete_for` falls back to the only athlete when the
table holds exactly one, and it holds Teddy. Nothing here has to special-case
her, and nothing should start to.

## Test dates get real dates

`test_dates` holds `window` ("2026-09"), `label` ("Baseline") and `display`
("Sep 15–17"). The range exists only as prose, so nothing in the app can
answer "is there a test today" without parsing that string, and parsing it
is not something this codebase is going to start doing.

- A migration adds `starts_on` and `ends_on`. The columns are nullable so
  the migration can run against production before the seed does; the model
  validates both as `presence: true`, so nothing can write a row without
  them.
- `backend/content/program_years/2026-27/program.yml` gains both on all five
  windows. It already states them inside `display`.
- **`display` stops being authored and starts being generated.** The seeder
  builds it from the two dates and writes the same column, so the one reader
  downstream is untouched: `web/src/screens/Tests.tsx`, which puts it in the
  window picker. `docs_exporter.rb` reads `.label`, and the Progress panel
  reads neither. The fact is then written once. The formatter handles a window
  inside one month ("Sep 15–17") and one crossing a month ("Jun 28 – Jul 2"),
  with an en dash in both, matching what the YAML says today.
- `ProgramYearPayload#test_dates` sends `starts_on` and `ends_on` as ISO
  strings. `TestDate` in `core/src/types.ts` gains both.

### `selectTestDayFor`

A new pure selector on the test-results duck, exported from core:

```ts
selectTestDayFor(dates: TestDate[], isoDate: string):
  { testDate: TestDate; dayNumber: number; dayCount: number } | null
```

ISO dates compare correctly as strings, so this is a range check and two
subtractions with no date arithmetic and no timezone in it. It is what
gives Today "Baseline test, day 2 of 3" and what makes the whole section
disappear on 18 September.

It lives in core rather than in `web/src/lib/scheduling.ts` because the
Phase 4 native app will want the same answer from the same payload, and
because it belongs beside `selectDefaultWindow`, which is the same kind of
question asked of the same array.

### Deploying it

`CLAUDE.md` is explicit that merging to `main` does not deploy the API.
Vercel rebuilds the web app on every push; the Rails app moves only when
someone runs:

```bash
cd backend && fly deploy -a teddy-pe-api
```

from a checkout of `main`. So there is a window in which the new front end
is live against an API still sending test dates with no `starts_on`. Today
treats a test date missing either field as one it cannot place, which means
no test section rather than a crash. `selectTestDayFor` returns null for
such a row. That behaviour gets its own test, because the window is real
and it is the first thing that will happen after a merge.

## The screen

```
TODAY · Thu 17 Sep
Wall Day · 100-120 min · Stick It

Note: watch his contact point on the backhand.

⌄ Wake Up                        8-12 min
   Animal walk medley, skips, crawls,
   mobility. Never skipped.
› New Thing                     15-20 min
› Fast or Strong                12-15 min
› Tennis or Throw               15-30 min
› Ball Skills                   15-25 min
› Challenge of the Day            5-8 min
› Play                          20-40 min
› Shake Out                        5 min
```

Header: the day's `dow` and `date`, then `role`, `minutes` and the week's
`theme`, then `dad_note` if the card has one. All off the week payload.

`TodayCard` renders one block open at a time, controlled by React state
holding the open block's id, as a `<button aria-expanded>` and a panel.
Native `<details name>` would give exclusive opening for free, and phone
browsers a version or two back ignore the attribute and open all eight, so
this stays explicit and testable. The first block is open on arrival.

Drill tokens keep working exactly as they do on This Week: `TodayCard`
takes an `onSelectDrill` callback and knows nothing about routing, the same
contract `DayCard` and `Tokens` already have, and for the same reason
(Phase 4 has no `useNavigate`).

### The cases it names out loud

The habit this codebase already has, most recently on the Notes drill list:
say which case it is rather than quietly showing something plausible.

| Case | What Today shows |
|---|---|
| Saturday, home program off | The card's own `summary_lines`, which say it |
| Today has no card in the current week | "No card has been written for today yet," and a link to This Week |
| Week still loading | The existing cold-Fly wait line |
| Week could not be reached | `ErrorNote` |
| Program year id still null | `WaitingForYearId` |

The second row covers more than it looks. `weeks/current` falls back to the
year's first week when no week contains today, so a date before the year
starts, after it ends, or inside a month whose cards are not written yet all
arrive here as a week that loaded fine and has no card for today. One
message, honest in all of them.

## Writing as you go

`CoachNoteForm` and `AthleteNoteForm` autosave:

- Text fields (`note`, `pain_note`, `best`, `hard`, `challenge_num`) save on
  blur, and only when the text actually changed. That guard is the one
  `MeasureRow.commit` already uses in `Tests.tsx`, so a field tabbed past
  does not fire a write.
- Radios, checkboxes and drill ratings save the moment one is tapped.
- Every save sends the whole entry, because `saveCoachEntry` is a
  whole-entry upsert keyed on the session date. That is already true of the
  Save button; autosave just presses it more often.

Offline this costs one request, not twenty. The outbox collapses repeated
writes under `coach:2026-09-17` (`core/src/ducks/outbox/reducer.ts`, the
`supersedes` rule), so a whole session written up on a field with no signal
leaves as a single request when the connection returns. Online it is one
small request per field, against an endpoint that upserts.

**Save stays, on Today and on both tabs, and it does a real job.** Autosave
covers the ordinary case and cannot cover the failed one: a write the queue
gave up on will not retry until Jeff happens to touch another field. Save
force-sends the current form state whether or not anything changed, which
makes it the retry. It is labelled Save because that is what he will reach
for, and it is never a control that does nothing.

### What the form says about itself

One status line per form, not one per field, reading real state rather than
an optimistic flag:

| State | Line |
|---|---|
| A save is in flight | "Saving." |
| A write is sitting in the outbox | The existing "Waiting to send" sentence |
| The server has an entry for this date | "Saved 4:12 pm", the local time off `updated_at` |
| Nothing has been written yet | Nothing |

`journalSelectors.selectIsEntryQueued(side, date)` already answers the
second row for both sides, delete included.

### Two consequences, stated plainly

- **Tapping one radio now creates the entry.** Today nothing exists on the
  server until Save is pressed. After this, scoring energy and walking away
  leaves a real row, and the delete control appears with it. That is the
  trade for not losing a session, and it is the right one, but it is a
  change in when a row comes into being.
- **Clearing a field writes the cleared value.** Emptying the note saves
  `null`, as pressing Save on an emptied note does today.

The delete is untouched: still two steps, still at the bottom of the tab
screens, away from anything else. It does not appear on Today at all. Today
is for the session in front of him, and an irreversible act does not belong
on the screen he is tapping one-handed between drills.

## Test results on Today

When `selectTestDayFor` places today inside a window, a section appears
below the note, rendering `TestSheet` with the window fixed and no picker:

```
── Baseline test · day 2 of 3 ──────────
20m sprint (s)            [ 4.42 ]  saved
Standing broad jump (cm)  [ 128  ]  saved
Dead hang (s)             [      ]
...
                                7 blank
```

The rows already save on blur and already queue offline, so this is
composition and not new behaviour. The count of what is still blank goes at
the bottom, because the battery runs across three days and what is left is
the thing worth knowing while standing on the court with a stopwatch.

Outside a window there is no section and no heading. A window with no
measures seeded says so, the sentence `Tests.tsx` already has.

## Testing

Test-first throughout.

**`backend/`**
- Migration and model: a `TestDate` without `starts_on` or without `ends_on`
  is invalid.
- Seeder: the five windows seed with both dates; `display` is generated and
  matches what the YAML used to state; a window crossing a month formats
  with both month names; re-seeding stays idempotent.
- `ProgramYearPayload`: both fields present and ISO.
- `content_spec.rb`: every `test_dates` row in `program.yml` carries both,
  and `ends_on` is not before `starts_on`.

**`core/`**
- `selectTestDayFor`: inside a window on the first, middle and last day;
  outside every window; empty array; a row missing either field returns
  null; windows that touch but do not overlap.

**`web/`** (`__tests__/today.test.tsx`, plus edits to the three screen
suites the extractions come out of)
- Renders today's card, its role, minutes and dad note, and only today's.
- The accordion opens one block and closes the last; the first is open on
  arrival; a drill token navigates to the glossary.
- Each of the five named cases renders its own message.
- Coach sees the coach form and not the athlete's; athlete the reverse; the
  viewer sees neither form, no test sheet, and fires neither fetch.
- Blurring a changed text field saves; blurring an unchanged one does not;
  tapping a radio saves.
- Save re-sends when nothing has changed.
- The test section appears on a test day and not the day after; a test date
  with no `starts_on` shows no section.
- `bundle-privacy.test.ts` keeps passing: every string Today adds is about
  the app, never about the program. Block names and prose come from the API.

## Files

**`backend/`** a migration, `app/models/test_date.rb`,
`app/services/content_seeder.rb`, `app/services/program_year_payload.rb`,
`content/program_years/2026-27/program.yml`, specs.

**`core/`** `src/types.ts`, `src/ducks/testResults/selectors.ts`,
`src/ducks/testResults/index.ts`, `src/index.ts`, tests.

**`web/`** `src/screens/Today.tsx`, `src/components/TodayCard.tsx`,
`src/components/CoachNoteForm.tsx`, `src/components/AthleteNoteForm.tsx`,
`src/components/TestSheet.tsx`, `src/routes.tsx`, `src/screens/CoachJournal
.tsx`, `src/screens/AthleteJournal.tsx`, `src/screens/Tests.tsx`,
`src/styles.css`, tests.

**`docs/`** `decisions.md` (Today as home, the two test-date columns, the
generated `display`, autosave with Save as the retry, when an entry row
comes into being), `architecture.md` (Today in "How the program reaches
Teddy"), `context.md` (the tab list in "How the program is run"),
`status.md`, `history/2026-09-14-today-view.md`.

## Out of scope

- Ticking blocks off as done. It was offered and not taken, and it needs
  storage that does not exist.
- A date picker on Today. Today is today; the tabs back-fill.
- Changing what This Week, Year, Month, Progress or the Glossary render.
- The 20px horizontal overflow on the Year tab, which is open and unrelated.
