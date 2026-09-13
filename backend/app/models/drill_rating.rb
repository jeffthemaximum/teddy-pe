class DrillRating < ApplicationRecord
  RATINGS = %w[not_yet getting owns].freeze

  belongs_to :coach_entry
  belongs_to :drill
  belongs_to :program_year

  validates :rating, inclusion: { in: RATINGS }
  validates :drill_id, uniqueness: { scope: :coach_entry_id }

  # The whole reason this left jsonb: mastery across every year, for one drill.
  scope :for_drill, ->(slug) { joins(:drill).where(drills: { slug: slug }).order(:session_date) }

  # Three "owns it" in a row progresses or retires a drill. Three "not yet" in
  # a row drops it to an easier entry point. The diary proposes, never edits.
  def self.streak(slug, rating, length: 3)
    for_drill(slug).last(length).then { |rows| rows.size == length && rows.all? { |r| r.rating == rating } }
  end
end
