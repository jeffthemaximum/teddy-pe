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
end
