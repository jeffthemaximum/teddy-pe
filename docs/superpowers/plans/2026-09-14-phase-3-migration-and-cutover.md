# Phase 3: Migration and Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every row Teddy and Jeff have written in the old Neon tables into the Rails schema, prove nothing was lost, then delete the old pipeline and the documentation that describes it.

**Architecture:** A read-only survey runs first and reports what exists and what will not map, so the unknowns are named before anything is written. Two migrators then copy `diary_entry` into `coach_entries` plus `drill_ratings`, and the old `test_result` into `test_results`, both idempotent and both refusing to overwrite anything the new system already holds. A verifier compares the two databases row by row. Only after it passes does any deletion happen.

**Tech Stack:** Rails 8.0, Ruby 3.3.5, PostgreSQL 17 on Neon, RSpec, a second ActiveRecord connection for the legacy tables.

**Spec:** `docs/superpowers/specs/2026-09-13-rewrite-design.md`, section "Migration and cutover, Phase 3". Brief: `docs/rewrite-prompt.md`, decision 9 and the Phase 3 gate.

## Global Constraints

- **The legacy database is read-only for the whole of this phase.** Nothing in `backend/app/services/legacy/` may issue INSERT, UPDATE, DELETE or DDL against the legacy connection. The old rows are the only copy until Task 5 proves otherwise.
- **Verification precedes deletion.** Spec step 3: "Verify by row count and a spot check of specific entries **before** anything is dropped." Task 6 must not start until Task 4 reports clean.
- **The new system wins every collision.** Jeff records Teddy's Baseline numbers on the new site from 15 September. A migrator that overwrote a row he had just typed would destroy a measurement that cannot be taken again. Conflicts are reported, never resolved automatically.
- **Timestamps are carried across.** `created_at` on a diary entry and `recorded_at` on a test result are facts about when something happened. `TestResult.upsert_for` stamps `recorded_at: Time.current`, so the migrator must not use it.
- `dow`, `plan_month`, `week` and `device` from `diary_entry` are deliberately not carried into `CoachEntry` (spec, Decisions I made, item 4). The first three are derivable, the fourth is dead.
- Writing style for every string a person reads, including rake output: direct, warm, specific. No em dashes. Avoid "it's not X, it's Y".
- Every commit goes on `feature/phase-3-migration`. Never commit to `main`. Jeff merges.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/models/legacy/record.rb` | Abstract base holding the second connection. The only place the legacy URL is read. |
| `backend/app/models/legacy/diary_entry.rb` | Maps the `diary_entry` table. Read-only. |
| `backend/app/models/legacy/test_result.rb` | Maps the old `test_result` table. Read-only. |
| `backend/app/services/legacy/survey.rb` | Counts both tables and names everything that will not map. Writes nothing. |
| `backend/app/services/legacy/journal_migrator.rb` | `diary_entry` into `coach_entries` and `drill_ratings`. |
| `backend/app/services/legacy/result_migrator.rb` | old `test_result` into `test_results`. |
| `backend/app/services/legacy/verifier.rb` | Compares both databases field by field and reports what disagrees. |
| `backend/lib/tasks/legacy.rake` | `legacy:survey`, `legacy:migrate`, `legacy:verify`. |
| `backend/spec/services/legacy/*_spec.rb` | One spec per service. |
| `backend/spec/support/legacy_tables.rb` | Creates the two legacy tables in the test database. |

---

### Task 1: The legacy connection and a survey that writes nothing

**Files:**
- Create: `backend/app/models/legacy/record.rb`, `backend/app/models/legacy/diary_entry.rb`, `backend/app/models/legacy/test_result.rb`, `backend/app/services/legacy/survey.rb`, `backend/spec/support/legacy_tables.rb`
- Create: `backend/lib/tasks/legacy.rake`
- Test: `backend/spec/services/legacy/survey_spec.rb`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Legacy::Record.connect!`, `Legacy::DiaryEntry`, `Legacy::TestResult`, and `Legacy::Survey.new.run` returning a Hash with keys `:diary_count`, `:result_count`, `:unmapped_drill_slugs` (Array<String>), `:unmapped_test_ids` (Array<String>), `:unmapped_windows` (Array<String>), `:dates_outside_any_year` (Array<Date>), `:already_present_results` (Array<Hash> with `:window`, `:test_id`, `:legacy_value`, `:current_value`).

**Why this is its own task.** Nobody knows yet how many rows are in the old tables, whether they live in the same Neon database as Rails, or whether every drill slug written this year still exists under that slug in `backend/content/`. Reading first and writing second means the surprises arrive while nothing is at stake.

- [ ] **Step 1: Write the support file that creates the legacy tables in the test database**

The legacy URL defaults to `DATABASE_URL`, so in the test environment the legacy connection is the test database. Create the two old tables there with exactly the DDL from `api/diary.js` and `api/results.js`, transcribed by hand.

```ruby
# backend/spec/support/legacy_tables.rb
#
# The old Vercel functions created their tables on a cold start rather than
# through a migration, so there is no schema file to load. These two
# statements are transcribed by hand from api/diary.js and api/results.js.
# Reading them from those files instead would make this fixture agree with a
# shape the migrator has never actually seen.
module LegacyTables
  DIARY = <<~SQL
    create table if not exists diary_entry (
      id            text primary key,
      created_at    timestamptz not null default now(),
      session_date  date        not null,
      dow           text,
      plan_month    text,
      week          integer,
      overall       smallint,
      energy        smallint,
      flag_pain     boolean     not null default false,
      pain_note     text,
      note          text,
      ratings       jsonb       not null default '{}'::jsonb,
      challenge_num text,
      device        text
    )
  SQL

  RESULT = <<~SQL
    create table if not exists test_result (
      id          text primary key,
      test_window text        not null,
      test_id     text        not null,
      value       text        not null,
      recorded_at timestamptz not null default now(),
      device      text
    )
  SQL

  def self.create!
    connection = ActiveRecord::Base.connection
    connection.execute(DIARY)
    connection.execute(RESULT)
  end

  def self.truncate!
    connection = ActiveRecord::Base.connection
    connection.execute("truncate diary_entry, test_result")
  end
end
```

Wire it into `backend/spec/rails_helper.rb`, inside the existing `RSpec.configure` block:

```ruby
  require Rails.root.join("spec/support/legacy_tables")

  config.before(:suite) { LegacyTables.create! }
  config.before(:each, :legacy) { LegacyTables.truncate! }
```

- [ ] **Step 2: Write the failing survey spec**

```ruby
# backend/spec/services/legacy/survey_spec.rb
require "rails_helper"

RSpec.describe Legacy::Survey, :legacy do
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }

  def insert_diary(date:, ratings: {}, note: "went well")
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", [date, note, ratings.to_json])
      insert into diary_entry (id, session_date, note, ratings)
      values ('e-' || $1::text, $1::date, $2, $3::jsonb)
    SQL
  end

  def insert_result(window:, test_id:, value:)
    ActiveRecord::Base.connection.exec_query(<<~SQL, "result", [window, test_id, value])
      insert into test_result (id, test_window, test_id, value)
      values ($1 || ':' || $2, $1, $2, $3)
    SQL
  end

  it "counts what is in each legacy table" do
    year
    insert_diary(date: "2026-09-14")
    insert_diary(date: "2026-09-15")
    insert_result(window: "2026-09", test_id: "t1", value: "4.5")

    report = described_class.new.run

    expect(report[:diary_count]).to eq(2)
    expect(report[:result_count]).to eq(1)
  end

  it "names a drill slug that no longer exists, rather than dropping it quietly" do
    year
    create(:drill, slug: "a-skip")
    insert_diary(date: "2026-09-14", ratings: { "a-skip" => "owns", "gone-drill" => "getting" })

    report = described_class.new.run

    expect(report[:unmapped_drill_slugs]).to eq(["gone-drill"])
  end

  it "names a test id and a window with nothing to map onto" do
    year
    create(:battery_measure, program_year: year, test_id: "t1")
    create(:test_date, program_year: year, window: "2026-09")
    insert_result(window: "2026-09", test_id: "t99", value: "4.5")
    insert_result(window: "2099-01", test_id: "t1", value: "4.5")

    report = described_class.new.run

    expect(report[:unmapped_test_ids]).to eq(["t99"])
    expect(report[:unmapped_windows]).to eq(["2099-01"])
  end

  it "names a session date that falls in no program year" do
    year
    insert_diary(date: "2020-01-01")

    report = described_class.new.run

    expect(report[:dates_outside_any_year]).to eq([Date.new(2020, 1, 1)])
  end

  it "names a result the new system already holds, with both values side by side" do
    measure = create(:battery_measure, program_year: year, test_id: "t1")
    date = create(:test_date, program_year: year, window: "2026-09")
    TestResult.create!(program_year: year, athlete: year.athlete, test_date: date,
                       battery_measure: measure, recorded_by_user: create(:user, :coach),
                       raw_value: "10", recorded_at: Time.current)
    insert_result(window: "2026-09", test_id: "t1", value: "4.5")

    report = described_class.new.run

    expect(report[:already_present_results]).to eq([
      { window: "2026-09", test_id: "t1", legacy_value: "4.5", current_value: "10" },
    ])
  end

  # The whole point of a survey is that it is safe to run against production
  # on a whim. If it can write, it is not a survey.
  it "writes nothing to either database" do
    year
    create(:drill, slug: "a-skip")
    insert_diary(date: "2026-09-14", ratings: { "a-skip" => "owns" })
    insert_result(window: "2026-09", test_id: "t1", value: "4.5")

    expect { described_class.new.run }
      .to not_change { CoachEntry.count }
      .and not_change { DrillRating.count }
      .and not_change { TestResult.count }
      .and not_change { ActiveRecord::Base.connection.select_value("select count(*) from diary_entry") }
      .and not_change { ActiveRecord::Base.connection.select_value("select count(*) from test_result") }
  end
end
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `cd backend && bundle exec rspec spec/services/legacy/survey_spec.rb`
Expected: FAIL with `uninitialized constant Legacy`.

- [ ] **Step 4: Write the legacy models**

```ruby
# backend/app/models/legacy/record.rb
module Legacy
  # The old Vercel functions wrote to Neon directly. Their tables may sit in
  # the same database as this app or in a different one, so the URL is a
  # separate setting that falls back to this app's own. Set
  # LEGACY_DATABASE_URL only if the old rows live somewhere else.
  #
  # Every subclass is read-only. The old rows are the only copy of a year of
  # Teddy's program until the verifier says otherwise, and a migrator that
  # can write to its own source can destroy the thing it is copying.
  class Record < ActiveRecord::Base
    self.abstract_class = true

    def self.legacy_url
      ENV["LEGACY_DATABASE_URL"].presence || ENV.fetch("DATABASE_URL")
    end

    def self.connect!
      establish_connection(legacy_url) unless connected?
    end

    def readonly? = true
  end
end
```

```ruby
# backend/app/models/legacy/diary_entry.rb
module Legacy
  class DiaryEntry < Record
    self.table_name = "diary_entry"
    self.inheritance_column = nil

    def self.table_present? = connection.table_exists?("diary_entry")
  end
end
```

```ruby
# backend/app/models/legacy/test_result.rb
module Legacy
  # Named TestResultRow rather than TestResult so it can never be confused
  # with the Rails model of the same name at a glance in a migrator.
  class TestResultRow < Record
    self.table_name = "test_result"
    self.inheritance_column = nil

    def self.table_present? = connection.table_exists?("test_result")
  end
end
```

- [ ] **Step 5: Write the survey**

```ruby
# backend/app/services/legacy/survey.rb
module Legacy
  # Reads both old tables and reports what exists and what will not map.
  # Writes nothing, so it is safe to run against production at any time.
  class Survey
    def run
      Legacy::Record.connect!

      diary = Legacy::DiaryEntry.table_present? ? Legacy::DiaryEntry.order(:session_date).to_a : []
      results = Legacy::TestResultRow.table_present? ? Legacy::TestResultRow.order(:test_window, :test_id).to_a : []

      {
        diary_count: diary.size,
        result_count: results.size,
        unmapped_drill_slugs: unmapped_drill_slugs(diary),
        unmapped_test_ids: unmapped(results.map(&:test_id), BatteryMeasure.pluck(:test_id)),
        unmapped_windows: unmapped(results.map(&:test_window), TestDate.pluck(:window)),
        dates_outside_any_year: diary.map(&:session_date).uniq.select { |d| year_for(d).nil? }.sort,
        already_present_results: already_present(results),
      }
    end

    private

    def unmapped(seen, known)
      (seen.uniq - known).sort
    end

    def unmapped_drill_slugs(diary)
      slugs = diary.flat_map { |row| (row.ratings || {}).keys }.uniq
      unmapped(slugs, Drill.pluck(:slug))
    end

    def year_for(date)
      ProgramYear.find_by("starts_on <= ? and ends_on >= ?", date, date)
    end

    # A legacy row whose slot the new system already fills. Both values are
    # reported so Jeff can see which number is the real measurement; nothing
    # here decides that.
    def already_present(results)
      results.filter_map do |row|
        existing = current_result(row)
        next if existing.nil?

        { window: row.test_window, test_id: row.test_id,
          legacy_value: row.value, current_value: existing.raw_value }
      end
    end

    def current_result(row)
      date = TestDate.find_by(window: row.test_window) or return nil
      measure = BatteryMeasure.find_by(program_year_id: date.program_year_id, test_id: row.test_id) or return nil
      TestResult.find_by(program_year_id: date.program_year_id, test_date: date, battery_measure: measure)
    end
  end
end
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/services/legacy/survey_spec.rb`
Expected: 6 examples, 0 failures. If `create(:battery_measure)` or `create(:test_date)` does not exist, add those factories in `backend/spec/factories/` following the shape of `backend/spec/factories/program_years.rb`.

- [ ] **Step 7: Write the rake task**

```ruby
# backend/lib/tasks/legacy.rake
namespace :legacy do
  desc "Read the old Neon tables and report what exists and what will not map. Writes nothing."
  task survey: :environment do
    report = Legacy::Survey.new.run

    puts "diary_entry rows:  #{report[:diary_count]}"
    puts "test_result rows:  #{report[:result_count]}"

    section = lambda do |label, items, explain|
      next if items.empty?

      puts
      puts "#{label} (#{items.size}): #{items.join(', ')}"
      puts "  #{explain}"
    end

    section.call("drill slugs with no drill", report[:unmapped_drill_slugs],
                 "These ratings have nowhere to go. Add the drill to backend/content or accept losing the rating.")
    section.call("test ids with no measure", report[:unmapped_test_ids],
                 "These results have nowhere to go.")
    section.call("windows with no test date", report[:unmapped_windows],
                 "These results have nowhere to go.")
    section.call("session dates in no program year", report[:dates_outside_any_year].map(&:to_s),
                 "These entries predate the program year or fall after it.")

    if report[:already_present_results].any?
      puts
      puts "results the new system already holds (#{report[:already_present_results].size}):"
      report[:already_present_results].each do |r|
        puts "  #{r[:window]} #{r[:test_id]}: old #{r[:legacy_value]}, current #{r[:current_value]}"
      end
      puts "  The migration leaves all of these alone. Decide which number is real yourself."
    end
  end
end
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/legacy backend/app/services/legacy backend/lib/tasks/legacy.rake backend/spec/services/legacy backend/spec/support/legacy_tables.rb backend/spec/rails_helper.rb
git commit -m "Read the old tables before writing anything to the new ones"
```

---

### Task 2: Migrate the coach's diary

**Files:**
- Create: `backend/app/services/legacy/journal_migrator.rb`
- Modify: `backend/lib/tasks/legacy.rake`
- Test: `backend/spec/services/legacy/journal_migrator_spec.rb`

**Interfaces:**
- Consumes: `Legacy::Record.connect!`, `Legacy::DiaryEntry` from Task 1.
- Produces: `Legacy::JournalMigrator.new(coach:).run!` returning a Hash with keys `:migrated` (Integer), `:skipped` (Array<Hash> with `:session_date`, `:reason`), `:dropped_ratings` (Array<Hash> with `:session_date`, `:slug`).

- [ ] **Step 1: Write the failing spec**

```ruby
# backend/spec/services/legacy/journal_migrator_spec.rb
require "rails_helper"

RSpec.describe Legacy::JournalMigrator, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }

  def insert_diary(date:, **attrs)
    row = { note: nil, pain_note: nil, overall: nil, energy: nil, flag_pain: false,
            challenge_num: nil, ratings: {}, created_at: "2026-09-14 08:00:00+00",
            dow: "Mon", plan_month: "2026-09", week: 1, device: "iPhone" }.merge(attrs)
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", [
      date, row[:note], row[:pain_note], row[:overall], row[:energy], row[:flag_pain],
      row[:challenge_num], row[:ratings].to_json, row[:created_at], row[:dow],
      row[:plan_month], row[:week], row[:device]
    ])
      insert into diary_entry
        (id, session_date, note, pain_note, overall, energy, flag_pain,
         challenge_num, ratings, created_at, dow, plan_month, week, device)
      values ('e-' || $1::text, $1::date, $2, $3, $4, $5, $6, $7, $8::jsonb,
              $9::timestamptz, $10, $11, $12, $13)
    SQL
  end

  it "puts the entry on the coach's account in the year that contains its date" do
    year
    insert_diary(date: "2026-09-16", note: "Sharp on the wall today.")

    described_class.new(coach: coach).run!

    entry = CoachEntry.sole
    expect(entry.user).to eq(coach)
    expect(entry.program_year).to eq(year)
    expect(entry.athlete).to eq(year.athlete)
    expect(entry.session_date).to eq(Date.new(2026, 9, 16))
    expect(entry.note).to eq("Sharp on the wall today.")
  end

  # Each field written out by hand. Reading them off the legacy row in a loop
  # would pass against a migrator that copied nothing but the column names.
  it "carries every field the new schema has a home for" do
    year
    insert_diary(date: "2026-09-16", overall: 4, energy: 3, flag_pain: true,
                 pain_note: "Left ankle, mild.", note: "Good session.",
                 challenge_num: "3")

    described_class.new(coach: coach).run!

    entry = CoachEntry.sole
    expect(entry.overall).to eq(4)
    expect(entry.energy).to eq(3)
    expect(entry.flag_pain).to be(true)
    expect(entry.pain_note).to eq("Left ankle, mild.")
    expect(entry.note).to eq("Good session.")
    expect(entry.challenge_num).to eq("3")
  end

  it "keeps the day the entry was written, not the day it was migrated" do
    year
    insert_diary(date: "2026-09-16", created_at: "2026-09-16 19:30:00+00")

    described_class.new(coach: coach).run!

    expect(CoachEntry.sole.created_at).to be_within(1.second).of(Time.utc(2026, 9, 16, 19, 30))
  end

  it "explodes the ratings json into drill ratings" do
    year
    skip_drill = create(:drill, slug: "a-skip")
    wall = create(:drill, slug: "wall-rally")
    insert_diary(date: "2026-09-16", ratings: { "a-skip" => "owns", "wall-rally" => "getting" })

    described_class.new(coach: coach).run!

    ratings = DrillRating.order(:drill_id).pluck(:drill_id, :rating)
    expect(ratings).to match_array([[skip_drill.id, "owns"], [wall.id, "getting"]])
    expect(DrillRating.first.session_date).to eq(Date.new(2026, 9, 16))
    expect(DrillRating.first.program_year).to eq(year)
  end

  # CoachEntry#replace_ratings! does `Drill.find_by(slug:) or next`, which is
  # right for a live form and wrong for a migration: a slug renamed since the
  # rating was written would vanish with no trace. The migrator reports it.
  it "reports a rating whose drill no longer exists instead of dropping it in silence" do
    year
    create(:drill, slug: "a-skip")
    insert_diary(date: "2026-09-16", ratings: { "a-skip" => "owns", "renamed-drill" => "getting" })

    report = described_class.new(coach: coach).run!

    expect(report[:dropped_ratings]).to eq([
      { session_date: Date.new(2026, 9, 16), slug: "renamed-drill" },
    ])
    expect(DrillRating.count).to eq(1)
  end

  it "links the day card when the date has one" do
    year
    card = create(:day_card, date: "2026-09-16", program_year: year)

    insert_diary(date: "2026-09-16")
    described_class.new(coach: coach).run!

    expect(CoachEntry.sole.day_card).to eq(card)
  end

  it "skips a date that belongs to no program year and says so" do
    year
    insert_diary(date: "2020-01-01")

    report = described_class.new(coach: coach).run!

    expect(CoachEntry.count).to eq(0)
    expect(report[:skipped]).to eq([
      { session_date: Date.new(2020, 1, 1), reason: "no program year contains this date" },
    ])
  end

  it "can be run twice without making a second copy" do
    year
    insert_diary(date: "2026-09-16", note: "Good session.")

    described_class.new(coach: coach).run!
    second = described_class.new(coach: coach).run!

    expect(CoachEntry.count).to eq(1)
    expect(second[:migrated]).to eq(1)
  end

  it "leaves the legacy rows exactly as it found them" do
    year
    insert_diary(date: "2026-09-16", note: "Good session.")
    before = ActiveRecord::Base.connection.select_all("select * from diary_entry").to_a

    described_class.new(coach: coach).run!

    after = ActiveRecord::Base.connection.select_all("select * from diary_entry").to_a
    expect(after).to eq(before)
  end
end
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd backend && bundle exec rspec spec/services/legacy/journal_migrator_spec.rb`
Expected: FAIL with `uninitialized constant Legacy::JournalMigrator`.

- [ ] **Step 3: Write the migrator**

```ruby
# backend/app/services/legacy/journal_migrator.rb
module Legacy
  # diary_entry into coach_entries and drill_ratings.
  #
  # Idempotent, because CoachEntry.upsert_for addresses an entry by
  # (user, program_year, session_date) and the old table held one row per
  # date. Running it twice writes the same rows again rather than a second
  # copy, which is what makes it safe to run before Jeff has decided whether
  # the numbers look right.
  class JournalMigrator
    def initialize(coach:)
      @coach = coach
      @skipped = []
      @dropped_ratings = []
    end

    def run!
      Legacy::Record.connect!
      return empty_report unless Legacy::DiaryEntry.table_present?

      migrated = 0
      Legacy::DiaryEntry.order(:session_date).each do |row|
        migrated += 1 if migrate(row)
      end

      { migrated: migrated, skipped: @skipped, dropped_ratings: @dropped_ratings }
    end

    private

    def empty_report = { migrated: 0, skipped: [], dropped_ratings: [] }

    def migrate(row)
      year = year_for(row.session_date)
      if year.nil?
        @skipped << { session_date: row.session_date, reason: "no program year contains this date" }
        return false
      end

      entry = CoachEntry.upsert_for(
        user: @coach, program_year: year, session_date: row.session_date,
        attrs: carried(row), ratings: known_ratings(row),
      )
      # created_at is a fact about when Jeff wrote it, and upsert_for has no
      # way to be told. Set it afterwards, without touching updated_at, which
      # honestly describes when this row was last written.
      entry.update_column(:created_at, row.created_at) if row.created_at.present?
      true
    end

    # dow, plan_month, week and device are deliberately not here. See the
    # spec's "Decisions I made" item 4.
    def carried(row)
      { overall: row.overall, energy: row.energy, flag_pain: row.flag_pain,
        pain_note: row.pain_note, note: row.note, challenge_num: row.challenge_num }
    end

    def known_ratings(row)
      ratings = row.ratings || {}
      known = Drill.where(slug: ratings.keys).pluck(:slug).to_set

      ratings.reject do |slug, _rating|
        next false if known.include?(slug)

        @dropped_ratings << { session_date: row.session_date, slug: slug }
        true
      end
    end

    def year_for(date)
      ProgramYear.find_by("starts_on <= ? and ends_on >= ?", date, date)
    end
  end
end
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/services/legacy/journal_migrator_spec.rb`
Expected: 9 examples, 0 failures.

- [ ] **Step 5: Prove the dropped-rating test is not vacuous**

Temporarily change `known_ratings` to `ratings` (dropping the filter), and run the spec. The "reports a rating whose drill no longer exists" example must fail. Restore the code afterwards. Record in the report that you did this and what happened.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/legacy/journal_migrator.rb backend/spec/services/legacy/journal_migrator_spec.rb
git commit -m "Move the coach's diary onto his account"
```

---

### Task 3: Migrate the test results

**Files:**
- Create: `backend/app/services/legacy/result_migrator.rb`
- Test: `backend/spec/services/legacy/result_migrator_spec.rb`

**Interfaces:**
- Consumes: `Legacy::Record.connect!`, `Legacy::TestResultRow` from Task 1.
- Produces: `Legacy::ResultMigrator.new(coach:).run!` returning a Hash with keys `:migrated` (Integer), `:skipped` (Array<Hash> with `:window`, `:test_id`, `:reason`), `:conflicts` (Array<Hash> with `:window`, `:test_id`, `:legacy_value`, `:current_value`).

**The rule that matters.** A result already in the new system is never overwritten. Jeff records Teddy's Baseline on the new site from 15 September, and those numbers cannot be measured again. A conflict is reported and left alone.

- [ ] **Step 1: Write the failing spec**

```ruby
# backend/spec/services/legacy/result_migrator_spec.rb
require "rails_helper"

RSpec.describe Legacy::ResultMigrator, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }
  let!(:date) { create(:test_date, program_year: year, window: "2026-09", label: "Baseline") }
  let!(:measure) { create(:battery_measure, program_year: year, test_id: "t1", unit: "s", direction: "lower") }

  def insert_result(window:, test_id:, value:, recorded_at: "2026-09-15 14:00:00+00")
    ActiveRecord::Base.connection.exec_query(<<~SQL, "result", [window, test_id, value, recorded_at])
      insert into test_result (id, test_window, test_id, value, recorded_at)
      values ($1 || ':' || $2, $1, $2, $3, $4::timestamptz)
    SQL
  end

  it "maps the window onto a test date and the test id onto a measure" do
    insert_result(window: "2026-09", test_id: "t1", value: "4.6")

    described_class.new(coach: coach).run!

    result = TestResult.sole
    expect(result.test_date).to eq(date)
    expect(result.battery_measure).to eq(measure)
    expect(result.program_year).to eq(year)
    expect(result.athlete).to eq(year.athlete)
    expect(result.recorded_by_user).to eq(coach)
  end

  it "keeps the text exactly and parses a number beside it" do
    insert_result(window: "2026-09", test_id: "t1", value: "15 to 18")

    described_class.new(coach: coach).run!

    expect(TestResult.sole.raw_value).to eq("15 to 18")
    expect(TestResult.sole.numeric_value).to eq(15)
  end

  it "keeps the day the measurement was taken, not the day it was migrated" do
    insert_result(window: "2026-09", test_id: "t1", value: "4.6",
                  recorded_at: "2026-09-15 14:00:00+00")

    described_class.new(coach: coach).run!

    expect(TestResult.sole.recorded_at).to be_within(1.second).of(Time.utc(2026, 9, 15, 14))
  end

  # The one that protects a measurement nobody can take again.
  it "never overwrites a result the new system already holds" do
    TestResult.create!(program_year: year, athlete: year.athlete, test_date: date,
                       battery_measure: measure, recorded_by_user: coach,
                       raw_value: "4.4", recorded_at: Time.utc(2026, 9, 16))
    insert_result(window: "2026-09", test_id: "t1", value: "9.9")

    report = described_class.new(coach: coach).run!

    expect(TestResult.sole.raw_value).to eq("4.4")
    expect(report[:migrated]).to eq(0)
    expect(report[:conflicts]).to eq([
      { window: "2026-09", test_id: "t1", legacy_value: "9.9", current_value: "4.4" },
    ])
  end

  it "skips a test id with no measure and says so" do
    insert_result(window: "2026-09", test_id: "t99", value: "4.6")

    report = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(0)
    expect(report[:skipped]).to eq([
      { window: "2026-09", test_id: "t99", reason: "no battery measure with this test id" },
    ])
  end

  it "skips a window with no test date and says so" do
    insert_result(window: "2099-01", test_id: "t1", value: "4.6")

    report = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(0)
    expect(report[:skipped]).to eq([
      { window: "2099-01", test_id: "t1", reason: "no test date with this window" },
    ])
  end

  it "can be run twice without making a second copy" do
    insert_result(window: "2026-09", test_id: "t1", value: "4.6")

    described_class.new(coach: coach).run!
    second = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(1)
    # The second run finds its own work already there, which is a conflict
    # with itself and reports as one. That is honest: a human reading the
    # output should see that nothing new was written.
    expect(second[:migrated]).to eq(0)
  end

  it "leaves the legacy rows exactly as it found them" do
    insert_result(window: "2026-09", test_id: "t1", value: "4.6")
    before = ActiveRecord::Base.connection.select_all("select * from test_result").to_a

    described_class.new(coach: coach).run!

    after = ActiveRecord::Base.connection.select_all("select * from test_result").to_a
    expect(after).to eq(before)
  end
end
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd backend && bundle exec rspec spec/services/legacy/result_migrator_spec.rb`
Expected: FAIL with `uninitialized constant Legacy::ResultMigrator`.

- [ ] **Step 3: Write the migrator**

```ruby
# backend/app/services/legacy/result_migrator.rb
module Legacy
  # The old test_result table into test_results.
  #
  # TestResult.upsert_for is deliberately not used. It stamps
  # recorded_at: Time.current, and when a measurement was taken is a fact
  # about Teddy rather than about this migration.
  class ResultMigrator
    def initialize(coach:)
      @coach = coach
      @skipped = []
      @conflicts = []
    end

    def run!
      Legacy::Record.connect!
      return empty_report unless Legacy::TestResultRow.table_present?

      migrated = 0
      Legacy::TestResultRow.order(:test_window, :test_id).each do |row|
        migrated += 1 if migrate(row)
      end

      { migrated: migrated, skipped: @skipped, conflicts: @conflicts }
    end

    private

    def empty_report = { migrated: 0, skipped: [], conflicts: [] }

    def migrate(row)
      date = TestDate.find_by(window: row.test_window)
      if date.nil?
        @skipped << { window: row.test_window, test_id: row.test_id,
                      reason: "no test date with this window" }
        return false
      end

      year = date.program_year
      measure = year.battery_measures.find_by(test_id: row.test_id)
      if measure.nil?
        @skipped << { window: row.test_window, test_id: row.test_id,
                      reason: "no battery measure with this test id" }
        return false
      end

      existing = TestResult.find_by(program_year: year, test_date: date, battery_measure: measure)
      if existing
        @conflicts << { window: row.test_window, test_id: row.test_id,
                        legacy_value: row.value, current_value: existing.raw_value }
        return false
      end

      TestResult.create!(program_year: year, athlete: year.athlete, test_date: date,
                         battery_measure: measure, recorded_by_user: @coach,
                         raw_value: row.value.to_s.strip, recorded_at: row.recorded_at)
      true
    end
  end
end
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/services/legacy/result_migrator_spec.rb`
Expected: 8 examples, 0 failures.

- [ ] **Step 5: Prove the no-overwrite test is not vacuous**

Temporarily replace the `if existing` branch with a `TestResult.upsert_for(...)` call, and run the spec. The "never overwrites" example must fail on `raw_value` being `"9.9"`. Restore the code. Record what happened.

- [ ] **Step 6: Add both migrators to the rake file**

Append to `backend/lib/tasks/legacy.rake`, inside the existing `namespace :legacy do`:

```ruby
  desc "Copy the old Neon rows into the Rails tables. COACH_EMAIL= CONFIRM=yes"
  task migrate: :environment do
    abort("Set CONFIRM=yes once you have read the survey.") unless ENV["CONFIRM"] == "yes"

    coach = User.find_by!(email: ENV.fetch("COACH_EMAIL").strip.downcase, role: "coach")

    journal = Legacy::JournalMigrator.new(coach: coach).run!
    results = Legacy::ResultMigrator.new(coach: coach).run!

    puts "diary entries written: #{journal[:migrated]}"
    journal[:skipped].each { |s| puts "  skipped #{s[:session_date]}: #{s[:reason]}" }
    journal[:dropped_ratings].each { |d| puts "  rating lost on #{d[:session_date]}: no drill '#{d[:slug]}'" }

    puts "test results written: #{results[:migrated]}"
    results[:skipped].each { |s| puts "  skipped #{s[:window]} #{s[:test_id]}: #{s[:reason]}" }
    results[:conflicts].each do |c|
      puts "  left alone #{c[:window]} #{c[:test_id]}: old #{c[:legacy_value]}, current #{c[:current_value]}"
    end

    puts
    puts "Now run rails legacy:verify. Nothing gets deleted until it reads clean."
  end
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/legacy/result_migrator.rb backend/spec/services/legacy/result_migrator_spec.rb backend/lib/tasks/legacy.rake
git commit -m "Move the test results across without touching a number already recorded"
```

---

### Task 4: Verify before anything is dropped

**Files:**
- Create: `backend/app/services/legacy/verifier.rb`
- Modify: `backend/lib/tasks/legacy.rake`
- Test: `backend/spec/services/legacy/verifier_spec.rb`

**Interfaces:**
- Consumes: `Legacy::Record.connect!`, `Legacy::DiaryEntry`, `Legacy::TestResultRow`.
- Produces: `Legacy::Verifier.new.run` returning a Hash with keys `:clean?` (Boolean), `:counts` (Hash with `:legacy_diary`, `:migrated_diary`, `:legacy_results`, `:migrated_results`), `:mismatches` (Array<Hash> with `:kind`, `:key`, `:field`, `:legacy`, `:migrated`), `:missing` (Array<Hash> with `:kind`, `:key`).

**This is spec step 3 and it is the gate on Task 6.** It compares field by field rather than counting, because a migration that wrote the right number of rows with the wrong contents passes a count.

- [ ] **Step 1: Write the failing spec**

```ruby
# backend/spec/services/legacy/verifier_spec.rb
require "rails_helper"

RSpec.describe Legacy::Verifier, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }
  let!(:date) { create(:test_date, program_year: year, window: "2026-09", label: "Baseline") }
  let!(:measure) { create(:battery_measure, program_year: year, test_id: "t1") }

  def insert_diary(session_date:, note:, overall: 4)
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", [session_date, note, overall])
      insert into diary_entry (id, session_date, note, overall)
      values ('e-' || $1::text, $1::date, $2, $3)
    SQL
  end

  def insert_result(value:)
    ActiveRecord::Base.connection.exec_query(<<~SQL, "result", [value])
      insert into test_result (id, test_window, test_id, value)
      values ('2026-09:t1', '2026-09', 't1', $1)
    SQL
  end

  it "reads clean when every legacy row has a match that agrees" do
    insert_diary(session_date: "2026-09-16", note: "Good session.")
    insert_result(value: "4.6")
    Legacy::JournalMigrator.new(coach: coach).run!
    Legacy::ResultMigrator.new(coach: coach).run!

    report = described_class.new.run

    expect(report[:clean?]).to be(true)
    expect(report[:counts]).to eq(legacy_diary: 1, migrated_diary: 1,
                                  legacy_results: 1, migrated_results: 1)
    expect(report[:mismatches]).to eq([])
    expect(report[:missing]).to eq([])
  end

  it "names a legacy entry that never arrived" do
    insert_diary(session_date: "2026-09-16", note: "Good session.")

    report = described_class.new.run

    expect(report[:clean?]).to be(false)
    expect(report[:missing]).to eq([{ kind: :diary, key: "2026-09-16" }])
  end

  # The reason this compares fields rather than counting: a migration that
  # wrote the right number of rows carrying the wrong words passes a count.
  it "names a field that arrived with different contents" do
    insert_diary(session_date: "2026-09-16", note: "Good session.")
    Legacy::JournalMigrator.new(coach: coach).run!
    CoachEntry.sole.update!(note: "something else entirely")

    report = described_class.new.run

    expect(report[:clean?]).to be(false)
    expect(report[:mismatches]).to eq([
      { kind: :diary, key: "2026-09-16", field: :note,
        legacy: "Good session.", migrated: "something else entirely" },
    ])
  end

  it "names a result whose value disagrees" do
    insert_result(value: "4.6")
    Legacy::ResultMigrator.new(coach: coach).run!
    TestResult.sole.update!(raw_value: "9.9")

    report = described_class.new.run

    expect(report[:clean?]).to be(false)
    expect(report[:mismatches]).to eq([
      { kind: :result, key: "2026-09:t1", field: :raw_value, legacy: "4.6", migrated: "9.9" },
    ])
  end

  it "does not call an entry missing when it was skipped for having no program year" do
    insert_diary(session_date: "2020-01-01", note: "before the program")

    report = described_class.new.run

    expect(report[:missing]).to eq([])
    expect(report[:counts][:legacy_diary]).to eq(0)
  end
end
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd backend && bundle exec rspec spec/services/legacy/verifier_spec.rb`
Expected: FAIL with `uninitialized constant Legacy::Verifier`.

- [ ] **Step 3: Write the verifier**

```ruby
# backend/app/services/legacy/verifier.rb
module Legacy
  # Compares the old tables against the new ones field by field.
  #
  # Counting alone would pass a migration that wrote the right number of rows
  # carrying the wrong words, which is the failure that matters here: the old
  # rows are about to be deleted, so this is the last moment anything can be
  # checked against them.
  #
  # Rows the migrators deliberately skipped are out of scope. A diary entry
  # dated before the program year has nowhere to go by design, so counting it
  # as missing would make a correct migration read as broken.
  class Verifier
    DIARY_FIELDS = %i[note pain_note overall energy flag_pain challenge_num].freeze

    def run
      Legacy::Record.connect!

      mismatches = []
      missing = []

      diary = comparable_diary
      diary.each { |row| check_diary(row, mismatches, missing) }

      results = comparable_results
      results.each { |row| check_result(row, mismatches, missing) }

      {
        clean?: mismatches.empty? && missing.empty?,
        counts: { legacy_diary: diary.size, migrated_diary: CoachEntry.kept.count,
                  legacy_results: results.size, migrated_results: TestResult.count },
        mismatches: mismatches,
        missing: missing,
      }
    end

    private

    def comparable_diary
      return [] unless Legacy::DiaryEntry.table_present?

      Legacy::DiaryEntry.order(:session_date).select { |row| year_for(row.session_date) }
    end

    def comparable_results
      return [] unless Legacy::TestResultRow.table_present?

      Legacy::TestResultRow.order(:test_window, :test_id).select do |row|
        date = TestDate.find_by(window: row.test_window)
        date && BatteryMeasure.exists?(program_year_id: date.program_year_id, test_id: row.test_id)
      end
    end

    def check_diary(row, mismatches, missing)
      key = row.session_date.to_s
      entry = CoachEntry.kept.find_by(session_date: row.session_date)
      if entry.nil?
        missing << { kind: :diary, key: key }
        return
      end

      DIARY_FIELDS.each do |field|
        legacy = normalise(row.public_send(field))
        migrated = normalise(entry.public_send(field))
        next if legacy == migrated

        mismatches << { kind: :diary, key: key, field: field, legacy: legacy, migrated: migrated }
      end
    end

    def check_result(row, mismatches, missing)
      key = "#{row.test_window}:#{row.test_id}"
      date = TestDate.find_by(window: row.test_window)
      measure = BatteryMeasure.find_by(program_year_id: date.program_year_id, test_id: row.test_id)
      result = TestResult.find_by(test_date: date, battery_measure: measure)
      if result.nil?
        missing << { kind: :result, key: key }
        return
      end

      legacy = row.value.to_s.strip
      return if legacy == result.raw_value

      mismatches << { kind: :result, key: key, field: :raw_value,
                      legacy: legacy, migrated: result.raw_value }
    end

    # smallint comes back as an Integer on one side and may be nil on the
    # other, and "" and nil mean the same absence in the old table.
    def normalise(value)
      return nil if value.nil? || value == ""

      value
    end

    def year_for(date)
      ProgramYear.find_by("starts_on <= ? and ends_on >= ?", date, date)
    end
  end
end
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/services/legacy/verifier_spec.rb`
Expected: 5 examples, 0 failures.

- [ ] **Step 5: Add the verify task to the rake file**

Append inside `namespace :legacy do`:

```ruby
  desc "Compare the old Neon rows against the migrated ones, field by field."
  task verify: :environment do
    report = Legacy::Verifier.new.run
    counts = report[:counts]

    puts "diary:   #{counts[:legacy_diary]} to migrate, #{counts[:migrated_diary]} in the new table"
    puts "results: #{counts[:legacy_results]} to migrate, #{counts[:migrated_results]} in the new table"

    report[:missing].each { |m| puts "MISSING #{m[:kind]} #{m[:key]}" }
    report[:mismatches].each do |m|
      puts "DIFFERS #{m[:kind]} #{m[:key]} #{m[:field]}: old #{m[:legacy].inspect}, new #{m[:migrated].inspect}"
    end

    if report[:clean?]
      puts
      puts "Every old row has a match that agrees. Safe to delete the old pipeline."
    else
      puts
      puts "Not clean. Nothing should be deleted until this reads clean."
      exit(1)
    end
  end
```

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && bundle exec rspec`
Expected: all green, count reported in the task report.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/legacy/verifier.rb backend/spec/services/legacy/verifier_spec.rb backend/lib/tasks/legacy.rake
git commit -m "Compare every old row against the new one before anything is dropped"
```

---

### Task 5: The cutover Jeff runs

**Files:**
- Create: `docs/cutover.md`
- Test: run against production, recorded in the report. No new automated test.

**Interfaces:**
- Consumes: `legacy:survey`, `legacy:migrate`, `legacy:verify` from Tasks 1 to 4.
- Produces: `docs/cutover.md`, the ordered runbook Task 6 depends on having been executed.

**Why a document rather than code.** Every step here writes to production or changes a hosting setting, which is Jeff's to do and not an agent's. The deliverable is a runbook precise enough that he can follow it without asking a question, and a record of what was run.

Jeff's two decisions, made 2026-09-14: he records Teddy's Baseline numbers on the new site from 15 September, and the new app takes over the original Vercel project's URL rather than keeping `teddy-pe-mlfs.vercel.app`.

- [ ] **Step 1: Write the runbook**

Create `docs/cutover.md`:

````markdown
# Phase 3 cutover

Run these in order. Steps 1 to 3 are safe at any time and change nothing.
Step 4 onwards changes production.

## 1. See what is there

```bash
fly ssh console -a teddy-pe-api -C "bin/rails legacy:survey"
```

Reports the row counts in the old tables and everything that will not map:
drill slugs with no drill, test ids with no measure, session dates in no
program year, and any result the new system already holds. Writes nothing.

If it cannot find the old tables, the old rows are in a different Neon
database from the Rails one. Set the old connection string and try again:

```bash
fly secrets set LEGACY_DATABASE_URL="<the Vercel project's DATABASE_URL>" -a teddy-pe-api
```

## 2. Clear the stray Baseline value

A 20m sprint result of `10` was typed into the new site on 14 September while
testing it. Open `/tests`, empty that box, and the row deletes itself. Left
alone it becomes the year's baseline for the sprint and every comparison
after it is measured against a number that was never a measurement.

## 3. Record Teddy's Baseline, 15 to 17 September

On the new site, signed in as the athlete or the coach. These are the year's
comparison points and most cannot be measured again.

## 4. Migrate the old rows

```bash
fly ssh console -a teddy-pe-api -C "bin/rails legacy:migrate COACH_EMAIL=frey.maxim@gmail.com CONFIRM=yes"
```

Safe to run after step 3: it never overwrites a result the new system already
holds, so the Baseline numbers just recorded are not at risk. It reports what
it wrote, what it skipped, and any result it left alone.

## 5. Verify

```bash
fly ssh console -a teddy-pe-api -C "bin/rails legacy:verify"
```

Compares both databases field by field. It must print "Every old row has a
match that agrees." Nothing is deleted until it does.

## 6. Export the program back into the repo

```bash
fly ssh console -a teddy-pe-api -C "bin/rails docs:export"
```

This is what keeps `CLAUDE.md`'s rule true, that the repo is the complete
memory of the project, once `tools/pull.py` is gone.

## 7. Repoint the original Vercel project at the new app

In the Vercel dashboard, on the project that has been serving Teddy's page:

- Settings, General: set Root Directory to `web`.
- Settings, Environment Variables: add `VITE_API_URL=https://teddy-pe-api.fly.dev`.
- Settings, Environment Variables: delete `DIARY_PASSPHRASE`. The shared
  passphrase dies at cutover and nothing reads it after this.
- Deployments: redeploy from `main`.

`web/vercel.json` carries the framework, build command, output directory,
the single-page rewrite and the response headers, so nothing else needs
setting by hand.

## 8. Let the API admit the new URL

```bash
fly secrets set WEB_ORIGIN="<the original project's URL>" -a teddy-pe-api
```

Until this runs the browser is refused by CORS and nobody can sign in. Check
it with a preflight, which should answer with the origin echoed back:

```bash
curl -s -o /dev/null -D - -X OPTIONS https://teddy-pe-api.fly.dev/api/v1/auth/login \
  -H "Origin: <the original project's URL>" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
```

## 9. Check the site before deleting anything

Open the original URL signed out. It must show the sign-in screen and
nothing else. Sign in, open This Week, the Year and the journal, and reload
on each so the single-page rewrite is exercised.

## 10. Delete the new project

Delete `teddy-pe-mlfs` in Vercel, so there is one site rather than two
quietly disagreeing.

## 11. Then, and only then, Task 6 deletes the old pipeline.
````

- [ ] **Step 2: Commit**

```bash
git add docs/cutover.md
git commit -m "Write the cutover down in the order it has to happen"
```

- [ ] **Step 3: Hand the runbook to Jeff and stop**

This task is complete when `docs/cutover.md` is committed and Jeff has been
given the summary. Task 6 does not start until he confirms `legacy:verify`
read clean and the site works on the original URL.

---

### Task 6: Delete the old pipeline and the documentation that describes it

**Files:**
- Delete: `build.py`, `src/page.html`, `site/`, `dist/`, `api/_auth.js`, `api/diary.js`, `api/login.js`, `api/page.js`, `api/results.js`, `public/`, `vercel.json` (the repo root one only), `tools/pull.py`, `tools/test_api.mjs`, `data/`
- Modify: `CLAUDE.md`, `README.md`, `package.json`, `docs/architecture.md`, `docs/status.md`
- Test: `backend/spec/content_spec.rb` and the full suites must stay green.

**Do not start this task until Jeff confirms `legacy:verify` read clean.** The old rows are the only copy of a year of Teddy's program until then.

**`data/` is on the delete list and is not in the spec's.** Its three files were converted into `backend/content/program_years/2026-27/` during Phase 1, verified as 84 drills on both sides and the same single plan month. `build.py` is the only thing that reads them. Leaving them would give the repo two copies of the program that nothing keeps in step, which is the failure mode `docs/rewrite-prompt.md` warns about directly.

- [ ] **Step 1: Prove the content really is equivalent before deleting the source**

```bash
python3 -c "import json; d=json.load(open('data/drills.json')); print(len(d if isinstance(d,list) else d.get('drills',d)))"
grep -c '^- slug:\|^  - slug:' backend/content/program_years/2026-27/drills.yml
ls data/plans/ backend/content/program_years/2026-27/plans/
```

Expected: 84 and 84, and one plan month on each side. If they disagree, stop and report rather than deleting.

- [ ] **Step 2: Delete the old pipeline**

```bash
git rm -r build.py src/page.html site dist api public vercel.json tools/pull.py tools/test_api.mjs data
```

If `tools/` is then empty, remove it too. If `src/` held only `page.html`, the same.

- [ ] **Step 3: Rewrite the "Generating plans" section of `CLAUDE.md`**

It currently reads:

> ## Generating plans
>
> Plans are JSON in `data/plans/`. Match the shape of `data/plans/2026-09.json` exactly. Then `python3 build.py`. The page template in `src/page.html` reads `DATA` injected at build; do not hand-edit `site/` or `dist/`.

Every path in it was just deleted. Replace it with:

```markdown
## Generating plans

Plans are YAML in `backend/content/program_years/<year>/plans/`. Match the
shape of `2026-09.yml` exactly. Then seed them:

```bash
cd backend && bin/rails content:seed
```

The seeder is idempotent and reports a count per table, plus anything it
pruned, so a YAML edit that removes rows says so rather than doing it
quietly. Deploying runs it as the release command, so a merge to `main`
seeds production on its own.

Before planning a month, pull the program back into the repo as readable
prose:

```bash
cd backend && bin/rails docs:export
```

That writes `docs/journal/<year>/<month>.md`, `docs/results/<year>.md` and
the plans. It is what keeps this repo the complete memory of the project.
Unshared athlete entries are left out, the same as they are from the API.
```

- [ ] **Step 4: Update `README.md`**

Remove the environment variable table rows for `DIARY_PASSPHRASE` and any
row describing the Vercel functions, and remove any section describing
`build.py`, `site/`, the zero-build static mirror or `tools/pull.py`.
Describe what the repo holds now: `backend/` the Rails API on Fly,
`core/` the shared Redux package, `web/` the React app on Vercel, and
`docs/` the project's memory. Keep `DATABASE_URL`, and add `RAILS_MASTER_KEY`,
`WEB_ORIGIN` and `VITE_API_URL` with one line each.

- [ ] **Step 5: Remove the dead dependency from the root `package.json`**

`@neondatabase/serverless` was there only for the deleted functions. The root
manifest keeps its name, private flag and engines so the repo still describes
itself, and loses `dependencies` entirely.

- [ ] **Step 6: Update `docs/architecture.md` and `docs/status.md`**

In `docs/architecture.md`, replace any description of the build pipeline,
the passphrase gate or the Vercel functions with the three-part shape above.
In `docs/status.md`, the "Where things live" section still describes the
Vercel mirror serving `site/index.html` and the passphrase gate; both are
gone. Note that publishing `dist/artifact.html` to claude.ai has stopped,
per decision 9 of `docs/rewrite-prompt.md`.

- [ ] **Step 7: Prove nothing that remains referenced what was deleted**

```bash
grep -rn "build\.py\|src/page\.html\|data/plans\|tools/pull\.py\|DIARY_PASSPHRASE\|api/diary\|api/results\|api/page" \
  --include="*.md" --include="*.json" --include="*.rb" --include="*.ts" --include="*.tsx" --include="*.yml" \
  . | grep -v "^./docs/history/" | grep -v "^./docs/decisions.md" | grep -v node_modules
```

Expected: no output. `docs/history/` and `docs/decisions.md` are the record of
what happened and keep their references on purpose.

- [ ] **Step 8: Run every suite**

```bash
cd backend && bundle exec rspec
cd ../core && npx jest
cd ../web && npx vitest run
```

Expected: all three green. Report the counts.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Delete the old pipeline and the instructions that pointed at it"
```

---

### Task 7: Record the phase

**Files:**
- Modify: `docs/decisions.md`, `docs/status.md`
- Create: `docs/history/2026-09-14-phase-3-migration-and-cutover.md`

- [ ] **Step 1: Append to `docs/decisions.md`**

Dated `## 2026-09-14 (Phase 3): migration and cutover`. Record, with the
reasoning rather than only the outcome: that the new system wins every
collision because Teddy's Baseline cannot be measured again; that the
migrators never write to the legacy database, because the old rows are the
only copy until the verifier passes; that `dow`, `plan_month`, `week` and
`device` were deliberately dropped; that verification compares fields and
not counts, because a count passes a migration that wrote the right number
of rows carrying the wrong words; that `data/` was deleted although the spec
did not list it, and why; and the actual row counts that moved.

- [ ] **Step 2: Write the history file**

`docs/history/2026-09-14-phase-3-migration-and-cutover.md`, following the
shape of the existing files: what Jeff asked, what was answered, what was
verified and how, what is still owed, and any correction owed to him.

- [ ] **Step 3: Update `docs/status.md`**

Phase 3 complete. Phase 4, the React Native app, is the only phase left.
Record the suite counts and the live URLs.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "Record Phase 3 in the log and the session history"
```

---

## Self-Review

**1. Spec coverage.** Spec step 1, convert `data/` to `backend/content/`: done in Phase 1, verified in Task 6 Step 1 before the source is deleted. Step 2, migrate `diary_entry` with ratings exploded and `test_result` by `test_id` and window: Tasks 2 and 3. Step 3, verify by count and spot check before anything is dropped: Task 4, gating Task 6. Step 4, point Vercel at the new app: Task 5 steps 7 to 10. Step 5, delete the listed files: Task 6, which also covers the spec's correction that `tools/pull.py` and `tools/test_api.mjs` replace the brief's `tools/diary_pull.py`. Decision 8, `rails docs:export` replacing `tools/pull.py`: already built; exercised in Task 5 step 6 before the old tool is deleted. Decision 4, the four dropped columns: Task 2's `carried`. No gaps found.

**2. Placeholder scan.** No TBDs, no "handle edge cases", no "similar to Task N". Every code step carries the code. Task 5 and Task 6 steps 4 and 6 describe edits to prose files rather than showing a diff, which is deliberate: the current text is quoted where it is being replaced, and the rest is a specified outcome on a file whose exact current wording an implementer must read anyway.

**3. Type consistency.** `Legacy::Record.connect!`, `Legacy::DiaryEntry`, `Legacy::TestResultRow` are defined in Task 1 and used under those names in Tasks 2, 3 and 4. Every report Hash key is declared in its task's Interfaces block and matches the rake task that prints it: `:migrated`, `:skipped`, `:dropped_ratings`, `:conflicts`, `:clean?`, `:counts`, `:mismatches`, `:missing`. The survey's `:already_present_results` and the result migrator's `:conflicts` carry the same four keys deliberately, since they describe the same situation seen before and during the migration.

**One thing this plan cannot prove.** Nobody has yet seen the old tables. The row counts, whether they share a database with Rails, and whether every drill slug written this year still exists are all unknown until Task 5 step 1 runs against production. Task 1 exists so that those answers arrive from a read-only command rather than from a migration in progress.
