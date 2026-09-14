# Working session, Monday 14 September 2026: Today, the screen he opens on the court

## What Jeff asked

A quick view for his phone while he is out with Teddy: the day's activities, the journal for that day so a session is not lost before it gets written up, and the test results when a test happens to be due. Today, This Week, Notes and Tests each already held a piece of this, in three different tabs behind a scroll, a picker and a Save button at the bottom.

## What got built

`/today`, a new route and the app's home. Design in `docs/superpowers/specs/2026-09-14-today-view-design.md`, built as twelve tasks off `docs/superpowers/plans/2026-09-14-today-view.md`, each reviewed before the next began. Nothing already built was removed: Year, the month, This Week, Progress, Tests, both journals, Notes and the Glossary all still exist and still do what they did. Today reads the same data a fourth way, so the common case (what is today, write it up, type the numbers) takes no navigation at all.

The write-forms came out of the screens that already owned them (`CoachJournal`, `AthleteJournal`, `Tests`) and became components both the tab and Today render, rather than a second, hand-copied form living only on Today. `test_dates` gained real `starts_on` and `ends_on` columns, backed by a new selector in `core/`, `selectTestDayFor`, that answers "is today inside a window, and which day of it" from the two dates and today's ISO string, nothing else.

Suites at the end: `backend/` 319 examples, `core/` 271 tests, `web/` 327 tests, all three clean and typechecking clean.

## The five choices he made

- **Today as home, over a plain extra tab.** A fifth tab holding the same three things would still have made him choose it every time he opened the app. Making it the app's home, first in the nav and where sign-in and a refused route land, means the screen he wants is simply what is there.
- **Inline autosaving, over a link out to the existing journal screen.** A link would have solved "find the form" and done nothing for "the phone locked before Save." Autosave writes as he goes; the form lives on the screen he is already on.
- **Adding real dates to `test_dates`, over showing the sheet all month.** Showing every test all the time would have answered "can he get to the sheet" without answering the actual question, which is whether one is due today. That needed dates the database did not have.
- **An accordion, over tick-off boxes or a fully expanded card.** Ticking off blocks needs storage that does not exist yet and answers a question ("what's done") nobody asked. A fully expanded card is what This Week already does, and is the long scroll Today exists to fix. One block open at a time is the shape that fits a phone and a short glance between drills.
- **All three accounts, over coach-only.** Today is not only Jeff's screen. Teddy gets his own journal on it and Emily gets the day's card with no write control at all, the same rule the rest of the app already follows: a screen shows only what the API will actually answer for that person.

## The one he corrected

Save was offered to him as something that could become a no-op once autosave existed, since autosave already covers the ordinary case. He said it would still work, and to leave it in. He was right: autosave cannot cover the one case that matters most, a write the offline queue already gave up on. That write does not retry on its own until a field is touched again. Save became that retry, a button that force-sends the current form whether or not anything has changed, on Today and on both tabs.

## Two things the code said that the design had assumed wrongly

- The design pictured `AthleteJournal` needing a date picker added so Today's version of it could be built from the same piece. Reading the screen first showed it already opens on `todayISODate()` with no picker at all; it had been today-only from the start.
- A comment in the athlete save path claimed core's request builder drops `felt`, `best` and `hard` before they reach the server. It was stale. Core sends all seven fields on every save, and the comment was corrected to say so, pointing at the actual function that does it.

## The deploy note

Merging to `main` rebuilds the web app on Vercel by itself, but it does not deploy the Rails API. `test_dates.starts_on` and `.ends_on` only reach production when the seeder runs, and the seeder runs on a Fly deploy, not on a merge. So there is a real window after this lands where Today is live and correct and shows no test section at all, because the server it is talking to has not sent the two new fields yet. That is what Today is built to do when a test date is missing either one: no section, not a crash. `cd backend && fly deploy -a teddy-pe-api` is what closes the window, and it is Jeff's to run, from a checkout of `main`, after the merge.
