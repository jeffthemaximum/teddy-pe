class Block < ApplicationRecord
  belongs_to :program_year
  has_many :area_cells, dependent: :destroy
  has_many :patches, dependent: :destroy

  validates :key, :name, :position, :starts_on, :ends_on, presence: true
  validates :key, uniqueness: { scope: :program_year_id }

  def current?(on: Date.current) = starts_on <= on && ends_on >= on
end
