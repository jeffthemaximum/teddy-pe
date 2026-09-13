#!/usr/bin/env ruby
# One-shot conversion of the legacy data/*.json into backend/content/.
# Deleted in Phase 3 with the rest of the old pipeline. Run from backend/:
#   bundle exec ruby script/convert_legacy_content.rb
require "json"
require "yaml"
require "date"
require "fileutils"

ROOT    = File.expand_path("../..", __dir__)
LEGACY  = File.join(ROOT, "data")
OUT     = File.expand_path("../content/program_years/2026-27", __dir__)

program = JSON.parse(File.read(File.join(LEGACY, "program.json")))
drills  = JSON.parse(File.read(File.join(LEGACY, "drills.json")))
plan    = JSON.parse(File.read(File.join(LEGACY, "plans/2026-09.json")))

# Areas carry no slug in the legacy data. These are the nine, in order.
AREA_SLUGS = {
  "Speed & Acceleration"  => "speed",
  "Power & Landing"       => "power",
  "Coordination & Balance" => "coordination",
  "Strength & Resilience" => "strength",
  "Throw & Catch"         => "throw",
  "Tennis"                => "tennis",
  "Basketball"            => "basketball",
  "Soccer"                => "soccer",
  "Compete & Mindset"     => "mindset"
}.freeze

# Patch labels are shortened versions of the area names, so they need an
# explicit mapping rather than a fuzzy match.
PATCH_AREA = {
  "Speed" => "speed", "Power & Landing" => "power", "Coordination" => "coordination",
  "Strength" => "strength", "Throw & Catch" => "throw", "Tennis" => "tennis",
  "Basketball" => "basketball", "Soccer" => "soccer", "Compete & Mindset" => "mindset"
}.freeze

DOW = %w[mon tue wed thu fri sat sun].freeze
MONTH_ABBR = %w[Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec]
  .each_with_index.to_h { |m, i| [ m, i + 1 ] }.freeze

# sheetRows is the 15 recordable rows. Map each to the battery test it belongs
# to by position; height belongs to none.
MEASURE_TEST = {
  "t1" => 1, "t2" => 2, "t3r" => 3, "t3l" => 3, "t4r" => 4, "t4l" => 4,
  "t5" => 5, "t6" => 6, "t7" => 7, "t8" => 8, "t9" => 9, "t10" => 10,
  "t11r" => nil, "t11l" => nil, "h" => nil
}.freeze

def die(message)
  warn "convert: #{message}"
  exit 1
end

blocks = program["blocks"].each_with_index.map do |b, i|
  { "key" => b["k"], "name" => b["name"], "position" => i + 1,
    "starts_on" => b["start"], "ends_on" => b["end"], "focus" => b["focus"] }
end
block_keys = blocks.map { |b| b["key"] }

areas = program["areas"].each_with_index.map do |a, i|
  slug = AREA_SLUGS.fetch(a["n"]) { die("unknown area #{a['n']}") }
  cells = program["cells"][i]
  die("area #{slug} has #{cells.size} cells, expected #{block_keys.size}") unless cells.size == block_keys.size
  { "slug" => slug, "position" => i + 1, "name" => a["n"], "summary" => a["s"],
    "cells" => block_keys.zip(cells).to_h }
end

# The authored patches are the Cub rank's nine. Later ranks are written when
# their block is planned.
patches = program["patches"].map do |(label, requirement)|
  { "block" => "cub", "area" => PATCH_AREA.fetch(label) { die("unknown patch area #{label}") },
    "name" => label, "requirement" => requirement }
end

ball_gates = program["gates"].each_with_index.map do |(from, to, label, requirement, status), i|
  { "position" => i + 1, "from_ball" => from, "to_ball" => to,
    "label" => label, "requirement" => requirement, "status" => status }
end

battery_tests = program["battery"].each_with_index.map do |(name, protocol, area_name, unit), i|
  { "position" => i + 1, "name" => name, "protocol" => protocol,
    "area_name" => area_name, "unit" => unit }
end

measures = program["sheetRows"].each_with_index.map do |(label, unit, test_id, direction), i|
  die("sheetRow #{test_id} is not mapped") unless MEASURE_TEST.key?(test_id)
  { "test_id" => test_id, "position" => i + 1, "label" => label, "unit" => unit,
    "direction" => direction, "battery_test_position" => MEASURE_TEST[test_id] }
end

test_dates = program["testDates"].each_with_index.map do |(window, label, display), i|
  { "window" => window, "label" => label, "display" => display, "position" => i + 1 }
end

