require "rails_helper"

RSpec.describe Legacy::Verifier, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }
  let!(:date) { create(:test_date, program_year: year, window: "2026-09", label: "Baseline") }
  let!(:measure) { create(:battery_measure, program_year: year, test_id: "t1") }

  def insert_diary(session_date:, note:, overall: 4)
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", [ session_date, note, overall ])
      insert into diary_entry (id, session_date, note, overall)
      values ('e-' || $1::text, $1::date, $2, $3)
    SQL
  end

  def insert_result(value:, test_window: "2026-09", test_id: "t1")
    ActiveRecord::Base.connection.exec_query(<<~SQL, "result", [ test_window, test_id, value ])
      insert into test_result (id, test_window, test_id, value)
      values ($1 || ':' || $2, $1, $2, $3)
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
    expect(report[:missing]).to eq([ { kind: :diary, key: "2026-09-16" } ])
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

  # R12: a legacy result with a blank value, or one whose window two program
  # years share, is not a loss. Legacy::ResultMigrator correctly skips both,
  # on purpose, so a verifier that does not know about them would report a
  # correct migration as broken and block the cutover it is supposed to gate.
  it "does not call a result missing when its value was cleared" do
    insert_result(value: "   ")

    report = described_class.new.run

    expect(report[:missing]).to eq([])
    expect(report[:counts][:legacy_results]).to eq(0)
  end

  it "does not call a result missing when its window belongs to more than one program year" do
    other_year = create(:program_year, starts_on: "2020-01-01", ends_on: "2020-12-31")
    create(:test_date, program_year: other_year, window: "2026-09", label: "Baseline")
    insert_result(value: "4.6")

    report = described_class.new.run

    expect(report[:missing]).to eq([])
    expect(report[:counts][:legacy_results]).to eq(0)
  end

  # This is the one that proves the migrators and the verifier have not
  # drifted apart. Each decides "which rows are in scope" on its own, in its
  # own code, and nothing else notices when the two disagree. One fixture
  # carries every category at once: a diary entry and a result that each
  # migrate cleanly, a diary entry dated outside any program year, a result
  # with a blank value, a result whose test id has no measure, and a result
  # whose window no test date carries. A clean report here is the only
  # evidence that scope agrees on both sides.
  it "reads clean across every category of skip at once, diary and results together" do
    # A blank value only tests category (d) if the row otherwise has
    # somewhere to go, so this needs its own measure rather than reusing t1
    # (which the clean result below already occupies) or a missing one
    # (which would really be testing category (c) instead).
    create(:battery_measure, program_year: year, test_id: "t1-blank")

    insert_diary(session_date: "2026-09-16", note: "Good session.")
    insert_diary(session_date: "2020-01-01", note: "before the program")
    insert_result(value: "4.6", test_window: "2026-09", test_id: "t1")
    insert_result(value: "   ", test_window: "2026-09", test_id: "t1-blank")
    insert_result(value: "9.9", test_window: "2026-09", test_id: "no-such-measure")
    insert_result(value: "5.5", test_window: "2099-01", test_id: "t1")

    Legacy::JournalMigrator.new(coach: coach).run!
    Legacy::ResultMigrator.new(coach: coach).run!

    report = described_class.new.run

    expect(report[:clean?]).to be(true)
    expect(report[:missing]).to eq([])
    expect(report[:mismatches]).to eq([])
  end
end
