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
