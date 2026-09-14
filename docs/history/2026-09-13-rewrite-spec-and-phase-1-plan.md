# Working session, Sunday Sep 13, 2026 (night): the rewrite spec and the Phase 1 plan

Fourth session of the day. Jeff had already written the design brief into `docs/rewrite-prompt.md` and asked for work to start on it. This session produced the spec and the Phase 1 implementation plan. No code yet.

## What Jeff asked

"Can you use the file in docs/rewrite-prompt.md to start working on that new stuff." The brief settles the design in advance: a decoupled Rails 8 API, a React web app and a React Native app, sharing every duck through a `core/` package, following the patterns in the sibling repo `../burough_buddies`. Four phases, each with a hard review gate. Never touch `main`.

## The baseline check failed, so the session started by stopping

The brief says to confirm `git branch --show-current` is `main` before writing any code, and to stop and ask Jeff otherwise. It was `feature/rewrite`, which is `main` plus the one commit that adds the brief itself. Working tree clean, `main` level with `origin/main`.

Jeff chose to branch off `feature/rewrite` rather than `main`, so the brief travels with the work that implements it.

The worktree ignore trap was closed first, before any commit: `.claude/worktrees/` and `.worktrees/` into `.git/info/exclude` immediately, then into `.gitignore` on the feature branch. The sibling repo has a committed phantom gitlink at `.claude/worktrees/landmark-passport-build` from exactly this, which was verified rather than taken on trust.

`EnterWorktree` defaults to branching from `origin/<default>`, which would have been wrong here, so `worktree.baseRef` was set to `head` first. The tool also names the branch after the worktree, so it was renamed to `feature/rails-react-rewrite` afterwards.

## Questions put to Jeff, and his answers

- Branch base: **off `feature/rewrite`.**
- Accounts: **coach, athlete and family viewers.**
- Passphrase migration: **none. Fresh per-user passwords**, the shared secret dies at cutover.
- Does the athlete journal step on the Champion's Log? **Teddy controls a per-entry "show Dad" toggle.**
- The `hie` backfill: **Claude proposes, Jeff corrects at the Phase 1 gate.**
- Offline: **queue journals and test results.**
- Repo memory: **`rails docs:export`, covering journals, results and plans.**

Then the three facts that were blocking: Teddy's birthday is **9 January 2019**, his login is **teddymaxim225@gmail.com**, and the viewer is **Emily Barker (mom), emmabark22@gmail.com**. Jeff also corrected his own address to **frey.maxim@gmail.com**; the work address had come from the session environment rather than from him.

## The Champion's Log question

Worth recording because it was not in the brief. `docs/architecture.md` says the Champion's Log is a notebook Teddy writes in himself, that it is his, and that Dad reads it only when invited. An `AthleteEntry` the coach can read is close enough to that to be worth asking about before building it.

Jeff picked the toggle. It defaults to off, so sharing is a deliberate act rather than something Teddy has to remember to switch off. It is enforced in the Pundit scope, so an unshared entry is absent from Jeff's payload rather than present and hidden by the client, and a request spec asserts that. Emily sees no journal entries at all, shared or not: shared means shared with Dad, not published. The same exclusion applies to `docs:export`, because enforcing the toggle in the API and leaking it to a file would make it worthless.

The Champion's Log itself stays on paper and never enters the software.

## Four things reading the data turned up

None of these were visible from outside the files.

1. **Fifteen recordable test rows against ten battery tests.** `sheetRows` splits hop, throw and balance into left and right, and height stands outside the ten. Unit and progress direction live at the row level, and `test_result` keys on `t3r`, `t11l`, `h`. So `BatteryMeasure` was added to the model list the brief gave, with a nullable link to a test so height is a first class row rather than a special case.

2. **The high-intent effort numbers were already written, in prose.** The 40 a week budget could never fail a test because nothing counted the efforts. It turned out Jeff's dad notes state the count in words. Wednesday's says "High-intent efforts today: 3 sprints, 3 jumps, 4 hops, 2 shuttles, 3 challenge jumps, about 15." Monday's says zero sprinting and zero jumping. Thursday's says near zero. Friday's says 5 or fewer. So the backfill is extraction rather than estimation, and week 1 totals 28 against a budget of 40.

3. **Drill linking cannot stay a build-time HTML transform**, because React Native cannot render an HTML string. The spec proposed a tokenizer in `core/`; the plan moved it to seed time instead, so the matcher exists once rather than twice and the content spec can assert what it produced. `day_blocks` keeps the raw prose, `body_tokens` holds the render tree, and `drill_slugs` falls out of it. The regression target is the report `build.py` prints today: 63 drills used across week 1, and the same four blocks where nothing matched.

4. **A day is written twice today**, once as a compact entry in `weeks[].days` and once as a full card in `cards.days`, and the two can drift. One `DayCard` now holds both, so its name is written once. The converter fails loudly if the two names disagree in the legacy file.

## What was built

- `docs/superpowers/specs/2026-09-13-rewrite-design.md`: the spec, with every table derived field by field from `data/program.json`, `data/drills.json`, `data/plans/2026-09.json` and the two Vercel functions, the mapping printed so Jeff can check it, the API payloads, and each program rule turned into a named test.
- `docs/superpowers/plans/2026-09-13-phase-1-rails-api.md`: the Phase 1 plan. 16 tasks, 114 steps, test-first, with real code and a real expected output at every step. One plan per phase, because each phase is a hard gate and produces working software on its own.
- `docs/context.md` gains Teddy's birthday and a who-has-access table.
- `docs/decisions.md` gains the session.

## Verification

The brief's two factual claims about the sibling repo were checked rather than believed: `burough_buddies/backend/db/seeds.rb` really does read `backend/content/` (the root `content/` there is a stale leftover it notes moving away from), and `.claude/worktrees/landmark-passport-build` really is a committed phantom gitlink.

The baseline was confirmed reproducible before anything changed: `python3 build.py` regenerates `site/` and `dist/` with no diff against what is committed.

The self-review pass over the finished plan found three real problems and fixed them: two factories referenced a `:program_year` factory no task defined, `DrillRating.streak` was written with no test despite encoding a rule straight out of the architecture, and the token shape example cited a drill slug that does not exist. Every drill slug the specs assert against was then checked against `data/drills.json`.

## One correction to the brief

`tools/diary_pull.py` was renamed to `tools/pull.py` when it started pulling test results too, so decision 9's delete list is out of date. `tools/test_api.mjs` tests the functions being deleted and goes with them.

## Left for Jeff

Review the spec and the Phase 1 plan, then Phase 1 gets built. Nothing is blocking.

The gate report at the end of Phase 1 is listed at the bottom of the plan: branch diff, the full test output pasted rather than summarized, the `hie` table for correction, measured cold start, the monthly cost verified against prices published that day rather than quoted from the brief, and exactly what an unauthenticated visitor can see once the bundle is public.
