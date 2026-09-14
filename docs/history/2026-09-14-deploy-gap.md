# Working session, Monday 14 September 2026: why the rope was still on Tuesday

## What was asked

Jump rope still shows on Tuesday this week. What might be wrong.

## What was answered

Nothing was wrong with the content. The API had not been deployed since the change was merged, so production was still serving the card from before it.

`flyctl releases -a teddy-pe-api` is what settled it. The newest release was v8 at 14:43 EDT, and v5 through v8 all pointed at one image built around 14:27. The three merges of the afternoon landed after that: the Phase 3 cutover at 14:54, the jump rope move at 15:13, the Notes challenge at 15:14. The machine was running code and content older than all three.

That matters because of where the plan lives. `backend/content/program_years/2026-27/plans/2026-09.yml` ships inside the Docker image, and `fly.toml` runs `bin/rails db:prepare content:seed` as the release command. The seeder reads the YAML in the image it was built from. An image built at 14:27 carries the Tuesday card, so every release command since has been faithfully seeding the old truth.

The repo was right the whole time. `main` had the rope on Thursday and off Tuesday, and `plan_seeder_spec.rb` pinned it from both ends. Client caching was ruled out on the way past: only auth and the outbox persist to `localStorage`, and week content is fetched on every visit.

## Why it stayed hidden for two hours

`4559919 test build` was pushed at 15:35, an empty commit. It rebuilt the web app on Vercel, which is the half of the deploy that is automatic, and that rebuild could never have changed a day card. The front end asked the same stale API it had been asking all along.

Under that sat a sentence in this repo. `CLAUDE.md` and `README.md` both said a merge to `main` seeds production on its own. It is not true and has never been true: `.github/workflows/ci.yml` scans, lints and tests, and nothing in it talks to Fly. The Fly deploy has always been a command someone types, exactly as `docs/status.md` already described for the password change. Anyone reading the repo had been told the deploy was already handled.

## What got done

Jeff ran `fly deploy -a teddy-pe-api` from the `main` checkout. v9 went out at 15:50:55 EDT on a new image, and the release machine logged what was wanted:

```
Preparing to run: `bin/rails db:prepare content:seed` as rails
day_blocks: 50
pruned day_blocks: 1
```

That pruned row is Tuesday's jump rope block leaving production, the same count the local seed reported when the move was written. The database itself was never read back: auto mode blocks production reads, so the seeder's own prune count plus the YAML inside the shipped image is the evidence this rests on.

Then the sentence that caused it. `CLAUDE.md` and `README.md` now say the API deploy is manual, give the command, and say plainly that a Vercel rebuild does not move program content. Both add the other half of the trap: `fly deploy` uploads the current directory as the build context, so a deploy from a stale worktree seeds stale content. There is a second worktree in this repo, sitting on `docs/tennis-subtarget-decision`, whose copy of September still has the rope on Tuesday.

## What was not done

No automatic deploy on merge. It would have prevented this, and it is a real decision about a production database holding Teddy's journal rather than a docs fix, so it is Jeff's to make. Worth weighing against how often the content changes: a deploy step someone runs on purpose is cheap when the answer is a few times a month.

Nothing was added that would have caught this from inside the repo either. A test cannot see which image Fly is running.
