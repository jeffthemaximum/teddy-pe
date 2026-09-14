# Decision log

A record of the planning conversation, the pushbacks, and what Jeff decided. Newest at the bottom. Add to this file whenever the program changes direction.

## 2026-09-13: Initial planning session

**Context Jeff gave.** Homeschooled 7 year old (Teddy). Wants 90 to 120 minutes daily of fun, play-based but demanding activity, progressing toward concrete improvement in key areas, with a weekly goal per area and a fun daily way to reach it. Deliverables: a yearly skills-progression visual, a monthly visual for September, daily plans for one week, regenerated as needed.

**Pushbacks raised and how they resolved.**

1. *The speed workout is an adult protocol.* Accepted. Volume cut to a third, disguised as games.
2. *Daily "demanding" is the wrong target; intensity must wave.* Accepted. Week runs 1 high home day (Wed), 2 moderate (Tue/Thu), 2 low (Mon/Fri), Saturday off from the home program, Sunday a 20-minute quick card.
3. *The original plan sampled narrowly (tennis plus linear sprint/jump).* Accepted. Added tumbling, hanging/rings, both-arm throwing, skateboard balance, rhythm work, water.
4. *"Concrete improvement" needs a measured battery.* Accepted. 8 tests, baseline plus four retests.
5. *Total load.* Teddy already has 8 to 9 hours a week organized (tennis 4h, soccer, lacrosse, gymnastics, swim). Adding a full 90 to 120 min daily block puts him at 18 to 23 hours a week. Recommendation was to absorb existing activities and supplement the gaps. **Jeff chose to treat soccer, lacrosse and swim as play rather than training load.** Resolution: the program budgets high-intent efforts per week rather than hours, so his choice is honored while Sunday/Monday/Friday home work stays low-impact regardless. Swim as recovery is accepted as legitimate; soccer and lacrosse are still cleated cutting sports and are treated that way in the day-role design.
6. *Yellow balls at 7 work against correct form.* Accepted. Ball progression is gated on skill. Teddy is on green; the active gate is green to controlled yellow exposure. Full-court yellow match play is held this year.

**Decisions.**

- Objective: general athleticism first, tennis prioritized slightly above the rest. Long horizon: compete at the highest levels at 20, not precocious at 8.
- Schedule shape: 5 structured + 2 open, mapped onto fixed day roles around the organized calendar.
- Jeff coaches and participates. His running is limited in fall and ramps through winter; fall sessions keep him stationary.
- Measurement: formal battery quarterly, with a smaller fun weekly challenge that feeds a battery item.
- Motivation: levels/ranks (Cub, Fox, Coyote, Wolf, Puma, Cheetah), five of seven patches to rank up.
- Weekly goal: one theme with 3 to 4 sub-targets, always including one tennis sub-target.
- Format: an interactive web page Jeff can reopen and regenerate from, mirrored to his own Vercel site.
- Move to West Chester, PA in November: assume all five organized activities continue uninterrupted, and that Riverside rings and the skate park remain available all year.
- Tennis focus strands: forehand and backhand form, footwork, gated ball progression, match play (point construction).

**Open.**

- Baseline test numbers (Sep 15 to 17) to be charted once recorded.
- Teddy's exact birthday, for the age-in-hours guideline and next year's plan.
- One-hand vs two-hand backhand to be settled in the Fox block with his coach.

## 2026-09-13 (later): future champion framing, basketball and soccer, more volume

**What Jeff asked for.** Dedicated year-round basketball skill development (dribbling, footwork, passing) and dedicated soccer skill development. More volume ("Teddy can have a lot of volume"; Monday can be longer than 45 minutes). Plan for a future champion, most likely in tennis, possibly a very high level basketball player or soccer goalkeeper; prepare him physically and mentally now. Very tall, very athletic parents and family. Delivered as a branch for review.

