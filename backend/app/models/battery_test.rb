class BatteryTest < ApplicationRecord
  belongs_to :program_year
  has_many :battery_measures, -> { order(:position) }, dependent: :nullify

  validates :name, :protocol, :area_name, :unit, :position, presence: true
  validates :name, uniqueness: { scope: :program_year_id }
end
