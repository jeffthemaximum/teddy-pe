class DayCard < ApplicationRecord
  # Zero on Sunday and Monday, at most 5 on Friday. Saturday's load is the
  # organized calendar's, so the home program spends nothing.
  HIE_CEILING = { "sun" => 0, "mon" => 0, "fri" => 5, "sat" => 0 }.freeze

  belongs_to :week
  belongs_to :day_role, optional: true
  has_many :day_blocks, -> { order(:position) }, dependent: :destroy
  has_many :coach_entries, dependent: :nullify
  has_many :athlete_entries, dependent: :nullify

  validates :date, :dow, :name, :minutes, presence: true
  validates :intensity, inclusion: { in: 1..4 }
  validates :hie, numericality: { greater_than_or_equal_to: 0 }
  validate  :respects_the_day_ceiling
  validate  :falls_on_the_weekday_it_claims

  def full_card? = day_blocks.any?

  private

  def respects_the_day_ceiling
    ceiling = HIE_CEILING[dow]
    return if ceiling.nil? || hie.to_i <= ceiling
    errors.add(:hie, "on #{dow} may be at most #{ceiling}")
  end

  def falls_on_the_weekday_it_claims
    return if date.blank? || date.strftime("%a").downcase == dow
    errors.add(:dow, "says #{dow} but #{date} is a #{date.strftime('%a').downcase}")
  end
end