**Pushback and resolution.**
- *"Future champion" does not mean train him like one now.* The evidence on world-class adults (Güllich et al. 2022) is that they sampled more, specialized later and hit junior milestones later than national-level peers. Planning for a champion at 7 means wider, not narrower. Jeff's request for three deliberate ball sports is exactly that, so this is agreement with a sharper rationale, written into the north star.
- *More volume, yes, as technical volume.* Hundreds of dribbles, touches and swings cost little recovery and are where champions separate. Sprints, jumps and max throws stay on the high-intent budget. Monday goes to 60 to 90 minutes, Tuesday to 75 to 90, Sunday to 30 to 45, all of the added time technical.
- *Tall frame.* Height recorded at every test date. A growth-rate jump is the trigger to halve jumping and sprinting for 8 to 12 weeks. Written into the architecture so it is not forgotten in 2029.

**Changes.**
- Two new areas: Basketball (Handle, Footwork, Pass, Shoot) and Soccer (Touch, Pass, Keeper). Play & Compete renamed Compete & Mindset with a deliberate mental-skills progression per block and a daily Champion's Log.
- Nine areas, nine Cub patches, 7 of 9 to rank up.
- Battery grows to 10 tests plus height: basketball cone weave and soccer wall passes added.
- Day roles updated with ball-skill blocks; weekly sub-targets now always include tennis, basketball and soccer.
- September weeks 1 to 3 and Week 1 daily cards regenerated with the new blocks and tests.

**Open.**
- Whether the November move changes any facility access (currently assumed: none).
- Youth basketball size (27.5 in) and a mat for keeper dive progressions in the Fox block.

## 2026-09-13 (evening): drill glossary and the coach's diary

**What Jeff asked for.** Two features. First, a way to find out what an activity actually is from the daily view: he read "toe taps 30s, tick-tocks 30s, sole rolls 30s" and did not know what a tick-tock was. He asked for options, including a clickable description or a gif. Second, a coach's diary he fills in regularly, describing how Teddy is doing, which then feeds plan updates. Delivered on a branch for review.

**What the options were and what was chosen.**

1. *Where the explanation appears.* Inline expansion, a tooltip, a bottom sheet, or a glossary tab. **Chosen: bottom sheet plus a glossary tab.** A tooltip cannot hold a real how-to, and inline expansion shoves the card around exactly when he is mid-session. The sheet answers the question where it is asked; the tab is for reading ahead.
2. *Media.* Text only, text plus an outbound video link, hand-built SVG animations, or clips of Teddy. **Chosen: text plus an optional video link.** Recommended against SVG animations: a guessed animation of something like a collapse dive is worse than a clear sentence. Clips of Teddy remain the best long-term option and the schema has a field waiting for them. Constraint that decided this: the claude.ai artifact runs under a CSP that blocks external images and video outright, so a remote gif would work on Vercel and silently show nothing on the artifact. A link is not an embed, so it works in both.
3. *Where diary entries are written.* In-page form saving locally with an export, repo and conversation only, or a real backend. **Jeff chose the real backend.** The recommendation had been the local-plus-export version, on the grounds that a backend ends the zero-build static setup and adds a second source of truth. Jeff picked the backend knowing those costs, so the design absorbs them: entries sync through Neon, and `tools/diary_pull.py` pulls them into `data/diary.json` so the repo stays the memory of the project.
4. *Store.* Writing to the repo through the GitHub API, Vercel KV, or Neon Postgres. **Chosen: Neon Postgres**, with a shared passphrase in a Vercel env var protecting both reads and writes.
5. *How much authority the diary has.* **Chosen: proposals only.** Entries never edit a plan by themselves.

**Decisions.**

- One drill registry, `data/drills.json`, underpins both features. Nothing in the data identified an individual activity before this; weeks, days, areas and tests had identifiers, drills did not. The glossary attaches explanations to a drill id and the diary attaches ratings to the same id.
- Terms are linked into cards at build time by matching names and aliases against the prose, longest match first, first mention per block only. Plan JSON stays plain prose, so every month generated from here inherits the glossary with no extra authoring. The aliases exist because the same drill is already written several ways in the data: drop feed and drop-feed, bear walk and bear crawl, hollow hold and hollow holds.
- The build reports any card block where no drill matched, so gaps are visible rather than silent. It never fails on a missing entry.
- 84 entries seeded, covering what is already written. The full year implies roughly 250, added month by month as plans are generated.
- Diary entries save to the device first and sync after, because the place these get filled in is a field with one bar of signal. The entry id is derived from the session date and the device, so a queued retry updates rather than duplicating.
- The diary rates drills from that day's card, which is why the two features were built together rather than in sequence.
- Adjustment rules: three sessions of "owns it" progresses or retires a drill, three of "not yet" drops to an easier entry point, any pain flag triggers the growth-load protocol already in the architecture. The invariants in CLAUDE.md are out of reach of the diary: day roles, the high-intent effort budget, touches rather than sprints, and the ball gates. Accepted adjustments are appended here with the date.

