# Today View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One screen, `/today`, that the app opens on, showing today's card as an accordion, an autosaving session note, and the test sheet when today falls inside a test window.

**Architecture:** The write-forms come out of `CoachJournal`, `AthleteJournal` and `Tests` and become components that both Today and those tabs render, so there is one coach form in the app rather than two. One backend change: `test_dates` gains `starts_on` and `ends_on`, and `display` stops being authored in YAML and starts being generated from them.

**Tech Stack:** Rails 8 API (`backend/`, RSpec), a shared Redux Toolkit + redux-saga package (`core/`, Jest), React 18 + react-router + Vite (`web/`, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-14-today-view-design.md`

**Branch:** `feature/today-view`, already created off `main`. Jeff merges.

## Global Constraints

- **Writing style** (`CLAUDE.md`): direct, warm, specific. Cues in Teddy's language. Dad notes one to three sentences. **No em dashes.** Avoid "it's not X, it's Y" constructions. This governs user-facing copy AND code comments.
- **No program vocabulary in the web bundle.** `web/__tests__/bundle-privacy.test.ts` builds the app for real and reads the output. Every string a new web file adds must be about the app, never about Teddy or the program. Block names, drill names and card prose all arrive from the API at runtime.
- **The en dash in `display` is U+2013 (`–`), not a hyphen.** `program.yml` uses it today ("Sep 15–17").
- **Comments explain why, not what.** This codebase's comments carry the reasoning and the history of a decision. Match that density; it is the house style, not decoration.
- **Every loop in a spec asserts a tally.** `backend/spec/content_spec.rb` explains why at the top: thirteen assertions on this project passed while checking nothing, each a loop that ran zero times. A new example that walks a collection counts what it reached.
- **Deploying the API is manual.** Merging to `main` rebuilds Vercel only. The Rails app moves when someone runs `cd backend && fly deploy -a teddy-pe-api` from a checkout of `main`.
- **Test commands:** `cd backend && bundle exec rspec`, `cd core && npm test`, `cd web && npm test`.

---

## File Structure

**`backend/`**
- Create `db/migrate/20260914140000_add_dates_to_test_dates.rb`: the two columns.
- Modify `app/models/test_date.rb`: validate both present, and own the `display` formatter.
- Modify `app/services/content_seeder.rb:156-160`: pass the dates, generate `display`.
- Modify `app/services/program_year_payload.rb:127-131`: send both fields.
- Modify `content/program_years/2026-27/program.yml:466-486`: five windows gain dates, lose `display`.
- Modify `spec/content_spec.rb`, create `spec/models/test_date_spec.rb`, modify `spec/services/content_seeder_spec.rb` and the program-year request spec.

**`core/`**
- Modify `src/types.ts`: `TestDate` gains two optional fields.
- Modify `src/ducks/testResults/selectors.ts`: `selectTestDayFor`, beside `selectDefaultWindow` because it is the same kind of question asked of the same array.
- Modify `src/index.ts`: nothing new to export; `testResultsSelectors` is already exported whole.
- Create `src/ducks/testResults/__tests__/selectTestDayFor.test.ts`.

**`web/`**
- Create `src/components/SaveStatus.tsx`: the one status line both forms use.
- Create `src/components/TestSheet.tsx`: out of `Tests.tsx`.
- Create `src/components/CoachNoteForm.tsx`: out of `CoachJournal.tsx`.
- Create `src/components/AthleteNoteForm.tsx`: out of `AthleteJournal.tsx`.
- Create `src/components/TodayCard.tsx`: the accordion.
- Create `src/screens/Today.tsx`: composes the four.
- Modify `src/routes.tsx`: the route, the nav order, the home redirect.
- Modify `src/screens/Tests.tsx`, `src/screens/CoachJournal.tsx`, `src/screens/AthleteJournal.tsx`: each becomes a picker plus the extracted component.
- Modify `src/styles.css`.
- Create `__tests__/today.test.tsx`; modify `__tests__/tests-screen.test.tsx`, `__tests__/coach-journal.test.tsx`, `__tests__/athlete-journal.test.tsx`, `__tests__/shell.test.tsx`.

**`docs/`**: `decisions.md`, `architecture.md`, `context.md`, `status.md`, `history/2026-09-14-today-view.md`.

---

### Task 1: `test_dates` carries real dates

The column, the validation, the content, and the seeder writing it. All in
one task because the validation makes the seeder's write mandatory: a
migration that adds a validated column without the seeder filling it breaks
`content:seed` on the next run.

**Files:**
- Create: `backend/db/migrate/20260914140000_add_dates_to_test_dates.rb`
- Create: `backend/spec/models/test_date_spec.rb`
- Modify: `backend/app/models/test_date.rb`
- Modify: `backend/content/program_years/2026-27/program.yml:466-486`
- Modify: `backend/app/services/content_seeder.rb:156-160`
- Modify: `backend/spec/content_spec.rb`

**Interfaces:**
- Consumes: nothing.
- Produces: `TestDate#starts_on` and `TestDate#ends_on`, both `Date`, both validated present. Every `test_dates` row in `program.yml` carries `starts_on:` and `ends_on:` as YAML dates.

- [ ] **Step 1: Write the failing model spec**

Create `backend/spec/models/test_date_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe TestDate do
  # A window with no dates is the state this table was in until 14 September
  # 2026, and it is the state that made "is there a test today" unanswerable
  # without parsing the display string. Nothing may write one again.
  let(:year) { create(:program_year) }

  def build_date(attrs = {})
    described_class.new({
      program_year: year, window: "2026-09", label: "Baseline",
      display: "Sep 15–17", position: 1,
      starts_on: Date.new(2026, 9, 15), ends_on: Date.new(2026, 9, 17)
    }.merge(attrs))
  end

  it "is valid with both dates" do
    expect(build_date).to be_valid
  end

  it "refuses a window with no start" do
    date = build_date(starts_on: nil)
    expect(date).not_to be_valid
    expect(date.errors[:starts_on]).to be_present
  end

  it "refuses a window with no end" do
    date = build_date(ends_on: nil)
    expect(date).not_to be_valid
    expect(date.errors[:ends_on]).to be_present
  end

  it "refuses a window that ends before it starts" do
    date = build_date(ends_on: Date.new(2026, 9, 14))
    expect(date).not_to be_valid
    expect(date.errors[:ends_on]).to be_present
  end
end
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && bundle exec rspec spec/models/test_date_spec.rb`
Expected: FAIL. Every example errors with `unknown attribute 'starts_on' for TestDate`.

- [ ] **Step 3: Write the migration**

Create `backend/db/migrate/20260914140000_add_dates_to_test_dates.rb`:

```ruby
# The range a test window covers, as dates rather than as the prose in
# `display`. Nullable in the column and required on the model, deliberately:
# the migration has to be able to run against production before the seed
# that fills the five existing rows does, and `fly deploy` runs them in that
# order. Nothing can write a row without them, because the model says so.
class AddDatesToTestDates < ActiveRecord::Migration[8.0]
  def change
    add_column :test_dates, :starts_on, :date
    add_column :test_dates, :ends_on, :date
  end
end
```

- [ ] **Step 4: Run the migration**

Run: `cd backend && bin/rails db:migrate`
Expected: `add_column(:test_dates, :starts_on, :date)` and the same for `ends_on`, and `db/schema.rb` picks both up.

- [ ] **Step 5: Add the validations**

Modify `backend/app/models/test_date.rb`:

```ruby
class TestDate < ApplicationRecord
  belongs_to :program_year

  validates :window, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :display, presence: true
  # Required here rather than in the column, so the migration can land on
  # production one release ahead of the seed that fills the five rows it
  # finds there. See the migration for the ordering.
  validates :starts_on, :ends_on, presence: true
  validate :ends_on_is_not_before_starts_on

  private

  def ends_on_is_not_before_starts_on
    return if starts_on.blank? || ends_on.blank?
    return if ends_on >= starts_on
    errors.add(:ends_on, "cannot be before starts_on")
  end
end
```

- [ ] **Step 6: Run the model spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/models/test_date_spec.rb`
Expected: PASS, 4 examples.

- [ ] **Step 7: Write the failing content spec**

Add to `backend/spec/content_spec.rb`, inside the top-level describe. Put
the constant beside the other tallies near the top of the file:

```ruby
  TEST_DATES = PROGRAM["test_dates"].size
```

and the examples in their own describe block:

```ruby
  describe "test windows" do
    # The five windows are what the Today screen reads to decide whether a
    # test is due, so a window with no dates is a window Today cannot see.
    it "gives every window a start and an end" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d["starts_on"]).to be_a(Date), "#{d['window']} has no starts_on"
        expect(d["ends_on"]).to be_a(Date), "#{d['window']} has no ends_on"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
    end

    it "never ends a window before it starts" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d["ends_on"]).to be >= d["starts_on"], "#{d['window']} ends before it starts"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
    end

    it "opens every window inside the month its key names" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d["starts_on"].strftime("%Y-%m")).to eq(d["window"]),
          "#{d['window']} starts in a different month from its key"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
    end
  end
```

- [ ] **Step 8: Run it to make sure it fails**

Run: `cd backend && bundle exec rspec spec/content_spec.rb -e "test windows"`
Expected: FAIL, 3 examples. The first two report `expected nil to be a Date`.

- [ ] **Step 9: Add the dates to the content**

Modify `backend/content/program_years/2026-27/program.yml`, the `test_dates:`
block at line 466. Keep `display` for now; Task 2 removes it. The dates come
straight from the prose already there, and from
`docs/architecture.md`'s test battery line.

```yaml
test_dates:
- window: 2026-09
  label: Baseline
  display: Sep 15–17
  starts_on: 2026-09-15
  ends_on: 2026-09-17
  position: 1
- window: 2026-12
  label: Retest 1
  display: Dec 7–11
  starts_on: 2026-12-07
  ends_on: 2026-12-11
  position: 2
- window: 2027-03
  label: Retest 2
  display: Mar 1–5
  starts_on: 2027-03-01
  ends_on: 2027-03-05
  position: 3
- window: 2027-06
  label: Retest 3
  display: Jun 14–18
  starts_on: 2027-06-14
  ends_on: 2027-06-18
  position: 4
- window: 2027-08
  label: Final
  display: Aug 9–13
  starts_on: 2027-08-09
  ends_on: 2027-08-13
  position: 5
```

- [ ] **Step 10: Run the content spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/content_spec.rb`
Expected: PASS, the whole file including the three new examples.

- [ ] **Step 11: Make the seeder carry the dates**

Modify `backend/app/services/content_seeder.rb:156-160`:

```ruby
  def seed_test_dates(rows)
    rows.each do |row|
      upsert(year.test_dates, { window: row.fetch("window") },
             row.slice("label", "display", "position", "starts_on", "ends_on"))
    end
  end
```

- [ ] **Step 12: Seed and verify**

Run: `cd backend && bin/rails content:seed`
Expected: it completes, and `test_dates` reports 5. A seeder that still
dropped the dates would raise `Validation failed: Starts on can't be blank`
here, which is the check this step is really making.

