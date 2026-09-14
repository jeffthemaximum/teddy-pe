# Phase 2c: the screens that write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the web app with the screens that put something into the year rather than read it out: both journals, the test sheet, the cross-year charts, and the delete Jeff asked for. Then deploy it and show what a stranger can see.

**Architecture:** Same as Phase 2b. The app owns screens and styling; `core/` owns every duck, selector and payload type, because Phase 4's native app imports the same ones. One task here reaches into `backend/` as well, because a delete needs an endpoint and a button built against each other.

**Tech Stack:** Vite 5, React 18.3, TypeScript 5.3, Vitest with React Testing Library. Rails 8 for the one backend task. No charting library: the progression charts are small, the data is a handful of points per measure, and a library would be a dependency in the bundle for something that is forty lines of SVG.

**Spec:** `docs/superpowers/specs/2026-09-13-rewrite-design.md`, and the brief at `docs/rewrite-prompt.md`.

**Follows:** Phase 2a built `core/`, Phase 2b built the shell and the read screens.

## Global Constraints

- **Nothing about Teddy in the bundle.** `web/__tests__/bundle-privacy.test.ts` builds the app and reads it. It has already caught one implementer hardcoding a program word into JSX. Program vocabulary arrives as API data.
- **No duck may be redefined.** If a screen needs state logic `core/` does not expose, change `core/` and say so. Do not write it in the app.
- **The share toggle is a promise to a child.** `AthleteEntry.shared` false means Jeff cannot see it. The API enforces it, `core/` passes it through untouched, and the screen must never compute it. A viewer sees no journal at all.
- **The server sleeps.** 6.6 to 7.6 seconds cold, measured in production. Every screen shows a real loading state, and a null `current_program_year_id` is a state that persists when `/me` failed for a reason other than a 401. `Year.tsx`, `Month.tsx` and `ThisWeek.tsx` all answer it the same way; follow them.
- **Teddy is 7.** His journal and the drill ratings are his. Big targets, few words, his own cue language.
- **Voice**, per `CLAUDE.md`: direct, warm, specific. No em dashes. No "it's not X, it's Y".
- **Test quality.** This project has found twenty-two assertions that passed while checking nothing and **thirteen** correct assertions sitting against fixtures that could not produce the failure. Two tells: a test that builds its own version of the thing under test stops being able to fail, and a fixture whose values coincide cannot distinguish them. Every task below names its own trap.

---

## Task 1: The coach's journal

**Files:** create `web/src/screens/CoachJournal.tsx`, `web/__tests__/coach-journal.test.tsx`; modify `web/src/routes.tsx`.

Jeff's notes on a session: a note, an overall and an energy rating, a pain flag with a note, the challenge number, and per-drill ratings. One entry per day, upserted on the server by user, year and date.

**What `core/` gives you:** `journalActions.saveCoachEntry`, `journalActions.fetchCoachEntries`, `journalSelectors.selectCoachEntryFor(date)`, `selectIsSaving(date)`, `selectJournalError`, and the types `CoachEntry`, `SaveCoachEntryPayload`, `DrillRatingValue`.

**`DrillRatingValue` is the string enum `"not_yet" | "getting" | "owns"`.** Never a number. A form writing 1, 2, 3 would fail server-side validation on every save with a message nobody can act on.

Tests: it lists recent entries; it opens a day's entry filled in when one exists; it saves what was typed; ratings are the three named values and nothing else; a save in flight disables the button for **that day only**; a failed save shows the API's message; an offline save says it is queued rather than failing.

**The fixture trap:** a form test with one drill cannot prove ratings are keyed per drill. Use three, and set two of them to different values.

## Task 2: Teddy's journal, and the toggle

**Files:** create `web/src/screens/AthleteJournal.tsx`, `web/__tests__/athlete-journal.test.tsx`; modify `web/src/routes.tsx`.

His own page. A note, and one control that decides whether Dad sees it.

