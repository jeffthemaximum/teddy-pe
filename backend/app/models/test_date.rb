class TestDate < ApplicationRecord
  belongs_to :program_year

  validates :window, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :display, presence: true
  # Required here rather than in the column, so the migration can land on
  # production one release ahead of the seed that fills the five rows it
  # finds there. See the migration for the ordering.
  validates :starts_on, :ends_on, presence: true
  validate :ends_on_is_not_before_starts_on

  # The `display` column's one author. It used to be hand-written in
  # program.yml beside the dates it describes, so a date edit that missed
  # the prose left the two disagreeing with nothing to notice.
  #
  # The separators differ on purpose. A window inside one month reads as one
  # span ("Sep 15–17"), so the en dash is tight. A window that crosses a
  # month reads as two dates, so it gets spaces. Both use an en dash
  # (U+2013), which is what the content has always used.
  def self.display_for(starts_on, ends_on)
    return starts_on.strftime("%b %-d") if starts_on == ends_on
    if starts_on.year == ends_on.year && starts_on.month == ends_on.month
      "#{starts_on.strftime('%b %-d')}–#{ends_on.day}"
    else
      "#{starts_on.strftime('%b %-d')} – #{ends_on.strftime('%b %-d')}"
    end
  end

  private

  def ends_on_is_not_before_starts_on
    return if starts_on.blank? || ends_on.blank?
    return if ends_on >= starts_on
    errors.add(:ends_on, "cannot be before starts_on")
  end
end
