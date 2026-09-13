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
