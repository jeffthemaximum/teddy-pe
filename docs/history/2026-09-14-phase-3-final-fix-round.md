# 2026-09-14: Phase 3, the final fix round

## What was asked

A whole-branch review of `feature/phase-3-migration` returned "not safe to run against production data" with seven findings. Make it safe. The stake: this migrates a year of Teddy's training records and Jeff's coaching diary out of the old Neon tables, and a later task permanently deletes those tables. There is no other copy.

Work test first throughout, and prove the no-overwrite example is not vacuous by restoring the old behaviour and watching it fail.

## What was wrong, and what was done

**Critical 1. An absent legacy table read as clean.** `Verifier#comparable_diary` and `#comparable_results` returned `[]` when the table was not present, so `clean?` was true, `legacy:verify` printed "Safe to delete the old pipeline" and exited 0. The realistic path is the old rows living in the Vercel Neon database while `LEGACY_DATABASE_URL` is unset or set on the wrong Fly app: every task reports zeros that look exactly like "there was nothing to migrate", and the next task deletes the only copy. The survey, both migrators and the verifier now report `:tables_missing` by real table name, `clean?` is false whenever it is non-empty, `legacy:verify` exits 1, and every rake task says the old rows are probably in another database and that `LEGACY_DATABASE_URL` is how to point at it.

Row count is deliberately not part of this. A legacy table that exists with nothing in it is a legitimate state, and blocking on it would push whoever is running the cutover into bypassing the gate, which is worse than the problem it would catch.

**Critical 2. The journal migrator overwrote what the new system held.** `CoachEntry.upsert_for` does `find_or_initialize_by` then `assign_attributes`, so every carried field on an entry that was already there was replaced with the legacy value, a `nil` over a note Jeff typed on the new site included, and `replace_ratings!` overwrote any rating the legacy payload named. The plan states "the new system wins every collision, conflicts are reported, never resolved automatically" as a global constraint, and it had been implemented on the result side only.

It now mirrors `ResultMigrator`. A kept entry at (coach, program year, session date) that agrees on every carried field and every legacy rating goes to `:already_migrated` and nothing is written. One that disagrees goes to `:conflicts` naming the carried fields and rating slugs that disagree, and nothing is written. Naming them is the point: whoever reads that output has to decide which version is right, on a day that cannot be re-lived.

**Important 3. The verifier looked entries up without the key they were written under.** It used `CoachEntry.kept.find_by(session_date:)` while the unique index is (user_id, program_year_id, session_date). Running `legacy:migrate` once with a wrong `COACH_EMAIL` and once with the right one leaves two complete sets, violating nothing, and the verifier picked one arbitrarily and read clean. It now takes the coach, `legacy:verify` takes `COACH_EMAIL=` the same way `legacy:migrate` does, and the diary count is scoped the same way. A gap between the two diary counts is reported in a paragraph and never blocks: failed rows and conflicts are legitimate causes, and a gate that fires on a legitimate state teaches people to walk past gates.

**Important 4. A second run called every migrated result a conflict.** `ResultMigrator` treated any existing `TestResult` as a conflict without comparing values, so a second run printed a wall of "left alone, old 4.4, current 4.4" with any real disagreement buried in it. It now compares `row.value.to_s.strip` against `existing.raw_value`; equal goes to `:already_migrated` and is reported as one line.

**Important 5. The survey did not check what the migrator checked.** It checked test ids against every `BatteryMeasure` and windows against every `TestDate`, and still used the `TestDate.find_by(window:)` that ruling R9 had removed from the migrator and the verifier. The survey is what a person reads before typing `CONFIRM=yes`, so it under-reporting what will not map is worse than the migrator doing it. `Legacy::Mapping` now owns the lookup and all three call it, with a comment saying the three must agree.

**The structural one.** The verifier compared no `drill_ratings` at all, so the half of a diary entry that records what Teddy owns passed the gate unchecked. And `Verifier::DIARY_FIELDS` and `JournalMigrator#carried` were two hand-written lists with nothing asserting they agree: add a field to `carried` and the verifier silently stops checking it, with no test failing. Ratings are now compared, excluding slugs with no `Drill` (the ones the migrator reports as dropped and cannot write), and one spec asserts the two lists are equal.

**Minor 7. Rake ergonomics.** A missing or unknown `COACH_EMAIL` raised a bare `KeyError` or `RecordNotFound` backtrace; both tasks now abort with a sentence saying what to pass. `legacy:migrate` printed its whole report at the very end, so a dropped `fly ssh console` left the writes done and nothing said; each migrator now reports the moment it finishes, and the task closes by saying it is safe to run again, which is true now and is the honest answer to an interrupted run.

## The vacuity proofs

The no-overwrite work was proved not vacuous twice over.

Before the fix, the four new journal examples failed against the real bug: the note came back `nil` where "Jeff typed this on the new site." had been, the rating came back `"owns"` where the new system held `"getting"`, and `created_at` came back as the legacy timestamp.

After the fix, commenting out the guard and restoring the direct `upsert_for` call reproduced all four failures exactly. Reverted.

The structural spec was proved the same way: removing `challenge_num` from `DIARY_FIELDS` fails the agreement spec and nothing else, which is precisely the drift it exists to catch.

## Run against the real tasks

Beyond the suite, all three rake tasks were driven end to end against a seeded test database: the happy path, a second run (nothing written, nothing called a conflict), a conflict on a field, a rating and a result at once, a missing `COACH_EMAIL`, an unknown one, and a dropped `diary_entry` table. The last one is the finding that mattered most: `legacy:verify` named the table, said nothing had been compared to anything, and exited 1.

## What is still open

Nothing has been run against production and nothing has been deleted. The cutover runbook is Task 5 of the plan, and its step 2 has been corrected: it claimed the ordering against Teddy's Baseline does not matter in either direction, which was true of the results and false of the diary until Critical 2 was fixed.

`Verifier`'s `:mismatches` bucket is now always empty, because a migrator that never overwrites cannot produce one. It stays in the report, documented, rather than being removed.
