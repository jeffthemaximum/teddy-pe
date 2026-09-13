# Teddy's own reflection, in his own words. Different fields from the coach's
# entry, a different form, and a switch he controls.
#
# The Champion's Log stays on paper and never appears here. That notebook is
# his, and Dad reads it only when invited.
class AthleteEntry < ApplicationRecord
  belongs_to :user
  belongs_to :athlete
  belongs_to :program_year
  belongs_to :day_card, optional: true

  validates :session_date, presence: true,
            uniqueness: { scope: %i[user_id program_year_id] }
  validates :felt, inclusion: { in: 1..5 }, allow_nil: true
  validates :best, :hard, :note, length: { maximum: 2000 }

  scope :shared_with_coach, -> { where(shared: true) }

  def self.upsert_for(user:, program_year:, session_date:, attrs: {})
    entry = find_or_initialize_by(user: user, program_year: program_year, session_date: session_date)
    entry.athlete ||= program_year.athlete
    entry.day_card ||= DayCard.joins(week: :month_plan)
                              .where(month_plans: { program_year_id: program_year.id })
                              .find_by(date: session_date)
    entry.assign_attributes(attrs)
    entry.save!
    entry
  end
end
