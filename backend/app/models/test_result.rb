class TestResult < ApplicationRecord
  belongs_to :program_year
  belongs_to :athlete
  belongs_to :test_date
  belongs_to :battery_measure
  belongs_to :recorded_by_user, class_name: "User"

  validates :raw_value, presence: true
  validate  :has_a_digit_in_it

  before_validation :parse_the_number
  before_validation { self.recorded_at ||= Time.current }

  scope :for_measure, ->(measure) { where(battery_measure: measure) }

  def self.upsert_for(program_year:, test_date:, battery_measure:, value:, user:)
    record = find_or_initialize_by(program_year: program_year, test_date: test_date,
                                   battery_measure: battery_measure)
    record.assign_attributes(athlete: program_year.athlete, recorded_by_user: user,
                             raw_value: value.to_s.strip, recorded_at: Time.current)
    record.save!
    record
  end

  # Growth pace in centimetres a year, from the windows the measurements were
  # taken in rather than when they were typed. Two heights measured three
  # months apart can be entered in one sitting, so recorded_at times data
  # entry. A fast pace is the trigger for halving jumping and sprinting for 8
  # to 12 weeks, so it has to come from the right clock.
  #
  # Returns nil on a non-positive span: nothing forces a test date's position
  # to agree with the calendar, and a misordered pair produced a negative
  # pace that read as shrinking and suppressed the trigger.
  def self.cm_per_year(rows)
    return nil if rows.size < 2

    first, last = rows.first, rows.last
    days = (window_date(last) - window_date(first)).to_i
    return nil if days <= 0

    ((last.numeric_value - first.numeric_value) / days * 365.25).to_f.round(1)
  end

  def self.window_date(result)
    Date.strptime(result.test_date.window, "%Y-%m")
  end

  private

  # Kept as text, parsed where possible. "15 to 18" stores as typed and charts
  # at 15, which beats refusing the entry or losing the range.
  def parse_the_number
    self.numeric_value = raw_value.to_s[/-?\d+(?:\.\d+)?/]&.to_d
  end

  def has_a_digit_in_it
    return if raw_value.to_s.match?(/\d/)
    errors.add(:raw_value, "needs at least one digit")
  end
end
