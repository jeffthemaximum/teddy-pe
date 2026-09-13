require "rails_helper"

RSpec.describe DocsExporter do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)    { ProgramYear.sole }
  let(:athlete) { year.athlete }
  let(:coach)   { create(:user, :coach) }
  let(:teddy)   { create(:user, :athlete) }
  let(:root)    { Pathname.new(Dir.mktmpdir) }

  after { FileUtils.remove_entry(root) }

  def export = described_class.new(athlete, root: root).export!

  it "writes a journal file per month" do
    create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17),
           overall: 4, energy: 3, note: "Finish stayed high all session.")
    export

    path = root.join("journal/2026-27/2026-09.md")
    expect(path).to exist
    body = path.read
    expect(body).to include("2026-09-17")
    expect(body).to include("Finish stayed high all session.")
    expect(body).to include("Wall & Ball")
  end

  it "writes the drill ratings beside the entry that made them" do
    entry = create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17))
    entry.replace_ratings!({ "split-step" => "owns" })
    export

    expect(root.join("journal/2026-27/2026-09.md").read).to include("split-step: owns")
  end

  it "leaves out an athlete entry Teddy has not shared" do
    create(:athlete_entry, user: teddy, program_year: year,
           session_date: Date.new(2026, 9, 17), best: "secret thing")
    export

    expect(root.join("journal/2026-27/2026-09.md").read).not_to include("secret thing")
  end

  it "includes one he has shared" do
    create(:athlete_entry, :shared, user: teddy, program_year: year,
           session_date: Date.new(2026, 9, 17), best: "The cartwheel felt like flying")
    export

    body = root.join("journal/2026-27/2026-09.md").read
    expect(body).to include("The cartwheel felt like flying")
    expect(body).to include("Teddy")
  end

  it "writes the results table with a direction on every row" do
    TestResult.upsert_for(program_year: year, test_date: year.test_dates.find_by!(window: "2026-09"),
                          battery_measure: year.battery_measures.find_by!(test_id: "t1"),
                          value: "4.42", user: coach)
    export

    body = root.join("results/2026-27.md").read
    expect(body).to include("20m sprint")
    expect(body).to include("4.42")
    expect(body).to include("lower")
  end

  it "writes the month plan as readable prose" do
    export
    body = root.join("plans/2026-27/2026-09.md").read

    expect(body).to include("Cub block · Weeks 1–3")
    expect(body).to include("Week 1: Baseline & Land")
    expect(body).to include("Challenge of the week:")
    expect(body).to include("Wall & Ball")
    expect(body).to include("Dad notes:")
    expect(body).to include("high-intent efforts: 2")
    # Prose rather than markup, the way the tokens render it.
    expect(body).not_to include("<b>")
    expect(body).not_to include("<q>")
  end

  it "names every file it wrote" do
    paths = export
    expect(paths.map { |p| p.to_s.sub("#{root}/", "") })
      .to include("plans/2026-27/2026-09.md", "results/2026-27.md")
  end

  it "is safe to run twice" do
    export
    first = root.join("plans/2026-27/2026-09.md").read
    export
    expect(root.join("plans/2026-27/2026-09.md").read).to eq(first)
  end
end
