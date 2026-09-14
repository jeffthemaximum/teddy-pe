class CoachEntry < ApplicationRecord
  belongs_to :user
  belongs_to :athlete
  belongs_to :program_year
  belongs_to :day_card, optional: true
  has_many :drill_ratings, dependent: :destroy

  validates :session_date, presence: true,
            uniqueness: { scope: %i[user_id program_year_id],
                          conditions: -> { where(deleted_at: nil) } }
  validates :overall, :energy, inclusion: { in: 1..5 }, allow_nil: true
  validates :note, :pain_note, length: { maximum: 2000 }

  # THE ONE PLACE A DELETED ENTRY IS EXCLUDED, for this model. Same rule and
  # same reasoning as AthleteEntry#kept: a delete stamps deleted_at, the row
  # and its words stay, and every read path checks this one scope rather than
  # writing its own copy of the condition.
  scope :kept, -> { where(deleted_at: nil) }

  scope :between, ->(from, to) { where(session_date: from..to) }
  scope :flagged, -> { where(flag_pain: true) }

  def deleted? = deleted_at.present?

  # The drill ratings are deliberately left alone. `dependent: :destroy` on
  # the association means a real destroy takes them with it; a soft delete
  # takes nothing, because the point is that the row keeps everything it
  # recorded. They leave the exported prose with their entry, since the
  # exporter reads ratings off entries it is writing.
  def soft_delete! = update!(deleted_at: Time.current)

  # Addressed by (author, year, date), so a second device and a replayed
  # offline write both land on the same row. Wrapped in a transaction so a
  # bad rating never leaves the entry saved with only some of its ratings:
  # the write the Phase 2 offline queue replays has to be all or nothing.
  def self.upsert_for(user:, program_year:, session_date:, attrs: {}, ratings: nil)
    transaction do
      # `kept`, for the same reason AthleteEntry.upsert_for is: a deleted
      # entry no longer owns its date, and reopening it would overwrite the
      # words a delete promised to keep.
      entry = kept.find_or_initialize_by(user: user, program_year: program_year, session_date: session_date)
      entry.athlete ||= program_year.athlete
      entry.day_card ||= DayCard.joins(week: :month_plan)
                                .where(month_plans: { program_year_id: program_year.id })
                                .find_by(date: session_date)
      entry.assign_attributes(attrs)
      entry.save!
      entry.replace_ratings!(ratings) unless ratings.nil?
      entry
    end
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
