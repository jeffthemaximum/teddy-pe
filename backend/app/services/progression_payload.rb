# Everything that crosses a year boundary. This is the endpoint the schema was
# shaped for: a single year of plans could have stayed in a JSON file, but rank
# history, a battery charted across every year, height over time and drill
# mastery could not.
#
# Battery measures join across years on test_id, the way areas join on slug.
class ProgressionPayload
  def initialize(athlete, user:)
    @athlete = athlete
    @user = user
  end

  def as_json(*)
    { years: years, ranks: ranks, battery: battery, height: height, drills: drills }
  end

  private

  def program_years
    @program_years ||= ProgramYear.where(athlete: @athlete).order(:starts_on).to_a
  end

  def year_labels
    @year_labels ||= program_years.to_h { |y| [ y.id, y.label ] }
  end

  def years
    program_years.map { |y| { id: y.id, label: y.label, starts_on: y.starts_on, ends_on: y.ends_on, status: y.status } }
  end

  def ranks
    RankAward.where(athlete: @athlete).includes(:block).chronological.map do |a|
      { block_key: a.block.key, block_name: a.block.name, awarded_on: a.awarded_on,
        patch_count: a.patch_count, year_label: year_labels[a.program_year_id] }
    end
  end

  def results
    @results ||= TestResult.where(athlete: @athlete)
                           .includes(:test_date, :battery_measure)
                           .sort_by { |r| [ r.test_date.window, r.id ] }
  end

  # Growth (height) is excluded here by direction, the same test that
  # selects it below, so a second growth measure moves with both sections
  # rather than silently vanishing from one.
  def battery
    results.reject { |r| r.battery_measure.direction == "growth" }
           .group_by { |r| r.battery_measure.test_id }
           .map { |test_id, rows| measure_card(test_id, rows) }
           .sort_by { |card| card[:position] }
           .each { |card| card.delete(:position) }
  end

  def measure_card(test_id, rows)
    measure = rows.last.battery_measure

    { test_id: test_id, label: measure.label, unit: measure.unit, direction: measure.direction,
      position: measure.position,
      first: rows.first.numeric_value&.to_s, latest: rows.last.numeric_value&.to_s,
      change: measure.improvement_from(rows.first.numeric_value, rows.last.numeric_value)&.to_s,
      series: rows.map { |r| point(r) } }
  end

  def height
    rows = results.select { |r| r.battery_measure.direction == "growth" }
    return { series: [], cm_per_year: nil } if rows.empty?

    { series: rows.map { |r| point(r) }, cm_per_year: TestResult.cm_per_year(rows) }
  end

  def point(result)
    { window: result.test_date.window, value: result.numeric_value&.to_s,
      recorded_at: result.recorded_at, year_label: year_labels[result.program_year_id] }
  end

  # Mastery comes out of the coach's journal, so a viewer gets none of it.
  def drills
    return [] unless @user&.coach? || @user&.athlete?

    DrillRating.where(program_year_id: program_years.map(&:id))
               .includes(:drill).order(:session_date)
               .group_by { |r| r.drill.slug }
               .map do |slug, rows|
                 { slug: slug, name: rows.first.drill.name, latest: rows.last.rating,
                   history: rows.map { |r| { session_date: r.session_date, rating: r.rating,
                                             year_label: year_labels[r.program_year_id] } } }
               end
               .sort_by { |d| d[:name] }
  end
end