- [ ] **Step 13: Run the whole backend suite**

Run: `cd backend && bundle exec rspec`
Expected: PASS, no regressions.

- [ ] **Step 14: Commit**

```bash
git add backend/db/migrate backend/db/schema.rb backend/app/models/test_date.rb \
        backend/spec/models/test_date_spec.rb backend/spec/content_spec.rb \
        backend/content/program_years/2026-27/program.yml \
        backend/app/services/content_seeder.rb
git commit -m "Test windows carry real dates, not just prose

test_dates held the range only inside display (\"Sep 15-17\"), so nothing
could answer whether a test is due today without parsing that string.

The columns are nullable and the model requires them, so the migration can
reach production one release ahead of the seed that fills the five rows it
finds there."
```

---

### Task 2: `display` is generated, not authored

**Files:**
- Modify: `backend/app/models/test_date.rb`
- Modify: `backend/app/services/content_seeder.rb`
- Modify: `backend/content/program_years/2026-27/program.yml`
- Modify: `backend/spec/models/test_date_spec.rb`
- Modify: `backend/spec/content_spec.rb`

**Interfaces:**
- Consumes: `starts_on` and `ends_on` from Task 1.
- Produces: `TestDate.display_for(starts_on, ends_on) -> String`. The `display` column still exists and still holds the same strings, so every reader downstream (`ProgramYearPayload`, `DocsExporter`, `web/src/screens/Tests.tsx`) is untouched.

- [ ] **Step 1: Write the failing formatter spec**

Add to `backend/spec/models/test_date_spec.rb`:

```ruby
  describe ".display_for" do
    # The string this replaces was hand-written beside the dates it
    # describes, which is the same fact written twice with nothing checking
    # that the two agree. These four cases are every shape the year can
    # produce; the first is the only one the 2026-27 content actually uses.
    it "keeps a window inside one month short" do
      expect(described_class.display_for(Date.new(2026, 9, 15), Date.new(2026, 9, 17)))
        .to eq("Sep 15–17")
    end

    it "names both months when a window crosses one" do
      expect(described_class.display_for(Date.new(2027, 6, 28), Date.new(2027, 7, 2)))
        .to eq("Jun 28 – Jul 2")
    end

    it "names both years when a window crosses one" do
      expect(described_class.display_for(Date.new(2026, 12, 30), Date.new(2027, 1, 2)))
        .to eq("Dec 30 – Jan 2")
    end

    it "writes a single day once" do
      expect(described_class.display_for(Date.new(2026, 9, 15), Date.new(2026, 9, 15)))
        .to eq("Sep 15")
    end
  end
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && bundle exec rspec spec/models/test_date_spec.rb -e "display_for"`
Expected: FAIL, 4 examples, `undefined method 'display_for' for TestDate:Class`.

- [ ] **Step 3: Write the formatter**

Add to `backend/app/models/test_date.rb`, above the `private` keyword:

```ruby
  # The `display` column's one author. It used to be hand-written in
  # program.yml beside the dates it describes, so a date edit that missed
  # the prose left the two disagreeing with nothing to notice.
  #
  # The separators differ on purpose. A window inside one month reads as one
  # span ("Sep 15–17"), so the en dash is tight. A window that crosses a
  # month reads as two dates, so it gets spaces. Both use an en dash
  # (U+2013), which is what the content has always used.
  def self.display_for(starts_on, ends_on)
    return starts_on.strftime("%b %-d") if starts_on == ends_on
    if starts_on.year == ends_on.year && starts_on.month == ends_on.month
      "#{starts_on.strftime('%b %-d')}–#{ends_on.day}"
    else
      "#{starts_on.strftime('%b %-d')} – #{ends_on.strftime('%b %-d')}"
    end
  end
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && bundle exec rspec spec/models/test_date_spec.rb`
Expected: PASS, 8 examples.

- [ ] **Step 5: Write the failing content spec**

In `backend/spec/content_spec.rb`, replace nothing yet; add to the
`describe "test windows"` block:

```ruby
    it "states the range once, as dates" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d).not_to have_key("display"),
          "#{d['window']} still hand-writes display; the seeder generates it from the dates"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
    end
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `cd backend && bundle exec rspec spec/content_spec.rb -e "states the range once"`
Expected: FAIL, 1 example, reporting that `2026-09` still hand-writes display.

- [ ] **Step 7: Generate `display` in the seeder and drop it from the YAML**

Modify `backend/app/services/content_seeder.rb`:

```ruby
  # `display` is generated rather than read. The YAML states the range once,
  # as dates; TestDate.display_for turns them into the prose the sheet and
  # the exporter show, so the two can never disagree.
  def seed_test_dates(rows)
    rows.each do |row|
      starts_on = row.fetch("starts_on")
      ends_on = row.fetch("ends_on")
      upsert(year.test_dates, { window: row.fetch("window") },
             row.slice("label", "position").merge(
               "starts_on" => starts_on,
               "ends_on" => ends_on,
               "display" => TestDate.display_for(starts_on, ends_on)
             ))
    end
  end
```

Then remove all five `display:` lines from the `test_dates:` block in
`backend/content/program_years/2026-27/program.yml`, leaving each window as
`window`, `label`, `starts_on`, `ends_on`, `position`.

- [ ] **Step 8: Run the content spec to verify it passes**

Run: `cd backend && bundle exec rspec spec/content_spec.rb`
Expected: PASS.

- [ ] **Step 9: Seed and check the generated strings match what was authored**

```bash
cd backend && bin/rails content:seed
bin/rails runner 'puts ProgramYear.last.test_dates.order(:position).pluck(:window, :display).inspect'
```

Expected, exactly the five strings the YAML used to carry:
`[["2026-09", "Sep 15–17"], ["2026-12", "Dec 7–11"], ["2027-03", "Mar 1–5"], ["2027-06", "Jun 14–18"], ["2027-08", "Aug 9–13"]]`

If any string differs from what `git show HEAD~1:backend/content/program_years/2026-27/program.yml`
carried, stop: the formatter is wrong, not the content.

- [ ] **Step 10: Run the whole backend suite**

Run: `cd backend && bundle exec rspec`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/test_date.rb backend/app/services/content_seeder.rb \
        backend/content/program_years/2026-27/program.yml \
        backend/spec/models/test_date_spec.rb backend/spec/content_spec.rb
git commit -m "Generate a test window's display string from its dates

The YAML stated the range twice, once as dates and once as prose, with
nothing checking that the two agreed. It states it once now and the seeder
writes the same column it always wrote, so every reader downstream is
untouched."
```

---

### Task 3: the payload sends the dates, and core knows their type

**Files:**
- Modify: `backend/app/services/program_year_payload.rb:127-131`
- Modify: `backend/spec/requests/` (the program-years request spec; find it with `ls backend/spec/requests`)
- Modify: `core/src/types.ts`

**Interfaces:**
- Consumes: `TestDate#starts_on`, `#ends_on` from Task 1.
- Produces: each object in `GET /api/v1/program_years/:id`'s `test_dates` array carries `starts_on` and `ends_on` as ISO date strings (`"2026-09-15"`). `TestDate` in `core/src/types.ts` gains `starts_on?: string | null` and `ends_on?: string | null`.

- [ ] **Step 1: Write the failing request spec**

Add to the program-years request spec, inside the `GET /api/v1/program_years/:id` describe:

```ruby
    it "sends each test window's range as dates" do
      get "/api/v1/program_years/#{year.id}", headers: auth_headers(coach)

      windows = response.parsed_body.fetch("test_dates")
      expect(windows).not_to be_empty
      checked = 0
      windows.each do |w|
        # ISO strings, not Date objects and not the prose in `display`. This
        # is what core parses to decide whether a test is due today.
        expect(w["starts_on"]).to match(/\A\d{4}-\d{2}-\d{2}\z/)
        expect(w["ends_on"]).to match(/\A\d{4}-\d{2}-\d{2}\z/)
        checked += 1
      end
      expect(checked).to eq(windows.size)
    end
```

If the existing spec names its subjects differently (`year`, `coach`,
`auth_headers`), match whatever that file already uses rather than
introducing new helpers.

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && bundle exec rspec spec/requests -e "sends each test window's range"`
Expected: FAIL, `expected nil to match /\A\d{4}-\d{2}-\d{2}\z/`.

- [ ] **Step 3: Send the fields**

Modify `backend/app/services/program_year_payload.rb:127-131`:

```ruby
  def test_dates
    @year.test_dates.map do |d|
      { id: d.id, window: d.window, label: d.label, display: d.display,
        starts_on: d.starts_on&.iso8601, ends_on: d.ends_on&.iso8601,
        position: d.position }
    end
  end
```

`&.iso8601` rather than `.iso8601`, because a row seeded before Task 1
landed still has nulls and the payload should say so rather than raise.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && bundle exec rspec spec/requests`
Expected: PASS.

- [ ] **Step 5: Teach core's type about them**

Modify `core/src/types.ts:256-262`:

```ts
export interface TestDate {
  id: number;
  window: string;
  label: string;
  display: string;
  // The range the window covers. Optional on purpose, and not because the
  // server treats them as optional: TestDate validates both as present, so
  // a row written after 14 September 2026 always has them. The gap is the
  // deploy. Merging to `main` rebuilds the web app and does not deploy the
  // API (CLAUDE.md), so there is a real window in which this front end runs
  // against a server whose payload omits both keys entirely, which reads as
  // undefined rather than as null. selectTestDayFor treats either as a
  // window it cannot place, so Today shows no test section instead of
  // breaking.
  starts_on?: string | null;
  ends_on?: string | null;
  position: number;
}
```

- [ ] **Step 6: Typecheck core and the web app**

Run: `cd core && npm run typecheck && cd ../web && npx tsc --noEmit`
Expected: both clean. Optional fields added to an interface break nothing
that does not read them, and nothing reads them yet.

- [ ] **Step 7: Run the backend and core suites**

Run: `cd backend && bundle exec rspec && cd ../core && npm test`
Expected: PASS both.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/program_year_payload.rb backend/spec/requests core/src/types.ts
git commit -m "Send a test window's dates to the client

Optional on core's type, deliberately. The server requires both; the gap is
that a merge rebuilds Vercel and does not deploy Fly, so this front end will
run for a while against a payload that omits them."
```

---

### Task 4: `selectTestDayFor`

**Files:**
- Modify: `core/src/ducks/testResults/selectors.ts`
- Create: `core/src/ducks/testResults/__tests__/selectTestDayFor.test.ts`

Check where the testResults duck's existing tests live first
(`ls core/src/ducks/testResults`); if the package keeps them in a sibling
`__tests__` directory, follow that, and if it keeps them elsewhere, follow
that instead.

**Interfaces:**
- Consumes: `TestDate` with the optional dates from Task 3.
- Produces:
  ```ts
  interface TestDay { testDate: TestDate; dayNumber: number; dayCount: number }
  function selectTestDayFor(dates: TestDate[], isoDate: string): TestDay | null
  ```
  Exported from `core/src/ducks/testResults/selectors.ts`, so it reaches
  apps as `testResultsSelectors.selectTestDayFor`. `core/src/index.ts`
  already re-exports `testResultsSelectors` whole, so nothing there changes.

- [ ] **Step 1: Write the failing tests**

Create `core/src/ducks/testResults/__tests__/selectTestDayFor.test.ts`:

```ts
import { selectTestDayFor } from "../selectors";
import type { TestDate } from "../../../types";

