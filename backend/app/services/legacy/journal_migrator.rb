module Legacy
  # diary_entry into coach_entries and drill_ratings.
  #
  # Idempotent, and it never overwrites anything. An entry the new system
  # already holds at (coach, program year, session date) is left exactly as
  # it is, whether this migration wrote it on an earlier run or Jeff typed it
  # on the new site. That is the plan's global constraint, "the new system
  # wins every collision, conflicts are reported, never resolved
  # automatically", and it is the same rule Legacy::ResultMigrator follows.
  #
  # CoachEntry.upsert_for is deliberately only ever called for a date with no
  # kept entry. It does find_or_initialize_by and then assign_attributes, so
  # over an existing entry it would replace every carried field with the
  # legacy value, a nil over a note Jeff typed included, and
  # replace_ratings! would overwrite any rating the legacy payload names.
  class JournalMigrator
    def initialize(coach:)
      @coach = coach
      @skipped = []
      @dropped_ratings = []
      @failed = []
      @conflicts = []
      @already_migrated = 0
    end

    def run!
      Legacy::Record.connect!
      # A table that is not on this connection is not the same fact as a
      # table with no rows in it, and reporting both as zeros is how the only
      # copy of a year of Teddy's program gets deleted. Name it instead.
      missing = Legacy::Mapping.missing_tables(Legacy::DiaryEntry)
      return empty_report.merge(tables_missing: missing) if missing.any?

      migrated = 0
      Legacy::DiaryEntry.order(:session_date).each do |row|
        migrated += 1 if migrate(row)
      end

      empty_report.merge(migrated: migrated, skipped: @skipped,
                         dropped_ratings: @dropped_ratings, failed: @failed,
                         conflicts: @conflicts, already_migrated: @already_migrated)
    end

    private

    def empty_report
      { tables_missing: [], migrated: 0, already_migrated: 0,
        skipped: [], dropped_ratings: [], conflicts: [], failed: [] }
    end

    def migrate(row)
      year = year_for(row.session_date)
      if year.nil?
        @skipped << { session_date: row.session_date, reason: "no program year contains this date" }
        return false
      end

      attrs = carried(row)
      ratings = known_ratings(row)

      # Addressed exactly the way the unique index is,
      # (user_id, program_year_id, session_date) where deleted_at is null, so
      # this finds the row upsert_for would otherwise have written over.
      existing = CoachEntry.kept.find_by(user: @coach, program_year: year,
                                         session_date: row.session_date)
      return record_existing(row, existing, attrs, ratings) if existing

      begin
        entry = CoachEntry.upsert_for(
          user: @coach, program_year: year, session_date: row.session_date,
          attrs: attrs, ratings: ratings,
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

    # Always returns false: nothing is written either way. Either the entry
    # already says what the legacy row says, and there is nothing to do, or
    # it disagrees and a person has to decide which version is right. Naming
    # the fields is the point. "This entry differs" would leave Jeff opening
    # both systems side by side on a row he cannot re-measure.
    def record_existing(row, existing, attrs, ratings)
      fields = disagreeing_fields(existing, attrs) + disagreeing_ratings(existing, ratings)
      if fields.empty?
        @already_migrated += 1
      else
        @conflicts << { session_date: row.session_date, fields: fields }
      end
      false
    end

    # Driven off `attrs`, which is carried(row), so a field added to carried
    # is compared here without anyone remembering to add it.
    # Legacy::Mapping.normalise is what the verifier uses too: "" and nil mean
    # the same absence in the old table, and the two have to agree or the
    # migrator declines a write the verifier then reports as a conflict.
    def disagreeing_fields(existing, attrs)
      attrs.filter_map do |field, legacy_value|
        next if Legacy::Mapping.normalise(legacy_value) ==
                Legacy::Mapping.normalise(existing.public_send(field))

        field
      end
    end

    # A slug the legacy payload does not name is not a disagreement. A rating
    # the new system does not have yet is, because migrating the entry would
    # have written it and this run is declining to.
    def disagreeing_ratings(existing, ratings)
      ratings.filter_map do |slug, rating|
        current = existing.drill_ratings.joins(:drill).find_by(drills: { slug: slug })
        next if current&.rating == rating.to_s

        "rating:#{slug}"
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