day_roles = program["roles"].each_with_index.map do |(dow, name, _org, minutes, intensity, note), i|
  { "dow" => dow.downcase, "position" => i, "name" => name,
    "organized" => program["org"].fetch(dow), "minutes" => minutes,
    "intensity" => intensity, "note" => note }
end

File.write(File.join(OUT, "program.yml"), {
  "athlete" => { "name" => "Teddy Maxim", "birthday" => "2019-01-09" },
  "program_year" => {
    "label" => "2026-27", "starts_on" => blocks.first["starts_on"],
    "ends_on" => blocks.last["ends_on"], "status" => "active",
    "ball_now" => program["ballNow"], "rank_rule" => program["rankRule"],
    "north_star" => program["northStar"]
  },
  "blocks" => blocks, "areas" => areas, "patches" => patches,
  "ball_gates" => ball_gates, "battery_tests" => battery_tests,
  "battery_measures" => measures, "test_dates" => test_dates, "day_roles" => day_roles
}.to_yaml)

File.write(File.join(OUT, "drills.yml"), {
  "drills" => drills.map do |slug, d|
    { "slug" => slug, "name" => d["name"], "area_name" => d["area"],
      "aliases" => d["aliases"] || [], "short" => d["short"], "how" => d["how"],
      "watch" => d["watch"], "cue" => d["cue"], "video" => d["video"] }
  end
}.to_yaml)

# ---- the month plan -------------------------------------------------------
# A day is written twice in the legacy file: a compact entry in weeks[].days
# and, for the current week only, a full card in cards.days. They are merged
# into one day here, and the converter fails if their names disagree.
plan_year, plan_month = plan["month"].split("-").map(&:to_i)
role_by_dow = day_roles.to_h { |r| [ r["dow"], r ] }

full_cards = plan["cards"]["days"].to_h do |d|
  abbr, dnum = d["date"].split
  mm = MONTH_ABBR.fetch(abbr)
  yyyy = plan_year + (mm < plan_month ? 1 : 0)
  [ Date.new(yyyy, mm, dnum.to_i).iso8601, d ]
end

weeks = plan["weeks"].map do |w|
  days = w["days"].map do |(dow, dnum, name, lines)|
    date = Date.new(plan_year, plan_month, dnum).iso8601
    role = role_by_dow.fetch(dow.downcase)
    card = full_cards[date]
    if card && card["name"] != name
      # The legacy data disagrees with itself on exactly one day. Saturday's
      # week-list entry reuses the day role's name ("Game Day") as a
      # placeholder, because the home program is off, while the full card names
      # the organized sport ("Soccer · Lacrosse · Tennis"). The full card wins:
      # the role is already carried separately, so the week list was repeating
      # it rather than naming the day.
      #
      # Any other disagreement is real drift between two copies of the same day
      # and still stops the conversion.
      unless name == role["name"]
        die("#{date} is named '#{name}' in the week list and '#{card['name']}' on the card")
      end
      warn "note: #{date} takes its name from the card ('#{card['name']}') rather than the week list placeholder ('#{name}')"
      name = card["name"]
    end
    day = { "dow" => dow.downcase, "date" => date, "name" => name,
            "role" => role["name"], "minutes" => role["minutes"],
            "intensity" => role["intensity"], "summary_lines" => lines }
    if card
      day["minutes"]  = card["mins"]
      day["intensity"] = card["level"]
      day["dad_note"] = card["dad"]
      day["blocks"] = card["blocks"].map do |(mins, bname, body, tag)|
        { "minutes" => mins, "name" => bname, "body" => body,
          "tag" => { "test" => "test", "ch" => "challenge" }[tag] }
      end
    end
    day
  end

  { "number" => w["n"], "position_in_block" => w["n"], "theme" => w["theme"],
    "dates_display" => w["dates"], "trials" => w["theme"].downcase.include?("trials"),
    "targets" => w["targets"], "challenge" => w["challenge"], "days" => days }
end

FileUtils.mkdir_p(File.join(OUT, "plans"))
File.write(File.join(OUT, "plans", "#{plan['month']}.yml"), {
  "month_plan" => { "month" => plan["month"], "block" => plan["block"],
                    "label" => plan["label"], "range_display" => plan["range"] },
  "weeks" => weeks
}.to_yaml)

puts "wrote program.yml (#{areas.size} areas, #{blocks.size} blocks, #{measures.size} measures)"
puts "wrote drills.yml (#{drills.size} drills)"
puts "wrote plans/#{plan['month']}.yml (#{weeks.size} weeks, #{weeks.sum { |w| w['days'].size }} days)"