**What `core/` gives you:** `journalActions.saveAthleteEntry`, `fetchAthleteEntries`, `setShared`, `journalSelectors.selectAthleteEntryFor(date)`, and `AthleteEntry`, `SaveAthleteEntryPayload`.

**The toggle is the whole task.** It defaults to not shared, so sharing is something he does rather than something he must remember to undo. The screen shows plainly which state it is in, in words a 7-year-old reads. It never computes `shared`; it renders what the API returned and dispatches `setShared` to change it.

`core/` already handles the hard part, and the screen must not undo it: if he types a note with no signal and then taps share, `setShared` carries the pending note forward out of the outbox queue so the toggle does not replace his unsent words. That was a Critical in Phase 2a. Do not reimplement it here.

Tests: an unshared entry says so in plain words; tapping share dispatches `setShared` and nothing else; the note survives a toggle; a saved entry reopens with its own text; an offline save is queued; the screen never renders another person's entry.

**The fixture trap:** a toggle test where the entry's `shared` starts false and ends true proves nothing about a screen that always displays "not shared". Assert both states render differently, from the API's value.

## Task 3: The test sheet

**Files:** create `web/src/screens/Tests.tsx`, `web/__tests__/tests-screen.test.tsx`; modify `web/src/routes.tsx`.

Five windows a year, ten tests, fifteen recordable measures, height at every window. Jeff types these on a court with a stopwatch in his hand.

**What `core/` gives you:** `testResultsActions.fetchResults`, `saveResult`, `testResultsSelectors` including `selectDefaultWindow(dates, today)`, and `TestResult`, `TestDate`, `SaveResultPayload`.

Three things this screen must get right, all of which `core/` already implements and the screen must simply respect:

1. **The window is already chosen when the sheet opens.** `selectDefaultWindow` picks the window today sits in, otherwise the nearest, keeping the earlier on a tie.
2. **Send the raw value he typed.** The API stores `raw_value` and derives the number itself. A range like "15 to 18" is a real thing to type into a balance test. Parsing on the client loses it.
3. **Clearing a box deletes the row.** An empty value is how a mistyped number is taken back, and the API answers that with a different shape. `core/` handles both; the screen must show the measure as empty afterwards rather than as its old value.

Tests: the current window is preselected; typing and blurring saves; clearing removes the value; a save in flight marks that measure only; `numeric_value` is a string from the server and is never used for arithmetic in the screen.

**The fixture trap:** test dates three months apart admit no tie, so a default-window test cannot exercise the tie rule. That is `core/`'s tested behaviour, so do not retest it here; test that the screen uses it.

## Task 4: The progression charts

**Files:** create `web/src/screens/Progress.tsx`, `web/src/components/Sparkline.tsx`, `web/__tests__/progress.test.tsx`; modify `web/src/routes.tsx`.

The point of keeping the numbers: height over time, each battery measure across every year, rank history, and per-drill mastery.

**What `core/` gives you:** `progression.actions.fetch()`, `progression.selectors`, and `ProgressionPayload`.

**A warning carried from Phase 2a.** `ProgressionPayload`'s `ranks`, `battery` and `drills` are typed `unknown[]` because production has no awards or results yet and nobody would invent a shape they had not seen. **Before building this screen, seed a program year with real results and awards and capture the actual payload**, then type it properly in `core/` and say what you found. Building a chart against `unknown[]` means guessing, and guessing is what this whole project has spent the night not doing.

`numeric_value` is a **string** from the API. Parse it at the edge of the chart, once, and say where.

**Direction matters.** Each measure carries `direction`, and lower is better for a sprint while higher is better for a jump. A chart that draws both the same way tells Jeff his son got worse when he got faster.

Tests: height renders in window order; a measure with no results renders as no data rather than as zero; a measure where lower is better reads as improving when the number falls; the growth pace shows nil rather than a wrong number when it cannot be computed.

## Task 5: The soft delete, server and client together

