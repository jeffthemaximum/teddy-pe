require "rails_helper"

RSpec.describe Legacy::JournalMigrator, :legacy do
  let(:coach) { create(:user, :coach) }
  let(:year) { create(:program_year, starts_on: "2026-09-14", ends_on: "2027-08-15") }

  # NOTE: the brief's own version of this helper opens the bind-values array
  # on the same line as the exec_query heredoc marker ("exec_query(<<~SQL,
  # "diary", ["), then spreads the array elements across the lines that
  # Ruby actually treats as the heredoc's body. That does not parse: the
  # heredoc swallows everything up to the "SQL" terminator as string
  # content, so the "[" never finds its "]" as real Ruby, which is a plain
  # SyntaxError (confirmed with `ruby -c`), not something the constant
  # being undefined could explain. Binding the array to a local first keeps
  # every value, order, and the SQL text itself identical; only the
  # placement of the array literal changes.
  def insert_diary(date:, **attrs)
    row = { note: nil, pain_note: nil, overall: nil, energy: nil, flag_pain: false,
            challenge_num: nil, ratings: {}, created_at: "2026-09-14 08:00:00+00",
            dow: "Mon", plan_month: "2026-09", week: 1, device: "iPhone" }.merge(attrs)
    binds = [
      date, row[:note], row[:pain_note], row[:overall], row[:energy], row[:flag_pain],
      row[:challenge_num], row[:ratings].to_json, row[:created_at], row[:dow],
      row[:plan_month], row[:week], row[:device],
    ]
    ActiveRecord::Base.connection.exec_query(<<~SQL, "diary", binds)
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

  # api/diary.js validated overall/energy at write time, not at every point
  # since, so a row written before a validation existed can carry a value
  # CoachEntry now rejects. One bad row must not cost every row after it:
  # this is the difference between "the bad row was handled" (the first
  # expectation) and "the bad row did not stop the run" (the second, which
  # is what the fix is actually about). The bad row is dated earlier so
  # run!'s session_date ordering puts it first.
  it "reports a row CoachEntry rejects instead of losing every row after it" do
    year
    insert_diary(date: "2026-09-15", overall: 9)
    insert_diary(date: "2026-09-16", note: "Still good.")

    report = described_class.new(coach: coach).run!

    failed = report[:failed]
    expect(failed.size).to eq(1)
    expect(failed.first[:session_date]).to eq(Date.new(2026, 9, 15))
    expect(failed.first[:error]).to be_a(String).and be_present

    good_entry = CoachEntry.find_by(session_date: Date.new(2026, 9, 16))
    expect(good_entry).to be_present
    expect(good_entry.note).to eq("Still good.")
  end

  it "reports a rating value the schema does not permit instead of raising" do
    year
    create(:drill, slug: "wall-rally")
    insert_diary(date: "2026-09-16", ratings: { "wall-rally" => "amazing" })

    report = described_class.new(coach: coach).run!

    expect(report[:failed].size).to eq(1)
    expect(report[:failed].first[:session_date]).to eq(Date.new(2026, 9, 16))
    expect(report[:failed].first[:error]).to be_a(String).and be_present
    expect(CoachEntry.count).to eq(0)
    expect(DrillRating.count).to eq(0)
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

  # The plan's global constraint: "The new system wins every collision.
  # Conflicts are reported, never resolved automatically." It was implemented
  # in Legacy::ResultMigrator and not here, so CoachEntry.upsert_for ran
  # assign_attributes over a kept entry and replaced every carried field with
  # the legacy value, nil included, over a note Jeff typed on the new site.
  it "never overwrites an entry the new system already holds, and names what disagrees" do
    year
    existing = create(:coach_entry, user: coach, program_year: year,
                                    session_date: "2026-09-16",
                                    note: "Jeff typed this on the new site.",
                                    overall: 4, energy: 4)
    insert_diary(date: "2026-09-16", note: nil, overall: 2)

    report = described_class.new(coach: coach).run!

    expect(existing.reload.note).to eq("Jeff typed this on the new site.")
    expect(existing.overall).to eq(4)
    expect(report[:migrated]).to eq(0)
    expect(report[:conflicts]).to eq([
      { session_date: Date.new(2026, 9, 16), fields: [ :overall, :energy, :note ] },
    ])
  end

  it "names a rating that disagrees, and leaves the rating the new system holds" do
    year
    drill = create(:drill, slug: "wall-rally")
    existing = create(:coach_entry, user: coach, program_year: year, session_date: "2026-09-16",
                                    note: "Good session.", overall: nil, energy: nil)
    DrillRating.create!(coach_entry: existing, drill: drill, program_year: year,
                        session_date: "2026-09-16", rating: "getting")
    insert_diary(date: "2026-09-16", note: "Good session.", ratings: { "wall-rally" => "owns" })

    report = described_class.new(coach: coach).run!

    expect(DrillRating.sole.rating).to eq("getting")
    expect(report[:conflicts]).to eq([
      { session_date: Date.new(2026, 9, 16), fields: [ "rating:wall-rally" ] },
    ])
  end

  # created_at is the field that proves nothing was written: the migrator
  # sets it from the legacy row with update_column, so an entry it rewrote
  # would come back carrying the legacy timestamp instead of the one from
  # the day Jeff typed it on the new site.
  it "counts an entry that already agrees as already migrated and writes nothing" do
    year
    existing = create(:coach_entry, user: coach, program_year: year, session_date: "2026-09-16",
                                    note: "Good session.", overall: 4, energy: nil)
    existing.update_column(:created_at, Time.utc(2026, 9, 16, 21, 0, 0))
    insert_diary(date: "2026-09-16", note: "Good session.", overall: 4,
                 created_at: "2020-01-01 00:00:00+00")

    report = described_class.new(coach: coach).run!

    expect(existing.reload.created_at).to eq(Time.utc(2026, 9, 16, 21, 0, 0))
    expect(report[:already_migrated]).to eq(1)
    expect(report[:migrated]).to eq(0)
    expect(report[:conflicts]).to eq([])
  end

  it "writes nothing new on a second run and reports nothing as newly migrated" do
    year
    create(:drill, slug: "wall-rally")
    insert_diary(date: "2026-09-16", note: "Good session.", ratings: { "wall-rally" => "owns" })

    described_class.new(coach: coach).run!
    second = described_class.new(coach: coach).run!

    expect(CoachEntry.count).to eq(1)
    expect(DrillRating.count).to eq(1)
    expect(second[:migrated]).to eq(0)
    expect(second[:already_migrated]).to eq(1)
    expect(second[:conflicts]).to eq([])
  end

  # A migration that silently did nothing is the thing to avoid. Zeros with
  # no explanation read the same as "the old table was empty", and the next
  # task deletes the only copy. The drop is rolled back with the example's
  # transaction, so later examples still find the table.
  it "reports a missing legacy table rather than an empty run" do
    year
    ActiveRecord::Base.connection.drop_table("diary_entry")

    report = described_class.new(coach: coach).run!

    expect(report[:tables_missing]).to eq([ "diary_entry" ])
    expect(report[:migrated]).to eq(0)
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
