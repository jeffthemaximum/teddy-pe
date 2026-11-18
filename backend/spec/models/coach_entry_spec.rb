require "rails_helper"

RSpec.describe CoachEntry do
  it "takes a note of 20,000 characters and refuses one longer" do
    expect(build(:coach_entry, note: "a" * 20_000)).to be_valid
    expect(build(:coach_entry, note: "a" * 20_001)).not_to be_valid
  end
end
