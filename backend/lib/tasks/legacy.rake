namespace :legacy do
  desc "Read the old Neon tables and report what exists and what will not map. Writes nothing."
  task survey: :environment do
    report = Legacy::Survey.new.run

    puts "diary_entry rows:  #{report[:diary_count]}"
    puts "test_result rows:  #{report[:result_count]}"

    section = lambda do |label, items, explain|
      next if items.empty?

      puts
      puts "#{label} (#{items.size}): #{items.join(', ')}"
      Array(explain).each { |line| puts "  #{line}" }
    end

    section.call("drill slugs with no drill", report[:unmapped_drill_slugs],
                 "These ratings have nowhere to go. Add the drill to backend/content or accept losing the rating.")
    section.call("test ids with no measure", report[:unmapped_test_ids], [
      "A test id like this means the old battery had a row this year's does not.",
      "Add it to backend/content/program_years/2026-27/program.yml and re-seed, or accept that these results do not come across."
    ])
    section.call("windows with no test date", report[:unmapped_windows], [
      "A window like this means the old data names a test window this program year does not have.",
      "Add it to backend/content/program_years/2026-27/program.yml and re-seed, or accept that these results do not come across."
    ])
    section.call("windows more than one program year carries", report[:ambiguous_windows], [
      "Two program years have a test date with this window, so which year these results belong to cannot be known.",
      "The migration refuses to guess and leaves them behind. Rename one of the windows and re-seed if you want them across."
    ])
    section.call("session dates in no program year", report[:dates_outside_any_year].map(&:to_s),
                 "These entries predate the program year or fall after it.")

    if report[:already_present_results].any?
      puts
      puts "results the new system already holds (#{report[:already_present_results].size}):"
      report[:already_present_results].each do |r|
        puts "  #{r[:window]} #{r[:test_id]}: old #{r[:legacy_value]}, current #{r[:current_value]}"
      end
      puts "  The migration leaves all of these alone. Decide which number is real yourself."
    end
  end

  desc "Copy the old Neon rows into the Rails tables. COACH_EMAIL= CONFIRM=yes"
  task migrate: :environment do
    abort("Set CONFIRM=yes once you have read the survey.") unless ENV["CONFIRM"] == "yes"

    coach = User.find_by!(email: ENV.fetch("COACH_EMAIL").strip.downcase, role: "coach")

    journal = Legacy::JournalMigrator.new(coach: coach).run!
    results = Legacy::ResultMigrator.new(coach: coach).run!

    puts "diary entries written: #{journal[:migrated]}"
    journal[:skipped].each { |s| puts "  skipped #{s[:session_date]}: #{s[:reason]}" }
    journal[:dropped_ratings].each { |d| puts "  rating lost on #{d[:session_date]}: no drill '#{d[:slug]}'" }

    puts "test results written: #{results[:migrated]}"
    results[:skipped].each { |s| puts "  skipped #{s[:window]} #{s[:test_id]}: #{s[:reason]}" }
    results[:conflicts].each do |c|
      puts "  left alone #{c[:window]} #{c[:test_id]}: old #{c[:legacy_value]}, current #{c[:current_value]}"
    end

    # These are the rows that did not arrive. They are what tells Jeff
    # whether it is safe to follow this migration with a deletion, so they
    # get their own loud section rather than hiding among the skips.
    failed_total = journal[:failed].size + results[:failed].size
    if failed_total.positive?
      puts
      puts "=" * 60
      puts "#{failed_total} row(s) FAILED to migrate. Nothing was deleted, but read this before trusting the counts above."
      journal[:failed].each do |f|
        puts "  diary entry #{f[:session_date]}: #{f[:error]}"
      end
      results[:failed].each do |f|
        puts "  test result #{f[:window]} #{f[:test_id]}: #{f[:error]}"
      end
      puts "=" * 60
    end

    puts
    puts "Now run rails legacy:verify. Nothing gets deleted until it reads clean."
  end

  desc "Compare the old Neon rows against the migrated ones, field by field."
  task verify: :environment do
    report = Legacy::Verifier.new.run
    counts = report[:counts]

    puts "diary:   #{counts[:legacy_diary]} to migrate, #{counts[:migrated_diary]} in the new table"
    puts "results: #{counts[:legacy_results]} to migrate, #{counts[:migrated_results]} in the new table"

    report[:missing].each { |m| puts "MISSING #{m[:kind]} #{m[:key]}" }
    report[:mismatches].each do |m|
      puts "DIFFERS #{m[:kind]} #{m[:key]} #{m[:field]}: old #{m[:legacy].inspect}, new #{m[:migrated].inspect}"
    end

    if report[:conflicts].any?
      puts
      puts "Slots where the old and new numbers disagree and the new one is being kept:"
      report[:conflicts].each do |c|
        puts "  #{c[:key]}: old #{c[:legacy].inspect}, keeping #{c[:kept].inspect}"
      end
      puts "  Deleting the old table drops the old number for good. Look at each one above before anything is deleted."
    end

    if report[:clean?]
      puts
      puts "Every old row has a match that agrees. Safe to delete the old pipeline."
    else
      puts
      puts "Not clean. Nothing should be deleted until this reads clean."
      exit(1)
    end
  end
end