**Open.**

- Jeff to create the Neon database and set `DATABASE_URL` and `DIARY_PASSPHRASE` in Vercel. The feature is dormant and returns a clear message until then.
- Whether to start filming Teddy for the clip field, which would also make a form record across the year.
- The Year tab has a pre-existing 20px horizontal overflow at phone width, from a timeline marker. Not introduced by this work and not fixed here.

## 2026-09-13 (later): one entry per day, database only, whole site gated

**What Jeff reported.** He wrote a diary entry on his computer on the Vercel site, synced it, saw it in the database, and it survived a refresh. Then he opened the site on his phone and the day's entry was not there.

**Cause.** The entry id was `e-<date>-<device>`, where the device part was a random salt generated per browser and kept in that browser's `localStorage`. Two devices therefore wrote two different rows for the same day, and the form prefilled from the local log rather than from the database, so the phone had nothing to show. The local-first design that made offline capture work is exactly what broke cross-device editing.

**What Jeff asked for.** One entry per day, visible and editable from any device. No local storage at all, the database record only. And the whole site behind the database password: you enter it and you can view the site and edit the diary, or you do not get in.

**Decisions.**

- **The id is derived on the server** as `e-<session_date>` and the client no longer sends one. Two devices on the same day address the same row by construction, not by agreement. Existing per-device rows are collapsed to one per date on the first request after deploy, newest wins.
- **No local storage in the diary.** The page loads the week's entries from the API and writes straight back to it. Unsaved edits are held in memory so switching sessions does not lose them, but nothing is written to the device.
- **The offline queue is gone**, which was the cost of the above and was flagged before building. Saving with no connection now fails, says so plainly, and keeps the text in the form. If a field with no signal turns out to matter, the queue comes back.
- **The gate is real, not cosmetic.** A client-side password screen would still have shipped the whole page to anyone who asked for it. Instead the page is served by `api/page.js` and `vercel.json` points the output directory at `public/` (robots.txt only), because Vercel gives the filesystem precedence over rewrites: a static `index.html` in the served directory would be handed out before any check ran. Signing in sets an HttpOnly, SameSite=Lax cookie holding a signed, expiring token, never the passphrase itself.
- `tools/diary_pull.py` keeps working through the `x-diary-key` header, so server-side pulls need no cookie.
- The test sheet's `localStorage` was left alone. It was not part of the ask, and it has the same cross-device weakness if that ever matters.

**Open.**

- The claude.ai artifact copy is still ungated and cannot reach the API; its diary panel says so. If the program content should be private too, stop publishing the artifact.
- Brute-force protection is a 500ms delay on a failed attempt and nothing more, so the passphrase should be a real one.

## 2026-09-13 (late): test results into the database, progress chart on the Year view

**What Jeff asked.** Whether the Baseline test sheet data synced anywhere. It did not: it was `localStorage` under `teddy-pe-sheet-v1`, the same per-browser storage that had just broken the diary across devices. He asked for the same fix, plus the Year-view chart that had been open since the first session.

**Why this mattered more than the diary did.** A diary entry can be re-typed from memory. A 20m sprint time from the baseline window cannot be measured again, and the entire battery exists to be compared against it four times across the year. The sheet's own status line ("read the numbers back to me and I will chart them") showed it was built as a scratchpad, with `data/results.json` as the intended record, and that file had never been created. Baseline testing was two days away.

**Decisions.**

