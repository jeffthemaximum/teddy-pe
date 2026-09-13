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
    # Bound to the attribution athlete_lines actually writes, not to "Teddy"
    # appearing anywhere in the file: the header line ("Athlete: Teddy
    # Maxim...") already contains "Teddy" regardless of whether a shared
    # entry is attributed correctly, so a bare include("Teddy") would pass
    # even with an empty or broken athlete_lines.
    expect(body).to include("**Teddy.** Shared with Dad.")
  end

  it "writes the results table with a direction on every row" do
    TestResult.upsert_for(program_year: year, test_date: year.test_dates.find_by!(window: "2026-09"),
                          battery_measure: year.battery_measures.find_by!(test_id: "t1"),
                          value: "4.42", user: coach)
    export

    body = root.join("results/2026-27.md").read
    # Bound to the 20m sprint row specifically, by splitting that one line on
    # "|" rather than searching the whole table: "lower" and "4.42" both
    # appear elsewhere in the document regardless (other rows use "lower",
    # and a corrupted direction on this row would go unnoticed by a plain
    # include check), so this asserts the cells of *this* row.
    row = body.lines.find { |line| line.include?("20m sprint") }
    cells = row.split("|").map(&:strip)
    expect(cells[1]).to eq("20m sprint")
    expect(cells[3]).to eq("lower")
    expect(cells[4]).to eq("4.42")
  end

  it "writes the month plan as readable prose" do
    export
    body = root.join("plans/2026-27/2026-09.md").read

    expect(body).to include("Cub block · Weeks 1–3")
    expect(body).to include("Week 1: Baseline & Land")
    expect(body).to include("Challenge of the week:")
    expect(body).to include("Wall & Ball")
    expect(body).to include("Dad notes:")

    # Bound to the Thursday "Wall & Ball" card's own line: weeks 2 and 3 both
    # spend 20 high-intent efforts on their Wednesday, and "high-intent
    # efforts: 2" is a leading substring of "high-intent efforts: 20)", so a
    # plain include check here passes even if this card's own hie were wrong.
    card_line = body.lines.find { |line| line.include?("Wall & Ball") }
    expect(card_line[/high-intent efforts: (\d+)\)/, 1]).to eq("2")

    # Prose rather than markup, the way the tokens render it.
    expect(body).not_to include("<b>")
    expect(body).not_to include("<q>")
  end

  it "names every file it wrote" do
    paths = export
    # contain_exactly rather than include: with no diary entries yet, this is
    # every file the run should have produced, not merely a subset of it.
    expect(paths.map { |p| p.to_s.sub("#{root}/", "") })
      .to contain_exactly("plans/2026-27/2026-09.md", "results/2026-27.md")
  end

  it "is safe to run twice" do
    export
    first = root.join("plans/2026-27/2026-09.md").read
    export
    expect(root.join("plans/2026-27/2026-09.md").read).to eq(first)
  end

  it "keeps two same-day coach entries in a stable, deterministic order" do
    other_coach = create(:user, :coach)
    create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17),
           note: "First coach note.")
    create(:coach_entry, user: other_coach, program_year: year, session_date: Date.new(2026, 9, 17),
           note: "Second coach note.")

    export
    body = root.join("journal/2026-27/2026-09.md").read
    expect(body.index("First coach note.")).to be < body.index("Second coach note.")

    export
    expect(root.join("journal/2026-27/2026-09.md").read).to eq(body)
  end

  describe "pruning stale files" do
    it "keeps a month's journal file, emptied, when its only entry is unshared rather than deleted" do
      entry = create(:athlete_entry, :shared, user: teddy, program_year: year,
                     session_date: Date.new(2026, 9, 17), best: "The cartwheel felt like flying")
      export
      path = root.join("journal/2026-27/2026-09.md")
      expect(path.read).to include("The cartwheel felt like flying")

      entry.update!(shared: false)
      export

      expect(path).to exist
      expect(path.read).not_to include("The cartwheel felt like flying")
    end

    it "prunes a journal file once every entry that month is deleted" do
      entry = create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17),
                     note: "Finish stayed high all session.")
      export
      path = root.join("journal/2026-27/2026-09.md")
      expect(path).to exist
      expect(path.read).to include("Finish stayed high all session.")

      entry.destroy!
      export

      expect(path).not_to exist
    end

    it "prunes a plan file once its MonthPlan is deleted" do
      export
      path = root.join("plans/2026-27/2026-09.md")
      expect(path).to exist

      year.month_plans.find_by!(month: "2026-09").destroy!
      export

      expect(path).not_to exist
    end

    it "never touches a file outside the year directory it owns" do
      sibling = root.join("plans/2026-09.md")
      FileUtils.mkdir_p(sibling.dirname)
      sibling.write("hand-written, not the exporter's to touch\n")

      export
      year.month_plans.find_by!(month: "2026-09").destroy!
      export

      expect(sibling).to exist
      expect(sibling.read).to eq("hand-written, not the exporter's to touch\n")
    end
  end
end
