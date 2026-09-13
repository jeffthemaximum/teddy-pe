# Context: who this is for and how it runs

Working memory for anyone (or any AI session) picking this project up cold. Keep it current; it is the file that replaces re-explaining.

## Teddy

- 7 years old (Sep 2026), homeschooled, only child. Reads well enough to follow his own daily card.
- Very advanced tennis player for his age. On green ball.
- Baseline skills: excellent bike rider, swims, catches a tennis ball out of the air, throws overhand without full rotation, no cartwheel yet.
- Loves nearly all of it, and especially loves doing it with Dad. Skateboards at a skate park.
- Organized week: Sat soccer + lacrosse + tennis (2h); Sun tennis (2h); Mon gymnastics; Tue swim. Tennis is a coached small group; Jeff also coaches him.

## Jeff

- Coach and training partner. Prefers direct, rigorous feedback and wants his assumptions challenged.
- Running is limited through fall 2026 and ramping through winter. Fall cards keep him feeding, timing, demonstrating and competing from a fixed position.
- Software engineer by background. Comfortable with a repo, a build script and a static host.

## Places and gear

- Manhattan through October 2026; West Chester, PA from November. Assume all activities and facilities continue.
- Riverside Park traveling rings (skills, strength, progression). Skate park. Basketball courts, tennis wall, soccer fields, hills. Yard/park space, indoor space and pool.
- Med ball, cones, mini hurdles, jump rope, balance/slant board, hang bar, kid racket and green balls.

## How the program is run

- One page, three tabs: The Year, the current month, This Week. Published to claude.ai as an artifact and to Jeff's Vercel site.
- Everything renders from `data/program.json` (the year) and `data/plans/<month>.json` (weeks and daily cards). `build.py` produces the page, the artifact fragment and a markdown export.
- Regenerate a month or a week by writing a new plan JSON that follows `docs/architecture.md`, pointing `data/current.json` at it, and running the build.
- Test results and patch progress are recorded by Jeff and charted on the Year view once reported. The in-page test sheet saves only in the viewer's browser.