- `test_result` table, row id derived on the server as `<window>:<test_id>`, same passphrase, same reasoning as the diary. Each number saves on blur rather than per keystroke, and clearing a box deletes the row so a mistyped number can be taken back.
- **Five test windows, not two columns.** The sheet previously had Baseline and December only, so the March, June and August retests had nowhere to go. There is now a window selector; non-baseline windows show the baseline value beside the input as a reference.
- **`sheetRows` carries a direction** (`lower`, `higher`, `growth`). Without it a chart cannot tell that a faster sprint and a longer jump are both progress. Height is `growth`: it reports a cm/year pace and surfaces the growth-load protocol when that pace runs fast, which is the trigger the tall-frame section of the architecture already specifies.
- **Single-leg balance was split into left and right rows**, matching the single-leg hop and the overhand throw. It had been one box holding two numbers, which nothing could chart. Safe to change now because no real numbers had been recorded yet.
- **Small multiples rather than one chart.** Fifteen tests in different units on one axis would be meaningless. Each test gets a card: latest value, change since baseline with the direction applied, and a sparkline across the recorded windows.
- `tools/diary_pull.py` became `tools/pull.py` and now pulls both, writing `data/results.json` keyed by window and test id.

**Found while building.** `api/results.js` connected to the database before validating the body, so a mistyped value would have surfaced as a database error rather than a clear message. The same mistake had already been fixed in `api/diary.js`; a test caught it here.

**Open.**

- The test sheet is the last thing to leave `localStorage`. Only the remembered tab remains there, which is a per-viewer convenience and fine where it is.

## 2026-09-13 (night): rewrite as a Rails API, a React web app and a React Native app

**What Jeff asked.** Rewrite the project as a decoupled Rails API with a React web frontend and a React Native app, following the patterns in the sibling repo `../burough_buddies`. The design was settled in advance and written to `docs/rewrite-prompt.md`. The full spec derived from it lives at `docs/superpowers/specs/2026-09-13-rewrite-design.md`.

**Why this is worth the disruption.** Three things the current setup cannot do. Teddy has no way to write anything himself, because one shared passphrase means one identity. Nothing carries across years, because the page is built from one year's JSON and "year one" is assumed everywhere. And drill mastery is locked in a jsonb column, so the question the diary exists to answer ("how has the cartwheel gone over three years") cannot be asked.

**Decisions Jeff made this session.**

- **Branch off `feature/rewrite`**, not `main`, so the design brief travels with the work that implements it. `main` stays deployable and untouched until he merges, and the Vercel deploy off `main` keeps serving the current site through cutover.
- **Three accounts, per-user passwords.** Jeff as coach, Teddy as athlete, Emily Barker (mom) as viewer. Viewer reads the program and writes nothing.
- **No passphrase migration.** The shared `DIARY_PASSPHRASE` dies at Phase 3 cutover rather than becoming somebody's password. A shared secret should not survive into a per-user model.
- **Teddy controls a per-entry "show Dad" toggle on his journal.** The alternatives were that Jeff reads everything, or that Jeff sees only a count. This was raised because `docs/architecture.md` already says the Champion's Log is Teddy's notebook and Jeff reads it only when invited, and an athlete journal the coach can read quietly digitizes the same thing. The toggle defaults to off, so sharing is a deliberate act rather than something he has to remember to switch off. Enforced in the Pundit scope, so an unshared entry is absent from Jeff's payload rather than present and hidden by the client. Emily sees no journal entries at all: shared means shared with Dad, not published. The Champion's Log itself stays on paper and never enters the software.
- **High-intent efforts get a number per day card.** Nothing in the plan data counts them today, so the 40 a week budget could never fail a test. Claude proposes a number for each of the 21 cards already written, derived from the architecture's own split, and Jeff corrects the table at the Phase 1 gate.
- **The offline queue comes back**, covering both journals and test results. It was removed in the cross-device fix and named as the cost at the time. Safe now because an entry is addressed by user, program year and session date, so a replayed write updates the same row instead of making a second one. That is the property the old per-device queue lacked.
- **`rails docs:export` replaces `tools/pull.py`**, covering journals, results and plans. It does more than the old tool, because the program goes back into the repo as prose a person can read rather than only as YAML a seeder can read. Unshared athlete entries are excluded from the export as well as from the API.

**Teddy's birthday, finally.** 9 January 2019. Open since the first planning session. He is 7 years 8 months at the start of this program year and turns 8 on 9 Jan 2027, inside the Coyote block.

**Found while reading the data, and not obvious from outside it.**

