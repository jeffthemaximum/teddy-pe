class TestDate < ApplicationRecord
  belongs_to :program_year

  validates :window, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :display, presence: true
  # Required here rather than in the column, so the migration can land on
  # production one release ahead of the seed that fills the five rows it
  # finds there. See the migration for the ordering.
  validates :starts_on, :ends_on, presence: true
  validate :ends_on_is_not_before_starts_on

  private

  def ends_on_is_not_before_starts_on
    return if starts_on.blank? || ends_on.blank?
    return if ends_on >= starts_on
    errors.add(:ends_on, "cannot be before starts_on")
  end
end
