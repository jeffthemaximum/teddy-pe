require "rails_helper"

RSpec.describe TestDate do
  # A window with no dates is the state this table was in until 14 September
  # 2026, and it is the state that made "is there a test today" unanswerable
  # without parsing the display string. Nothing may write one again.
  let(:year) { create(:program_year) }

  def build_date(attrs = {})
    described_class.new({
      program_year: year, window: "2026-09", label: "Baseline",
      display: "Sep 15–17", position: 1,
      starts_on: Date.new(2026, 9, 15), ends_on: Date.new(2026, 9, 17)
    }.merge(attrs))
  end

  it "is valid with both dates" do
    expect(build_date).to be_valid
  end

  it "refuses a window with no start" do
    date = build_date(starts_on: nil)
    expect(date).not_to be_valid
    expect(date.errors[:starts_on]).to be_present
  end

  it "refuses a window with no end" do
    date = build_date(ends_on: nil)
    expect(date).not_to be_valid
    expect(date.errors[:ends_on]).to be_present
  end

  it "refuses a window that ends before it starts" do
    date = build_date(ends_on: Date.new(2026, 9, 14))
    expect(date).not_to be_valid
    expect(date.errors[:ends_on]).to be_present
  end

  describe ".display_for" do
    # The string this replaces was hand-written beside the dates it
    # describes, which is the same fact written twice with nothing checking
    # that the two agree. These four cases are every shape the year can
    # produce; the first is the only one the 2026-27 content actually uses.
    it "keeps a window inside one month short" do
      expect(described_class.display_for(Date.new(2026, 9, 15), Date.new(2026, 9, 17)))
        .to eq("Sep 15–17")
    end

    it "names both months when a window crosses one" do
      expect(described_class.display_for(Date.new(2027, 6, 28), Date.new(2027, 7, 2)))
        .to eq("Jun 28 – Jul 2")
    end

    it "names both years when a window crosses one" do
      expect(described_class.display_for(Date.new(2026, 12, 30), Date.new(2027, 1, 2)))
        .to eq("Dec 30 – Jan 2")
    end

    it "writes a single day once" do
      expect(described_class.display_for(Date.new(2026, 9, 15), Date.new(2026, 9, 15)))
        .to eq("Sep 15")
    end
  end
end
