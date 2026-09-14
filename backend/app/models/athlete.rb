class Athlete < ApplicationRecord
  belongs_to :user, optional: true
  has_many :program_years, dependent: :destroy
  has_many :patch_awards, dependent: :destroy
  has_many :rank_awards, dependent: :destroy
  has_many :test_results, dependent: :destroy

  validates :name, presence: true
  validates :birthday, presence: true
  validates :slug, presence: true, uniqueness: true

  def age_on(date)
    years = date.year - birthday.year
    date < birthday + years.years ? years - 1 : years
  end
end