- There are 15 recordable test rows against 10 battery tests, because hop, throw and balance each record left and right and height stands outside the ten. Unit and progress direction live at the row level, and `test_result` keys on `t3r`, `t11l`, `h`. So a `BatteryMeasure` table is needed that the brief's model list did not name.
- A day is written twice today, once as a month-view summary in `weeks[].days` and once as a full card in `cards.days`, and the two can drift. One `DayCard` now holds both.
- Drill linking cannot stay a build-time HTML transform, because React Native cannot render an HTML string. It becomes a pure tokenizer in `core/` with the same matching rules `build.py` uses, unit tested against today's cases.
- `api/results.js` deliberately stores test values as text, on the grounds that a number that will not parse is still worth keeping. That judgment survives: `TestResult` keeps the text and adds a parsed numeric beside it, so the chart reads what it can and nothing typed is ever discarded.

**Open.**

- The `hie` table, for Jeff's correction at the Phase 1 gate.
- Actual hosting cost and measured cold start, to be verified at the Phase 1 gate against prices published then rather than quoted from the brief.
- What an unauthenticated visitor can see once the bundle is public, to be demonstrated at the Phase 2 gate. Privacy moves entirely to the API, since a decoupled SPA has a readable bundle by definition.

## 2026-09-13 (late): the whole-branch review, and the ten fixes off it

**What Jeff asked.** Phase 1 was reviewed as one thing rather than task by task. He picked ten findings off the review and ruled on the shape where the shape mattered. Full account in `docs/history/2026-09-13-final-review-fixes.md`.

**Decisions made this session.**

- **Every looping example in `content_spec.rb` counts what it reached** and asserts that count against a total taken from the content. Two of them had been passing while checking nothing, the thirteenth and fourteenth on this project, in the file that encodes the rules of the program. A tally does not make an assertion stronger; it makes the absence of one loud.
- **The week 8 Trials rule is written both ways round.** "Week 8 is Trials" has no subject until a block is eight weeks long in the files, which is why it sat green and empty. "No other week is Trials" has every authored week as its subject and turns into the positive form by itself when week 8 lands.
- **The seeder prunes, and only inside the year being seeded.** Month plans, weeks, day cards, day blocks, area cells and ball gates. Never blocks, areas, patches, test dates, drills, battery tests or battery measures: each has a row of Jeff's or Teddy's pointing at it, and `BatteryMeasure` declares `dependent: :destroy` on its test results, so pruning one measure would delete Teddy's numbers on the strength of a YAML edit. Deleting one of those is a migration Jeff writes and looks at, not a side effect of a deploy.
- **A day card that Teddy journalled about can still be removed from the YAML.** `DayCard` declares `dependent: :nullify` on both journals, so the entry keeps every word and lets go of its `day_card_id`. Nothing reads an entry by that column: the API addresses entries by (user, year, session date), so the entry still reads back on its own day and relinks on the next write to it.
- **Rails 8.0's end of life is recorded as a dated test rather than only as a brakeman ignore.** The ignore cannot expire on its own, because brakeman fingerprints a warning from its code, file and confidence and never from its message, so it would have silenced the same warning for Rails 8.1 too. `spec/rails_version_spec.rb` holds the maintenance dates and fails on 2026-11-07 if the app is still on 8.0.
- **Ten login attempts every three minutes, by address**, counted by attempt rather than by failure, expiring on its own. A throttle that does not let go locks Jeff out of his own son's program over one bad afternoon. The test environment moved to `memory_store` so the suite actually exercises it.
- **`updated_at` rides on every journal and test-result payload.** Phase 2's offline queue gets the option of noticing it is about to overwrite something newer. Nothing has to use it yet.

**Found while fixing, and not in the review.**

- **`/healthz` was not checking the database at all.** It is the OkComputer engine root, and the root runs the check named "default" and no other. The database check was registered as "database", so it sat on `/healthz/database`. With the database completely unreachable, `/healthz` answered 200 "Application is running". That is the path Fly polls every 30 seconds and the path the release command gates on. `fly.toml`'s comment claiming the health check asks the database a question was false until this session.
- **The Year tab and the Progression tab could disagree about Teddy's growth pace**, which is the trigger for halving jumping and sprinting for 8 to 12 weeks. They sorted the same rows differently and agreed only because the 2026-27 test windows happen to run in the same order as their positions.

**Open.**

