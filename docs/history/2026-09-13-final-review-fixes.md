# 2026-09-13 (late): fixing the whole-branch review

The Phase 1 API was finished, deployed and reviewed as one thing. The review is
at `.superpowers/sdd/2026-09-13-phase-1-rails-api/final-review.md`: 0 critical,
12 important, 22 minor, and a verdict of fit to be Teddy's program for a year
once four things were closed. Jeff picked ten of them and ruled on the shape of
the ones where the shape mattered. This is what was asked and what came back.

## The ten

**The thirteenth and fourteenth vacuous assertions.** "Makes week 8 of a block
Trials" had never evaluated an assertion. September's weeks are
`position_in_block` 1, 2 and 3, so the loop body ran zero times and the example
had been green all month, in the file that encodes the rules of the program.
"Leaves Saturday's home program off" counted day blocks, and two Saturdays in
three carry no `blocks` key, so it looked at one of the three.

Both now read something every week and every Saturday has. The week 8 rule is
written both ways round: "no week but 8 is Trials" has all three weeks as its
subject today and turns into the positive form by itself the day a block reaches
eight weeks in the files. The Saturday rule reads `minutes`, which is on all 21
cards and says "off" on all three Saturdays, and was sitting there unused.

Then a `checked` tally on every example in the file that loops, asserted against
the count the content actually holds. Adding a skip to the day-role rule now
reports "expected 21, got 18". The table of what each rule reaches is in the fix
report.

**CI shipped red.** Six rubocop offences and a brakeman exit 3, so two of three
jobs failed on every push. A gate that is already red stops being a gate. All
six rubocop offences were real style and all six were fixed rather than
configured away. Brakeman's one warning is that Rails 8.0 stops getting security
patches on 2026-11-07, which is true, two months into Teddy's year, and not
fixable by editing code: it needs `bundle update rails` and a deploy. Ignored
with a long note, and the note says the ignore does not lift itself, because
brakeman fingerprints a warning from its code, file and confidence and never
from its message. The alarm that does fire is `spec/rails_version_spec.rb`,
which holds the maintenance dates and fails on the day.

**One coach entry, one shape.** The week payload dumped the record with
`as_json` and `/coach_entries` built a hash by hand, so the same row came back
two ways. The week payload exists so the journal form opens filled in, and the
drill ratings are the half of that form Jeff actually taps, and they were the
half missing. Serializers now hold the shape and both callers go through them.
The guard compares the two key sets rather than listing them.

**The growth sum lived in two places.** The Year tab sorted test results by
`test_date.position` and the Progression tab by window, and both then asked
`cm_per_year`, whose answer depends on which row comes first. They agreed only
because the 2026-27 windows happen to run in the same order as their positions.
Put two of those positions out of order and the Year tab said `null` while
Progression said 12.0, about the one number that triggers halving jumping and
sprinting for 8 to 12 weeks. Third time on this project that one calculation in
two places has drifted. One ordering, one summary, both callers.

**The seeder can take a row out again.** `fly.toml` re-seeds on every deploy, so
"edit the YAML and deploy" is the only way a content change reaches production,
and it could add and change but never remove. Content gets edited by deletion as
often as by addition.

Pruned now, inside the year being seeded and nowhere else: month plans, weeks,
day cards, day blocks, area cells and ball gates. Not pruned: blocks, areas,
patches, test dates, drills, battery tests and battery measures, because each
has a row of Jeff's or Teddy's pointing at it and `BatteryMeasure` declares
`dependent: :destroy` on its test results. Deleting one of those is a migration
Jeff writes and looks at, not a side effect of a deploy.

The question Jeff asked to be answered before anything shipped: what happens to
a journal entry and a test result on a week that is removed. The answer is that
both survive whole. `DayCard` declares `dependent: :nullify` on both journals,
so the entry's `day_card_id` nullifies rather than cascading or raising, and
nothing anywhere reads an entry by `day_card_id`. The API addresses entries by
(user, year, session date) and the week payload by session date, so the entry
still reads back on its own day and relinks on the next write to that date. A
test result never referenced a day card at all.

**Progression stopped guessing which child it means.** `/me` refuses to guess
once there are two athletes. `/progression` took `Athlete.first`, and its policy
never looks at the record, so a second child's whole history would have gone to
anyone signed in including the viewer. One resolution now, shared.

**`/healthz` was worse than the review had it.** The known half: OkComputer's
`ActiveRecordCheck` renders the raw driver exception on failure, and a
`PG::ConnectionBad` message carries the host, the port, the database and the
user straight off the Neon connection string, to any caller, unauthenticated.

The half nobody had: `/healthz` is the OkComputer engine root, and the root runs
the check named "default" and no other. The database check was named "database",
so it sat on `/healthz/database`. Measured, with the database completely
unreachable, `/healthz` returned **200 "default: PASSED Application is
running"**. That is the path Fly polls every 30 seconds and the path the release
command gates on, and it had never once asked the database anything. Fixed by
registering the real check under both names.

**A login rate limit.** Ten attempts every three minutes, by address, counted by
attempt rather than by failure, expiring on its own. Generous for a family of
three on one home address and useless to anyone working through a list. The test
environment moved from `null_store` to `memory_store`, because `rate_limit`
counts into `Rails.cache` and `increment` on a null store always returns nil, so
the suite would have proved nothing about it. The production store was checked
for the same trap and increments correctly.

**`updated_at` on the journals and the results.** The offline queue's safety
argument is that a replayed write lands on the same row, which is real and
tested. The other half was missing: no payload said how old the row was, so a
phone offline for two days overwrote yesterday's laptop edit and neither end
could tell.

## How the session was run

Same rule as the last one, and it earned its keep every time. Every fix shows
the before. Break it, paste the failure, fix it, paste the pass. Two of the ten
turned out to be materially different from the written finding once the failure
was actually produced: `/healthz` was not checking the database at all, and the
brakeman ignore does not expire the way the fingerprint suggests it would.
Neither would have been found by reading.

## What is still open from the review

Everything not on Jeff's list of ten, which is most of the 22 minor findings and
five of the twelve important ones. The ones worth naming: there is still no way
to delete a journal entry, while the exporter carries a whole pruning mechanism
for when something does; `test_results#index` returns every athlete's rows and a
spec pins that as correct; and there is no `after_action :verify_authorized`, so
the fourteenth controller to forget `authorize` will not be caught.
