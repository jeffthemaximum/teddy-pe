# Working session, Monday 14 September 2026: the password minimum

## What was asked

Reset all three accounts to one password Jeff chose, and, when that turned out to be impossible, lower the minimum password length to 6 so it was possible. The password itself is not written down here: it is 7 characters, which is the only thing about it that mattered.

## What was answered

It is 7 characters. `backend/app/models/user.rb` required 12, so `update!` would have raised `RecordInvalid` on all three. The concern was put once, with both halves of it: the throttle on `AuthController#login` is what holds an online guessing run, and the length minimum is the floor for the case where the database leaks. Jeff decided. It is his family and his app.

### What got built

One number, and the test it never had.

`backend/spec/models/user_spec.rb` did not exist. Nothing anywhere asserted the minimum, which is exactly why lowering it looked free: a one-character edit with no suite to disagree. Three examples now: one below the boundary refused, one at it accepted, and the `allow_nil` behaviour that keeps saving a user with a new name from being a password change. Two of the three were red against the old 12, failing on "Password is too short (minimum is 12 characters)".

Then `minimum: 12` became `minimum: 6`, with a comment saying what the number is for so the next person to move it weighs the same thing.

Nothing else changed. Neither `web/` nor `core/` validates length, so the server holds the only copy. The factory's `"a-long-enough-password"` is valid under either rule, so no fixture moved.

## A detour worth recording

The full suite reported 1 failure, then 76, then a Postgres deadlock inside DatabaseCleaner's truncation, then 0 examples at all. None of it was the change.

An earlier `rspec` was still running, and a `pkill -9` had left one of its connections **idle in transaction** holding an `AccessShareLock`. Every later run's truncation deadlocked against it, and the numbers were whatever the run reached before dying. `pg_stat_activity` showed it in one query: a live rspec backend, idle in transaction, mid-INSERT on `day_cards`.

Killing the real process and terminating the orphaned backend fixed it. The suite then ran clean: **252 examples, 0 failures**, up from 249 by the three added here.

The lesson is small and cheap: a test failure that changes shape between identical runs is not a test failure. Look at what is holding the database before reading anything into the number.

## What is still owed

The reset itself, which cannot run until this is deployed, because a `rails runner` on the Fly machine runs the deployed code and the deployed code still requires 12. Merge, `fly deploy -a teddy-pe-api`, then reset. Everyone signs out when it lands: the JWT carries a fingerprint of the password digest, so every token on every device dies and all three sign in again.
