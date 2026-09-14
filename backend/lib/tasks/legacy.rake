namespace :legacy do
  # A bare KeyError or RecordNotFound backtrace on a Fly console is a puzzle
  # to whoever typed the command. Say what to pass instead, the way CONFIRM
  # already does. Both migrate and verify close over this.
  find_coach = lambda do
    email = ENV["COACH_EMAIL"].to_s.strip.downcase
    if email.empty?
      abort("Set COACH_EMAIL to the coach's sign-in address, for example " \
            "COACH_EMAIL=frey.maxim@gmail.com. The migration files every diary entry under that account " \
            "and the verifier looks for them there, so the two have to be given the same one.")
    end

    User.find_by(email: email, role: "coach") ||
      abort("No coach account has the email #{email}. Check the spelling, and check it is the coach " \
            "account rather than Teddy's. `bin/rails runner 'puts User.where(role: :coach).pluck(:email)'` " \
            "lists the ones that exist.")
  end

  desc "Read the old Neon tables and report what exists and what will not map. Writes nothing."
  task survey: :environment do
    report = Legacy::Survey.new.run

    # A table that is not on this connection has to say so. Printing "0 rows"
    # for it reads exactly like "there was nothing to migrate", and the task
    # that follows this one deletes the only other copy of the rows.
    report[:tables_missing].each do |table|
      puts "#{table} not found on this connection"
    end
    if report[:tables_missing].any?
      puts "  The old rows are probably in another database. The Vercel functions wrote to their own Neon database,"
      puts "  and this app reads its own unless you tell it otherwise."
      puts "  Point it at the old one with LEGACY_DATABASE_URL, set to the Vercel project's DATABASE_URL:"
      puts "    fly secrets set LEGACY_DATABASE_URL=\"<the Vercel project's DATABASE_URL>\" -a teddy-pe-api"
      puts "  Treat every count below as unknown until this line is gone."
      puts
    end

    puts "diary_entry rows:  #{report[:diary_count]}" unless report[:tables_missing].include?("diary_entry")
    puts "test_result rows:  #{report[:result_count]}" unless report[:tables_missing].include?("test_result")

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

    coach = find_coach.call

    # First, and loudly. A migration that silently did nothing is the thing
    # this whole phase is guarding against: zeros with no explanation read
    # the same as an empty old table, and the next task deletes the only copy.
    say_missing = lambda do |tables|
      next if tables.empty?

      puts "=" * 60
      puts "NOTHING WAS MIGRATED from #{tables.join(' or ')}: not found on this connection."
      puts "The old rows are probably in another database. Set LEGACY_DATABASE_URL to the Vercel project's"
      puts "DATABASE_URL and run this again:"
      puts "  fly secrets set LEGACY_DATABASE_URL=\"<the Vercel project's DATABASE_URL>\" -a teddy-pe-api"
      puts "Do not read the counts below as a finished migration."
      puts "=" * 60
      puts
    end

    # Each migrator reports the moment it finishes rather than everything
    # being held to the end. A dropped fly ssh console used to leave the
    # writes done and nothing said about them.
    journal = Legacy::JournalMigrator.new(coach: coach).run!
    say_missing.call(journal[:tables_missing])

    puts "diary entries written: #{journal[:migrated]}"
    if journal[:already_migrated].positive?
      puts "  #{journal[:already_migrated]} entry(s) were already there and already agree. Nothing was rewritten."
    end
    journal[:skipped].each { |s| puts "  skipped #{s[:session_date]}: #{s[:reason]}" }
    journal[:dropped_ratings].each { |d| puts "  rating lost on #{d[:session_date]}: no drill '#{d[:slug]}'" }

    # Its own block, because this is the one thing here that needs a decision
    # from a person rather than a read. Nothing was written for these dates.
    if journal[:conflicts].any?
      puts
      puts "Diary entries the new system already holds, where the old row says something different (#{journal[:conflicts].size}):"
      journal[:conflicts].each do |c|
        puts "  #{c[:session_date]}: #{c[:fields].join(', ')}"
      end
      puts "  The entry on the new site was kept and nothing on these dates was written."
      puts "  Deleting the legacy table drops the old version of exactly those fields, so open each date"
      puts "  on /journal and compare before anything is deleted."
    end
    $stdout.flush

    results = Legacy::ResultMigrator.new(coach: coach).run!
    say_missing.call(results[:tables_missing])

    puts "test results written: #{results[:migrated]}"
    if results[:already_migrated].positive?
      puts "  #{results[:already_migrated]} result(s) were already there and already agree. Nothing was rewritten."
    end
    results[:skipped].each { |s| puts "  skipped #{s[:window]} #{s[:test_id]}: #{s[:reason]}" }
    if results[:conflicts].any?
      puts
      puts "Results the new system already holds, where the old row says a different number (#{results[:conflicts].size}):"
      results[:conflicts].each do |c|
        puts "  #{c[:window]} #{c[:test_id]}: old #{c[:legacy_value]}, kept #{c[:current_value]}"
      end
      puts "  The number on the new site was kept and nothing here was written."
      puts "  Deleting the legacy table drops the old number for good, so look at each one before anything is deleted."
    end
    $stdout.flush

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
    puts "This task is safe to run again. It never writes over an entry or a result the new system"
    puts "already holds, so a second run writes only what is genuinely not there yet. If this one was"
    puts "cut off part way, run it again with the same COACH_EMAIL."
    puts "Then run rails legacy:verify COACH_EMAIL=#{coach.email}. Nothing gets deleted until it reads clean."
  end

  desc "Compare the old Neon rows against the migrated ones, field by field. COACH_EMAIL="
  task verify: :environment do
    report = Legacy::Verifier.new(coach: find_coach.call).run
    counts = report[:counts]

    # Never a clean read. An absent table used to look exactly like an empty
    # one, and the task after this one deletes the only other copy.
    if report[:tables_missing].any?
      puts "=" * 60
      report[:tables_missing].each { |t| puts "#{t} not found on this connection." }
      puts "Nothing below was compared against anything. The old rows are probably in another database:"
      puts "  fly secrets set LEGACY_DATABASE_URL=\"<the Vercel project's DATABASE_URL>\" -a teddy-pe-api"
      puts "=" * 60
      puts
    end

    puts "diary:   #{counts[:legacy_diary]} to migrate, #{counts[:migrated_diary]} on the coach's account"
    puts "results: #{counts[:legacy_results]} to migrate, #{counts[:migrated_results]} in the new table"

    # Reported loudly, never blocking. Failed rows and conflicts are
    # legitimate reasons for a gap, and blocking on a count would fire on
    # those and teach whoever reads this to walk past the gate.
    if counts[:legacy_diary] != counts[:migrated_diary]
      puts
      puts "The two diary numbers differ by #{(counts[:legacy_diary] - counts[:migrated_diary]).abs}."
      puts "  Rows that failed to migrate and dates reported as conflicts account for some of that gap."
      puts "  Anything left over after those means entries exist on this account that this migration"
      puts "  did not write, or entries it wrote are on a different account. Check COACH_EMAIL."
    end

    report[:missing].each { |m| puts "MISSING #{m[:kind]} #{m[:key]}" }

    if report[:conflicts].any?
      puts
      puts "Slots where the old row and the new one disagree and the new one is being kept:"
      report[:conflicts].each do |c|
        field = c[:field] ? " #{c[:field]}" : ""
        puts "  #{c[:kind]} #{c[:key]}#{field}: old #{c[:legacy].inspect}, keeping #{c[:kept].inspect}"
      end
      puts "  Nothing was written for any of these. Deleting the old tables drops the old version for good,"
      puts "  so look at each line above and decide which one is right before anything is deleted."
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
