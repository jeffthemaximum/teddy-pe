require "rails_helper"

RSpec.describe Legacy::Verifier, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }
  let!(:date) { create(:test_date, program_year: year, window: "2026-09", label: "Baseline") }
  let!(:measure) { create(:battery_measure, program_year: year, test_id: "t1") }

  def insert_diary(session_date:, note:, overall: 4, ratings: {})
    binds = [ session_date, note, overall, ratings.to_json ]
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", binds)
      insert into diary_entry (id, session_date, note, overall, ratings)
      values ('e-' || $1::text, $1::date, $2, $3, $4::jsonb)
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

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(true)
    expect(report[:counts]).to eq(legacy_diary: 1, migrated_diary: 1,
                                  legacy_results: 1, migrated_results: 1)
    expect(report[:missing]).to eq([])
  end

  it "names a legacy entry that never arrived" do
    insert_diary(session_date: "2026-09-16", note: "Good session.")

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(false)
    expect(report[:missing]).to eq([ { kind: :diary, key: "2026-09-16" } ])
  end

  # The reason this compares fields rather than counting: a migration that
  # wrote the right number of rows carrying the wrong words passes a count.
  #
  # It is a conflict, not "the migration wrote the wrong thing", for the same
  # reason a result that disagrees is. Legacy::JournalMigrator now either
  # writes the legacy row verbatim or does not write at all, so a diary field
  # that disagrees can only mean the entry was already there and was kept on
  # purpose. There is no :mismatches bucket any more: nothing could ever fill
  # one, and a named check that never runs is the worst thing to put in front
  # of a person about to delete the only other copy.
  it "names a diary field that disagrees, as a conflict rather than a migration bug" do
    insert_diary(session_date: "2026-09-16", note: "Good session.")
    Legacy::JournalMigrator.new(coach: coach).run!
    CoachEntry.sole.update!(note: "something else entirely")

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(false)
    expect(report[:conflicts]).to eq([
      { kind: :diary, key: "2026-09-16", field: :note,
        legacy: "Good session.", kept: "something else entirely" },
    ])
  end

  # The verifier compared no drill_ratings at all, so a rating that never
  # arrived, or one the new system was holding a different answer for, passed
  # the gate silently and then the legacy json was deleted.
  it "names a drill rating that disagrees" do
    drill = create(:drill, slug: "wall-rally")
    insert_diary(session_date: "2026-09-16", note: "Good session.",
                 ratings: { "wall-rally" => "owns" })
    Legacy::JournalMigrator.new(coach: coach).run!
    DrillRating.sole.update!(rating: "getting")

    report = described_class.new(coach: coach).run

    expect(drill.reload).to be_present
    expect(report[:clean?]).to be(false)
    expect(report[:conflicts]).to eq([
      { kind: :diary, key: "2026-09-16", field: "rating:wall-rally",
        legacy: "owns", kept: "getting" },
    ])
  end

  it "names a drill rating that never arrived at all" do
    create(:drill, slug: "wall-rally")
    insert_diary(session_date: "2026-09-16", note: "Good session.",
                 ratings: { "wall-rally" => "owns" })
    Legacy::JournalMigrator.new(coach: coach).run!
    DrillRating.sole.destroy!

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(false)
    expect(report[:conflicts]).to eq([
      { kind: :diary, key: "2026-09-16", field: "rating:wall-rally",
        legacy: "owns", kept: nil },
    ])
  end

  # A slug with no Drill is the one rating the migrator reports as dropped
  # and cannot write. Counting it here would make a correct migration read as
  # broken and block the cutover this task exists to gate.
  it "does not blame a rating whose drill no longer exists" do
    insert_diary(session_date: "2026-09-16", note: "Good session.",
                 ratings: { "renamed-drill" => "owns" })
    Legacy::JournalMigrator.new(coach: coach).run!

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(true)
    expect(report[:conflicts]).to eq([])
  end

  # The unique index is (user_id, program_year_id, session_date), so running
  # legacy:migrate once with a wrong COACH_EMAIL and once with the right one
  # leaves two complete sets, violating nothing. CoachEntry.kept.find_by
  # (session_date:) then picked one arbitrarily and the verifier read clean
  # over an entry that has nothing to do with the coach being verified.
  it "looks the entry up under the coach it was written for, not by date alone" do
    other_coach = create(:user, :coach)
    insert_diary(session_date: "2026-09-16", note: "Good session.")
    Legacy::JournalMigrator.new(coach: other_coach).run!

    report = described_class.new(coach: coach).run

    expect(CoachEntry.kept.count).to eq(1)
    expect(report[:clean?]).to be(false)
    expect(report[:missing]).to eq([ { kind: :diary, key: "2026-09-16" } ])
    expect(report[:counts][:migrated_diary]).to eq(0)
  end

  # The structural one. DIARY_FIELDS and JournalMigrator#carried are two
  # hand-written lists and nothing asserted they agree, so adding a field to
  # carried made the verifier silently stop checking it and no test failed.
  #
  # IF YOU ADD A FIELD TO JournalMigrator#carried, ADD IT TO
  # Verifier::DIARY_FIELDS TOO, or the verifier stops checking that field and
  # the legacy table is deleted with it unverified.
  it "checks exactly the fields the journal migrator carries" do
    carried = Legacy::JournalMigrator.new(coach: coach)
                                     .send(:carried, Legacy::DiaryEntry.new).keys

    expect(described_class::DIARY_FIELDS).to match_array(carried)
  end

  # Ruling: a result row that disagrees is never a mismatch, because
  # Legacy::ResultMigrator either writes the legacy value verbatim or does
  # not write at all. Whatever made the two numbers disagree here (this test
  # edits the row directly after migrating it; the next test is the more
  # realistic case, a slot the new system already held before the migration
  # ran), the verifier cannot and need not tell those apart: any residual
  # disagreement can only mean the legacy value was declined, which is a
  # conflict for a person to look at, not a bug to fix.
  it "names a result whose value disagrees" do
    insert_result(value: "4.6")
    Legacy::ResultMigrator.new(coach: coach).run!
    TestResult.sole.update!(raw_value: "9.9")

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(false)
    expect(report[:conflicts]).to eq([
      { kind: :result, key: "2026-09:t1", legacy: "4.6", kept: "9.9" },
    ])
  end

  # A mismatch here would mean "the migration wrote the wrong thing", which
  # is not what happened: Legacy::ResultMigrator never overwrites a
  # TestResult that already exists at a slot (see
  # "never overwrites a result the new system already holds" in
  # result_migrator_spec.rb), so a legacy value that disagrees with what is
  # kept can only mean the slot was already occupied before the migration
  # ran. That is a conflict Jeff has to look at before the legacy row is
  # deleted for good, not a bug to fix, so it gets its own bucket and its
  # own words rather than being called a migration bug.
  it "routes a result whose slot the new system already held into conflicts" do
    TestResult.create!(program_year: year, athlete: year.athlete, test_date: date,
                       battery_measure: measure, recorded_by_user: coach, raw_value: "4.4")
    insert_result(value: "9.9")

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(false)
    expect(report[:conflicts]).to eq([
      { kind: :result, key: "2026-09:t1", legacy: "9.9", kept: "4.4" },
    ])
  end

  # The one that stops a deletion of the only copy. comparable_diary returned
  # [] when the table was absent, which made clean? true, which made
  # legacy:verify print "Safe to delete the old pipeline" and exit 0. The
  # realistic cause is LEGACY_DATABASE_URL being unset while the old rows sit
  # in the Vercel Neon database. Row count is deliberately not part of this:
  # a legacy table that exists and is empty is a legitimate state, and
  # blocking on it would teach someone to bypass the gate.
  it "refuses to read clean when a legacy table is not on this connection" do
    ActiveRecord::Base.connection.drop_table("diary_entry")

    report = described_class.new(coach: coach).run

    expect(report[:clean?]).to be(false)
    expect(report[:tables_missing]).to eq([ "diary_entry" ])
  end

  it "does not call an entry missing when it was skipped for having no program year" do
    insert_diary(session_date: "2020-01-01", note: "before the program")

    report = described_class.new(coach: coach).run

    expect(report[:missing]).to eq([])
    expect(report[:counts][:legacy_diary]).to eq(0)
  end

  # R12: a legacy result with a blank value, or one whose window two program
  # years share, is not a loss. Legacy::ResultMigrator correctly skips both,
  # on purpose, so a verifier that does not know about them would report a
  # correct migration as broken and block the cutover it is supposed to gate.
  it "does not call a result missing when its value was cleared" do
    insert_result(value: "   ")

    report = described_class.new(coach: coach).run

    expect(report[:missing]).to eq([])
    expect(report[:counts][:legacy_results]).to eq(0)
  end

  it "does not call a result missing when its window belongs to more than one program year" do
    other_year = create(:program_year, starts_on: "2020-01-01", ends_on: "2020-12-31")
    create(:test_date, program_year: other_year, window: "2026-09", label: "Baseline")
    insert_result(value: "4.6")

    report = described_class.new(coach: coach).run

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

    report = described_class.new(coach: coach).run

    # Hand-typed, not read back off the report: a verifier hard-coded to
    # report clean with empty buckets would still pass a bare clean?/missing/
    # missing check. Naming the exact counts this fixture is supposed to
    # produce (one clean diary entry and one clean result actually compared,
    # against the four rows this fixture also seeded and expects excluded)
    # is what tells "clean because everything agreed" apart from "clean
    # because nothing was compared".
    expect(report[:clean?]).to be(true)
    expect(report[:counts]).to eq(legacy_diary: 1, migrated_diary: 1,
                                  legacy_results: 1, migrated_results: 1)
    expect(report[:missing]).to eq([])
    expect(report[:conflicts]).to eq([])
  end
end