function window(overrides: Partial<TestDate> & Pick<TestDate, "window">): TestDate {
  return {
    id: 1,
    label: "Baseline",
    display: "Sep 15–17",
    starts_on: "2026-09-15",
    ends_on: "2026-09-17",
    position: 1,
    ...overrides,
  };
}

const BASELINE = window({ window: "2026-09" });
const RETEST = window({
  id: 2,
  window: "2026-12",
  label: "Retest 1",
  display: "Dec 7–11",
  starts_on: "2026-12-07",
  ends_on: "2026-12-11",
  position: 2,
});
const DATES = [BASELINE, RETEST];

describe("selectTestDayFor", () => {
  // The three days of the baseline, each named, because "day 2 of 3" is the
  // whole reason this returns a number rather than a boolean and an
  // off-by-one here would read as a wrong day on the court.
  it("counts the first day of a window as day 1", () => {
    expect(selectTestDayFor(DATES, "2026-09-15")).toEqual({
      testDate: BASELINE,
      dayNumber: 1,
      dayCount: 3,
    });
  });

  it("counts a middle day", () => {
    expect(selectTestDayFor(DATES, "2026-09-16")).toEqual({
      testDate: BASELINE,
      dayNumber: 2,
      dayCount: 3,
    });
  });

  it("counts the last day", () => {
    expect(selectTestDayFor(DATES, "2026-09-17")).toEqual({
      testDate: BASELINE,
      dayNumber: 3,
      dayCount: 3,
    });
  });

  it("finds a window other than the first", () => {
    expect(selectTestDayFor(DATES, "2026-12-09")).toEqual({
      testDate: RETEST,
      dayNumber: 3,
      dayCount: 5,
    });
  });

  // The day either side of a window, which is what makes the section
  // disappear rather than linger for a month.
  it("finds nothing the day before a window opens", () => {
    expect(selectTestDayFor(DATES, "2026-09-14")).toBeNull();
  });

  it("finds nothing the day after a window closes", () => {
    expect(selectTestDayFor(DATES, "2026-09-18")).toBeNull();
  });

  it("finds nothing between windows", () => {
    expect(selectTestDayFor(DATES, "2026-10-20")).toBeNull();
  });

  it("finds nothing when there are no windows at all", () => {
    expect(selectTestDayFor([], "2026-09-16")).toBeNull();
  });

  // The deploy window: Vercel has the new front end, Fly has not been
  // deployed, so the payload omits both keys. Today must show no test
  // section rather than place the day wrongly or throw.
  it("cannot place a window whose dates the server has not sent", () => {
    const old = { ...BASELINE };
    delete (old as Partial<TestDate>).starts_on;
    delete (old as Partial<TestDate>).ends_on;
    expect(selectTestDayFor([old], "2026-09-16")).toBeNull();
  });

  it("cannot place a window with a null start", () => {
    expect(selectTestDayFor([{ ...BASELINE, starts_on: null }], "2026-09-16")).toBeNull();
  });

  it("cannot place a window with a null end", () => {
    expect(selectTestDayFor([{ ...BASELINE, ends_on: null }], "2026-09-16")).toBeNull();
  });

  // A window one day long. dayCount 1 is a real answer, and a formula that
  // subtracted without adding one would return 0 here.
  it("handles a window one day long", () => {
    const single = { ...BASELINE, starts_on: "2026-09-15", ends_on: "2026-09-15" };
    expect(selectTestDayFor([single], "2026-09-15")).toEqual({
      testDate: single,
      dayNumber: 1,
      dayCount: 1,
    });
  });

  // Crossing a month and crossing a year, where string comparison still
  // works but naive day arithmetic on the day-of-month would not.
  it("handles a window that crosses a month", () => {
    const crossing = { ...BASELINE, starts_on: "2027-06-28", ends_on: "2027-07-02" };
    expect(selectTestDayFor([crossing], "2027-07-01")).toEqual({
      testDate: crossing,
      dayNumber: 4,
      dayCount: 5,
    });
  });

  it("handles a window that crosses a year", () => {
    const crossing = { ...BASELINE, starts_on: "2026-12-30", ends_on: "2027-01-02" };
    expect(selectTestDayFor([crossing], "2027-01-01")).toEqual({
      testDate: crossing,
      dayNumber: 3,
      dayCount: 4,
    });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd core && npx jest selectTestDayFor`
Expected: FAIL, 14 examples, `selectTestDayFor is not a function`.

- [ ] **Step 3: Write the selector**

Add to `core/src/ducks/testResults/selectors.ts`, below `selectDefaultWindow`:

```ts
export interface TestDay {
  testDate: TestDate;
  dayNumber: number;
  dayCount: number;
}

// Whole days since the epoch, from the date's own parts. Not `new Date(iso)`,
// which parses a bare "2026-09-15" as midnight UTC and then reports it in
// the viewer's zone, so a coach west of Greenwich would be told the window
// opened a day later than it did. Date.UTC on the parts has no zone in it at
// all, which is the right amount of timezone for a calendar date.
function utcDays(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

// Which test window, if any, `isoDate` falls inside, and where in it.
// `dayNumber` is 1-based because "day 2 of 3" is what a person standing on a
// court with a stopwatch reads.
//
// A window missing either date is one this cannot place, and it is skipped
// rather than guessed at. That is not defensive padding: merging to `main`
// rebuilds the web app and does not deploy the API, so this front end runs
// against a payload with neither field until somebody deploys Fly. See the
// comment on TestDate in types.ts.
export function selectTestDayFor(dates: TestDate[], isoDate: string): TestDay | null {
  for (const testDate of dates) {
    const { starts_on: startsOn, ends_on: endsOn } = testDate;
    if (!startsOn || !endsOn) continue;
    // ISO dates are zero-padded and fixed width, so comparing them as
    // strings orders them correctly and costs no parsing.
    if (isoDate < startsOn || isoDate > endsOn) continue;
    const start = utcDays(startsOn);
    return {
      testDate,
      dayNumber: utcDays(isoDate) - start + 1,
      dayCount: utcDays(endsOn) - start + 1,
    };
  }
  return null;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd core && npx jest selectTestDayFor`
Expected: PASS, 14 examples.

- [ ] **Step 5: Run the whole core suite and typecheck**

Run: `cd core && npm test && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add core/src/ducks/testResults/selectors.ts core/src/ducks/testResults/__tests__
git commit -m "core: which test window a date falls in, and where in it

Answers \"Baseline test, day 2 of 3\" and, just as importantly, answers
nothing on the day after a window closes. A window whose dates the server
has not sent yet is one it declines to place."
```

---

### Task 5: `TestSheet`, out of the Tests screen

**Files:**
- Create: `web/src/components/TestSheet.tsx`
- Modify: `web/src/screens/Tests.tsx`
- Modify: `web/__tests__/tests-screen.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```tsx
  function TestSheet(props: {
    programYearId: number;
    window: string;
    measures: ProgramYearDetail["battery"]["measures"];
  }): JSX.Element
  ```
  It reads results and the outbox queue itself through selectors, so a
  caller passes only what it knows. It renders the measure rows and, below
  them, a count of how many are still blank.

- [ ] **Step 1: Write the failing test**

Add to `web/__tests__/tests-screen.test.tsx`, using the helpers already at
the top of that file: `renderTests()`, `loadYear(store)`, `loadResults(store)`,
the three-measure `MEASURES` fixture (`sprint10`, `broad_jump`, `balance_l`)
and the `RESULTS` fixture, which carries `sprint10` and `broad_jump` in the
`2026-09` window and nothing for `balance_l`.

```tsx
describe("what is left to measure", () => {
  // The battery runs across three days, so what is still blank is the thing
  // worth knowing while standing on a court with a stopwatch.
  it("counts the measures with no result yet", async () => {
    const { store } = renderTests();
    loadYear(store);

    expect(await screen.findByText(/still blank/i)).toHaveTextContent("3 still blank");
  });

  // Counted off the store, which is the point. RESULTS fills two of the
  // three measures in the active window, so the count has to drop to one.
  it("counts down as results arrive", async () => {
    const { store } = renderTests();
    loadYear(store);
    await screen.findByText(/still blank/i);

    loadResults(store);

    expect(screen.getByText(/still blank/i)).toHaveTextContent("1 still blank");
  });

  // Nothing left to say once every box is filled, rather than "0 still
  // blank", which is a sentence nobody needs to read.
  it("says nothing when every measure has a result", async () => {
    const { store } = renderTests();
    loadYear(store);
    loadResults(store, [
      ...RESULTS,
      {
        id: 503,
        test_id: "balance_l",
        window: "2026-09",
        raw_value: "12",
        numeric_value: "12",
        recorded_at: "2026-09-14T10:00:00.000Z",
        updated_at: "2026-09-14T10:00:00.000Z",
      },
    ]);

    expect(screen.queryByText(/still blank/i)).toBeNull();
  });

  // A number typed and not blurred has not been saved. Telling him it had
  // is the one lie this screen must not tell.
  it("does not count a number that has been typed but not committed", async () => {
    const { store } = renderTests();
    loadYear(store);
    await screen.findByText(/still blank/i);

    await userEvent.type(screen.getByLabelText("Balance hold, left (sec)"), "12");

    expect(screen.getByText(/still blank/i)).toHaveTextContent("3 still blank");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd web && npx vitest run __tests__/tests-screen.test.tsx`
Expected: FAIL, unable to find text matching `/still blank/i`.

- [ ] **Step 3: Create the component**

Create `web/src/components/TestSheet.tsx`. Move `isQueuedFor` and
`MeasureRow` across from `Tests.tsx` **unchanged, comments and all**: they
are correct and their comments carry the reasoning for `inputMode="text"`
and for reading `raw_value` rather than `numeric_value`.

```tsx
import { useEffect, useState } from "react";
import {
  outboxSelectors,
  testResultsActions,
  testResultsSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { ProgramYearDetail, QueuedWrite, TestResult } from "@teddy-pe/core";

type Measure = ProgramYearDetail["battery"]["measures"][number];

// (move isQueuedFor here from Tests.tsx, with its comment intact)

// The rows of one test window. It takes the window it is showing and reads
// everything else itself, so a caller needs to know only which window it
// wants: the Tests tab passes whichever one the picker is on, and Today
// passes the one today falls inside.
export function TestSheet({
  programYearId,
  window,
  measures,
}: {
  programYearId: number;
  window: string;
  measures: Measure[];
}) {
  const results = useAppSelector(testResultsSelectors.selectResultsForWindow(window));
  const queue = useAppSelector(outboxSelectors.selectQueue);

  // Counted off the store, never off the boxes. A number typed and not yet
  // blurred has not been saved, and telling him it had would be the one
  // lie this screen must not tell.
  const blank = measures.filter((m) => !results[m.test_id]).length;

  return (
    <>
      <ul className="tests__measures" aria-label="Measures">
        {measures.map((measure) => (
          <MeasureRow
            key={`${window}-${measure.test_id}`}
            programYearId={programYearId}
            window={window}
            measure={measure}
            result={results[measure.test_id] ?? null}
            queue={queue}
          />
        ))}
      </ul>
      {blank > 0 && <p className="tests__blank-count">{blank} still blank</p>}
    </>
  );
}

// (move MeasureRow here from Tests.tsx, unchanged, with every comment)
```

Note the `key` keeps the window in it. `MeasureRow`'s own comment explains
why: switching windows is a clean remount so each box starts from that
window's stored value.

- [ ] **Step 4: Make Tests render it**

Modify `web/src/screens/Tests.tsx`. Delete `isQueuedFor`, `MeasureRow`, the
`Measure` type alias and the now-unused imports (`outboxSelectors`,
`QueuedWrite`, `TestResult`, and `results`/`queue` selectors). Keep
everything else: the window picker, the loading and error gates,
`selectDefaultWindow`, `byPosition`. Replace the `<ul>` block with:

```tsx
      {measures.length === 0 ? (
        <p className="tests__empty">No measures have been set up yet.</p>
      ) : (
        <TestSheet programYearId={programYearId} window={activeWindow} measures={measures} />
      )}
```

and add `import { TestSheet } from "../components/TestSheet";`.

- [ ] **Step 5: Run the tests screen suite to verify it passes**

Run: `cd web && npx vitest run __tests__/tests-screen.test.tsx`
Expected: PASS, including the two new examples and every example that
existed before. The extraction changes no behaviour, so a previously
passing example that now fails means something was dropped in the move.

- [ ] **Step 6: Run the whole web suite and typecheck**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/TestSheet.tsx web/src/screens/Tests.tsx \
        web/__tests__/tests-screen.test.tsx
git commit -m "Lift the test sheet out of the Tests screen

One component that takes the window it is showing, so the Tests tab can
hand it the picker's choice and Today can hand it the window today falls
inside. It gains a count of what is still blank, which the battery's three
days make worth knowing on both."
```

---

### Task 6: `SaveStatus`, the one line both forms use

**Files:**
- Create: `web/src/components/SaveStatus.tsx`
- Create: `web/__tests__/save-status.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```tsx
  function SaveStatus(props: {
    saving: boolean;
    queued: boolean;
    savedAt: string | null;  // an entry's updated_at, ISO, or null
  }): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/save-status.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { SaveStatus } from "../src/components/SaveStatus";

// The four states, and the order they win in. A form that is both saving and
// holding a queued write is saving; a form with a queued write has not
// reached the server whatever its entry says it was last saved at.
describe("SaveStatus", () => {
  it("says nothing before anything has been written", () => {
    const { container } = render(<SaveStatus saving={false} queued={false} savedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is saving", () => {
    render(<SaveStatus saving queued={false} savedAt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving.");
  });

  it("says a write is waiting for a connection", () => {
    render(<SaveStatus saving={false} queued savedAt="2026-09-17T16:12:00Z" />);
    expect(screen.getByRole("status")).toHaveTextContent(/waiting to send/i);
  });

  it("prefers saving over waiting", () => {
    render(<SaveStatus saving queued savedAt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving.");
  });

  it("says when the server last saved it", () => {
    render(<SaveStatus saving={false} queued={false} savedAt="2026-09-17T16:12:00Z" />);
    // The local time, whatever zone the test runs in, so this asserts the
    // shape rather than a zone the CI box happens to be in.
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved \d{1,2}:\d{2}/);
  });

  it("says nothing about a time it cannot read", () => {
    render(<SaveStatus saving={false} queued={false} savedAt="not a date" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd web && npx vitest run __tests__/save-status.test.tsx`
Expected: FAIL, cannot resolve `../src/components/SaveStatus`.

- [ ] **Step 3: Write the component**

Create `web/src/components/SaveStatus.tsx`:

```tsx
// What a form says about itself, in one line, read off real state rather
// than an optimistic flag somebody set when a button was pressed.
//
// One line per form and not one per field. A form that marked each field
// would be a wall of "saved" on a phone, and the question he actually has
// mid-session is whether the entry is safe, never which of nine fields is.
const WAITING_TEXT =
  "Waiting to send. It is saved on this phone and will go out once you have a connection.";

export function SaveStatus({
  saving,
  queued,
  savedAt,
}: {
  saving: boolean;
  queued: boolean;
  // An entry's `updated_at`, or null when the server holds no entry for
  // this date yet.
  savedAt: string | null;
}) {
  // Saving wins over queued: both are true for the moment between a write
  // leaving the form and the outbox taking it, and "Saving." is the truer
  // of the two there.
  if (saving) return <p role="status">Saving.</p>;
  // A queued write has not reached the server, so whatever `savedAt` says
  // was last stored is older than what he is looking at. Say the honest
  // thing rather than the reassuring one.
  if (queued) return <p role="status">{WAITING_TEXT}</p>;
  if (!savedAt) return null;

  const at = new Date(savedAt);
  // An unparseable timestamp says nothing rather than "Saved Invalid Date".
  if (Number.isNaN(at.getTime())) return null;

  return (
    <p role="status">
      Saved {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </p>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run __tests__/save-status.test.tsx`
Expected: PASS, 6 examples.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/SaveStatus.tsx web/__tests__/save-status.test.tsx
git commit -m "One line a form says about itself

Read off real state. A queued write says so rather than showing the time
the server last saved something older."
```

---

### Task 7: `CoachNoteForm`, extracted and autosaving

**Files:**
- Create: `web/src/components/CoachNoteForm.tsx`
- Modify: `web/src/screens/CoachJournal.tsx`
- Modify: `web/__tests__/coach-journal.test.tsx`

**Interfaces:**
- Consumes: `SaveStatus` from Task 6.
- Produces:
  ```tsx
  function CoachNoteForm(props: {
    programYearId: number;
    date: string;
  }): JSX.Element
  ```
  It reads the entry, the drills, the week and the queue itself. The Save
  button stays inside it. The delete stays behind, on `CoachJournal`.

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/coach-journal.test.tsx`, reusing the file's existing
fixtures and render helper:

```tsx
  describe("saving as you go", () => {
    // Autosave is the whole reason this screen changed. A session written up
    // on a phone that locks must not lose what was typed, and the only way
    // that holds is if nothing waits for a button.
    it("saves a text field when it loses focus", async () => {
      const { dispatched } = renderCoachJournal(); // this file's helper
      const note = await screen.findByLabelText("What did you see?");

      await userEvent.type(note, "Landed quiet on eight of ten.");
      fireEvent.blur(note);

      expect(dispatched.filter(isCoachSave)).toHaveLength(1);
      expect(lastCoachSave(dispatched).note).toBe("Landed quiet on eight of ten.");
    });

    // The guard Tests.tsx already uses on its own boxes. A field tabbed past
    // is not an edit, and firing a write for one would put a request on the
    // wire for every field he walks through.
    it("does not save a text field he only passed through", async () => {
      const { dispatched } = renderCoachJournal();
      const note = await screen.findByLabelText("What did you see?");

      fireEvent.focus(note);
      fireEvent.blur(note);

      expect(dispatched.filter(isCoachSave)).toHaveLength(0);
    });

    it("saves the moment a radio is tapped", async () => {
      const { dispatched } = renderCoachJournal();
      const energy = await screen.findByRole("group", { name: "Energy" });

      await userEvent.click(within(energy).getByLabelText("4"));

      expect(dispatched.filter(isCoachSave)).toHaveLength(1);
      expect(lastCoachSave(dispatched).energy).toBe(4);
    });

    it("saves the moment a drill rating is tapped", async () => {
      const { dispatched } = renderCoachJournal();
      const drill = await screen.findByRole("group", { name: "Star Jump" });

      await userEvent.click(within(drill).getByLabelText("owns"));

      expect(lastCoachSave(dispatched).ratings).toEqual({ "star-jump": "owns" });
    });

    // Save is the retry, and it is the one thing autosave cannot be. A write
    // the queue gave up on will not go again until a field is touched, so
    // this must send even when nothing has changed.
    it("re-sends on Save when nothing has changed", async () => {
      const { dispatched } = renderCoachJournal();
      const save = await screen.findByRole("button", { name: "Save" });

      await userEvent.click(save);

      expect(dispatched.filter(isCoachSave)).toHaveLength(1);
    });

    it("sends the whole entry on every save, not just the field that changed", async () => {
      const { dispatched } = renderCoachJournal();
      const energy = await screen.findByRole("group", { name: "Energy" });
      await userEvent.click(within(energy).getByLabelText("4"));

      const note = screen.getByLabelText("What did you see?");
      await userEvent.type(note, "Good session.");
      fireEvent.blur(note);

      // saveCoachEntry is a whole-entry upsert, so the second write has to
      // carry the first one's energy or tapping a radio then typing a note
      // would erase the radio.
      const last = lastCoachSave(dispatched);
      expect(last.energy).toBe(4);
      expect(last.note).toBe("Good session.");
    });
  });
```

Add the two helpers near the top of the file:

```tsx
function isCoachSave(action: { type: string }): boolean {
  return action.type === journalActions.saveCoachEntry("" as never).type;
}

function lastCoachSave(dispatched: { type: string; payload: SaveCoachEntryPayload }[]) {
  const saves = dispatched.filter(isCoachSave);
  return saves[saves.length - 1]!.payload;
}
```

If this file does not already record dispatched actions, add a small middleware
to its store helper that pushes each action onto an array, and return that
array from the helper. Do not reach into the store's internals to assert.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd web && npx vitest run __tests__/coach-journal.test.tsx`
Expected: FAIL on the new examples. "saves a text field when it loses focus"
reports 0 saves, because today nothing saves until Save is pressed.

- [ ] **Step 3: Create the component**

Create `web/src/components/CoachNoteForm.tsx`. Move across from
`CoachJournal.tsx`, unchanged and with every comment: `RATING_VALUES`,
`ratingLabel`, `FINDING_DRILLS_LABEL`, `NO_DRILLS_LABEL`,
`OUTSIDE_WEEK_LABEL`, `NO_WEEK_LABEL`, `CHALLENGE_HEADING`,
`CHALLENGE_NUMBER_LABEL`, `FormState`, `BLANK_FORM`, `formFrom`, the
`dayDrills`/`shownDrills` computation and the whole `<form>`. Leave the
delete constants and the delete section behind on the screen.

The new part is the commit machinery:

```tsx
export function CoachNoteForm({
  programYearId,
  date,
}: {
  programYearId: number;
  date: string;
}) {
  const dispatch = useAppDispatch();

  const existingEntry = useAppSelector(journalSelectors.selectCoachEntryFor(date));
  const saving = useAppSelector(journalSelectors.selectIsSaving(date));
  const queued = useAppSelector(journalSelectors.selectIsEntryQueued("coach", date));

  const drillList = useAppSelector(selectDrills);
  const weekData = useAppSelector(selectWeek);
  const weekError = useAppSelector(week.selectors.selectError);
  const dayCard = useAppSelector(selectDayByDate(date));

  const [form, setForm] = useState<FormState>(() => formFrom(existingEntry));

  // What was last sent, so a text field can tell an edit from a field he
  // walked through. The same guard MeasureRow.commit already uses on the
  // test sheet's boxes, kept in a ref rather than in state because changing
  // it must not re-render: it is a record of what happened, never something
  // the form displays.
  const sentRef = useRef<FormState>(form);

  useEffect(() => {
    const next = formFrom(existingEntry);
    setForm(next);
    // Reset together with the form. A date change or an entry arriving from
    // the server makes whatever was last sent irrelevant to what is now on
    // screen, and a stale ref here would suppress the first real edit.
    sentRef.current = next;
  }, [date, existingEntry]);

  function commit(next: FormState) {
    sentRef.current = next;
    dispatch(
      journalActions.saveCoachEntry({
        programYearId,
        date,
        note: next.note.trim() === "" ? null : next.note,
        overall: next.overall,
        energy: next.energy,
        flag_pain: next.flagPain,
        pain_note: next.flagPain && next.painNote.trim() !== "" ? next.painNote : null,
        challenge_num: next.challengeNum.trim() === "" ? null : next.challengeNum,
        ratings: next.ratings,
      }),
    );
  }

  // For a text field: save on blur, and only when the text actually moved.
  function commitIfChanged(field: "note" | "painNote" | "challengeNum") {
    if (form[field] === sentRef.current[field]) return;
    commit(form);
  }

  // For a radio, a checkbox or a rating: the tap is the decision, so it goes
  // straight out. Every save sends the whole entry, so `next` is built first
  // and both set and sent, rather than setting state and sending a `form`
  // this render still has the old value of.
  function set(next: FormState) {
    setForm(next);
    commit(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Unconditional, on purpose. Autosave covers the ordinary case and
    // cannot cover the failed one: a write the outbox gave up on does not go
    // again until a field is touched. This button is that retry, which is
    // why it does not check whether anything changed first.
    commit(form);
  }
  // ... the JSX, with onBlur / onChange wired to the three functions above
  //     and <SaveStatus saving={saving} queued={queued}
  //                     savedAt={existingEntry?.updated_at ?? null} />
  //     above the Save button
}
```

Wire each control:
- `note`, `painNote`, `challengeNum` textareas and inputs: keep `onChange`
  setting state only, add `onBlur={() => commitIfChanged("note")}` and so on.
- `overall`, `energy` radios: `onChange={() => set({ ...form, overall: n })}`.
- The pain checkbox: `onChange={(e) => set({ ...form, flagPain: e.target.checked })}`.
- Drill ratings: `updateRating` becomes
  `set({ ...form, ratings: { ...form.ratings, [slug]: value } })`.

- [ ] **Step 4: Make CoachJournal render it**

Modify `web/src/screens/CoachJournal.tsx`. It keeps: the fetch effect, the
`currentId` and `drillsData` gates, `WAKING_LABEL`, `FINDING_YEAR_LABEL`,
the `<h1>`, the session-date picker, the delete section and its constants,
and `justDeleted`. Everything between the date picker and the delete
section becomes:

```tsx
      <CoachNoteForm programYearId={currentId} date={date} />
```

Delete the now-unused `FormState`, `BLANK_FORM`, `formFrom`, `form`,
`handleSubmit`, `updateRating`, `RATING_VALUES`, `ratingLabel`, the four
drill labels, the two challenge constants and their imports. Keep `saving`
and `queued` on the screen only if the delete section still reads them
(`handleDelete` disables on `saving`, and `justDeleted` reads `queued`).

- [ ] **Step 5: Run the coach journal suite to verify it passes**

Run: `cd web && npx vitest run __tests__/coach-journal.test.tsx`
Expected: PASS, the new examples and every one that existed before. An
older example that asserted "nothing is dispatched until Save is pressed"
is now wrong by design: update it to assert the new behaviour rather than
deleting it, and say so in its comment.

- [ ] **Step 6: Run the whole web suite and typecheck**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/CoachNoteForm.tsx web/src/screens/CoachJournal.tsx \
        web/__tests__/coach-journal.test.tsx
git commit -m "The coach's note saves as he writes it

Text fields on blur when they changed, radios and ratings on the tap. A
session written up on a phone that locks is no longer a session lost.

Save stays, and it is the retry: a write the outbox gave up on does not go
again until a field is touched, so the button sends whether or not anything
changed."
```

---

### Task 8: `AthleteNoteForm`, extracted and autosaving

`AthleteJournal` is already today-only: no date picker, `<h1>Today</h1>`,
`todayISODate()` in the body. So this extraction takes the date as a prop
for the first time, which is what lets Today render it.

**Files:**
- Create: `web/src/components/AthleteNoteForm.tsx`
- Modify: `web/src/screens/AthleteJournal.tsx`
- Modify: `web/__tests__/athlete-journal.test.tsx`

**Interfaces:**
- Consumes: `SaveStatus` from Task 6.
- Produces:
  ```tsx
  function AthleteNoteForm(props: {
    programYearId: number;
    date: string;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/athlete-journal.test.tsx`, reusing its helpers:

```tsx
  describe("saving as he writes", () => {
    it("saves a text field when it loses focus", async () => {
      const { dispatched } = renderAthleteJournal();
      const best = await screen.findByLabelText(/best/i);

      await userEvent.type(best, "I did a cartwheel.");
      fireEvent.blur(best);

      expect(lastAthleteSave(dispatched).best).toBe("I did a cartwheel.");
    });

    it("does not save a field he only passed through", async () => {
      const { dispatched } = renderAthleteJournal();
      const best = await screen.findByLabelText(/best/i);

      fireEvent.focus(best);
      fireEvent.blur(best);

      expect(dispatched.filter(isAthleteSave)).toHaveLength(0);
    });

    it("saves the moment he picks how it felt", async () => {
      const { dispatched } = renderAthleteJournal();
      const felt = await screen.findByRole("group", { name: /felt/i });

      await userEvent.click(within(felt).getByLabelText("5"));

      expect(lastAthleteSave(dispatched).felt).toBe(5);
    });

    it("re-sends on Save when nothing has changed", async () => {
      const { dispatched } = renderAthleteJournal();

      await userEvent.click(await screen.findByRole("button", { name: "Save" }));

      expect(dispatched.filter(isAthleteSave)).toHaveLength(1);
    });

    // The share toggle has always been its own action and stays one.
    // setShared is what the API reads for it, and routing it through a
    // whole-entry save would be a second way to change the one field Teddy
    // controls.
    it("still shares through setShared, not through a save", async () => {
      const { dispatched } = renderAthleteJournal();

      await userEvent.click(await screen.findByRole("button", { name: /show dad/i }));

      expect(dispatched.filter(isAthleteSave)).toHaveLength(0);
      expect(dispatched.some((a) => a.type.includes("SET_SHARED"))).toBe(true);
    });
  });
```

Match the real label text and button names by reading the screen first; the
regexes above are the shapes, and the file's existing examples already name
them exactly.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd web && npx vitest run __tests__/athlete-journal.test.tsx`
Expected: FAIL on the new examples, 0 saves where 1 is expected.

- [ ] **Step 3: Create the component**

Create `web/src/components/AthleteNoteForm.tsx`, moving the form state,
the fields, the share toggle and the Save button across from
`AthleteJournal.tsx`. It takes `date` as a prop instead of calling
`todayISODate()`. Use exactly the same `sentRef` / `commit` /
`commitIfChanged` / `set` shape Task 7 established, over this form's fields
(`felt`, `best`, `hard`, `note`), and dispatch
`journalActions.saveAthleteEntry` with the payload the screen builds today:

```tsx
    dispatch(
      journalActions.saveAthleteEntry({
        programYearId,
        date,
        note: next.note,
        shared,
        felt: next.felt,
        best: next.best.length === 0 ? null : next.best,
        hard: next.hard.length === 0 ? null : next.hard,
      }),
    );
```

While moving it, **fix the stale comment** at the old
`AthleteJournal.tsx:309-313`. It says `SaveAthleteEntryPayload` is "exactly
the four fields core's own request builder reads today (programYearId, date,
note, shared)" and that felt, best and hard only ride along. That was true
once and is not now: `SaveAthleteEntryPayload` in
`core/src/ducks/journal/actions.ts:25-33` declares all seven and
`athleteRequest` at line 92 sends all seven. Annotate the payload as
`SaveAthleteEntryPayload` and replace the comment with one sentence saying
the type carries every field and the request builder sends them.

Render `<SaveStatus saving={saving} queued={queued} savedAt={entry?.updated_at ?? null} />`
above Save. Leave the share toggle on its own `setShared` action, untouched.

- [ ] **Step 4: Make AthleteJournal render it**

Modify `web/src/screens/AthleteJournal.tsx`: it keeps the `<h1>Today</h1>`,
the fetch effect, the gates, the delete section and `todayISODate()`, and
renders `<AthleteNoteForm programYearId={currentId} date={today} />` in
place of the form.

- [ ] **Step 5: Run the athlete journal suite to verify it passes**

Run: `cd web && npx vitest run __tests__/athlete-journal.test.tsx`
Expected: PASS, new and old.

- [ ] **Step 6: Run the whole web suite and typecheck**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/AthleteNoteForm.tsx web/src/screens/AthleteJournal.tsx \
        web/__tests__/athlete-journal.test.tsx
git commit -m "Teddy's journal saves as he writes it, and takes a date

The form took today off the clock itself, which is why it could only ever be
today's. It takes the date now, so Today can render it.

Also corrects a comment that said core's request builder drops felt, best and
hard. It sends all three, and has since the payload type was widened."
```

---

### Task 9: `TodayCard`, the accordion

**Files:**
- Create: `web/src/components/TodayCard.tsx`
- Create: `web/__tests__/today-card.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```tsx
  function TodayCard(props: {
    day: DayCard;
    onSelectDrill: (slug: string) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/today-card.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayCard, DayBlock } from "@teddy-pe/core";
import { TodayCard } from "../src/components/TodayCard";

// Three blocks, so "one open at a time" can be told apart from "the one you
// tapped opens". A two-block fixture cannot: closing the first and opening
// the second looks the same either way.
function block(id: number, name: string, body: string): DayBlock {
  return {
    id,
    position: id,
    minutes: "10",
    name,
    tag: null,
    name_tokens: [{ text: name, type: "text", style: "plain" }],
    body_tokens: [{ text: body, type: "text", style: "plain" }],
    drill_slugs: [],
  };
}

const DAY: DayCard = {
  id: 1,
  dow: "thu",
  date: "2026-09-17",
  name: "Wall Day",
  role: "Wall Day",
  minutes: "100 to 120",
  intensity: 3,
  hie: 8,
  summary_lines: ["Tennis heaviest."],
  drill_slugs: [],
  dad_note: "Watch his contact point.",
  blocks: [block(1, "Wake Up", "Animal walks."), block(2, "New Thing", "Cartwheel."), block(3, "Play", "His pick.")],
};

describe("TodayCard", () => {
  it("opens the first block on arrival", () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    expect(screen.getByText("Animal walks.")).toBeInTheDocument();
    expect(screen.queryByText("Cartwheel.")).toBeNull();
  });

  it("lists every block whether open or not", () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("opens the one tapped and closes the one that was open", async () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /New Thing/ }));

    expect(screen.getByText("Cartwheel.")).toBeInTheDocument();
    expect(screen.queryByText("Animal walks.")).toBeNull();
    expect(screen.queryByText("His pick.")).toBeNull();
  });

  it("closes a block tapped a second time", async () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Wake Up/ }));

    expect(screen.queryByText("Animal walks.")).toBeNull();
  });

  it("says which block is open, for a screen reader", async () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    const wakeUp = screen.getByRole("button", { name: /Wake Up/ });
    expect(wakeUp).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: /New Thing/ }));
    expect(wakeUp).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the dad note and the summary lines", () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    expect(screen.getByText(/Watch his contact point/)).toBeInTheDocument();
    expect(screen.getByText("Tennis heaviest.")).toBeInTheDocument();
  });

  // Game Day: the home program is off, the card carries no blocks at all,
  // and the summary lines are the whole answer.
  it("shows a card with no blocks as its summary alone", () => {
    render(<TodayCard day={{ ...DAY, blocks: [], dad_note: undefined }} onSelectDrill={() => {}} />);
    expect(screen.getByText("Tennis heaviest.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("hands a tapped drill token back to its caller", async () => {
    const opened: string[] = [];
    const withDrill: DayCard = {
      ...DAY,
      blocks: [
        {
          ...block(1, "Wake Up", "Do the "),
          body_tokens: [
            { text: "Do the ", type: "text", style: "plain" },
            { text: "bear walk", type: "drill", style: "link", slug: "bear-walk" },
          ],
        },
      ],
    };
    render(<TodayCard day={withDrill} onSelectDrill={(slug) => opened.push(slug)} />);

    await userEvent.click(screen.getByRole("button", { name: "bear walk" }));

    expect(opened).toEqual(["bear-walk"]);
  });
});
```

Check `web/src/components/Tokens.tsx` for how a drill token actually
renders (button, link or something else) and match the query in the last
example to it.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd web && npx vitest run __tests__/today-card.test.tsx`
Expected: FAIL, cannot resolve `../src/components/TodayCard`.

- [ ] **Step 3: Write the component**

Create `web/src/components/TodayCard.tsx`:

```tsx
import { useState } from "react";
import type { DayCard as DayCardPayload } from "@teddy-pe/core";
import { Tokens } from "./Tokens";

// Today's card, on a phone, with a ball in his other hand. Eight blocks of
// prose all open at once is what This Week gives him and it is a long scroll
// with the one he is on somewhere inside it, so this lists all eight and
// opens one.
//
// Controlled by React state rather than by <details name="today-block">,
// which would give exclusive opening for free. Phone browsers a version or
// two back ignore the name attribute and open all eight, which is the exact
// thing this exists to stop, and the degradation would be silent.
//
// `onSelectDrill` passes straight through to Tokens, the same plain callback
// DayCard uses, for the same reason: this file has no more business calling
// useNavigate() than Tokens does, and doing so here would be exactly as
// unportable to the Phase 4 native app.
export function TodayCard({
  day,
  onSelectDrill,
}: {
  day: DayCardPayload;
  onSelectDrill: (slug: string) => void;
}) {
  const blocks = day.blocks ?? [];
  // The first block, open on arrival, because Wake Up is where a session
  // starts and he should not have to tap to begin. Null once he closes it.
  const [openId, setOpenId] = useState<number | null>(blocks[0]?.id ?? null);

  return (
    <article className="today-card">
      <p className="today-card__role">
        {day.role} &middot; {day.minutes} min
      </p>

      {day.summary_lines.length > 0 && (
        <ul aria-label="Today's summary" className="today-card__summary">
          {day.summary_lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {day.dad_note && (
        <p className="today-card__dad-note">
          <strong>Note:</strong> {day.dad_note}
        </p>
      )}

      {blocks.length > 0 && (
        <ol aria-label="Today's blocks" className="today-card__blocks">
          {blocks.map((b) => {
            const isOpen = b.id === openId;
            const panelId = `today-block-${b.id}`;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className="today-card__block-toggle"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? null : b.id)}
                >
                  <span className="today-card__block-name">
                    <Tokens tokens={b.name_tokens} onSelectDrill={onSelectDrill} />
                  </span>
                  <span className="today-card__block-minutes">{b.minutes} min</span>
                </button>
                {isOpen && (
                  <div id={panelId} className="today-card__block-body">
                    <Tokens tokens={b.body_tokens} onSelectDrill={onSelectDrill} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
```

If a block's `name_tokens` can carry a drill token, the toggle would nest a
button inside a button, which is invalid HTML. Check a real week payload
(`day_blocks.name_tokens` after `bin/rails content:seed`, or the fixtures in
`web/__tests__/this-week.test.tsx`). If names do carry drill tokens, render
the toggle's label as plain text from `b.name` and leave `Tokens` for the
body alone, and say why in a comment.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run __tests__/today-card.test.tsx`
Expected: PASS, 8 examples.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/TodayCard.tsx web/__tests__/today-card.test.tsx
git commit -m "Today's card as an accordion, one block open

Eight blocks of prose at once is a long scroll with the one he is on
somewhere inside it. React state rather than <details name>, which phone
browsers a version back ignore silently."
```

---

### Task 10: the Today screen, the route, and home

**Files:**
- Create: `web/src/screens/Today.tsx`
- Create: `web/__tests__/today.test.tsx`
- Modify: `web/src/routes.tsx`
- Modify: `web/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: `TodayCard` (Task 9), `CoachNoteForm` (Task 7),
  `AthleteNoteForm` (Task 8), `TestSheet` (Task 5),
  `testResultsSelectors.selectTestDayFor` (Task 4).
- Produces: the route `/today`, first in `NAV_ITEMS`, `roles: "any"`, and
  the app's home.

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/today.test.tsx`. Build it on `this-week.test.tsx`'s
week fixture and `tests-screen.test.tsx`'s program-year fixture; import
them if those files export them, and copy them if they do not.

```tsx
// The one helper every example here goes through. It takes the four things
// a Today example ever needs to vary (who is signed in, what the week duck
// holds, whether the year id is known, and what the program year holds) and
// hands back the tracked dispatches and the router, so an example asserts on
// what went out and where it navigated rather than on store internals.
//
// `trackDispatch` and `seedAuth` are lifted from tests-screen.test.tsx,
// which already has both. `seedAuth` there takes (store, programYearId) and
// puts a coach in the store; it needs a third argument for the role, since
// half of what this file asserts is that the three accounts see three
// different screens. Widen it there with a default of "coach" so that file's
// own callers are untouched, and copy it across.
//
// `WEEK` is this-week.test.tsx's week fixture, whose seven cards run 14 to
// 20 September 2026 with Thursday the 17th as Wall Day. Export it from that
// file and import it here rather than writing a second week that has to be
// kept in step with the first.
function renderToday({
  role = "coach",
  currentProgramYearId = 42,
  week = WEEK,
  loading = false,
  error = null,
  programYear: year = yearFixture(),
}: {
  role?: Role;
  currentProgramYearId?: number | null;
  week?: WeekPayload | null;
  loading?: boolean;
  error?: string | null;
  programYear?: ProgramYearDetail;
} = {}) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId, role);
  const dispatched = trackDispatch(store);

  const router = createMemoryRouter(
    [{ path: "*", element: <Today /> }],
    { initialEntries: ["/today"] },
  );

  const rendered = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  act(() => {
    if (week) store.dispatch({ type: "week/SUCCEEDED", payload: week });
    if (loading) store.dispatch(weekDuck.actions.fetch(currentProgramYearId as number));
    if (error) store.dispatch({ type: "week/FAILED", payload: error });
    if (currentProgramYearId !== null) {
      store.dispatch({ type: "programYear/SUCCEEDED", payload: year });
    }
  });

  return { store, dispatched, router, ...rendered };
}

// The program year, with the real Baseline window on it. tests-screen's own
// TEST_DATES fixture predates starts_on and ends_on and deliberately still
// has neither, which is what makes it the fixture for the deploy-window
// example below rather than for these.
function yearFixture(overrides: Partial<ProgramYearDetail> = {}): ProgramYearDetail {
  // Copy tests-screen.test.tsx's own yearFixture and give its test_dates
  // the dates, so this file asserts against a window that can be placed:
  //   { id: 1, window: "2026-09", label: "Baseline", display: "Sep 15–17",
  //     starts_on: "2026-09-15", ends_on: "2026-09-17", position: 1 }
  // ...
}

function yearWithUndatedWindows(): ProgramYearDetail {
  const year = yearFixture();
  return {
    ...year,
    test_dates: year.test_dates.map(({ starts_on, ends_on, ...rest }) => rest),
  };
}

// A week whose seven cards cover 14 to 20 September but whose Thursday has
// been removed, so "today" falls inside the loaded week and still has no
// card. That is the shape the real gap takes: a week that loaded fine and
// does not hold today.
function weekWithoutToday(): WeekPayload {
  return { ...WEEK, days: WEEK.days.filter((d) => d.date !== "2026-09-17") };
}

// The clock. Every example here fixes it, because "today" is the whole
// subject and a suite that asked the real one would pass in September and
// fail in October.
const THURSDAY = new Date("2026-09-17T10:00:00");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(THURSDAY);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Today", () => {
  describe("the card", () => {
    it("shows today's card and no other day", async () => {
      renderToday({ role: "coach" });
      expect(await screen.findByText("Wall Day")).toBeInTheDocument();
      // Wednesday's card is in the same week payload and must not be here.
      expect(screen.queryByText("Fast Day")).toBeNull();
    });

    it("shows the day's role, minutes and dad note", async () => {
      renderToday({ role: "coach" });
      expect(await screen.findByText(/100 to 120 min/)).toBeInTheDocument();
      expect(screen.getByText(/Watch his contact point/)).toBeInTheDocument();
    });

    it("opens a tapped drill in the glossary", async () => {
      // The same assertion this-week.test.tsx already makes about its own
      // tokens: the screen hands the slug to a callback and the callback is
      // the only thing that knows a slug becomes a URL.
      const { router } = renderToday({ role: "coach" });
      await userEvent.click(await screen.findByRole("button", { name: "bear walk" }));

      expect(router.state.location.pathname).toBe("/glossary/bear-walk");
    });
  });

  // The five cases the spec names. Each says which one it is rather than
  // showing nothing, which is what the Notes drill list already does.
  describe("when there is no card", () => {
    it("says so when this week has no card for today", async () => {
      renderToday({ role: "coach", week: weekWithoutToday() });
      expect(await screen.findByText(/no card has been written for today yet/i))
        .toBeInTheDocument();
    });

    it("offers a way to the rest of the week", async () => {
      renderToday({ role: "coach", week: weekWithoutToday() });
      expect(await screen.findByRole("link", { name: /this week/i }))
        .toHaveAttribute("href", "/week");
    });

    // The difference that matters most on this screen. "No card for today"
    // while one is still on its way is a guess dressed as a fact, and he
    // would believe it and go and write the session up somewhere else.
    it("waits rather than says no card while the week is loading", async () => {
      renderToday({ role: "coach", week: null, loading: true });

      expect(await screen.findByText(/waking up the server/i)).toBeInTheDocument();
      expect(screen.queryByText(/no card has been written/i)).toBeNull();
    });

    it("shows the error when the week could not be reached", async () => {
      renderToday({ role: "coach", week: null, error: "That could not be reached." });

      expect(await screen.findByText("That could not be reached.")).toBeInTheDocument();
      expect(screen.queryByText(/no card has been written/i)).toBeNull();
    });

    it("waits while the program year id is still unknown", async () => {
      renderToday({ role: "coach", currentProgramYearId: null });

      expect(await screen.findByText(/finding today/i)).toBeInTheDocument();
      expect(screen.queryByText(/no card has been written/i)).toBeNull();
    });
  });

  describe("who sees what", () => {
    it("gives the coach his note and not Teddy's", async () => {
      renderToday({ role: "coach" });
      expect(await screen.findByLabelText("What did you see?")).toBeInTheDocument();
      expect(screen.queryByLabelText(/best/i)).toBeNull();
    });

    it("gives the athlete his journal and not the coach's", async () => {
      renderToday({ role: "athlete" });
      expect(await screen.findByLabelText(/best/i)).toBeInTheDocument();
      expect(screen.queryByLabelText("What did you see?")).toBeNull();
    });

    it("gives the viewer the card and nothing to write", async () => {
      renderToday({ role: "viewer" });
      expect(await screen.findByText("Wall Day")).toBeInTheDocument();
      expect(screen.queryByLabelText("What did you see?")).toBeNull();
      expect(screen.queryByLabelText(/best/i)).toBeNull();
      expect(screen.queryByLabelText(/20m sprint/i)).toBeNull();
    });

    // A viewer who fired these would get 403s she can do nothing about.
    it("never asks for a viewer's entries or results", async () => {
      const { dispatched } = renderToday({ role: "viewer" });
      const asked = dispatched.map((a) => a.type);
      expect(asked).not.toContain(journalActions.fetchCoachEntries().type);
      expect(asked).not.toContain(journalActions.fetchAthleteEntries().type);
      expect(asked.some((t) => t.includes("testResults"))).toBe(false);
    });
  });

  describe("the test sheet", () => {
    // 15 to 17 September is the Baseline window, so the 16th is inside it
    // and the 18th is not.
    it("shows the sheet on a test day, and says which day of it", async () => {
      vi.setSystemTime(new Date("2026-09-16T10:00:00"));
      renderToday({ role: "coach" });
      expect(await screen.findByText(/Baseline/)).toBeInTheDocument();
      expect(screen.getByText(/day 2 of 3/i)).toBeInTheDocument();
    });

    it("shows no sheet the day after the window closes", async () => {
      vi.setSystemTime(new Date("2026-09-18T10:00:00"));
      renderToday({ role: "coach" });
      await screen.findByText("Wall Day");
      expect(screen.queryByText(/Baseline/)).toBeNull();
    });

    // The deploy window: Vercel is ahead of Fly and the payload omits the
    // dates. No section beats a wrong one, and beats a crash by more.
    it("shows no sheet when the server has not sent the window's dates", async () => {
      vi.setSystemTime(new Date("2026-09-16T10:00:00"));
      renderToday({ role: "coach", programYear: yearWithUndatedWindows() });
      await screen.findByText("Wall Day");
      expect(screen.queryByText(/still blank/i)).toBeNull();
    });

    it("keeps the sheet away from a viewer on a test day", async () => {
      vi.setSystemTime(new Date("2026-09-16T10:00:00"));
      renderToday({ role: "viewer" });
      await screen.findByText("Wall Day");
      expect(screen.queryByText(/still blank/i)).toBeNull();
    });
  });
});
```

And add to `web/__tests__/shell.test.tsx`:

```tsx
  it("lands every role on Today", async () => {
    for (const role of ["coach", "athlete", "viewer"] as const) {
      // render signed in as `role` at "/", assert the Today screen is what
      // shows, using whatever this file's existing helper does for /year
    }
  });

  it("puts Today first in the nav", async () => {
    renderShell({ role: "coach" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Today");
  });

  it("keeps every tab that was there before", async () => {
    renderShell({ role: "coach" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav).getAllByRole("link").map((l) => l.textContent);
    expect(labels).toEqual([
      "Today", "Year", "Month", "This Week", "Glossary",
      "Progress", "Tests", "Journal", "Notes",
    ]);
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd web && npx vitest run __tests__/today.test.tsx __tests__/shell.test.tsx`
Expected: FAIL, cannot resolve `../src/screens/Today`, and the shell
examples find "Year" first.

- [ ] **Step 3: Write the screen**

Create `web/src/screens/Today.tsx`:

```tsx
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  authSelectors,
  drills,
  journalActions,
  programYear,
  selectDayByDate,
  selectWeek,
  testResultsActions,
  testResultsSelectors,
  useAppDispatch,
  useAppSelector,
  week,
} from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { TodayCard } from "../components/TodayCard";
import { CoachNoteForm } from "../components/CoachNoteForm";
import { AthleteNoteForm } from "../components/AthleteNoteForm";
import { TestSheet } from "../components/TestSheet";
import { todayISODate, byPosition, dowLabel } from "../lib/scheduling";

const WAKING_LABEL = "Waking up the server. Today can take a few seconds to load.";
const FINDING_YEAR_LABEL = "Waking up the server. Finding today can take a few seconds too.";

// Said when the week loaded fine and holds no card for today. That covers
// more than a missing card: weeks/current falls back to the year's first
// week when none contains today, so a date before the year starts, after it
// ends, or inside a month whose cards are not written yet all arrive here
// looking the same. One honest sentence is right in all of them.
const NO_CARD_LABEL = "No card has been written for today yet.";

export function Today() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);
  const role = useAppSelector(authSelectors.selectRole);
  const isCoach = role === "coach";
  const isAthlete = role === "athlete";
  // Who the API will answer a test_results write for. routes.tsx's own table
  // is the source of this: create is coach or athlete, never a viewer.
  const canRecord = isCoach || isAthlete;

  const today = todayISODate();
  const dayCard = useAppSelector(selectDayByDate(today));
  const weekData = useAppSelector(selectWeek);
  const weekLoading = useAppSelector(week.selectors.selectIsLoading);
  const weekError = useAppSelector(week.selectors.selectError);

  const yearData = useAppSelector(programYear.selectors.selectData);

  // Fires once currentId resolves from null to a real id, and again only if
  // it or the role ever changes. A screen that asked again on every render
  // would hammer a server that takes seven seconds to wake.
  //
  // Each fetch is gated on who is signed in, not only each section's
  // rendering. A viewer who asked for coach entries would get a 403 she can
  // do nothing about, and an error in the store she never asked for.
  useEffect(() => {
    if (currentId === null) return;
    dispatch(week.actions.fetch(currentId));
    if (isCoach) {
      dispatch(journalActions.fetchCoachEntries());
      dispatch(drills.actions.fetch());
    }
    if (isAthlete) dispatch(journalActions.fetchAthleteEntries());
    if (canRecord) {
      dispatch(programYear.actions.fetch(currentId));
      dispatch(testResultsActions.fetchResults(currentId));
    }
  }, [dispatch, currentId, isCoach, isAthlete, canRecord]);

  function openDrill(slug: string) {
    navigate(`/glossary/${slug}`);
  }

  if (currentId === null) {
    return (
      <div className="today">
        <WaitingForYearId label={FINDING_YEAR_LABEL} />
      </div>
    );
  }

  const testDay = yearData
    ? testResultsSelectors.selectTestDayFor(yearData.test_dates, today)
    : null;

  return (
    <div className="today">
      <h1>Today</h1>
      <p className="today__date">
        {dayCard ? `${dowLabel(dayCard.dow)} ` : ""}
        {today}
        {weekData ? ` · ${weekData.theme}` : ""}
      </p>

      {weekError && <ErrorNote message={weekError} />}
      {weekLoading && !dayCard && <Loading label={WAKING_LABEL} />}

      {dayCard ? (
        <TodayCard key={dayCard.id} day={dayCard} onSelectDrill={openDrill} />
      ) : (
        // Only once the week has actually answered. Saying "no card" while
        // one is still on its way would be a guess dressed as a fact.
        !weekLoading &&
        (weekData || weekError) && (
          <p className="today__no-card">
            {NO_CARD_LABEL} <Link to="/week">This Week</Link>
          </p>
        )
      )}

      {isCoach && <CoachNoteForm programYearId={currentId} date={today} />}
      {isAthlete && <AthleteNoteForm programYearId={currentId} date={today} />}

      {canRecord && testDay && yearData && (
        <section className="today__tests">
          <h2>
            {testDay.testDate.label} test &middot; day {testDay.dayNumber} of{" "}
            {testDay.dayCount}
          </h2>
          <TestSheet
            programYearId={currentId}
            window={testDay.testDate.window}
            measures={byPosition(yearData.battery.measures)}
          />
        </section>
      )}
    </div>
  );
}
```

The date line should read as prose, not as an ISO string. Format it with
`toLocaleDateString` on the parts (never `new Date(iso)`, for the timezone
reason `utcDays` documents in Task 4), or render `dayCard.date` through a
small helper in `web/src/lib/scheduling.ts` beside `todayISODate`. Write
the helper with its own test if you add one.

- [ ] **Step 4: Add the route and make it home**

Modify `web/src/routes.tsx`:

```tsx
import { Today } from "./screens/Today";

// Where a person lands: signing in, hitting "/", and being turned away from
// a route their role may not read. It was /year until Today existed. Both
// are "any" routes, so this is the same guarantee pointed at the screen
// somebody actually opens mid-session.
const HOME = "/today";

export const NAV_ITEMS: NavItem[] = [
  { to: "/today", label: "Today", roles: "any", element: <Today /> },
  { to: "/year", label: "Year", roles: "any", element: <Year /> },
  // ... the rest unchanged
];
```

and replace both `<Navigate to="/year" replace />` occurrences (in
`Guarded` and in the `/` and `*` routes) with `<Navigate to={HOME} replace />`.

- [ ] **Step 5: Run the two suites to verify they pass**

Run: `cd web && npx vitest run __tests__/today.test.tsx __tests__/shell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the whole web suite and typecheck**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: PASS, clean. Any suite that asserted `/year` is the landing route
needs updating to `/today`; that is the change, not a break.

- [ ] **Step 7: Check the bundle still gives nothing away**

Run: `cd web && npx vitest run __tests__/bundle-privacy.test.ts`
Expected: PASS. Every string Today adds is about the app. If this fails,
a program word reached a literal and it must come from the API instead.

- [ ] **Step 8: Commit**

```bash
git add web/src/screens/Today.tsx web/src/routes.tsx \
        web/__tests__/today.test.tsx web/__tests__/shell.test.tsx
git commit -m "Today: the screen he opens on the court, and the app's home

Today's card as an accordion, his note under it saving as he writes, and the
test sheet when today falls inside a window. Each of the three accounts sees
what the API will answer for it, and a viewer fires no fetch that would 403.

Signing in lands here. Every tab that was there is still there."
```

---

### Task 11: styles

**Files:**
- Modify: `web/src/styles.css`
- Modify: `web/__tests__/styling.test.tsx`

**Interfaces:**
- Consumes: the class names Tasks 5 to 10 introduced: `today`,
  `today__date`, `today__no-card`, `today__tests`, `today-card`,
  `today-card__role`, `today-card__summary`, `today-card__dad-note`,
  `today-card__blocks`, `today-card__block-toggle`,
  `today-card__block-name`, `today-card__block-minutes`,
  `today-card__block-body`, `tests__blank-count`.
- Produces: nothing other files consume.

- [ ] **Step 1: Read what is already there**

Run: `cd web && sed -n '500,560p' src/styles.css` for `.day-card` and
`.day-card--today`, and `sed -n '1415,1456p'` for the existing
`@media (max-width: 26rem)` and `prefers-reduced-motion` blocks. Match the
file's conventions: its custom properties, its spacing scale, its BEM-ish
naming. Do not introduce a new system.

- [ ] **Step 2: Write the failing test**

Add to `web/__tests__/styling.test.tsx`, using the `declared(selector,
property)` and `pixels(value)` helpers already in that file. `pixels`
resolves `var(--tap)`, which `:root` declares as `44px`, so a rule can spell
the token rather than the number and this still reads it.

```tsx
describe("a block toggle on Today", () => {
  // He taps this one-handed, between drills, with a ball in the other hand.
  // The 44px floor is the same one every other target in this file is held
  // to, and a block toggle is the most-tapped control on the screen he now
  // opens on.
  it("is at least as tall as a finger", () => {
    expect(pixels(declared(".today-card__block-toggle", "min-height")))
      .toBeGreaterThanOrEqual(44);
  });

  // The whole row, not the six characters of the block's name. A toggle that
  // only takes taps on its text is a 44px rule that buys nothing.
  it("takes taps across the whole row", () => {
    expect(declared(".today-card__block-toggle", "width")).toBe("100%");
  });

  // Which block is open is said by aria-expanded in the markup, which
  // today-card.test.tsx asserts. This is the visual half: the open one has
  // to be tellable from the seven closed ones by something other than the
  // panel below it, or a glance mid-session lands on the wrong row.
  it("marks the open block with something other than colour", () => {
    const open = declared(".today-card__block-toggle[aria-expanded='true']", "font-weight");
    expect(open).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd web && npx vitest run __tests__/styling.test.tsx`
Expected: FAIL, no rule for `.today-card__block-toggle`.

- [ ] **Step 4: Write the styles**

Add to `web/src/styles.css`. Substitute this file's own custom properties
for the ones named below wherever it already has an equivalent; read the
`:root` block first and use what is there rather than adding a parallel set.

```css
/* Today. The screen he opens standing up, one-handed, mid-session, so the
   whole of it is built around a thumb: full-width rows, a 44px floor on
   anything tappable, and nothing that needs two hands or a careful aim. */
.today__date {
  color: var(--muted);
  margin-block: 0 var(--space-3);
}

.today__no-card {
  color: var(--muted);
}

.today-card__role {
  font-weight: 600;
}

.today-card__dad-note {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-2);
}

.today-card__blocks {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* The whole row is the target. A toggle sized to its text would make the
   44px floor below buy nothing, because the miss would land beside it. */
.today-card__block-toggle {
  width: 100%;
  min-height: var(--tap);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  text-align: left;
  background: none;
  border: 0;
  border-top: 1px solid var(--rule);
  padding: var(--space-2) 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

/* Which one is open, said by weight as well as by the panel below it, so a
   glance lands on the right row. today-card.test.tsx asserts the
   aria-expanded half of the same question. */
.today-card__block-toggle[aria-expanded="true"] {
  font-weight: 700;
}

.today-card__block-minutes {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.today-card__block-body {
  padding: 0 0 var(--space-3) var(--space-2);
}

/* A different job from the note above it, so it gets space and a rule
   rather than running on from it. */
.today__tests {
  margin-top: var(--space-5);
  border-top: 2px solid var(--rule);
  padding-top: var(--space-3);
}

/* A count, not a warning. */
.tests__blank-count {
  color: var(--muted);
}
```

The file already styles focus on buttons. Check that
`.today-card__block-toggle` is covered by whatever selector does that
(`button:focus-visible` or similar) and extend that rule rather than writing
a second focus style here.

Check the existing `@media (max-width: 26rem)` block at line 1421 and add
anything Today needs inside it rather than starting a new breakpoint.

- [ ] **Step 5: Run the styling suite to verify it passes**

Run: `cd web && npx vitest run __tests__/styling.test.tsx`
Expected: PASS.

- [ ] **Step 6: Look at it**

```bash
cd web && npm run dev
```

Open the site at a phone width (375px in the browser's device toolbar) and
sign in as Jeff. Check, in order:
1. Today is the landing screen and the first tab.
2. The card lists its blocks, Wake Up open, and tapping another closes it.
3. Nothing scrolls sideways. The Year tab has a known 20px overflow
   (`docs/status.md`); Today must not add its own.
4. Typing in the note and tapping away shows "Saved" with a time.
5. Set the system clock to 16 September, reload, and the Baseline sheet
   appears saying day 2 of 3.

- [ ] **Step 7: Commit**

```bash
git add web/src/styles.css web/__tests__/styling.test.tsx
git commit -m "Style Today for a thumb

Full-width block toggles at a 44px minimum, because the whole row is the
tap target and he is one-handed between drills."
```

---

### Task 12: the docs this repo is

`CLAUDE.md`: append to `decisions.md` with the date, update `context.md` if
the facts changed, `architecture.md` if the program changed, `status.md` at
the end of every session, and add a file to `docs/history/`.

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/architecture.md`
- Modify: `docs/context.md`
- Modify: `docs/status.md`
- Create: `docs/history/2026-09-14-today-view.md`

- [ ] **Step 1: Append the rulings to `docs/decisions.md`**

Read the file's existing format first and match it exactly (its dating, its
numbering, its voice). Six rulings, each with the reason:

1. **Today is the app's home.** `/today` is first in the nav and where
   sign-in, `/` and a refused route all land. Year was the home because it
   was the first screen built, not because it is the one anybody opens
   mid-session.
2. **`test_dates` carries `starts_on` and `ends_on`.** The range existed
   only inside `display`, so nothing could answer whether a test was due
   today without parsing prose.
3. **`display` is generated from those dates.** It was hand-written beside
   them, which is one fact written twice with nothing checking they agreed.
4. **Both journals autosave; Save stays as the retry.** A session written up
   on a phone that locks was a session lost. Save force-sends whether or not
   anything changed, which is the one thing autosave cannot do: a write the
   outbox gave up on does not go again until a field is touched.
5. **An entry row now comes into being on the first tap, not on Save.**
   Scoring energy and walking away leaves a real row, and the delete control
   appears with it. That is the trade for not losing a session.
6. **Delete is not on Today.** It stays on the tab screens. Today is tapped
   one-handed between drills and an irreversible act does not belong there.

- [ ] **Step 2: Update `docs/architecture.md`**

In "How the program reaches Teddy", add a sentence naming Today as the
screen the app opens on and what it holds. In the test battery section,
note that each window now carries its dates and that the display string is
generated from them.

- [ ] **Step 3: Update `docs/context.md`**

In "How the program is run", the tab list currently reads "tabs for The
Year, the current month, This Week and the Glossary". Add Today, first, and
say the app opens on it. Adjust the sentence about test results being typed
into the sheet on This Week to say they can also be typed on Today during a
test window.

- [ ] **Step 4: Write `docs/history/2026-09-14-today-view.md`**

What was asked and what was answered, in this repo's history format. Read
`docs/history/2026-09-14-notes-challenge.md` for the shape. Cover:
- Jeff asked for a quick view for his phone while out with Teddy: the day's
  activities, the journal for that day so progress is not lost, and the test
  results when a test is due.
- The five decisions he made: Today as home over a plain tab; inline
  autosaving over a link out; adding real dates to `test_dates` over
  showing the sheet all month; an accordion over tick-off boxes or a full
  expansion; all three roles over coach-only.
- The one he corrected: Save was offered as a no-op and he said it would
  still work. He was right, and it became the retry.
- Two things the code said that the design had assumed wrongly:
  `AthleteJournal` was already today-only with no date picker, and the
  comment at its old lines 309-313 claiming core drops felt, best and hard
  was stale. Core sends all seven fields.
- The deploy note: merging rebuilds Vercel and does not deploy Fly, so the
  test section stays hidden until someone runs `fly deploy`.

- [ ] **Step 5: Update `docs/status.md`**

Add Today to "Built". Add to "Next", at the top, the deploy this needs:

```markdown
- **Today needs an API deploy before the test sheet appears on it.** The
  test windows' `starts_on` and `ends_on` reach production only when the
  seeder runs, and the seeder runs on a deploy:

  ```bash
  cd backend && fly deploy -a teddy-pe-api
  ```

  Run it from a checkout of `main` after merging. Until then Today shows the
  card and the note and no test section, which is what it is built to do
  when the server has not sent the dates.
```

- [ ] **Step 6: Run everything one last time**

```bash
cd backend && bundle exec rspec
cd ../core && npm test && npm run typecheck
cd ../web && npm test && npx tsc --noEmit
```

Expected: PASS everywhere, clean typechecks. Record the three example counts
in `docs/status.md` the way it records them today.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "Write Today into the repo's memory

Six rulings in decisions.md, Today in the architecture and the context, the
account in history, and the deploy this needs in status: merging rebuilds
Vercel and does not deploy Fly, so the test section stays hidden until
somebody runs fly deploy."
```

---

## Verification

Before opening the PR:

- [ ] `cd backend && bundle exec rspec` passes.
- [ ] `cd core && npm test && npm run typecheck` passes clean.
- [ ] `cd web && npm test && npx tsc --noEmit` passes clean.
- [ ] `cd web && npx vitest run __tests__/bundle-privacy.test.ts` passes.
- [ ] `cd backend && bin/rails content:seed` runs and reports 5 test dates.
- [ ] `cd backend && bin/rails docs:export` runs without error, and the
      diff it produces to `docs/results/2026-27.md` is empty or explainable.
      The exporter reads `display`, which is now generated, so this is the
      check that the generated strings match what was authored.
- [ ] The manual pass in Task 11 Step 6 has been done at 375px.

Then open the PR against `main` and leave it for Jeff.
