require "rails_helper"

RSpec.describe Legacy::ResultMigrator, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }
  let!(:date) { create(:test_date, program_year: year, window: "2026-09", label: "Baseline") }
  let!(:measure) { create(:battery_measure, program_year: year, test_id: "t1", unit: "s", direction: "lower") }

  def insert_result(window:, test_id:, value:, recorded_at: "2026-09-15 14:00:00+00")
    ActiveRecord::Base.connection.exec_query(<<~SQL, "result", [ window, test_id, value, recorded_at ])
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
      { window: "2026-09", test_id: "t1", legacy_value: "9.9", current_value: "4.4" }
    ])
  end

  it "skips a test id with no measure and says so" do
    insert_result(window: "2026-09", test_id: "t99", value: "4.6")

    report = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(0)
    expect(report[:skipped]).to eq([
      { window: "2026-09", test_id: "t99", reason: "no battery measure with this test id" }
    ])
  end

  it "skips a window with no test date and says so" do
    insert_result(window: "2099-01", test_id: "t1", value: "4.6")

    report = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(0)
    expect(report[:skipped]).to eq([
      { window: "2099-01", test_id: "t1", reason: "no test date with this window" }
    ])
  end

  # R9: the unique index on test_dates is (program_year_id, window), so two
  # program years are allowed to carry the same window string. A global
  # find_by would silently pick whichever came first and file the result
  # under the wrong program year, which is not a risk this migration can
  # take with numbers nobody can measure again.
  it "skips a window that more than one program year has and says so, instead of guessing" do
    other_year = create(:program_year, starts_on: "2020-01-01", ends_on: "2020-12-31")
    create(:test_date, program_year: other_year, window: "2026-09", label: "Baseline")
    insert_result(window: "2026-09", test_id: "t1", value: "4.6")

    report = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(0)
    expect(report[:skipped]).to eq([
      { window: "2026-09", test_id: "t1", reason: "more than one program year has this window" }
    ])
  end

  # api/results.js deleted the row when someone cleared a value, so a blank
  # value in the old table means no measurement was recorded, not a data
  # problem. It must not land in :failed, which is the block that tells
  # Jeff the migration is not yet safe to follow with a deletion: a routine
  # cleared value diluting that signal is the failure mode being guarded
  # against here. The legacy value column is not null, so a whitespace
  # string, not NULL, is the realistic shape of a cleared value.
  it "skips a cleared value and says so, instead of failing it" do
    insert_result(window: "2026-09", test_id: "t1", value: "   ")

    report = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(0)
    expect(report[:skipped]).to eq([
      { window: "2026-09", test_id: "t1", reason: "the value was cleared, so there is nothing to migrate" }
    ])
    expect(report[:failed]).to eq([])
  end

  # A second run used to call every row it had already migrated a conflict,
  # without ever comparing the two values, so the output was a wall of
  # "left alone, old 4.4, current 4.4" with any real disagreement buried in
  # it. A conflict is a thing a person has to decide about, and a row that
  # agrees with itself is not one.
  it "can be run twice without making a second copy, and calls none of it a conflict" do
    insert_result(window: "2026-09", test_id: "t1", value: "4.6")

    described_class.new(coach: coach).run!
    second = described_class.new(coach: coach).run!

    expect(TestResult.count).to eq(1)
    expect(second[:migrated]).to eq(0)
    expect(second[:already_migrated]).to eq(1)
    expect(second[:conflicts]).to eq([])
  end

  # The legacy column is text and the migrator writes row.value.to_s.strip,
  # so a value with whitespace around it has already agreed once it is
  # stripped. Comparing the raw column would call this a conflict.
  it "counts a result that already holds the same value as already migrated" do
    TestResult.create!(program_year: year, athlete: year.athlete, test_date: date,
                       battery_measure: measure, recorded_by_user: coach,
                       raw_value: "4.6", recorded_at: Time.utc(2026, 9, 16))
    insert_result(window: "2026-09", test_id: "t1", value: "  4.6 ")

    report = described_class.new(coach: coach).run!

    expect(report[:already_migrated]).to eq(1)
    expect(report[:conflicts]).to eq([])
  end

  # Same guard as the journal migrator's. Reporting zeros for a table that
  # is not on this connection is indistinguishable from reporting zeros for
  # an empty table, and only one of those is safe to follow with a deletion.
  it "reports a missing legacy table rather than an empty run" do
    ActiveRecord::Base.connection.drop_table("test_result")

    report = described_class.new(coach: coach).run!

    expect(report[:tables_missing]).to eq([ "test_result" ])
    expect(report[:migrated]).to eq(0)
  end

  it "leaves the legacy rows exactly as it found them" do
    insert_result(window: "2026-09", test_id: "t1", value: "4.6")
    before = ActiveRecord::Base.connection.select_all("select * from test_result").to_a

    described_class.new(coach: coach).run!

    after = ActiveRecord::Base.connection.select_all("select * from test_result").to_a
    expect(after).to eq(before)
  end

  # R10: TestResult validates raw_value presence and has_a_digit_in_it, so a
  # legacy row whose value carries no digit raises RecordInvalid out of
  # create!. One bad row must not cost every row after it. The bad row sorts
  # first ((test_window, test_id) order) so this proves the loop continued,
  # not only that the exception was caught.
  it "reports a row TestResult rejects instead of losing every row after it" do
    insert_result(window: "2026-09", test_id: "t1", value: "no digits here")
    other_measure = create(:battery_measure, program_year: year, test_id: "t2", unit: "s", direction: "lower")
    insert_result(window: "2026-09", test_id: "t2", value: "4.6")

    report = described_class.new(coach: coach).run!

    failed = report[:failed]
    expect(failed.size).to eq(1)
    expect(failed.first[:window]).to eq("2026-09")
    expect(failed.first[:test_id]).to eq("t1")
    expect(failed.first[:error]).to be_a(String).and be_present

    good_result = TestResult.find_by(battery_measure: other_measure)
    expect(good_result).to be_present
    expect(good_result.raw_value).to eq("4.6")
  end
end
