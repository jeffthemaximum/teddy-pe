namespace :content do
  desc "Seed backend/content into Postgres. Idempotent. YEAR=2026-27"
  task seed: :environment do
    seeder = ContentSeeder.new(year_label: ENV.fetch("YEAR", "2026-27"))
    counts = seeder.seed!
    counts.sort.each { |table, n| puts "#{table}: #{n}" }

    # A deploy that quietly deletes rows is worse than one that does not
    # delete at all. This runs as the release command, so the numbers go in
    # the deploy log where Jeff can see what a YAML edit took out.
    seeder.pruned.sort.each { |table, n| puts "pruned #{table}: #{n}" }

    if seeder.bare.any?
      puts "no drill matched in #{seeder.bare.size} block(s): #{seeder.bare.join('; ')}"
    end
  end
end
