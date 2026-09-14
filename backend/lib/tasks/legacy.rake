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
      puts "  #{explain}"
    end

    section.call("drill slugs with no drill", report[:unmapped_drill_slugs],
                 "These ratings have nowhere to go. Add the drill to backend/content or accept losing the rating.")
    section.call("test ids with no measure", report[:unmapped_test_ids],
                 "These results have nowhere to go.")
    section.call("windows with no test date", report[:unmapped_windows],
                 "These results have nowhere to go.")
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
end
