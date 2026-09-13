class DayBlock < ApplicationRecord
  TAGS = %w[test challenge].freeze

  belongs_to :day_card

  validates :minutes, :name, presence: true
  validates :tag, inclusion: { in: TAGS }, allow_nil: true

  scope :tests,      -> { where(tag: "test") }
  scope :challenges, -> { where(tag: "challenge") }
end