- The Rails 8.1 upgrade. Needs `bundle update rails` and a deploy, both Jeff's. Due before 2026-11-07 and the suite will say so.
- Most of the review's 22 minor findings, and five of its twelve important ones. Named at the end of the history file. The ones worth a decision: nothing can delete a journal entry, `test_results#index` returns every athlete's rows, and there is no `after_action :verify_authorized`.

## 2026-09-13 (late): two answers from Jeff, both shaping Phase 2

**Deleting a journal entry: yes, but nothing actually leaves the database.** Jeff and Teddy can each delete their own entries, and a delete sets `deleted_at` rather than removing the row. This answers the open item from the review pass above.

Three things follow from that, and they are worth writing down before Phase 2 starts rather than discovering them in it.

- **A soft-deleted entry has to be excluded everywhere an unshared one is.** The Pundit scope, both payloads, the progression payload and `DocsExporter` all already have exactly one place each where visibility is decided, because the share toggle needed it. `deleted_at` rides the same path. If it gets its own filter in a second place, the two will drift, which is the defect this project found three times with the growth sum.
- **It makes the export's prune reachable.** `DocsExporter` learned to remove a file whose source is gone, and the review noted that nothing in the app could actually perform a deletion, so the whole mechanism existed for a case that could not occur. It can now: Teddy deletes an entry, the next export drops it from `docs/`.
- **The repo and the database deliberately disagree.** The row keeps every word, and the committed prose loses it. That is the correct direction: `CLAUDE.md` says this repo is the complete memory of the project, and a child who deleted something did not consent to it being the memory. Recovery is a console, and it is Jeff's.

Each person deletes only their own. Teddy cannot delete Dad's notes and Dad cannot delete Teddy's entries, which is the same line the share toggle already draws.

**Redeploy as soon as the re-review clears the seeder.** Production is currently running the pre-fix code, so it has a health check that cannot see a dead database, no login throttle, and the Neon host in its error text. The trade is that the deploy runs the newly pruning seeder against the live database for the first time. Conditional on a clean re-review, and the content rows get counted before and after.

## 2026-09-14 (overnight): the core package, and four decisions inside it

**What Jeff asked.** Start Phase 2. He then went to bed and said to keep going, to rule on anything ambiguous rather than park it, and to carry on into the web app. Full account in `docs/history/2026-09-14-core-package.md`.

**Decisions made this session.**

- **`core/` owns the ducks and the network and owns no storage.** Storage arrives as a three-method async interface that each app supplies: the web app hands it `localStorage`, and Phase 4 hands it `expo-secure-store`. That one seam is the only place the two apps differ, which is what makes the brief's rule that no duck may be redefined cheap to keep rather than a promise broken quietly.
- **A duck exposes what an app dispatches, never what a saga dispatches to itself.** An app that could dispatch `signInSucceeded` could put itself in a signed-in state holding a token the server never issued, and render Teddy's journal against credentials that do not exist. The same reasoning narrowed all ten ducks. The package's test asserts the exact set of exports rather than a list of expected ones, so anything added by accident fails.
- **A queued write belongs to whoever typed it.** Teddy and Jeff share an iPad. A write queued with no signal survives a sign-out on purpose, because the words are still owed to the server, but a replay now sends only the signed-in person's writes and leaves the rest queued for when they come back. Before this, Teddy's unshared note would have been sent under Jeff's token, and was readable by Jeff through an exported selector the whole time it sat queued.
- **One entry has one home.** The week payload carries a day's journal entries inline and the journal slice holds them by date, which is two sources of truth for one thing. The payload's copy is folded into the slice on arrival and screens read the slice. Which copy wins is decided in one function, by whichever the server stamped later, with a tie going to the copy arriving now. That answers the case "the slice always wins" gets wrong: a week fetch still in flight when a save lands.
- **The bundle may carry the product's name and nothing else about Teddy.** A decoupled app has a publicly readable bundle, so a test builds it and reads it. The repo is `teddy-pe`, the API is `teddy-pe-api.fly.dev`, and the session key is `teddy-pe.session`, so the name is unavoidable and excluding it would be theatre that also makes the test impossible to keep green. The list covers him as a person and his program instead, and a further assertion requires every occurrence of his name to be one of four allowed forms, so a real leak cannot hide behind the exemption.

