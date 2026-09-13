class MonthPlan < ApplicationRecord
  belongs_to :program_year
  belongs_to :block
  has_many :weeks, -> { order(:number) }, dependent: :destroy

  validates :month, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :range_display, presence: true
end
