require "rails_helper"

RSpec.describe RankAward do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)    { ProgramYear.sole }
  let(:athlete) { year.athlete }
  let(:cub)     { year.blocks.find_by!(key: "cub") }

  def award_patches(n)
    cub.patches.order(:id).first(n).each do |patch|
      PatchAward.create!(athlete: athlete, program_year: year, patch: patch, awarded_on: Date.new(2026, 11, 8))
    end
  end

  it "ranks up on seven of nine" do
    award_patches(7)
    award = RankAward.new(athlete: athlete, program_year: year, block: cub,
                          awarded_on: Date.new(2026, 11, 8), patch_count: 7)
    expect(award).to be_valid
  end

  it "refuses a rank-up on six" do
    award_patches(6)
    award = RankAward.new(athlete: athlete, program_year: year, block: cub,
                          awarded_on: Date.new(2026, 11, 8), patch_count: 6)
    expect(award).not_to be_valid
    expect(award.errors[:patch_count].first).to eq("needs 7 of 9 to rank up")
  end

  it "refuses a count that claims more patches than were actually awarded" do
    award_patches(7)
    award = RankAward.new(athlete: athlete, program_year: year, block: cub,
                          awarded_on: Date.new(2026, 11, 8), patch_count: 9)
    expect(award).not_to be_valid
    expect(award.errors[:patch_count].first).to eq("says 9 but 7 patches are awarded for Cub")
  end

  it "counts the patches actually earned for a block" do
    award_patches(8)
    expect(RankAward.patches_earned(athlete, cub)).to eq(8)
  end
end
