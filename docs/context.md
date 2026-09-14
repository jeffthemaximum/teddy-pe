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
| Jeff Maxim | frey.maxim@gmail.com | coach | Everything, except an athlete entry Teddy has not shared |
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

- One app, tabs for The Year, the current month, This Week and the Glossary. The React app in `web/` runs at https://teddy-pe-mlfs.vercel.app, reading the Rails API in `backend/` at https://teddy-pe-api.fly.dev. Everyone signs in; there is no public page.
- The program itself is YAML in `backend/content/program_years/<year>/`: `program.yml` for the year, `drills.yml` for the glossary, `plans/<month>.yml` for weeks and daily cards. `bin/rails content:seed` loads it into Postgres and runs on every deploy.
- Regenerate a month or a week by writing a new plan YAML that follows `docs/architecture.md` and seeding it. `bin/rails docs:export` writes the journals, the results and the plans back into `docs/` as prose, which is what keeps this repo the complete memory.
- Test results are typed into the sheet on the This Week tab. Five test windows, 15 rows. The Progress panel on the Year tab charts them: latest value, change since baseline in the direction that counts as progress for that test, and a sparkline. Patch progress is still recorded by Jeff by hand.
- Drills explain themselves. Tapping an underlined drill on a daily card opens what it is, how to do it, what to watch for and the cue; the Glossary tab lists all of them. Entries live in `drills.yml` and are linked into cards when the content is seeded.
- **Everything about Teddy is behind the sign-in.** The API answers nothing without a token, Pundit decides what each of the three accounts may see, and the web bundle ships no program vocabulary at all. A test in `web/` builds the app for real and reads the built output to prove it.
- Jeff fills in a coach's diary on the This Week tab after sessions. One entry per session date, keyed on the server, so every device sees and edits the same entry. Teddy keeps his own journal and chooses what to share; unshared entries stay out of the API and out of the export. Saves go through the offline queue in `core/`, so a field with no signal keeps the words and writes them when the connection comes back. Entries drive proposed plan changes, never automatic ones.