**Files:** `backend/` migration, `athlete_entries_controller.rb`, `coach_entries_controller.rb`, policies, serializers, `docs_exporter.rb`, request specs; `core/src/ducks/journal/*`; `web/src/screens/{Athlete,Coach}Journal.tsx`.

This is the thing Jeff asked for on the night of 13 September and it has been owed since. It was deliberately not built earlier, because an endpoint with no button gets designed against an imagined interaction.

**His decision, verbatim in intent:** he and Teddy can each delete their own entries, a delete sets `deleted_at` rather than removing the row, and the row keeps every word.

Three consequences, already reasoned through in `docs/decisions.md` and not to be relitigated:

- **A soft-deleted entry is excluded everywhere an unshared one is**, through the same single place per layer, never a second filter beside it.
- **The export's prune becomes reachable.** `DocsExporter` learned to remove a file whose source is gone, and until now nothing could perform a deletion. Teddy deletes an entry, the next export drops it from `docs/`.
- **The repo and the database deliberately disagree.** The row keeps the words; the committed prose loses them. A child who deleted something did not consent to it being the memory of the year.

Each person deletes only their own. Teddy cannot delete Dad's notes; Dad cannot delete Teddy's entries.

**Build the endpoint and the button in one task, and test them against each other.** Phase 2a's rule stands: a client written against an imagined route has its test mock the call and pass while the real thing 404s.

## Task 6: Styling, and a screen a 7-year-old can use

**Files:** `web/src/styles.css`, and markup adjustments across the screens.

The app currently has no CSS. Every screen renders as unstyled markup, which is not a polish gap: the brief states that Teddy is 7 and This Week is the screen he opens, so it needs big targets and few words.

This is deliberately late, because styling written before the screens exist is styling written twice.

Tests are thin here by nature. What is testable: tap targets on Teddy's screens meet a minimum size; the current day and the current block are distinguishable by more than colour; nothing depends on colour alone; the app is usable at phone width.

## Task 7: Deploy, and show what a stranger sees

**Files:** `web/vercel.json`, `docs/`.

The web app goes to Vercel, pointed at the deployed API, with `VITE_API_URL` set and `WEB_ORIGIN` set on the Fly app so CORS admits it. Neither is set today.

**The Phase 2 gate obligation lives here.** The brief requires showing what an unauthenticated visitor can see. The bundle test proves nothing about Teddy is in the JavaScript; this proves the running site behaves. Open the deployed URL signed out and record what renders, then fetch every API route with no token and record the answers. Phase 1 did exactly this against the API and got twelve 401s; do it again against the site.

**This task needs Jeff.** A Vercel deploy and a CORS change to a live API are his to approve, and the accounts already exist.

---

## Self-review

**Spec coverage.** The brief's Phase 2 names login, Year, month, This Week with day cards, glossary, both journal forms, and cross-year progression charts. Phase 2b covered the first five; Tasks 1, 2 and 4 here cover the rest. Task 3 is the test sheet, which the old page had and the brief assumes. Task 5 is Jeff's delete. Tasks 6 and 7 are the two gate obligations: a screen his son can actually use, and proof of what a stranger sees.

**Gaps recorded rather than hidden.**

- **Task 4 cannot be built as written until the progression payload is real.** It is typed `unknown[]` in three places. The task's first step is to seed and capture, and it must not be dispatched before that is done.
- Tasks 1, 2 and 3 give test intent rather than full test bodies, as Phase 2b's plan did for its later tasks. That was a real weakness there and the fix worked: the tests were written into each dispatch from the actual component API. Do the same here, and do not dispatch a task until its tests are written out.
- Task 6 has the thinnest tests in either plan. Say so at the gate rather than implying the styling is verified to the standard everything else is.

**Type consistency.** Every type named here is exported from `core/src/index.ts` under the name used, except `ProgressionPayload`'s three `unknown[]` members, which Task 4 exists partly to fix.
