class TestDate < ApplicationRecord
  belongs_to :program_year

  validates :window, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :display, presence: true
end
