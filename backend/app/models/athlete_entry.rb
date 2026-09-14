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

  # Scoped to the entries that are still his, the same condition the partial
  # unique index carries: a day he deleted is free to be written about again,
  # and the deleted row keeps its own words rather than being overwritten.
  validates :session_date, presence: true,
            uniqueness: { scope: %i[user_id program_year_id],
                          conditions: -> { where(deleted_at: nil) } }
  validates :felt, inclusion: { in: 1..5 }, allow_nil: true
  validates :best, :hard, :note, length: { maximum: 2000 }

  # THE ONE PLACE A DELETED ENTRY IS EXCLUDED, for this model.
  #
  # A delete stamps deleted_at rather than removing the row, so every read
  # path has to say so. They all say it through this: the Pundit scope (which
  # is what the API and the week payload both read through) and DocsExporter.
  # Nothing writes `where(deleted_at: nil)` beside this, for the same reason
  # `shared` has exactly one home: two filters for one rule drift, and this
  # project has found that defect three times.
  scope :kept, -> { where(deleted_at: nil) }

  scope :shared_with_coach, -> { where(shared: true) }

  def deleted? = deleted_at.present?

  # Soft delete. Jeff's ruling, in one line: the row stays, the words stay,
  # and the column is what every read path checks.
  def soft_delete! = update!(deleted_at: Time.current)

  # Wrapped in a transaction for the same reason as CoachEntry.upsert_for:
  # the write the Phase 2 offline queue replays has to be all or nothing.
  def self.upsert_for(user:, program_year:, session_date:, attrs: {})
    transaction do
      # `kept`, so a day Teddy deleted and then wrote about again starts a
      # new row instead of reopening the deleted one and painting over the
      # words it was promised it would keep.
      entry = kept.find_or_initialize_by(user: user, program_year: program_year, session_date: session_date)
      entry.athlete ||= program_year.athlete
      entry.day_card ||= DayCard.joins(week: :month_plan)
                                .where(month_plans: { program_year_id: program_year.id })
                                .find_by(date: session_date)
      entry.assign_attributes(attrs)
      entry.save!
      entry
    end
  end
end
