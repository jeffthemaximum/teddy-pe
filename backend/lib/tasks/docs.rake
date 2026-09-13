namespace :docs do
  desc "Export journals, results and plans into docs/ so the repo stays the memory"
  task export: :environment do
    athlete = Athlete.first or abort("No athlete yet. Run content:seed first.")
    paths = DocsExporter.new(athlete).export!
    paths.each { |p| puts p.to_s.sub("#{Rails.root.join('..')}/", "") }
    puts "#{paths.size} file(s) written. Read them before planning the next month."
  end
end
