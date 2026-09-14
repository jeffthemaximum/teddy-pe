class Week < ApplicationRecord
  HOME_BUDGET   = 40
  TRIALS_BUDGET = 20

  belongs_to :month_plan
  belongs_to :block
  has_many :day_cards, -> { order(:position) }, dependent: :destroy

  validates :theme, :challenge, :dates_display, presence: true
  validates :number, :position_in_block, presence: true
  validate  :targets_cover_the_three_ball_sports
  validate  :stays_inside_the_effort_budget

  def budget = trials? ? TRIALS_BUDGET : HOME_BUDGET
  def high_intent_efforts = day_cards.sum(&:hie)

  def self.current(program_year, on: Date.current)
    joins(:day_cards).where(day_cards: { date: on.beginning_of_week..on.end_of_week })
      .where(month_plans: { program_year_id: program_year.id })
      .joins(:month_plan).distinct.first
  end

  private

  # One theme, 5 to 6 sub-targets, always one tennis, one basketball and one
  # soccer. The content spec catches this first; this is the backstop.
  def targets_cover_the_three_ball_sports
    errors.add(:targets, "must number 5 or 6") unless targets.size.between?(5, 6)
    { "tennis" => /tennis/i, "basketball" => /basketball/i, "soccer" => /soccer|keeper/i }
      .each do |sport, pattern|
        next if targets.any? { |t| t =~ pattern }
        errors.add(:targets, "need a #{sport} sub-target")
      end
  end

  def stays_inside_the_effort_budget
    return if day_cards.none?
    spent = high_intent_efforts
    return if spent <= budget
    errors.add(:base, "spends #{spent} high-intent efforts against a budget of #{budget}")
  end
end
