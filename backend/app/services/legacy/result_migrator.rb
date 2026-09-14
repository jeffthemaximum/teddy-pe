module Legacy
  # The old test_result table into test_results.
  #
  # TestResult.upsert_for is deliberately not used. It stamps
  # recorded_at: Time.current, and when a measurement was taken is a fact
  # about Teddy rather than about this migration.
  class ResultMigrator
    def initialize(coach:)
      @coach = coach
      @skipped = []
      @conflicts = []
      @failed = []
    end

    def run!
      Legacy::Record.connect!
      # See Legacy::JournalMigrator#run!. An absent table and an empty table
      # report identically unless one of them says so out loud.
      missing = Legacy::Mapping.missing_tables(Legacy::TestResultRow)
      return empty_report.merge(tables_missing: missing) if missing.any?

      migrated = 0
      Legacy::TestResultRow.order(:test_window, :test_id).each do |row|
        migrated += 1 if migrate(row)
      end

      empty_report.merge(migrated: migrated, skipped: @skipped,
                         conflicts: @conflicts, failed: @failed)
    end

    private

    def empty_report
      { tables_missing: [], migrated: 0, skipped: [], conflicts: [], failed: [] }
    end

    def migrate(row)
      # Legacy::Mapping owns every reason a row maps onto nothing, including
      # the one R9 was about: two program years are allowed to carry the same
      # window string, so an ambiguous window is refused rather than guessed
      # at. Legacy::Survey and Legacy::Verifier ask the same question of the
      # same code, which is the only thing keeping the three in agreement.
      resolved = Legacy::Mapping.resolve_result(window: row.test_window, test_id: row.test_id)
      unless resolved.ok?
        @skipped << { window: row.test_window, test_id: row.test_id, reason: resolved.reason }
        return false
      end

      date = resolved.test_date
      measure = resolved.measure
      year = date.program_year

      value = row.value.to_s.strip
      if value.empty?
        # api/results.js deleted the row when someone cleared a value, so a
        # blank in the old table means no measurement was recorded, not a
        # data problem. That is an ordinary fact about a partly filled test
        # sheet and does not belong in :failed, which exists to tell Jeff
        # which rows he cannot yet trust the counts around.
        @skipped << { window: row.test_window, test_id: row.test_id,
                      reason: "the value was cleared, so there is nothing to migrate" }
        return false
      end

      existing = TestResult.find_by(program_year: year, test_date: date, battery_measure: measure)
      if existing
        @conflicts << { window: row.test_window, test_id: row.test_id,
                        legacy_value: row.value, current_value: existing.raw_value }
        return false
      end

      begin
        TestResult.create!(program_year: year, athlete: year.athlete, test_date: date,
                           battery_measure: measure, recorded_by_user: @coach,
                           raw_value: value, recorded_at: row.recorded_at)
        true
      rescue StandardError => e
        # A legacy value with no digit in it (or anything else a validation
        # now rejects) must not cost every row after it. Rescuing
        # StandardError, not Exception, so a real bug in this migrator still
        # surfaces here rather than vanishing silently.
        @failed << { window: row.test_window, test_id: row.test_id, error: e.message }
        false
      end
    end
  end
end
