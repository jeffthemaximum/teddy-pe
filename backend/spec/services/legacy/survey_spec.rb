require "rails_helper"

RSpec.describe Legacy::Survey, :legacy do
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }

  def insert_diary(date:, ratings: {}, note: "went well")
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", [ date, note, ratings.to_json ])
      insert into diary_entry (id, session_date, note, ratings)
      values ('e-' || $1::text, $1::date, $2, $3::jsonb)
    SQL
  end

  def insert_result(window:, test_id:, value:)
    ActiveRecord::Base.connection.exec_query(<<~SQL, "result", [ window, test_id, value ])
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

    expect(report[:unmapped_drill_slugs]).to eq([ "gone-drill" ])
  end

  it "names a test id and a window with nothing to map onto" do
    year
    create(:battery_measure, program_year: year, test_id: "t1")
    create(:test_date, program_year: year, window: "2026-09")
    insert_result(window: "2026-09", test_id: "t99", value: "4.5")
    insert_result(window: "2099-01", test_id: "t1", value: "4.5")

    report = described_class.new.run

    expect(report[:unmapped_test_ids]).to eq([ "t99" ])
    expect(report[:unmapped_windows]).to eq([ "2099-01" ])
  end

  # R9 removed TestDate.find_by(window:) from the migrator and the verifier,
  # because the unique index on test_dates is (program_year_id, window) and a
  # global find_by would file a result under whichever program year happened
  # to come first. The survey is what a person reads before typing
  # CONFIRM=yes, so it has to name the same row the migrator will refuse to
  # write rather than quietly counting it as mappable.
  it "names a window more than one program year carries, instead of guessing" do
    year
    create(:battery_measure, program_year: year, test_id: "t1")
    create(:test_date, program_year: year, window: "2026-09")
    other_year = create(:program_year, starts_on: "2020-01-01", ends_on: "2020-12-31")
    create(:test_date, program_year: other_year, window: "2026-09")
    insert_result(window: "2026-09", test_id: "t1", value: "4.5")

    report = described_class.new.run

    expect(report[:ambiguous_windows]).to eq([ "2026-09" ])
    expect(report[:unmapped_windows]).to eq([])
    expect(report[:unmapped_test_ids]).to eq([])
  end

  # The migrator asks the test date's own program year for the measure. A
  # survey that asked every program year at once would report this row as
  # mappable and then the migrator would skip it, which is the survey
  # under-reporting the thing it exists to report.
  it "counts a test id as unmapped when the measure belongs to another program year" do
    year
    create(:test_date, program_year: year, window: "2026-09")
    other_year = create(:program_year, starts_on: "2020-01-01", ends_on: "2020-12-31")
    create(:battery_measure, program_year: other_year, test_id: "t1")
    insert_result(window: "2026-09", test_id: "t1", value: "4.5")

    report = described_class.new.run

    expect(report[:unmapped_test_ids]).to eq([ "t1" ])
  end

  it "names a session date that falls in no program year" do
    year
    insert_diary(date: "2020-01-01")

    report = described_class.new.run

    expect(report[:dates_outside_any_year]).to eq([ Date.new(2020, 1, 1) ])
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
      { window: "2026-09", test_id: "t1", legacy_value: "4.5", current_value: "10" }
    ])
  end

  # The state the missing-table check cannot catch: LEGACY_DATABASE_URL
  # pointing at a database that has both tables and is not the live one. A
  # Neon branch, a restored snapshot, a staging copy. Neon's branching makes
  # that a plausible typo rather than a thought experiment, and a near-empty
  # branch gives zero comparable rows, no missing tables, and a clean read
  # over rows nothing ever looked at.
  #
  # There is no gate that can tell those apart, so the answer is to say which
  # database the numbers describe and let the person reading decide. The host
  # and the database name, never the password: this output goes to a terminal
  # and from there into a paste.
  #
  # The config here is built in the example rather than read back from the
  # same call the code makes, so this cannot pass by agreeing with itself.
  it "says which database it read, and never prints the password" do
    config = ActiveRecord::DatabaseConfigurations::HashConfig.new(
      "test", "legacy",
      { adapter: "postgresql", host: "ep-snapshot-42.us-east-2.aws.neon.tech", port: 5432,
        database: "teddy_restored_snapshot", username: "neon_owner",
        password: "s3cret-do-not-print" }
    )
    allow(Legacy::Record).to receive(:connection_db_config).and_return(config)

    report = described_class.new.run

    expect(report[:source]).to include("teddy_restored_snapshot")
    expect(report[:source]).to include("ep-snapshot-42.us-east-2.aws.neon.tech")
    expect(report[:source]).not_to include("s3cret-do-not-print")
    expect(report[:source]).not_to include("password")
  end

  # The realistic path this guards: the old rows live in the Vercel Neon
  # database rather than the Rails one, LEGACY_DATABASE_URL is unset or set
  # on the wrong Fly app, and every task reports zeros that look exactly like
  # "there was nothing to migrate". A later task then deletes the only copy.
  #
  # Dropping the table inside the example is safe for the examples that
  # follow: every example runs inside a DatabaseCleaner transaction and
  # Postgres rolls DDL back with everything else, so the table is there again
  # before the next one starts. Confirmed by running a probe pair of examples
  # before writing this.
  it "names a legacy table that is not on this connection instead of counting zero rows" do
    year
    ActiveRecord::Base.connection.drop_table("diary_entry")

    report = described_class.new.run

    expect(report[:tables_missing]).to eq([ "diary_entry" ])
    expect(report[:diary_count]).to eq(0)
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
