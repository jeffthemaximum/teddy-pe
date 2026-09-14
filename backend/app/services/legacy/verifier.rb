module Legacy
  # Compares the old tables against the new ones field by field.
  #
  # Counting alone would pass a migration that wrote the right number of rows
  # carrying the wrong words, which is the failure that matters here: the old
  # rows are about to be deleted, so this is the last moment anything can be
  # checked against them.
  #
  # Rows the migrators deliberately skipped are out of scope. A diary entry
  # dated before the program year has nowhere to go by design, and neither
  # does a result with a blank value, one whose test id has no measure, or
  # one whose window belongs to no test date or to more than one program
  # year. Counting any of those as missing would make a correct migration
  # read as broken, and this task is the gate on deleting the only other
  # copy of the rows, so that false alarm is not a safe direction to fail in.
  #
  # A row the migrator put in :failed is different: it genuinely did not
  # arrive, and this verifier has no visibility into :failed lists (it only
  # ever reads the two databases), so it reports those as missing on its own
  # by finding no matching row. That is correct and desired.
  #
  # A result row that disagrees is a third thing again, neither a mismatch
  # nor missing: Legacy::ResultMigrator never overwrites a TestResult that
  # already existed at that slot, so a legacy value that disagrees with what
  # is on the row means something was already recorded there before this
  # migration ran and the newer number was kept on purpose. That is a
  # conflict, not a sign the migration wrote the wrong thing, but it still
  # has to block clean?, because the legacy number is about to be deleted
  # forever and this is the last chance for a person to look at it.
  class Verifier
    DIARY_FIELDS = %i[note pain_note overall energy flag_pain challenge_num].freeze

    def run
      Legacy::Record.connect!

      mismatches = []
      missing = []
      conflicts = []

      diary = comparable_diary
      diary.each { |row| check_diary(row, mismatches, missing) }

      results = comparable_results
      results.each { |row| check_result(row, mismatches, missing, conflicts) }

      {
        clean?: mismatches.empty? && missing.empty? && conflicts.empty?,
        counts: { legacy_diary: diary.size, migrated_diary: CoachEntry.kept.count,
                  legacy_results: results.size, migrated_results: TestResult.count },
        mismatches: mismatches,
        missing: missing,
        conflicts: conflicts
      }
    end

    private

    def comparable_diary
      return [] unless Legacy::DiaryEntry.table_present?

      Legacy::DiaryEntry.order(:session_date).select { |row| year_for(row.session_date) }
    end

    # Mirrors every reason Legacy::ResultMigrator skips a row, on purpose,
    # rather than migrating it: no test date carries the window, more than
    # one program year carries it (so which one it belongs to cannot be
    # known), no battery measure carries the test id, or the value is blank
    # once stripped. A row the migrator skips for any of these reasons has
    # nowhere to go by design and so is not comparable to anything.
    def comparable_results
      return [] unless Legacy::TestResultRow.table_present?

      Legacy::TestResultRow.order(:test_window, :test_id).select do |row|
        date = resolve_test_date(row.test_window)
        next false unless date
        next false unless BatteryMeasure.exists?(program_year_id: date.program_year_id, test_id: row.test_id)

        row.value.to_s.strip.present?
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

    def check_result(row, mismatches, missing, conflicts)
      key = "#{row.test_window}:#{row.test_id}"
      date = resolve_test_date(row.test_window)
      measure = date && BatteryMeasure.find_by(program_year_id: date.program_year_id, test_id: row.test_id)
      result = measure && TestResult.find_by(test_date: date, battery_measure: measure)
      if result.nil?
        missing << { kind: :result, key: key }
        return
      end

      legacy = row.value.to_s.strip
      return if legacy == result.raw_value

      # For a result row this can only mean one thing: Legacy::ResultMigrator
      # either writes the legacy value verbatim or does not write at all (it
      # never overwrites a TestResult that already exists at this slot). So
      # a difference here means the slot was already occupied before this
      # migration ran and the migrator correctly left it alone, not that the
      # migration wrote the wrong thing. That is a conflict, not a mismatch,
      # but it still blocks clean?: the legacy value is about to be deleted
      # for good, and disagreeing with what is kept is exactly when a
      # person has to look before that happens.
      conflicts << { kind: :result, key: key, legacy: legacy, kept: result.raw_value }
    end

    def normalise(value) = Legacy::Mapping.normalise(value)

    def year_for(date)
      ProgramYear.find_by("starts_on <= ? and ends_on >= ?", date, date)
    end

    # Legacy::Mapping, so that "which legacy rows are in scope" is decided by
    # the same code the migrator and the survey run. A window two program
    # years share resolves to nothing here for the same reason the migrator
    # skips it: neither is willing to guess which year the row belongs to.
    def resolve_test_date(window)
      Legacy::Mapping.resolve_result(window: window, test_id: nil).test_date
    end
  end
end
