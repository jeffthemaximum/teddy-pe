class Athlete < ApplicationRecord
  belongs_to :user, optional: true
  has_many :program_years, dependent: :destroy

  validates :name, presence: true
  validates :birthday, presence: true

  def age_on(date)
    years = date.year - birthday.year
    date < birthday + years.years ? years - 1 : years
  end
end
