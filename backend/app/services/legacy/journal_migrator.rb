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
      @failed = []
    end

    def run!
      Legacy::Record.connect!
      return empty_report unless Legacy::DiaryEntry.table_present?

      migrated = 0
      Legacy::DiaryEntry.order(:session_date).each do |row|
        migrated += 1 if migrate(row)
      end

      { migrated: migrated, skipped: @skipped, dropped_ratings: @dropped_ratings, failed: @failed }
    end

    private

    def empty_report = { migrated: 0, skipped: [], dropped_ratings: [], failed: [] }

    def migrate(row)
      year = year_for(row.session_date)
      if year.nil?
        @skipped << { session_date: row.session_date, reason: "no program year contains this date" }
        return false
      end

      begin
        entry = CoachEntry.upsert_for(
          user: @coach, program_year: year, session_date: row.session_date,
          attrs: carried(row), ratings: known_ratings(row),
        )
        # created_at is a fact about when Jeff wrote it, and upsert_for has no
        # way to be told. Set it afterwards, without touching updated_at, which
        # honestly describes when this row was last written.
        entry.update_column(:created_at, row.created_at) if row.created_at.present?
        true
      rescue StandardError => e
        # A legacy row can carry a value a validation added after it was
        # written would now reject (overall/energy out of 1..5, a rating
        # outside not_yet/getting/owns). One bad row is not a reason to
        # lose every row after it: record it and keep going. Rescuing
        # StandardError, not Exception, so a real bug in this migrator
        # still surfaces here rather than vanishing silently.
        @failed << { session_date: row.session_date, error: e.message }
        false
      end
    end

    # dow, plan_month, week and device are deliberately not here. They are
    # either derivable from session_date (dow, plan_month, week) or dead
    # (device), and the new schema has no column for any of them.
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
