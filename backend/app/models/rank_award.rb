class RankAward < ApplicationRecord
  REQUIRED_PATCHES = 7
  TOTAL_AREAS = 9

  belongs_to :athlete
  belongs_to :program_year
  belongs_to :block

  validates :awarded_on, presence: true
  validates :block_id, uniqueness: { scope: :athlete_id }
  validate  :earned_seven_of_nine

  scope :chronological, -> { order(:awarded_on) }

  def self.patches_earned(athlete, block)
    PatchAward.where(athlete: athlete, patch_id: block.patches.select(:id)).count
  end

  private

  # Seven of nine, so two lagging areas never block progress and three do.
  def earned_seven_of_nine
    if patch_count.to_i < REQUIRED_PATCHES
      return errors.add(:patch_count, "needs #{REQUIRED_PATCHES} of #{TOTAL_AREAS} to rank up")
    end

    return if block.blank? || athlete.blank?
    actual = self.class.patches_earned(athlete, block)
    return if patch_count.to_i <= actual
    errors.add(:patch_count, "says #{patch_count} but #{actual} patches are awarded for #{block.name}")
  end
end
