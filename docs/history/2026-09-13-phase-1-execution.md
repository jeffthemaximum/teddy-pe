# Working session, Sunday Sep 13, 2026 (night into Monday): Phase 1 built

Fifth session of the day, and the first one that wrote code. The previous session produced `docs/superpowers/specs/2026-09-13-rewrite-design.md` and a 16-task implementation plan. This session executed it.

## What Jeff asked

"Go." Then, when offered a choice of execution mode, "1. Subagent-Driven." That means a fresh implementer agent per task, a spec-and-quality review after each one, fix rounds until the review is clean, and a broad review of the whole branch at the end. Jeff stays out of it until the gate.

He asked four questions during the run, and three of them were the same question: what was I waiting on him for. The answer each time was nothing. That is recorded below because the cause was mine.

## What got built

A Rails 8 API-only app in `backend/`, Ruby 3.3.5, PostgreSQL 17, RSpec. Twenty-three tables. JWT bearer auth over `has_secure_password`. Pundit policies, with filtering done in SQL rather than handed to the client to hide. The whole program moved out of `data/plans/*.json` into `backend/content/` as YAML and is seeded into Postgres by an idempotent `rails content:seed`.

Nothing on `main` was touched. It sits where it started.

The endpoints, in the order they were built: auth, program year, month plan, week, day, journal, test results, progression, and `rails docs:export`, which writes the database back out as prose into `docs/` so this repo stays what `CLAUDE.md` says it is.

## The rules of the program are now tests

`backend/spec/content_spec.rb` reads the YAML and fails if the content breaks a rule from `CLAUDE.md`. Day roles in their fixed order. High-intent effort zero on Sunday and Monday, five or under on Friday, forty or under in a week. One tennis, one basketball and one soccer sub-target per week. Ball volume counted in touches. No fall drill that needs Jeff to sprint.

That last one is the reason the suite is worth having. Three of these rules were written so that they only examined days carrying a `blocks` key, which only week 1 has. The sprint rule was reading 7 of 21 days and passing. A rule that checks a third of the month and reports success is worse than no rule, because it is trusted.

## Nine tests that passed while checking nothing

This was the defect that kept coming back, in three shapes: asserting a key exists rather than what it equals, asserting a collection is not empty rather than what is in it, and comparing two values that are both `nil`, so the assertion reads `nil == nil` and can never fail.

Nine were found. One I wrote myself, while fixing others. One an implementer found inside the brief I had handed it.

What eventually worked was stating the running count and the three shapes in every dispatch, rather than a general warning about test quality. After that, implementers started finding them independently.

## What the reviews caught that a passing suite would not have

- A stolen token was permanent account takeover. Changing a password did not invalidate anything issued before it. Now a token carries a fingerprint of the password digest and dies when the password changes, and a change requires the current password.
- The growth pace was measuring data entry rather than growth. It divided by the gap between `recorded_at` timestamps, so typing September's height and December's height in one sitting gave a span of minutes. Worse, the same wrong code was in my plan twice. One copy was fixed; the other survived four more tasks because its fixture happened to have both the timestamps and the test windows a year apart, so the broken formula and the correct one returned the same number. It now lives once, on `TestResult`, where a single existing test guards both callers.
- The seeder keyed the athlete on his name and the ball gates on their ordinal position, so renaming Teddy would create a second athlete and reordering the gates would rewrite the wrong rows. Fixing that introduced a second bug, a unique index still standing on a column that was now allowed to change, which had to be dropped.
- Battery cards came back in lexical order, rendering `t1, t10, t11l, t11r, t2` instead of sheet order. Jeff would have seen that one on the first screen.
- The month view cost 21 queries for want of preloading, and the first fix over-preloaded.
- `config/master.key` was going to ship inside the Docker image.
- CI had never run once. The workflow file was at `backend/.github/workflows/`, one directory below where GitHub looks. So was `dependabot.yml`. Both are now at the repository root.
- The Dockerfile's `chown log` failed on a real build, because `log` and `tmp` are excluded by `.dockerignore` and nothing recreated them. That one only surfaced because Jeff installed Docker mid-session, which is a good argument for verifying infrastructure by running it rather than by reading it.

## Two things about how the session was run

**Every proof has to show the before.** A fix that comes with a passing test proves the test passes. Implementers were asked to break the thing again and paste the failure, so the test is shown to discriminate. The clearest example: before the growth-pace guard, a misordered test date produced **-12.0 cm per year**, which reads as Teddy shrinking and would have quietly suppressed the growth-load trigger the number exists to fire. After, `nil`.

**Query counts are measured, never asserted as absolute numbers.** A spec that pins "8 queries" fails on an unrelated change and gets updated without thought until it means nothing. The specs pin the relationship instead: adding a second year, or a tenth drill, must not add a query.

## The mistake worth writing down

Jeff asked three times whether I was waiting on an answer from him. I was not, any of the three times. The cause was that I had been narrating the questions I was putting to *reviewer agents*, which read exactly like questions I was putting to him. He was sitting there believing he was the thing blocking his own project.

The fix was one line per task at completion and nothing else until the gate. Worth remembering next time: a progress narration that mentions open questions is indistinguishable, to the person reading it, from a request.

## Parallelism, since Jeff asked

Mostly no. `config/routes.rb` is touched by five of the remaining tasks and the payload services by two or three each, so running implementers concurrently would have had two agents editing one file. The one clean split was the infrastructure half of the deployment task, which shares nothing with the API work. Running it early is what surfaced the CI path bug, the master key leak and the Docker build failure, all of which would otherwise have been found at the very end.

## What Jeff has to decide at the gate

The deploy. `flyctl` is installed and authenticated, `fly.toml` is complete, and `teddy-pe-api` does not exist yet. It is blocked on a Neon database that nothing in this repo can create, but it would be a question for Jeff regardless: `fly deploy` puts a public endpoint holding his son's private journal on the internet and starts billing his personal account, and the step that proves a stranger sees nothing runs after the thing is already reachable.

Three secrets are needed: `DATABASE_URL`, `RAILS_MASTER_KEY`, and `WEB_ORIGIN`, which defaults to localhost and will silently break the browser in Phase 2 if it is left that way.

The `hie` numbers are his to correct, not to approve. They satisfy every rule in `CLAUDE.md`, but satisfying a cap is not the same as being the right number for that Wednesday, and I chose them.
