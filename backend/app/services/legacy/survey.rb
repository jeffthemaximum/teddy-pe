module Legacy
  # Reads both old tables and reports what exists and what will not map.
  # Writes nothing, so it is safe to run against production at any time.
  #
  # Every decision about whether a legacy result row can map is delegated to
  # Legacy::Mapping, which Legacy::ResultMigrator and Legacy::Verifier also
  # use. This is the report a person reads before typing CONFIRM=yes, so a
  # survey that judged mapping more generously than the migrator does would
  # under-report exactly the rows he needs to have seen.
  class Survey
    def run
      Legacy::Record.connect!

      missing = Legacy::Mapping.missing_tables(Legacy::DiaryEntry, Legacy::TestResultRow)
      diary = Legacy::DiaryEntry.table_present? ? Legacy::DiaryEntry.order(:session_date).to_a : []
      results = Legacy::TestResultRow.table_present? ? Legacy::TestResultRow.order(:test_window, :test_id).to_a : []
      resolved = results.to_h { |row| [ row, Legacy::Mapping.resolve_result(window: row.test_window, test_id: row.test_id) ] }

      {
        source: Legacy::Record.source_description,
        tables_missing: missing,
        diary_count: diary.size,
        result_count: results.size,
        unmapped_drill_slugs: unmapped_drill_slugs(diary),
        unmapped_test_ids: windows_or_ids(resolved, Legacy::Mapping::NO_MEASURE, :test_id),
        unmapped_windows: windows_or_ids(resolved, Legacy::Mapping::NO_WINDOW, :test_window),
        ambiguous_windows: windows_or_ids(resolved, Legacy::Mapping::AMBIGUOUS_WINDOW, :test_window),
        dates_outside_any_year: diary.map(&:session_date).uniq.select { |d| year_for(d).nil? }.sort,
        already_present_results: already_present(resolved)
      }
    end

    private

    def windows_or_ids(resolved, reason, field)
      resolved.filter_map { |row, res| row.public_send(field) if res.reason == reason }.uniq.sort
    end

    def unmapped_drill_slugs(diary)
      slugs = diary.flat_map { |row| (row.ratings || {}).keys }.uniq
      (slugs - Drill.pluck(:slug)).sort
    end

    def year_for(date)
      ProgramYear.find_by("starts_on <= ? and ends_on >= ?", date, date)
    end

    # A legacy row whose slot the new system already fills. Both values are
    # reported so Jeff can see which number is the real measurement; nothing
    # here decides that.
    def already_present(resolved)
      resolved.filter_map do |row, res|
        next unless res.ok?

        existing = TestResult.find_by(program_year_id: res.test_date.program_year_id,
                                      test_date: res.test_date, battery_measure: res.measure)
        next if existing.nil?

        { window: row.test_window, test_id: row.test_id,
          legacy_value: row.value, current_value: existing.raw_value }
      end
    end
  end
end
