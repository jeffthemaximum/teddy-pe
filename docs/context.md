# Context: who this is for and how it runs

Working memory for anyone (or any AI session) picking this project up cold. Keep it current; it is the file that replaces re-explaining.

## Teddy

- Born 9 January 2019. 7 years 8 months at the start of this program year, and turns 8 on 9 Jan 2027, inside the Coyote block. Homeschooled, only child. Reads well enough to follow his own daily card.
- Very advanced tennis player for his age. On green ball.
- Framed by Jeff as a future champion: most likely tennis, possibly high-level basketball or soccer goalkeeping. Prepared for that now, physically and mentally, through athleticism and enjoyment.
- Handles a lot of volume. The program adds it as technical volume (touches, dribbles, swings), not intensity.
- Very tall, very athletic parents and family. Height is recorded at every test date; see the tall-frame notes in the architecture.
- Baseline skills: excellent bike rider, swims, catches a tennis ball out of the air, throws overhand without full rotation, no cartwheel yet.
- Loves nearly all of it, and especially loves doing it with Dad. Skateboards at a skate park.
- Organized week: Sat soccer + lacrosse + tennis (2h); Sun tennis (2h); Mon gymnastics; Tue swim. Tennis is a coached small group; Jeff also coaches him.
- Home program adds dedicated basketball (Mon, Thu, alternate Sun) and soccer including keeper work (Tue, Wed, Fri, alternate Sun).

## Who has access

From the Rails rewrite onward, each person signs in with their own email and password. There is no shared passphrase.

| Name | Email | Role | Can do |
|---|---|---|---|
| Jeff Maxim | jmaxim@trxtraining.com | coach | Everything, except an athlete entry Teddy has not shared |
| Teddy Maxim | teddymaxim225@gmail.com | athlete | Reads his program and results, writes his own journal, chooses what to show Dad |
| Emily Barker (mom) | emmabark22@gmail.com | viewer | Reads the program, the plans and the drills. Writes nothing, sees no journal |

## Jeff

- Coach and training partner. Prefers direct, rigorous feedback and wants his assumptions challenged.
- Running is limited through fall 2026 and ramping through winter. Fall cards keep him feeding, timing, demonstrating and competing from a fixed position.
- Software engineer by background. Comfortable with a repo, a build script and a static host. Wants changes on a branch to review before merging.

## Places and gear

- Manhattan through October 2026; West Chester, PA from November. Assume all activities and facilities continue.
- Riverside Park traveling rings (skills, strength, progression). Skate park. Basketball courts, tennis wall, soccer fields, hills. Yard/park space, indoor space and pool.
- Med ball, cones, mini hurdles, jump rope, balance/slant board, hang bar, kid racket and green balls. Youth basketball, soccer ball, a small goal or cone goal, keeper gloves, a mat for dive progressions.

## How the program is run

- One page, three tabs: The Year, the current month, This Week. Published to claude.ai as an artifact and to Jeff's Vercel site.
- Everything renders from `data/program.json` (the year) and `data/plans/<month>.json` (weeks and daily cards). `build.py` produces the page, the artifact fragment and a markdown export.
- Regenerate a month or a week by writing a new plan JSON that follows `docs/architecture.md`, pointing `data/current.json` at it, and running the build.
- Test results are typed into the sheet on the This Week tab and stored in Neon, not in the browser. Five test windows, 15 rows. The Progress panel on the Year tab charts them: latest value, change since baseline in the direction that counts as progress for that test, and a sparkline. Patch progress is still recorded by Jeff by hand.
- Drills explain themselves. Tapping an underlined drill on a daily card opens what it is, how to do it, what to watch for and the cue; the Glossary tab lists all of them. Entries live in `data/drills.json` and are linked into cards at build time.
- **The Vercel site is private.** One passphrase (`DIARY_PASSPHRASE`) gates the whole thing. The page is served by `api/page.js` rather than as a static file, so an unauthenticated visitor never receives the HTML; signing in sets a 90 day cookie. The claude.ai artifact copy is a separate, ungated surface with no API access.
- Jeff fills in a coach's diary on the This Week tab after sessions. One entry per session date, stored only in Neon Postgres and keyed by the date on the server, so every device sees and edits the same entry. Nothing is kept on the device, so saving needs a connection. `tools/pull.py` brings entries and test results into `data/`; they drive proposed plan changes, never automatic ones. Needs `DATABASE_URL` and `DIARY_PASSPHRASE` set in Vercel.
