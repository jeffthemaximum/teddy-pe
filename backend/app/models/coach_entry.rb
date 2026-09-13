class CoachEntry < ApplicationRecord
  belongs_to :user
  belongs_to :athlete
  belongs_to :program_year
  belongs_to :day_card, optional: true
  has_many :drill_ratings, dependent: :destroy

  validates :session_date, presence: true,
            uniqueness: { scope: %i[user_id program_year_id] }
  validates :overall, :energy, inclusion: { in: 1..5 }, allow_nil: true
  validates :note, :pain_note, length: { maximum: 2000 }

  scope :between, ->(from, to) { where(session_date: from..to) }
  scope :flagged, -> { where(flag_pain: true) }

  # Addressed by (author, year, date), so a second device and a replayed
  # offline write both land on the same row.
  def self.upsert_for(user:, program_year:, session_date:, attrs: {}, ratings: nil)
    entry = find_or_initialize_by(user: user, program_year: program_year, session_date: session_date)
    entry.athlete ||= program_year.athlete
    entry.day_card ||= DayCard.joins(week: :month_plan)
                              .where(month_plans: { program_year_id: program_year.id })
                              .find_by(date: session_date)
    entry.assign_attributes(attrs)
    entry.save!
    entry.replace_ratings!(ratings) unless ratings.nil?
    entry
  end

  # A rating that is sent replaces what was there. A drill left out of the
  # payload keeps whatever it had, so a partly filled form loses nothing.
  def replace_ratings!(ratings)
    ratings.each do |slug, rating|
      drill = Drill.find_by(slug: slug) or next
      record = drill_ratings.find_or_initialize_by(drill: drill)
      record.assign_attributes(rating: rating, program_year: program_year, session_date: session_date)
      record.save!
    end
  end
end
