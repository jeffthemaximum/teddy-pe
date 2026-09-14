class DayRole < ApplicationRecord
  DOWS = %w[mon tue wed thu fri sat sun].freeze

  # The roles are fixed. The content spec catches a bad plan before it reaches
  # the database, and this is the backstop behind it.
  FIXED = {
    "mon" => "Floor Day", "tue" => "Rings Day", "wed" => "Fast Day",
    "thu" => "Wall Day",  "fri" => "Skate Day", "sat" => "Game Day",
    "sun" => "Court Day"
  }.freeze

  belongs_to :program_year

  validates :dow, inclusion: { in: DOWS }
  validates :minutes, presence: true
  validates :intensity, inclusion: { in: 1..4 }
  validate  :name_matches_the_fixed_role

  private

  def name_matches_the_fixed_role
    return if dow.blank? || name == FIXED[dow]
    errors.add(:name, "on #{dow} must be #{FIXED[dow]}")
  end
end
