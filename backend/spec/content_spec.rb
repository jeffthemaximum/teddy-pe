require "spec_helper"
require "yaml"
require "date"

# Guards the hand-authored program against drift. It validates the YAML the
# seeder consumes, so a bad edit fails here instead of reaching Teddy.
#
# No Rails, no database. Everything this needs is in the files.
RSpec.describe "content integrity" do
  CONTENT = File.expand_path("../content/program_years/2026-27", __dir__)
  PROGRAM = YAML.load_file(File.join(CONTENT, "program.yml"))
  DRILLS  = YAML.load_file(File.join(CONTENT, "drills.yml"))["drills"]
  PLANS   = Dir[File.join(CONTENT, "plans/*.yml")].sort.map { |f| YAML.load_file(f) }

  DAY_ROLES = {
    "mon" => "Floor Day", "tue" => "Rings Day", "wed" => "Fast Day",
    "thu" => "Wall Day",  "fri" => "Skate Day", "sat" => "Game Day",
    "sun" => "Court Day"
  }.freeze

  let(:block_keys) { PROGRAM["blocks"].map { |b| b["key"] } }
  let(:area_slugs) { PROGRAM["areas"].map { |a| a["slug"] } }

  describe "the year" do
    it "runs from the first block to the last" do
      py = PROGRAM["program_year"]
      expect(py["starts_on"].to_s).to eq(PROGRAM["blocks"].first["starts_on"].to_s)
      expect(py["ends_on"].to_s).to eq(PROGRAM["blocks"].last["ends_on"].to_s)
    end

    it "has six blocks in order with no gaps" do
      expect(PROGRAM["blocks"].size).to eq(6)
      PROGRAM["blocks"].each_cons(2) do |a, b|
        expect(Date.parse(b["starts_on"].to_s)).to eq(Date.parse(a["ends_on"].to_s) + 1),
          "#{b['key']} starts #{b['starts_on']}, but #{a['key']} ends #{a['ends_on']}"
      end
    end

    it "gives every ordered collection distinct positions" do
      {
        "blocks" => PROGRAM["blocks"], "areas" => PROGRAM["areas"],
        "ball_gates" => PROGRAM["ball_gates"], "battery_tests" => PROGRAM["battery_tests"],
        "battery_measures" => PROGRAM["battery_measures"], "test_dates" => PROGRAM["test_dates"],
        "day_roles" => PROGRAM["day_roles"]
      }.each do |name, rows|
        positions = rows.map { |r| r["position"] }
        expect(positions.uniq.size).to eq(positions.size), "#{name} repeats a position: #{positions.inspect}"
      end
    end
  end

  describe "areas" do
    it "has exactly nine, with unique slugs" do
      expect(area_slugs.size).to eq(9)
      expect(area_slugs.uniq.size).to eq(9)
    end

    it "gives every area a cell for every block" do
      PROGRAM["areas"].each do |a|
        expect(a["cells"].keys).to match_array(block_keys), "area #{a['slug']}"
        a["cells"].each { |k, v| expect(v.to_s.strip).not_to be_empty, "#{a['slug']}/#{k} is blank" }
      end
    end
  end

  describe "patches" do
    it "has nine for each rank that has any" do
      PROGRAM["patches"].group_by { |p| p["block"] }.each do |block, ps|
        expect(ps.size).to eq(9), "#{block} has #{ps.size} patches, needs 9"
        expect(ps.map { |p| p["area"] }.uniq.size).to eq(9), "#{block} repeats an area"
      end
    end

    it "references known blocks and areas" do
      PROGRAM["patches"].each do |p|
        expect(block_keys).to include(p["block"])
        expect(area_slugs).to include(p["area"])
      end
    end
  end

  describe "the tennis ball progression" do
    it "is gated on skill and never on a date" do
      PROGRAM["ball_gates"].each do |g|
        expect(g.keys).not_to include("date", "starts_on", "expected_on"),
          "#{g['label']} carries a date, and the gates move on skill only"
        expect(g["requirement"].to_s.strip).not_to be_empty
      end
    end

    it "has exactly one active gate" do
      expect(PROGRAM["ball_gates"].count { |g| g["status"] == "active" }).to eq(1)
    end
  end

  describe "the test battery" do
    it "has ten tests and fifteen recordable measures" do
      expect(PROGRAM["battery_tests"].size).to eq(10)
      expect(PROGRAM["battery_measures"].size).to eq(15)
    end

    it "records height at every test date" do
      expect(PROGRAM["battery_measures"].map { |m| m["test_id"] }).to include("h")
      height = PROGRAM["battery_measures"].find { |m| m["test_id"] == "h" }
      expect(height["direction"]).to eq("growth")
    end

    it "gives every measure a direction the chart can read" do
      PROGRAM["battery_measures"].each do |m|
        expect(%w[lower higher growth]).to include(m["direction"]), "measure #{m['test_id']}"
      end
    end

    it "leaves exactly the measures that belong to no protocol without one" do
      keys = PROGRAM["battery_tests"].map { |t| t["key"] }
      unattached = PROGRAM["battery_measures"].select { |m| m["battery_test_key"].nil? }.map { |m| m["test_id"] }

      # Height is not one of the ten, and single-leg balance is recorded on its
      # own. Everything else must name a protocol, so a mistyped or missing key
      # cannot quietly look like one of these three.
      expect(unattached).to match_array(%w[h t11r t11l])

      PROGRAM["battery_measures"].each do |m|
        next if m["battery_test_key"].nil?
        expect(keys).to include(m["battery_test_key"]), "measure #{m['test_id']} names unknown battery test #{m['battery_test_key']}"
      end
    end

    it "has unique test ids" do
      ids = PROGRAM["battery_measures"].map { |m| m["test_id"] }
      expect(ids.uniq.size).to eq(ids.size)
    end
  end

  describe "day roles" do
    it "are the seven fixed roles, in week order" do
      actual = PROGRAM["day_roles"].sort_by { |r| r["position"] }.to_h { |r| [ r["dow"], r["name"] ] }
      expect(actual).to eq(DAY_ROLES)
    end

    it "keeps Saturday off for the home program" do
      sat = PROGRAM["day_roles"].find { |r| r["dow"] == "sat" }
      expect(sat["minutes"]).to eq("off")
    end
  end

  describe "drills" do
    it "has unique slugs and no blank fields" do
      slugs = DRILLS.map { |d| d["slug"] }
      expect(slugs.uniq.size).to eq(slugs.size)
      DRILLS.each do |d|
        %w[name area_name short watch cue].each do |field|
          expect(d[field].to_s.strip).not_to be_empty, "#{d['slug']} has a blank #{field}"
        end
        expect(d["how"]).to be_an(Array).and(satisfy { |h| h.any? }), "#{d['slug']} has no how-to"
      end
    end

    it "names an area the year actually has" do
      names = PROGRAM["areas"].map { |a| a["name"] }
      DRILLS.each { |d| expect(names).to include(d["area_name"]), "drill #{d['slug']}" }
    end
  end

  describe "every month plan" do
    it "names a block the year has" do
      PLANS.each { |p| expect(block_keys).to include(p["month_plan"]["block"]) }
    end

    it "gives every week one theme, 5 or 6 sub-targets and a challenge" do
      each_week do |w, label|
        expect(w["theme"].to_s.strip).not_to be_empty, label
        expect(w["targets"].size).to be_between(5, 6), "#{label} has #{w['targets'].size} sub-targets"
        expect(w["challenge"].to_s.strip).not_to be_empty, label
      end
    end

    it "includes a tennis, a basketball and a soccer sub-target every week" do
      { "tennis" => /tennis/i, "basketball" => /basketball/i, "soccer" => /soccer|keeper/i }
        .each do |sport, pattern|
          each_week do |w, label|
            expect(w["targets"].any? { |t| t =~ pattern }).to be(true),
              "#{label} has no #{sport} sub-target"
          end
        end
    end

    it "puts every day on the role its weekday owns" do
      each_day do |d, label|
        expect(d["role"]).to eq(DAY_ROLES.fetch(d["dow"])), label
        expect(Date.parse(d["date"].to_s).strftime("%a").downcase).to eq(d["dow"]), label
      end
    end

    it "attempts the Challenge of the Week early and late" do
      each_week do |w, label|
        early = w["days"].select { |d| %w[mon tue].include?(d["dow"]) }
        late  = w["days"].select { |d| d["dow"] == "fri" }
        expect(early.any? { |d| challenge?(d) }).to be(true), "#{label} has no early challenge attempt"
        expect(late.any? { |d| challenge?(d) }).to be(true), "#{label} has no Friday challenge attempt"
      end
    end

    it "has full day cards for at least one week of every month" do
      PLANS.each do |p|
        carded = p["weeks"].count { |w| w["days"].any? { |d| d["blocks"] } }
        expect(carded).to be >= 1, "#{p['month_plan']['month']} has no week with full day cards"
      end
    end

    it "stays inside the weekly high-intent effort budget" do
      each_week do |w, label|
        cap = w["trials"] ? 20 : 40
        total = w["days"].sum { |d| d["hie"].to_i }
        expect(total).to be <= cap, "#{label} spends #{total} high-intent efforts against a cap of #{cap}"
      end
    end

    it "spends nothing on Sunday or Monday and at most 5 on Friday" do
      each_day do |d, label|
        ceiling = { "sun" => 0, "mon" => 0, "fri" => 5 }[d["dow"]]
        next if ceiling.nil?
        expect(d["hie"].to_i).to be <= ceiling, "#{label} spends #{d['hie']}, ceiling is #{ceiling}"
      end
    end

    it "never runs two high-impact home days back to back" do
      # Walks the whole plan in date order rather than resetting each week.
      # Sunday and Monday sit on either side of a week boundary, so a rule
      # scoped to one week would never compare them, and the same goes for the
      # last day of one month's plan against the first of the next.
      #
      # Saturday is dropped because the home program is off that day, which
      # makes Friday and Sunday the adjacent pair the rule cares about.
      home = PLANS.flat_map { |p| p["weeks"].flat_map { |w| w["days"] } }
                  .reject { |d| d["dow"] == "sat" }
                  .sort_by { |d| d["date"].to_s }

      home.each_cons(2) do |a, b|
        both_high = a["intensity"].to_i >= 3 && b["intensity"].to_i >= 3
        expect(both_high).to be(false),
          "#{a['date']} (#{a['dow']}) and #{b['date']} (#{b['dow']}) are both high impact"
      end
    end

    it "gives every day card a high-intent effort count" do
      each_day { |d, label| expect(d["hie"]).to be_an(Integer), "#{label} has no hie" }
    end

    it "counts ball skills in touches rather than minutes" do
      # This one genuinely needs full cards. A week whose cards are not written
      # yet carries its volume in those cards when they arrive, so there is
      # nothing here to count. The tally below stops every week taking that
      # exit at once and leaving the rule checking nothing at all.
      checked = 0

      each_week do |w, label|
        carded = w["days"].select { |d| d["blocks"] }
        next if carded.empty?
        checked += 1
        counted = carded.flat_map { |d| d["blocks"] }
          .select { |b| b["name"] =~ /basketball|soccer|tennis/i }
          .count { |b| b["body"] =~ /\d+\s*(dribbles|touches|passes|reps|swings|throws)/i }
        expect(counted).to be >= 1, "#{label} has no ball-skill block with a counted volume"
      end

      expect(checked).to be >= 1, "no week has full day cards, so this rule checked nothing"
    end

    it "makes week 8 of a block Trials" do
      each_week do |w, label|
        next unless w["position_in_block"] == 8
        expect(w["trials"]).to be(true), label
        expect(w["theme"]).to match(/trials/i), label
      end
    end

    it "leaves Saturday's home program off" do
      each_day do |d, label|
        next unless d["dow"] == "sat"
        expect(d["blocks"].to_a.count { |b| b["minutes"].to_s =~ /\d/ }).to be <= 1, label
      end
    end

    it "uses only the two tags the cards are written with" do
      # Bold and quote are the whole vocabulary. Anything else in angle brackets
      # renders differently in the old build and the new tokenizer, so the guard
      # is to keep it out of the prose rather than to reconcile two matchers.
      allowed = %w[<b> </b> <q> </q>]

      each_day do |d, label|
        d["blocks"].to_a.each do |b|
          [ b["name"], b["body"] ].compact.each do |text|
            text.scan(/<[^>]*>/).each do |tag|
              expect(allowed).to include(tag), "#{label} #{b['name']} uses #{tag}"
            end
          end
        end
      end
    end
  end

  describe "Jeff's running, limited through fall 2026" do
    # Fall cards keep him feeding, timing, demonstrating and competing from a
    # fixed position. Chase and race games phase in during the Coyote block.
    DAD_RUNS = /\bdad (?:sprints|races|chases|runs)\b|\brace (?:dad|him)\b|\bchase (?:dad|him)\b/i

    it "asks him to sprint, race or chase nowhere before December" do
      # Reads the day summaries as well as the card prose. Most days in a month
      # that is only part written have a summary and no card, so checking only
      # the cards would leave two weeks in three unread. This is the rule with
      # the highest cost of being wrong, so it reads everything there is.
      each_day do |d, label|
        next if Date.parse(d["date"].to_s) >= Date.new(2026, 12, 1)

        prose = d["blocks"].to_a.map { |b| [ b["name"], b["body"] ].compact.join(" ") }
        prose += d["summary_lines"].to_a

        prose.each do |text|
          expect(text.to_s).not_to match(DAD_RUNS), "#{label}: #{text}"
        end
      end
    end
  end

  def each_week
    PLANS.each do |p|
      p["weeks"].each { |w| yield w, "#{p['month_plan']['month']} week #{w['number']}" }
    end
  end

  def each_day
    each_week { |w, label| w["days"].each { |d| yield d, "#{label} #{d['dow']} #{d['date']}" } }
  end

  # A month is authored a week at a time, so most weeks have day summaries and
  # no full cards yet. Both name the challenge, so both are worth reading.
  # Checking only the blocks would let every week without cards pass without
  # ever being looked at.
  def challenge?(day)
    day["blocks"].to_a.any? { |b| b["tag"] == "challenge" || b["name"] =~ /challenge/i } ||
      day["summary_lines"].to_a.any? { |l| l =~ /challenge/i }
  end
end
