namespace :content do
  desc "Seed backend/content into Postgres. Idempotent. YEAR=2026-27"
  task seed: :environment do
    counts = ContentSeeder.new(year_label: ENV.fetch("YEAR", "2026-27")).seed!
    counts.sort.each { |table, n| puts "#{table}: #{n}" }
  end
end
