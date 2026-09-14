class PatchAward < ApplicationRecord
  belongs_to :athlete
  belongs_to :program_year
  belongs_to :patch

  validates :awarded_on, presence: true
  validates :patch_id, uniqueness: { scope: :athlete_id }
end
