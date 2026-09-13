class Patch < ApplicationRecord
  belongs_to :program_year
  belongs_to :block
  belongs_to :area

  validates :name, :requirement, presence: true
end
