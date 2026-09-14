class AreaCell < ApplicationRecord
  belongs_to :area
  belongs_to :block
  validates :body, presence: true
end
