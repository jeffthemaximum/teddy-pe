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
      return empty_report unless Legacy::TestResultRow.table_present?

      migrated = 0
      Legacy::TestResultRow.order(:test_window, :test_id).each do |row|
        migrated += 1 if migrate(row)
      end

      { migrated: migrated, skipped: @skipped, conflicts: @conflicts, failed: @failed }
    end

    private

    def empty_report = { migrated: 0, skipped: [], conflicts: [], failed: [] }

    def migrate(row)
      # The unique index on test_dates is (program_year_id, window), so two
      # program years are allowed to carry a test date with the same window
      # string. A global find_by would silently pick whichever came first
      # and file this result under the wrong program year. There is only
      # one program year today, so that cannot happen yet, but this is a
      # one-shot migration of numbers nobody can measure again, so the
      # lookup refuses to guess.
      dates = TestDate.where(window: row.test_window).to_a
      if dates.size > 1
        @skipped << { window: row.test_window, test_id: row.test_id,
                      reason: "more than one program year has this window" }
        return false
      end

      date = dates.first
      if date.nil?
        @skipped << { window: row.test_window, test_id: row.test_id,
                      reason: "no test date with this window" }
        return false
      end

      year = date.program_year
      measure = year.battery_measures.find_by(test_id: row.test_id)
      if measure.nil?
        @skipped << { window: row.test_window, test_id: row.test_id,
                      reason: "no battery measure with this test id" }
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
                           raw_value: row.value.to_s.strip, recorded_at: row.recorded_at)
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
