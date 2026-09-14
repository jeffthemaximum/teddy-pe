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
