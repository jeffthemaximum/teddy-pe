require "rails_helper"

RSpec.describe "seeding the month plan" do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:plan) { MonthPlan.find_by!(month: "2026-09") }
  let(:week1) { plan.weeks.find_by!(number: 1) }
  let(:thursday) { week1.day_cards.find_by!(dow: "thu") }

  it "creates the month, its weeks and its days" do
    expect(plan.month).to eq("2026-09")
    expect(plan.block.key).to eq("cub")
    expect(plan.weeks.count).to eq(3)
    expect(plan.weeks.flat_map(&:day_cards).count).to eq(21)
  end

  it "gives week 1 full cards and the later weeks summaries" do
    expect(week1.day_cards.select(&:full_card?).count).to eq(7)
    expect(plan.weeks.find_by!(number: 2).day_cards.none?(&:full_card?)).to be(true)
    expect(plan.weeks.find_by!(number: 2).day_cards.all? { |d| d.summary_lines.any? }).to be(true)
  end

  it "puts every day on the role its weekday owns" do
    plan.weeks.flat_map(&:day_cards).each do |card|
      expect(card.day_role.name).to eq(DayRole::FIXED.fetch(card.dow)), card.date.to_s
    end
  end

  it "reads Thursday's card the way it is written" do
    expect(thursday.name).to eq("Wall & Ball")
    expect(thursday.date).to eq(Date.new(2026, 9, 17))
    expect(thursday.day_blocks.count).to eq(9)
    expect(thursday.day_blocks.tests.count).to eq(2)
    expect(thursday.day_blocks.challenges.count).to eq(1)
    expect(thursday.dad_note).to start_with("Form over volume on the tennis.")
  end

  it "carries the high-intent effort counts" do
    expect(week1.day_cards.order(:position).map(&:hie)).to eq([ 0, 6, 15, 2, 5, 0, 0 ])
    expect(week1.high_intent_efforts).to eq(28)
    expect(week1.high_intent_efforts).to be <= week1.budget
  end

  it "stores prose and tokens rather than markup" do
    block = thursday.day_blocks.find_by!(name: "New Thing")
    expect(block.body).to include("<q>")
    expect(block.body_tokens.map { |t| t["text"] }.join).not_to include("<")
    expect(block.body_tokens.any? { |t| t["style"] == "quote" }).to be(true)
  end

  # The regression target is the report build.py prints today.
  it "matches the drill linking the old build produced" do
    used = week1.day_cards.flat_map(&:drill_slugs).uniq
    expect(used.size).to eq(63)

    bare = week1.day_cards.flat_map(&:day_blocks).select { |b| b.drill_slugs.empty? }
    expect(bare.map { |b| "#{b.day_card.dow} · #{b.name}" }).to match_array([
      "tue · Test: Height", "fri · Play", "sat · Home program", "sun · Review"
    ])
  end

  it "names only drills that exist" do
    slugs = DayBlock.pluck(:drill_slugs).flatten.uniq
    expect(slugs - Drill.pluck(:slug)).to be_empty
  end

  it "is idempotent, like the rest of the seed" do
    counts = [ MonthPlan.count, Week.count, DayCard.count, DayBlock.count ]
    ContentSeeder.new(year_label: "2026-27").seed!
    expect([ MonthPlan.count, Week.count, DayCard.count, DayBlock.count ]).to eq(counts)
  end

  it "loses no prose anywhere in the month" do
    # The tokens replace the prose in every view, so any text the tokenizer
    # drops is text a reader never sees again. This walks every seeded block
    # rather than a sample, because the next month's prose is unwritten and
    # this is the only assertion that will cover it.
    tags = /<\/?[a-z]+>/i

    DayBlock.find_each do |block|
      expect(block.body_tokens.map { |t| t["text"] }.join).to eq(block.body.to_s.gsub(tags, "")), block.name
      expect(block.name_tokens.map { |t| t["text"] }.join).to eq(block.name.gsub(tags, "")), block.name
    end
  end
end
