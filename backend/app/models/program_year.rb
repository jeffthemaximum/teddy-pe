class ProgramYear < ApplicationRecord
  STATUSES = %w[draft active archived].freeze

  belongs_to :athlete
  has_many :blocks,     -> { order(:position) }, dependent: :destroy
  has_many :areas,      -> { order(:position) }, dependent: :destroy
  has_many :patches,    dependent: :destroy
  has_many :ball_gates, -> { order(:position) }, dependent: :destroy
  has_many :test_dates, -> { order(:position) }, dependent: :destroy
  has_many :day_roles,  -> { order(:position) }, dependent: :destroy
  has_many :battery_tests,    -> { order(:position) }, dependent: :destroy
  has_many :battery_measures, -> { order(:position) }, dependent: :destroy
  has_many :month_plans, -> { order(:month) }, dependent: :destroy

  validates :label, presence: true, uniqueness: { scope: :athlete_id }
  validates :ball_now, presence: true
  validates :status, inclusion: { in: STATUSES }
  validate  :ends_after_it_starts

  scope :active, -> { where(status: "active") }

  # Nothing anywhere may assume there is one year. This takes a date, finds
  # the year containing it, and falls back to the newest active year.
  def self.current_for(athlete, on: Date.current)
    return nil if athlete.nil?
    scope = where(athlete: athlete)
    scope.where("starts_on <= ? and ends_on >= ?", on, on).order(starts_on: :desc).first ||
      scope.active.order(starts_on: :desc).first
  end

  def current_block(on: Date.current)
    blocks.find { |b| b.current?(on: on) }
  end

  private

  def ends_after_it_starts
    return if starts_on.blank? || ends_on.blank? || ends_on > starts_on
    errors.add(:ends_on, "must fall after the year starts")
  end
end
