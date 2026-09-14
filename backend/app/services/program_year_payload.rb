# The whole Year tab in one response.
#
# The Fly machine scales to zero, so the first request after an idle period
# already costs a wake-up. Splitting this into six endpoints would pay that
# latency six times over for a payload that is a few hundred rows.
class ProgramYearPayload
  def initialize(program_year, on: Date.current)
    @year = program_year
    @on = on
  end

  def as_json(*)
    {
      id: @year.id,
      label: @year.label,
      starts_on: @year.starts_on,
      ends_on: @year.ends_on,
      status: @year.status,
      ball_now: @year.ball_now,
      rank_rule: @year.rank_rule,
      north_star: @year.north_star,
      blocks: blocks,
      areas: areas,
      patches: patches,
      ball_gates: ball_gates,
      battery: battery,
      test_dates: test_dates,
      day_roles: day_roles,
      current_block_key: @year.current_block(on: @on)&.key,
      current_week_id: Week.current(@year, on: @on)&.id,
      patch_awards: @year.patch_awards.map { |a|
        { patch_id: a.patch_id, awarded_on: a.awarded_on, note: a.note } },
      rank_awards: @year.rank_awards.includes(:block).map { |a|
        { block_key: a.block.key, awarded_on: a.awarded_on, patch_count: a.patch_count } }
    }
  end

  private

  def blocks
    @year.blocks.map do |b|
      { key: b.key, name: b.name, position: b.position, starts_on: b.starts_on,
        ends_on: b.ends_on, focus: b.focus, current: b.current?(on: @on) }
    end
  end

  def areas
    cells = AreaCell.where(area: @year.areas).includes(:block).group_by(&:area_id)
    @year.areas.map do |a|
      { slug: a.slug, position: a.position, name: a.name, summary: a.summary,
        cells: (cells[a.id] || []).sort_by { |c| c.block.position }
                                  .map { |c| { block_key: c.block.key, body: c.body } } }
    end
  end

  # Patch carries no position of its own by design: it is identified by its
  # block and its area, not by where it sits in a list. Without an explicit
  # order here, @year.patches would return the nine in whatever order
  # Postgres hands them back, so the Year view sorts them by the area's own
  # position instead, giving a stable Speed-to-Mindset order every time.
  def patches
    @year.patches.includes(:block, :area).sort_by { |p| p.area.position }.map do |p|
      { id: p.id, block_key: p.block.key, area_slug: p.area.slug,
        name: p.name, requirement: p.requirement }
    end
  end

  def ball_gates
    @year.ball_gates.map do |g|
      { position: g.position, from_ball: g.from_ball, to_ball: g.to_ball,
        label: g.label, requirement: g.requirement, status: g.status }
    end
  end

  def battery
    {
      tests: @year.battery_tests.map do |t|
        { id: t.id, position: t.position, name: t.name, protocol: t.protocol,
          area_name: t.area_name, unit: t.unit }
      end,
      measures: @year.battery_measures.map do |m|
        { id: m.id, test_id: m.test_id, position: m.position, label: m.label,
          unit: m.unit, direction: m.direction, battery_test_id: m.battery_test_id }
      end,
      results: results.map { |r| { window: r.test_date.window, test_id: r.battery_measure.test_id,
                                   raw_value: r.raw_value, numeric_value: r.numeric_value&.to_s } },
      progress: progress
    }
  end

  # TestResult.chronological, the same ordering the Progression tab uses. The
  # two used to sort differently and could disagree about the growth pace.
  def results
    @results ||= TestResult.chronological(
      TestResult.where(program_year: @year).includes(:test_date, :battery_measure).to_a
    )
  end

  # One card per measure: latest value, change since baseline with the
  # direction applied, and a series for the sparkline. Fifteen tests in
  # different units on one axis would mean nothing, so they stay separate.
  #
  # The arithmetic is TestResult.summarise, shared with the Progression tab.
  # Only the names differ here: this view calls the first value the baseline.
  def progress
    by_measure = results.group_by(&:battery_measure_id)

    @year.battery_measures.map do |measure|
      summary = TestResult.summarise(by_measure[measure.id] || [], measure)

      card = {
        test_id: measure.test_id, label: measure.label, unit: measure.unit,
        direction: measure.direction,
        baseline: summary[:first]&.to_s,
        latest: summary[:latest]&.to_s,
        change: summary[:change]&.to_s,
        series: summary[:rows].map { |r| { window: r.test_date.window, value: r.numeric_value&.to_s } }
      }
      # Height reports a pace rather than a verdict. A fast one is the
      # trigger for the growth-load protocol: halve jumping and sprinting
      # for 8 to 12 weeks and double down on skill and mobility. summarise
      # carries cm_per_year only for a growth measure.
      summary.key?(:cm_per_year) ? card.merge(cm_per_year: summary[:cm_per_year]) : card
    end
  end

  def test_dates
    @year.test_dates.map do |d|
      { id: d.id, window: d.window, label: d.label, display: d.display,
        starts_on: d.starts_on&.iso8601, ends_on: d.ends_on&.iso8601,
        position: d.position }
    end
  end

  def day_roles
    @year.day_roles.map do |r|
      { dow: r.dow, position: r.position, name: r.name, organized: r.organized,
        minutes: r.minutes, intensity: r.intensity, note: r.note }
    end
  end
end
