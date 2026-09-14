# One recordable row on the test sheet. There are fifteen of these against ten
# battery tests, because hop, throw and balance each record left and right, and
# height stands outside the ten.
class BatteryMeasure < ApplicationRecord
  DIRECTIONS = %w[lower higher growth].freeze

  belongs_to :program_year
  belongs_to :battery_test, optional: true
  has_many :test_results, dependent: :destroy

  validates :test_id, presence: true, uniqueness: { scope: :program_year_id }
  validates :label, :unit, :position, presence: true
  validates :direction, inclusion: { in: DIRECTIONS }

  # Which way counts as progress. A faster sprint and a longer jump are both
  # better; a shorter dead hang is not. Height is growth, so it reports a pace
  # rather than a verdict and never reads as worse.
  def improvement_from(baseline, latest)
    return nil if baseline.nil? || latest.nil?
    return :same if direction == "growth"

    delta = latest.to_f - baseline.to_f
    return :same if delta.zero?

    better = direction == "lower" ? delta.negative? : delta.positive?
    better ? :better : :worse
  end
end
