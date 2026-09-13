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
      current_week_id: Week.current(@year, on: @on)&.id
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
      end
    }
  end

  def test_dates
    @year.test_dates.map do |d|
      { id: d.id, window: d.window, label: d.label, display: d.display, position: d.position }
    end
  end

  def day_roles
    @year.day_roles.map do |r|
      { dow: r.dow, position: r.position, name: r.name, organized: r.organized,
        minutes: r.minutes, intensity: r.intensity, note: r.note }
    end
  end
end
