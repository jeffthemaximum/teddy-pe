require "rails_helper"

RSpec.describe DrillRating do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)  { ProgramYear.sole }
  let(:coach) { create(:user, :coach) }
  let(:drill) { Drill.find_by!(slug: "split-step") }

  def rate(date, rating)
    entry = CoachEntry.upsert_for(user: coach, program_year: year, session_date: date)
    DrillRating.create!(coach_entry: entry, drill: drill, program_year: year,
                        session_date: date, rating: rating)
  end

  it "sees three owns-it sessions in a row, which progresses or retires a drill" do
    %w[2026-09-14 2026-09-16 2026-09-17].each { |d| rate(Date.parse(d), "owns") }
    expect(described_class.streak("split-step", "owns")).to be(true)
  end

  it "sees three not-yet sessions in a row, which drops it to an easier entry" do
    %w[2026-09-14 2026-09-16 2026-09-17].each { |d| rate(Date.parse(d), "not_yet") }
    expect(described_class.streak("split-step", "not_yet")).to be(true)
  end

  it "does not call two in a row a streak" do
    rate(Date.new(2026, 9, 14), "owns")
    rate(Date.new(2026, 9, 16), "owns")
    expect(described_class.streak("split-step", "owns")).to be(false)
  end

  it "breaks the streak when the middle session disagrees" do
    rate(Date.new(2026, 9, 14), "owns")
    rate(Date.new(2026, 9, 16), "getting")
    rate(Date.new(2026, 9, 17), "owns")
    expect(described_class.streak("split-step", "owns")).to be(false)
  end

  it "reads the streak in session order across years" do
    rate(Date.new(2026, 9, 17), "not_yet")
    rate(Date.new(2026, 9, 16), "owns")
    expect(described_class.for_drill("split-step").map(&:rating)).to eq(%w[owns not_yet])
  end
end
