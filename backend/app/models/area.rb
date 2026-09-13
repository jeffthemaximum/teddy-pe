class Area < ApplicationRecord
  belongs_to :program_year
  has_many :area_cells, dependent: :destroy
  has_many :patches, dependent: :destroy

  validates :slug, :name, :position, presence: true
  validates :slug, uniqueness: { scope: :program_year_id }
end