**Found while building, and worth knowing.**

- **Every journal save would have returned 400.** Neither save sent `program_year_id`, which both controllers require. The same defect was caught and fixed in the test-results duck earlier the same night and never swept here, which is the second time on this project that a correction was applied where it was found and not everywhere it applied.
- **The journal stored the API's envelope as the entry**, so a day's entry filed under the key `"undefined"` and a screen asking for that date got nothing back.
- **Nothing fetched journal entries at all**, so both journal screens would have opened empty until something was saved in that same session.
- **Clearing a test-result box deletes the row.** The controller treats an empty value as a delete and answers with a different shape. That is the only delete anywhere in the API, and Jeff will use it in the first week, because typing a wrong number on a court with a stopwatch and clearing it is what happens.

**Open.**

- The soft delete Jeff asked for is owed. It is built in Phase 2c alongside the journal screen, because an endpoint with no button is designed against an imagined interaction.
- `GET /api/v1/athlete_entries` has no year filter, so a second program year will make that screen list both. The fix belongs in the controller.
- An app can still read another user's queued words by reaching past the filtered selector into raw state. Accepted at three users; closing it means getting plaintext out of the store entirely.
- 41 em dashes across `core/` against this repo's own style rule, being removed as files are touched.

## 2026-09-14 (overnight, later): the web app's read screens

**What Jeff asked.** Keep going into building the web app, and rule rather than park. Full account in `docs/history/2026-09-14-web-app.md`.

**Decisions made this session.**

- **Program vocabulary does not go in the web app, it comes from the API.** A decoupled app's JavaScript is public, so a test builds the bundle and reads it. When that test first blocked a program word, an implementer reworded around it, and the replacement was program vocabulary too. The rule is now what the code does rather than which strings it contains: a heading either shows what the API called something, or it is plain English a stranger learns nothing from.
- **The bundle test reads everything the build emits**, not only the scripts. A description tag in `index.html` is served to a stranger exactly like the JavaScript is, and for a while it was the one file nobody looked at.
- **The nav shows only what the API will answer.** Emily gets 403 on both journals and Teddy gets 403 on Dad's notes, so neither sees a tab for them, and a typed URL is refused by the same table the nav reads. A tab that always errors teaches a child the app is broken.
- **An open drill lives in the URL.** Tapping a drill in Wednesday's card opens it in the glossary, which means Jeff can bookmark one and Teddy can use the back button.
- **The session is restored before the first paint, not after it.** Restoring in an effect meant every launch showed a sign-in form for a moment and then replaced it, even with a good stored session.
- **The app asks the API who it is signed in as.** That was added mid-session: it saves a round trip on a server that takes seven seconds to wake, and it turns restoring a session into a real check rather than trusting whatever is in storage. A token dies whenever a password changes.

**Found while building, and worth knowing.**

- **A property name cannot be minified.** Deleting a program word from the screen was not enough, because the code still read `week.trials` and the field name shipped in the bundle regardless. The marker now derives the same condition from the budget instead.
- **Every screen rendered unstyled.** The app has no CSS at all. That is a requirement rather than a polish item, because Teddy is 7 and This Week is the screen he opens, so it has its own task in Phase 2c.
- **Tapping a drill did nothing.** The token carried its slug and had no handler, and the glossary had no way to receive one. Each task tested its own half and the link between them existed in neither.
- **A waiting screen with no way out.** If the API answers anything but a 401 when the app asks who it is, the person stays signed in on cached data and the year id never arrives. Three screens waited forever under copy promising a few seconds. They now offer to try again.

**Open.**

- The soft delete is still owed and is the first real task of Phase 2c, built with its endpoint.
- Six small helpers live in the web app that the native app will need: weekday ordering and labels, today's date, the current month key, and a position sort. They belong in the shared package and have not moved yet.
- The bundle test is a denylist and is not airtight. It catches a program word typed into a heading and his name pasted into a comment or a tag. API field names still ship, because a minifier cannot rename them.
- Nothing yet proves the deployed site refuses a stranger. The bundle test proves the JavaScript carries nothing; the running site is Phase 2c's deploy task.

## 2026-09-14 (Phase 2c, task 5): the soft delete, built at last

