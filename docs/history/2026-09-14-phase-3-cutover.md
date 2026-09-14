# 2026-09-14: Phase 3, the cutover

## What was asked

Run the migration against production, and if it verified clean, delete the old pipeline. Then write down what happened.

The stake had been stated the same way all through Phase 3. The old Neon tables held whatever Jeff had recorded on the site that has served Teddy's page since the program started, and `data/` held the only copy of the program itself in the format `build.py` could read. Delete either one on a wrong reading and there is nothing to go back to.

## What happened

### The survey found nothing, and that was the finding

The first run of `legacy:survey` against production reported both `diary_entry` and `test_result` missing from the connection. That is exactly the Critical the whole-branch review had caught a few hours earlier, showing up in real life.

Under the old behaviour, an absent table returned `[]`, `clean?` was true, and `legacy:verify` printed "Safe to delete the old pipeline" and exited 0. The next thing anyone does after reading that message is delete the only copy. The fixed code named both tables, said the rows were probably in another database, and said `LEGACY_DATABASE_URL` is how to point at one.

It is worth being plain about the order of events. The gate was written the day before, against a hypothetical. The hypothetical was the actual state of production.

### Where the rows were

`LEGACY_DATABASE_URL` set to database `neondb` on the same Neon host the Rails app already uses. The old Vercel functions had written to a second database on that host, so the two connection strings differ in one path segment and read as identical at a glance.

### Two rows

With the connection right, the survey found one diary entry and one test result. Nothing unmapped: every drill slug in the entry's ratings matched a `Drill`, and the result's test id and window both resolved. No conflicts, because the new system held nothing at those keys yet.

Both migrated. `legacy:verify` compared them field by field, drill ratings included, and read clean: "Every old row has a match that agrees. Safe to delete the old pipeline."

Two rows is not what the plan was sized for. It was written expecting a year of records, and the honest number turned out to be two. Nobody could have known that without looking, which is the whole argument for a survey that writes nothing existing at all. It costs one command and it is the only way to find out what you are about to touch before you touch it.

### The deletion

`build.py`, `src/page.html`, `site/`, `dist/`, the five functions in `api/`, `public/`, the repo root `vercel.json`, `tools/pull.py`, `tools/test_api.mjs` and `data/`. `tools/` and `src/` went empty and went with them.

`web/vercel.json` survived, checked deliberately after the fact. It is the live config for the new app and shares a filename with the one being deleted.

The prose went with the code. `CLAUDE.md`'s "Generating plans" section had told every future reader to edit `data/plans/` and run `python3 build.py`, and every path in it stopped existing. It now points at `backend/content/program_years/<year>/plans/` and `bin/rails content:seed`, with `bin/rails docs:export` named as what keeps this repo the memory of the project. `README.md`, `docs/architecture.md` and `docs/status.md` were updated the same way.

`docs/context.md` was on nobody's list and needed it. `CLAUDE.md` names it as the first file to read, and it described the passphrase gate, `api/page.js` and the build in the present tense throughout.

`docs/rewrite-prompt.md`, `docs/superpowers/` and `docs/history/` were left alone on purpose. They describe the old pipeline in the present tense because they were written while it existed, and they are the record of what was decided and when.

## What was verified, and how

**The content, before deleting the source.** `data/` held the only copy of the program in the old format, so equivalence was proved before it went. 84 drills in `data/drills.json` and 84 in `backend/content/program_years/2026-27/drills.yml`. One plan month on each side, `2026-09.json` and `2026-09.yml`. Then `bin/rails content:seed` ran and reported the same numbers independently: 84 drills, 1 month plan, 21 day cards, and the same four blocks where no drill matched that `build.py` used to print.

**The rake tasks in `CLAUDE.md` actually run.** Both were executed from a clean checkout rather than taken on trust. `content:seed` seeded. `docs:export` wrote `docs/results/2026-27.md` and `docs/plans/2026-27/2026-09.md` with no diff against what was already committed.

**Nothing that remains points at what went.** The grep for dangling references came back to eleven lines, all deliberate. Nine are comments in `backend/` saying what a piece of Ruby was ported from or transcribing the old DDL by hand, which is provenance and should stay. Two are the new lines in `docs/` saying the pipeline is gone. One comment in `plan_seeder_spec.rb` said "the report build.py prints today" and was reworded, because the thing that printed it cannot be re-run and the numbers it is asserting are now only recorded here.

**The suites.** `backend/` 305 examples, 0 failures. `core/` 257 tests. `web/` 264 tests. `bin/rubocop` clean across 142 files.

**The bundle privacy test, specifically.** It shells out to a real `npm run build` and reads the built output, so `data/` disappearing was a plausible way to break it. `web/dist` was deleted and the test re-run from nothing: 35 tests, green.

## What is still open

**The Vercel project has to be repointed at `web/` before this branch merges.** That is Jeff's, by hand, and it is the one ordering constraint left. The branch deletes the root `vercel.json` and everything the old project builds, so merging first takes the served page down.

**The legacy tables stay.** `diary_entry` and `test_result` in `neondb` were not dropped and are not on anyone's list to drop. Deleting files is reversible through git history; dropping the only copy of a row is not.

**`DIARY_PASSPHRASE` is still set on the old Vercel project.** Deleting it is on the runbook and nothing in the repo depends on it any more.

**`WEB_ORIGIN` on the Fly app** is still owed from Phase 2b, and until it is set nobody can sign in to the new site.
