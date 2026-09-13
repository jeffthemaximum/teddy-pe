# Loads backend/content/ into Postgres. Idempotent: every row is addressed by
# a natural key, so a second run updates in place rather than duplicating.
#
# The repo owns the program. Postgres owns what Jeff and Teddy generate. This
# is the one place the two meet.
class ContentSeeder
  class MissingContent < StandardError; end

  attr_reader :year_label, :counts, :year

  def initialize(year_label:, root: Rails.root.join("content/program_years"))
    @year_label = year_label
    @dir = root.join(year_label)
    @counts = Hash.new(0)
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
      tests = seed_battery_tests(program.fetch("battery_tests"))
      seed_battery_measures(program.fetch("battery_measures"), tests)
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

      row.fetch("cells").each do |block_key, body|
        block = blocks[block_key] or raise MissingContent, "area #{area.slug} names unknown block #{block_key}"
        upsert(AreaCell, { area: area, block: block }, { body: body })
      end

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
    rows.each do |row|
      # The gate is identified by the progression it guards, not by where it
      # happens to sit in the file. Keying on position meant reordering the
      # list wrote one gate's requirement onto another gate's row.
      upsert(year.ball_gates,
             row.slice("from_ball", "to_ball"),
             row.slice("position", "label", "requirement", "status"))
    end
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

  def seed_battery_tests(rows)
    rows.to_h do |row|
      # The test is identified by its name, not by where it sits in the file.
      # Keying on position would repeat the ball-gates mistake: reordering the
      # battery would silently write one protocol's description onto another
      # test's row, on the table a later chart reads direction from.
      test = upsert(year.battery_tests, { name: row.fetch("name") },
                    row.slice("position", "protocol", "area_name", "unit"))
      [ row.fetch("position"), test ]
    end
  end

  def seed_battery_measures(rows, tests)
    rows.each do |row|
      position = row["battery_test_position"]
      test = position && (tests[position] or raise MissingContent,
        "measure #{row['test_id']} names unknown battery test #{position}")
      upsert(year.battery_measures, { test_id: row.fetch("test_id") },
             row.slice("position", "label", "unit", "direction").merge("battery_test" => test))
    end
  end
end