**What Jeff asked**, on the night of 13 September, and what has been owed since: he and Teddy can each delete their own entries, a delete sets `deleted_at` rather than removing the row, and the row keeps every word. The three consequences were reasoned through above and were not relitigated. It was deliberately not built twice, because an endpoint with no button gets designed against an imagined interaction and a client written against an imagined route has its test mock the call and pass while the real thing 404s. Both journal screens now exist, so it was built as one thing.

**Decisions made building it.**

- **The unique index becomes partial.** `(user_id, program_year_id, session_date)` is the triple `upsert_for` addresses an entry by, so a deleted entry still owned its day: Teddy deletes what he wrote on Thursday, writes something new about Thursday, and either the insert violates the index or the upsert finds the deleted row and overwrites the words the delete had just promised to keep. Partial on `deleted_at IS NULL`, the day is free again and the deleted row keeps everything it said. `upsert_for` and the uniqueness validation read through the same condition.
- **`deleted_at` rides the `shared` path everywhere except the exporter, where it deliberately sits one level up.** The Pundit scopes apply `kept` once above their branches, so the API and the week payload both honour it by the line that already decides sharing. The exporter is the exception, and it has to be: an unshared entry still marks a month as lived and simply contributes nothing, while a deleted entry must not, or the month's file would keep being written empty and the prune would never fire. So the exporter applies it on the two loads that decide which entries exist at all, and the `shared` filter below still decides which of those get written down.
- **A delete queues offline, under the same dedupe key a save for that day uses.** It queues because a delete is a write and the outbox exists so a write made with no signal is still owed: the alternative is Teddy tapping delete at a court with no connection, getting an error, and finding his words still there next time with nothing recording that he asked. It shares the key because the outbox keeps only the last queued write per key, so an edit made offline and then deleted is replaced rather than racing the delete on one row. Sending both would be an upsert and a delete on the same row, and in the wrong order the entry comes back.
- **A queued delete is honoured locally straight away.** The entry leaves the slice the moment the write is queued, not when the server answers. He asked for it gone, and showing a child the words he just took back with no way to tell whether the app heard him is the wrong failure direction. If the replay is refused for good, the server still has the row and the next fetch puts it back, which is the honest outcome.
- **The delete answers `{deleted: {id, session_date}}`, not an entry envelope.** Every other action on those controllers answers with the entry, and a client handed that back would fold what it had just deleted straight into its own state. One function in `core/` knows that shape, so the live path and the replayed path read it the same way.
- **A 404 on a delete is success, not a failure.** The scope already excludes a deleted entry, so a second device or a replayed delete that actually landed answers 404, and that is the state the person asked for.
- **The button confirms, in two steps, in the page.** It is the only control on a 7-year-old's screen that removes his own writing, it cannot be undone from there, and it sits on the same page as Save. So it lives outside the form and last on the page, the confirm is a different button in a different place from the one that opened the question, and "Keep it" comes first. A `window.confirm` was the alternative and it is a wall of adult text in a box a child has no reason to trust. Both screens use the same two steps.

**Found while building, and worth knowing.**

- **The coach journal could not see a queued delete.** Its is-it-queued check read a session date out of a queued write's request body, and a delete has no body at all, so it would have reported "nothing is queued" for exactly the write a person most needs told about. It now reads `selectIsEntryQueued`, which matches the dedupe key every journal write carries.
- **`core/`'s exact-set surface test never looked inside a narrowed namespace.** It asserts the names `index.ts` exports, so `journalActions` gaining or losing an action changed nothing either assertion read, which is the whole of what the narrowing is. That object now has its own exact set.

**One fix after review.** A queued delete that answers 404 on replay was reported to the duck that queued it as a permanent rejection, which the journal turned into "That entry did not save." about a delete that had worked. The replay path now applies the rule the live path already applied: a 404 in response to a DELETE means the thing is gone, so the write succeeded. It lives in the outbox rather than the journal, because that is a property of DELETE and not of journals, and the queued action already carries its own `request.method`, so the outbox can tell without knowing what was deleted. The two alternatives were both declined: threading the method through to the failure action would put journal semantics in a duck that must not know what a journal is, and giving deletes their own key prefix would give up the dedupe with a save that the whole design rests on.
