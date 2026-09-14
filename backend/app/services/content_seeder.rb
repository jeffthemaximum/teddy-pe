# Loads backend/content/ into Postgres. Idempotent: every row is addressed by
# a natural key, so a second run updates in place rather than duplicating.
#
# The repo owns the program. Postgres owns what Jeff and Teddy generate. This
# is the one place the two meet.
#
# Pruning, and where it stops.
#
# fly.toml runs content:seed as the release command on every deploy, so "edit
# the YAML and deploy" is the only way a content change reaches production.
# That road used to run one way. Every write was find_or_initialize_by plus
# save!, nothing anywhere called destroy, so deleting a day block from the
# YAML left the row in Postgres forever, in every payload and in the exported
# docs. Content gets edited by deletion as often as by addition.
#
# What is pruned, inside the year being seeded and nowhere else: month plans,
# weeks, day cards, day blocks, area cells and ball gates. A seeded row this
# run's YAML does not have is gone.
#
# What is not, and why. Blocks, areas, patches, test dates, drills, battery
# tests and battery measures each have a row of Jeff's or Teddy's pointing at
# them: rank awards, patch awards, test results and drill ratings. A battery
# measure declares dependent: :destroy on its test results, so pruning one
# would delete Teddy's numbers on the strength of a YAML edit. None of that is
# content and no YAML file gets to remove it. Those tables are left alone on
# purpose. Deleting one of those rows is a migration Jeff writes, looks at,
# and runs on its own.
#
# Day cards are the one prune that touches Teddy's side at all, and only to
# let go: DayCard declares dependent: :nullify on both journals, so removing a
# day the YAML no longer has nullifies the entry's day_card_id and leaves
# everything he wrote where it is. Nothing reads an entry by day_card_id. The
# API addresses entries by (user, year, session_date) and the week payload by
# session_date, so a nullified entry still reads back on its own day, and the
# next write to that date relinks it. There is a spec for exactly this.
class ContentSeeder
  class MissingContent < StandardError; end

  attr_reader :year_label, :counts, :year, :bare, :pruned

  def initialize(year_label:, root: Rails.root.join("content/program_years"))
    @year_label = year_label
    @dir = root.join(year_label)
    @counts = Hash.new(0)
    @pruned = Hash.new(0)
    @bare = []
    raise MissingContent, "no content at #{@dir}" unless File.directory?(@dir)
  end

  def seed!
    ActiveRecord::Base.transaction do
      program = load_yaml("program.yml")
      athlete = seed_athlete(program.fetch("athlete"))
      @year   = seed_year(athlete, program.fetch("program_year"))
      blocks  = seed_blocks(program.fetch("blocks"))
      areas   = seed_areas(program.fetch("areas"), blocks)
      seed_patches(program.fetch("patches"), blocks, areas)
      seed_ball_gates(program.fetch("ball_gates"))
      seed_test_dates(program.fetch("test_dates"))
      seed_day_roles(program.fetch("day_roles"))
      seed_drills(load_yaml("drills.yml").fetch("drills"))
      tests = seed_battery_tests(program.fetch("battery_tests"))
      seed_battery_measures(program.fetch("battery_measures"), tests)
      seed_plans(blocks)
    end
    counts
  end

  private

  def load_yaml(name)
    path = @dir.join(name)
    raise MissingContent, "no #{name} at #{path}" unless File.exist?(path)
    YAML.load_file(path, permitted_classes: [ Date ])
  end

  def track(record) = @counts[record.class.table_name] += 1

  def upsert(scope, finder, attrs)
    record = scope.find_or_initialize_by(finder)
    record.assign_attributes(attrs)
    record.save!
    track(record)
    record
  end

  # Everything in scope that this run did not write. destroy_all rather than
  # delete_all, because the dependent: options on these models are the whole
  # safety story: a week takes its day cards, a day card takes its day blocks
  # and lets go of the journal entries pointing at it. delete_all would skip
  # all of that and hit the foreign keys, which are NO ACTION.
  def prune(scope, kept_ids)
    doomed = scope.where.not(id: kept_ids)
    return if doomed.empty?

    @pruned[scope.model.table_name] += doomed.count
    doomed.destroy_all
  end

  def seed_athlete(attrs)
    upsert(Athlete, { slug: attrs.fetch("slug") },
           attrs.slice("name", "birthday"))
  end

  def seed_year(athlete, attrs)
    upsert(ProgramYear, { athlete: athlete, label: attrs.fetch("label") },
           attrs.slice("starts_on", "ends_on", "status", "ball_now", "rank_rule", "north_star"))
  end

  def seed_blocks(rows)
    rows.to_h do |row|
      block = upsert(year.blocks, { key: row.fetch("key") },
                     row.slice("name", "position", "starts_on", "ends_on", "focus"))
      [ row.fetch("key"), block ]
    end
  end

  def seed_areas(rows, blocks)
    rows.to_h do |row|
      area = upsert(year.areas, { slug: row.fetch("slug") }, row.slice("position", "name", "summary"))

      cells = row.fetch("cells").map do |block_key, body|
        block = blocks[block_key] or raise MissingContent, "area #{area.slug} names unknown block #{block_key}"
        upsert(AreaCell, { area: area, block: block }, { body: body })
      end
      # A cell for a block this area no longer covers. Nothing references a
      # cell, so it goes without taking anything with it.
      prune(AreaCell.where(area: area), cells.map(&:id))

      [ row.fetch("slug"), area ]
    end
  end

  def seed_patches(rows, blocks, areas)
    rows.each do |row|
      block = blocks[row.fetch("block")] or raise MissingContent, "patch names unknown block #{row['block']}"
      area  = areas[row.fetch("area")]   or raise MissingContent, "patch names unknown area #{row['area']}"
      upsert(Patch, { block: block, area: area },
             { program_year: year, name: row.fetch("name"), requirement: row.fetch("requirement") })
    end
  end

  def seed_ball_gates(rows)
    gates = rows.map do |row|
      # The gate is identified by the progression it guards, not by where it
      # happens to sit in the file. Keying on position meant reordering the
      # list wrote one gate's requirement onto another gate's row.
      upsert(year.ball_gates,
             row.slice("from_ball", "to_ball"),
             row.slice("position", "label", "requirement", "status"))
    end
    # Nothing references a gate, so a progression dropped from the file goes.
    prune(year.ball_gates, gates.map(&:id))
  end

  def seed_test_dates(rows)
    rows.each do |row|
      upsert(year.test_dates, { window: row.fetch("window") }, row.slice("label", "display", "position"))
    end
  end

  def seed_day_roles(rows)
    rows.each do |row|
      upsert(year.day_roles, { dow: row.fetch("dow") },
             row.slice("position", "name", "organized", "minutes", "intensity", "note"))
    end
  end

  # Drills are global, so they are keyed on slug alone and never on the year.
  def seed_drills(rows)
    rows.each do |row|
      upsert(Drill, { slug: row.fetch("slug") },
             row.slice("name", "area_name", "aliases", "short", "how", "watch", "cue", "video"))
    end
  end

  def seed_battery_tests(rows)
    rows.to_h do |row|
      # The test is identified by its key, not by its name or by where it
      # sits in the file. The name is prose and gets reworded; keying on it,
      # or on position, would repeat the ball-gates mistake of silently
      # writing one protocol's description onto another test's row, on the
      # table a later chart reads direction from.
      test = upsert(year.battery_tests, { key: row.fetch("key") },
                    row.slice("position", "name", "protocol", "area_name", "unit"))
      [ row.fetch("key"), test ]
    end
  end

  def seed_battery_measures(rows, tests)
    rows.each do |row|
      key = row["battery_test_key"]
      test = key && (tests[key] or raise MissingContent,
        "measure #{row['test_id']} names unknown battery test #{key}")
      upsert(year.battery_measures, { test_id: row.fetch("test_id") },
             row.slice("position", "label", "unit", "direction").merge("battery_test" => test))
    end
  end

  def seed_plans(blocks)
    tokenizer = BodyTokenizer.new(Drill.terms)
    roles = year.day_roles.index_by(&:dow)

    plans = Dir[@dir.join("plans/*.yml")].sort.map do |path|
      doc = YAML.load_file(path, permitted_classes: [ Date ])
      seed_month_plan(doc, blocks, roles, tokenizer)
    end
    # A month whose file is gone. Its weeks and day cards go with it through
    # dependent: :destroy, and the journal entries on those days keep every
    # word, holding a nil day_card_id instead of a stale one.
    prune(year.month_plans, plans.map(&:id))
  end

  def seed_month_plan(doc, blocks, roles, tokenizer)
    attrs = doc.fetch("month_plan")
    block = blocks[attrs.fetch("block")] or
      raise MissingContent, "plan #{attrs['month']} names unknown block #{attrs['block']}"

    plan = upsert(MonthPlan, { program_year: year, month: attrs.fetch("month") },
                  attrs.slice("label", "range_display").merge("block" => block))

    weeks = doc.fetch("weeks").map do |row|
      week = upsert(plan.weeks, { number: row.fetch("number") },
                    row.slice("position_in_block", "theme", "dates_display", "targets", "challenge", "trials")
                       .merge("block" => block))
      seed_days(week, row.fetch("days"), roles, tokenizer)
      week
    end
    # A week dropped from the month. It survived in the month view before this.
    prune(plan.weeks, weeks.map(&:id))

    plan
  end

  def seed_days(week, rows, roles, tokenizer)
    cards = rows.each_with_index.map do |row, index|
      role = roles[row.fetch("dow")] or
        raise MissingContent, "#{row['date']} names unknown day role #{row['dow']}"

      card = upsert(week.day_cards, { date: row.fetch("date") },
                    { day_role: role, dow: row.fetch("dow"),
                      name: row.fetch("name"), minutes: row.fetch("minutes"),
                      intensity: row.fetch("intensity"), hie: row.fetch("hie"),
                      summary_lines: row.fetch("summary_lines", []),
                      dad_note: row["dad_note"], position: index, drill_slugs: [] })

      slugs = seed_blocks_for(card, row["blocks"] || [], tokenizer)
      card.update!(drill_slugs: slugs)
      card
    end
    # A day shortened out of the week. The old card was still counted by
    # Week#high_intent_efforts and still validated against the budget.
    prune(week.day_cards, cards.map(&:id))
  end

  # Returns the day's drill slugs in first-mention order, which is what the
  # journal's rating chips are built from.
  def seed_blocks_for(card, rows, tokenizer)
    day_slugs = []

    blocks = rows.each_with_index.map do |row, index|
      tokens = tokenizer.tokenize(name: row.fetch("name"), body: row["body"].to_s)
      block = upsert(card.day_blocks, { position: index },
                     { minutes: row.fetch("minutes"), name: row.fetch("name"), body: row["body"],
                       tag: row["tag"], name_tokens: tokens[:name_tokens],
                       body_tokens: tokens[:body_tokens], drill_slugs: tokens[:drill_slugs] })
      day_slugs |= tokens[:drill_slugs]
      block
    end
    # Day blocks are keyed on position, which is the one place the ball-gates
    # lesson could not be applied because a block has no natural key: a name is
    # prose and repeats. Every attribute is reassigned on every run, so a
    # reorder rewrites rows rather than moving them, and the only thing left
    # over is the tail. This is the tail.
    prune(card.day_blocks, blocks.map(&:id))

    # Blocks where nothing matched are the gaps to fill when the next month is
    # written. build.py printed this; so does the seeder.
    rows.each_with_index do |row, index|
      next unless card.day_blocks.find_by(position: index)&.drill_slugs&.empty?
      @bare << "#{card.dow} · #{row.fetch('name')}"
    end

    day_slugs
  end
end
