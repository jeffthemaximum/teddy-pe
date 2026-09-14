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

  # One ordering for every series this app draws or summarises.
  #
  # The Year tab used to sort by test_date.position and the Progression tab by
  # window, and both then asked cm_per_year for a growth pace, which depends
  # entirely on which row comes first. The two agreed only because the 2026-27
  # windows happen to run in the same order as their positions. Author one test
  # date out of position and the Year tab said null while Progression said a
  # number, about the figure that triggers halving jumping and sprinting for 8
  # to 12 weeks.
  #
  # The window is the clock the measurement was taken on, so the window leads.
  # position breaks a tie inside one window and id breaks a tie after that, so
  # the order is total and does not shuffle between two calls.
  def self.chronological(rows)
    rows.sort_by { |r| [ r.test_date.window, r.test_date.position, r.id ] }
  end

  # First, latest, direction of travel and growth pace over one measure's rows.
  # Both payloads call this and differ only in the names they publish it under.
  # cm_per_year is present for a growth measure and absent for every other, so
  # a caller cannot accidentally report a centimetres-a-year figure for a
  # sprint time.
  def self.summarise(rows, measure)
    ordered = chronological(rows)
    first, last = ordered.first, ordered.last

    summary = { rows: ordered, first: first&.numeric_value, latest: last&.numeric_value,
                change: measure.improvement_from(first&.numeric_value, last&.numeric_value) }
    return summary unless measure.direction == "growth"

    summary.merge(cm_per_year: cm_per_year(ordered))
  end

  # Growth pace in centimetres a year, from the windows the measurements were
  # taken in rather than when they were typed. Two heights measured three
  # months apart can be entered in one sitting, so recorded_at times data
  # entry. A fast pace is the trigger for halving jumping and sprinting for 8
  # to 12 weeks, so it has to come from the right clock.
  #
  # Returns nil on a non-positive span. Callers reach this through summarise,
  # which orders the rows first, so a nil here now means two measurements in
  # one window rather than a pair read backwards.
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
