namespace :content do
  desc "Seed backend/content into Postgres. Idempotent. YEAR=2026-27"
  task seed: :environment do
    seeder = ContentSeeder.new(year_label: ENV.fetch("YEAR", "2026-27"))
    counts = seeder.seed!
    counts.sort.each { |table, n| puts "#{table}: #{n}" }
    if seeder.bare.any?
      puts "no drill matched in #{seeder.bare.size} block(s): #{seeder.bare.join('; ')}"
    end
  end
end
