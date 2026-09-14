module Legacy
  # Reads both old tables and reports what exists and what will not map.
  # Writes nothing, so it is safe to run against production at any time.
  class Survey
    def run
      Legacy::Record.connect!

      diary = Legacy::DiaryEntry.table_present? ? Legacy::DiaryEntry.order(:session_date).to_a : []
      results = Legacy::TestResultRow.table_present? ? Legacy::TestResultRow.order(:test_window, :test_id).to_a : []

      {
        diary_count: diary.size,
        result_count: results.size,
        unmapped_drill_slugs: unmapped_drill_slugs(diary),
        unmapped_test_ids: unmapped(results.map(&:test_id), BatteryMeasure.pluck(:test_id)),
        unmapped_windows: unmapped(results.map(&:test_window), TestDate.pluck(:window)),
        dates_outside_any_year: diary.map(&:session_date).uniq.select { |d| year_for(d).nil? }.sort,
        already_present_results: already_present(results)
      }
    end

    private

    def unmapped(seen, known)
      (seen.uniq - known).sort
    end

    def unmapped_drill_slugs(diary)
      slugs = diary.flat_map { |row| (row.ratings || {}).keys }.uniq
      unmapped(slugs, Drill.pluck(:slug))
    end

    def year_for(date)
      ProgramYear.find_by("starts_on <= ? and ends_on >= ?", date, date)
    end

    # A legacy row whose slot the new system already fills. Both values are
    # reported so Jeff can see which number is the real measurement; nothing
    # here decides that.
    def already_present(results)
      results.filter_map do |row|
        existing = current_result(row)
        next if existing.nil?

        { window: row.test_window, test_id: row.test_id,
          legacy_value: row.value, current_value: existing.raw_value }
      end
    end

    def current_result(row)
      date = TestDate.find_by(window: row.test_window) or return nil
      measure = BatteryMeasure.find_by(program_year_id: date.program_year_id, test_id: row.test_id) or return nil
      TestResult.find_by(program_year_id: date.program_year_id, test_date: date, battery_measure: measure)
    end
  end
end
