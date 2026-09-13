namespace :docs do
  desc "Export journals, results and plans into docs/ so the repo stays the memory"
  task export: :environment do
    athlete = Athlete.first or abort("No athlete yet. Run content:seed first.")
    exporter = DocsExporter.new(athlete)
    paths = exporter.export!

    relative = ->(p) { p.to_s.sub("#{Rails.root.join('..')}/", "") }

    paths.each { |p| puts "#{relative.call(p)} (#{exporter.descriptions[p]})" }
    exporter.pruned.each { |p| puts "pruned #{relative.call(p)}" }

    puts "#{paths.size} file(s) written, #{exporter.pruned.size} pruned. Read them before planning the next month."
  end
end
