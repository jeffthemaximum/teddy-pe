class BallGate < ApplicationRecord
  STATUSES = %w[cleared active held].freeze

  belongs_to :program_year

  validates :from_ball, :to_ball, :label, :requirement, presence: true
  validates :status, inclusion: { in: STATUSES }
end
