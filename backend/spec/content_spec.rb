require "spec_helper"
require "yaml"
require "date"

# Guards the hand-authored program against drift. It validates the YAML the
# seeder consumes, so a bad edit fails here instead of reaching Teddy.
#
# No Rails, no database. Everything this needs is in the files.
#
# Every example that loops counts what it reached and asserts that count
# against a total taken from the content itself. Thirteen assertions on this
# project have passed while checking nothing, and every one of them was a loop
# that ran zero times or took an exit on every pass. A tally does not make an
# assertion stronger. It makes the absence of one loud.
RSpec.describe "content integrity" do
  CONTENT = File.expand_path("../content/program_years/2026-27", __dir__)
  # permitted_classes: [ Date ] matches content_seeder.rb's own loader. Every
  # other date in this file is a quoted string parsed by hand with Date.parse;
  # test_dates is the first place the YAML carries a real date literal, so
  # the safe loader needs telling it is allowed.
  PROGRAM = YAML.load_file(File.join(CONTENT, "program.yml"), permitted_classes: [ Date ])
  DRILLS  = YAML.load_file(File.join(CONTENT, "drills.yml"))["drills"]
  PLANS   = Dir[File.join(CONTENT, "plans/*.yml")].sort.map { |f| YAML.load_file(f) }

  # What the content actually holds, counted once, off to the side of the rules
  # that walk it. Each example asserts its own tally against the number here
  # that names its subject, so a rule that quietly stops reaching everything it
  # is about fails instead of shrinking.
  ALL_WEEKS = PLANS.flat_map { |p| p["weeks"] }
  ALL_DAYS  = ALL_WEEKS.flat_map { |w| w["days"] }

  WEEKS         = ALL_WEEKS.size
  DAYS          = ALL_DAYS.size
  CARDED_WEEKS  = ALL_WEEKS.count { |w| w["days"].any? { |d| d["blocks"] } }
  SATURDAYS     = ALL_DAYS.count { |d| d["dow"] == "sat" }
  HIE_CAPPED    = ALL_DAYS.count { |d| %w[sun mon fri].include?(d["dow"]) }
  HOME_PAIRS    = [ ALL_DAYS.count { |d| d["dow"] != "sat" } - 1, 0 ].max
  TEST_DATES    = PROGRAM["test_dates"].size

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

      checked = 0
      PROGRAM["blocks"].each_cons(2) do |a, b|
        checked += 1
        expect(Date.parse(b["starts_on"].to_s)).to eq(Date.parse(a["ends_on"].to_s) + 1),
          "#{b['key']} starts #{b['starts_on']}, but #{a['key']} ends #{a['ends_on']}"
      end
      expect(checked).to eq(PROGRAM["blocks"].size - 1)
    end

    it "gives every ordered collection distinct positions" do
      collections = {
        "blocks" => PROGRAM["blocks"], "areas" => PROGRAM["areas"],
        "ball_gates" => PROGRAM["ball_gates"], "battery_tests" => PROGRAM["battery_tests"],
        "battery_measures" => PROGRAM["battery_measures"], "test_dates" => PROGRAM["test_dates"],
        "day_roles" => PROGRAM["day_roles"]
      }

      checked = 0
      collections.each do |name, rows|
        checked += 1
        positions = rows.map { |r| r["position"] }
        expect(positions.uniq.size).to eq(positions.size), "#{name} repeats a position: #{positions.inspect}"
      end
      # 7 is written here, not read off `collections`, so dropping one of the
      # seven names above shrinks the loop without shrinking what it owes.
      expect(checked).to eq(7), "expected 7 ordered collections, walked #{checked}"
    end
  end

  describe "areas" do
    it "has exactly nine, with unique slugs" do
      expect(area_slugs.size).to eq(9)
      expect(area_slugs.uniq.size).to eq(9)
    end

    it "gives every area a cell for every block" do
      areas = 0
      cells = 0

      PROGRAM["areas"].each do |a|
        areas += 1
        expect(a["cells"].keys).to match_array(block_keys), "area #{a['slug']}"
        a["cells"].each do |k, v|
          cells += 1
          expect(v.to_s.strip).not_to be_empty, "#{a['slug']}/#{k} is blank"
        end
      end

      expect(areas).to eq(PROGRAM["areas"].size)
      expect(cells).to eq(PROGRAM["areas"].size * block_keys.size)
    end
  end

  describe "patches" do
    it "has nine for each rank that has any" do
      groups = PROGRAM["patches"].group_by { |p| p["block"] }

      # Read straight off PROGRAM["patches"], not off `groups` above. If a
      # future edit narrows `groups` to fewer ranks, this stays at the real
      # count and the mismatch below catches it.
      ranks_with_patches = PROGRAM["patches"].map { |p| p["block"] }.uniq.size

      checked = 0
      groups.each do |block, ps|
        checked += 1
        expect(ps.size).to eq(9), "#{block} has #{ps.size} patches, needs 9"
        expect(ps.map { |p| p["area"] }.uniq.size).to eq(9), "#{block} repeats an area"
      end
      expect(checked).to eq(ranks_with_patches), "expected #{ranks_with_patches} ranks with patches, walked #{checked}"
      expect(checked).to be >= 1, "the year has no patches at all"
    end

    it "references known blocks and areas" do
      checked = 0
      PROGRAM["patches"].each do |p|
        checked += 1
        expect(block_keys).to include(p["block"])
        expect(area_slugs).to include(p["area"])
      end
      expect(checked).to eq(PROGRAM["patches"].size)
    end
  end

  describe "the tennis ball progression" do
    it "is gated on skill and never on a date" do
      checked = 0
      PROGRAM["ball_gates"].each do |g|
        checked += 1
        expect(g.keys).not_to include("date", "starts_on", "expected_on"),
          "#{g['label']} carries a date, and the gates move on skill only"
        expect(g["requirement"].to_s.strip).not_to be_empty
      end
      expect(checked).to eq(PROGRAM["ball_gates"].size)
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
      checked = 0
      PROGRAM["battery_measures"].each do |m|
        checked += 1
        expect(%w[lower higher growth]).to include(m["direction"]), "measure #{m['test_id']}"
      end
      expect(checked).to eq(PROGRAM["battery_measures"].size)
    end

    it "leaves exactly the measures that belong to no protocol without one" do
      keys = PROGRAM["battery_tests"].map { |t| t["key"] }
      unattached = PROGRAM["battery_measures"].select { |m| m["battery_test_key"].nil? }.map { |m| m["test_id"] }

      # Height is not one of the ten, and single-leg balance is recorded on its
      # own. Everything else must name a protocol, so a mistyped or missing key
      # cannot quietly look like one of these three.
      expect(unattached).to match_array(%w[h t11r t11l])

      checked = 0
      PROGRAM["battery_measures"].each do |m|
        next if m["battery_test_key"].nil?
        checked += 1
        expect(keys).to include(m["battery_test_key"]), "measure #{m['test_id']} names unknown battery test #{m['battery_test_key']}"
      end
      expect(checked).to eq(PROGRAM["battery_measures"].size - unattached.size)
    end

    it "has unique test ids" do
      ids = PROGRAM["battery_measures"].map { |m| m["test_id"] }
      expect(ids.uniq.size).to eq(ids.size)
    end
  end

  describe "test windows" do
    # The five windows are what the Today screen reads to decide whether a
    # test is due, so a window with no dates is a window Today cannot see.
    it "gives every window a start and an end" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d["starts_on"]).to be_a(Date), "#{d['window']} has no starts_on"
        expect(d["ends_on"]).to be_a(Date), "#{d['window']} has no ends_on"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
    end

    it "never ends a window before it starts" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d["ends_on"]).to be >= d["starts_on"], "#{d['window']} ends before it starts"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
    end

    it "opens every window inside the month its key names" do
      checked = 0
      PROGRAM["test_dates"].each do |d|
        expect(d["starts_on"].strftime("%Y-%m")).to eq(d["window"]),
          "#{d['window']} starts in a different month from its key"
        checked += 1
      end
      expect(checked).to eq(TEST_DATES)
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

      checked = 0
      DRILLS.each do |d|
        checked += 1
        %w[name area_name short watch cue].each do |field|
          expect(d[field].to_s.strip).not_to be_empty, "#{d['slug']} has a blank #{field}"
        end
        expect(d["how"]).to be_an(Array).and(satisfy { |h| h.any? }), "#{d['slug']} has no how-to"
      end
      expect(checked).to eq(DRILLS.size)
    end

    it "names an area the year actually has" do
      names = PROGRAM["areas"].map { |a| a["name"] }

      checked = 0
      DRILLS.each do |d|
        checked += 1
        expect(names).to include(d["area_name"]), "drill #{d['slug']}"
      end
      expect(checked).to eq(DRILLS.size)
    end
  end

  describe "every month plan" do
    it "names a block the year has" do
      checked = 0
      PLANS.each do |p|
        checked += 1
        expect(block_keys).to include(p["month_plan"]["block"])
      end
      expect(checked).to eq(PLANS.size)
    end

    it "gives every week one theme, 5 or 6 sub-targets and a challenge" do
      checked = 0
      each_week do |w, label|
        checked += 1
        expect(w["theme"].to_s.strip).not_to be_empty, label
        expect(w["targets"].size).to be_between(5, 6), "#{label} has #{w['targets'].size} sub-targets"
        expect(w["challenge"].to_s.strip).not_to be_empty, label
      end
      expect(checked).to eq(WEEKS)
    end

    it "includes a tennis, a basketball and a soccer sub-target every week" do
      patterns = { "tennis" => /tennis/i, "basketball" => /basketball/i, "soccer" => /soccer|keeper/i }

      checked = 0
      patterns.each do |sport, pattern|
        each_week do |w, label|
          checked += 1
          expect(w["targets"].any? { |t| t =~ pattern }).to be(true),
            "#{label} has no #{sport} sub-target"
        end
      end
      # 3 is the rule (tennis, basketball, soccer), written here rather than
      # read off `patterns.size`, so dropping a sport from the hash above
      # shrinks the loop without shrinking what it owes.
      expect(checked).to eq(WEEKS * 3), "expected #{WEEKS} weeks x 3 sports, walked #{checked}"
    end

    it "puts every day on the role its weekday owns" do
      checked = 0
      each_day do |d, label|
        checked += 1
        expect(d["role"]).to eq(DAY_ROLES.fetch(d["dow"])), label
        expect(Date.parse(d["date"].to_s).strftime("%a").downcase).to eq(d["dow"]), label
      end
      expect(checked).to eq(DAYS)
    end

    it "attempts the Challenge of the Week early and late" do
      checked = 0
      each_week do |w, label|
        checked += 1
        early = w["days"].select { |d| %w[mon tue].include?(d["dow"]) }
        late  = w["days"].select { |d| d["dow"] == "fri" }
        expect(early.any? { |d| challenge?(d) }).to be(true), "#{label} has no early challenge attempt"
        expect(late.any? { |d| challenge?(d) }).to be(true), "#{label} has no Friday challenge attempt"
      end
      expect(checked).to eq(WEEKS)
    end

    it "has full day cards for at least one week of every month" do
      checked = 0
      PLANS.each do |p|
        checked += 1
        carded = p["weeks"].count { |w| w["days"].any? { |d| d["blocks"] } }
        expect(carded).to be >= 1, "#{p['month_plan']['month']} has no week with full day cards"
      end
      expect(checked).to eq(PLANS.size)
    end

    it "stays inside the weekly high-intent effort budget" do
      checked = 0
      each_week do |w, label|
        checked += 1
        cap = w["trials"] ? 20 : 40
        total = w["days"].sum { |d| d["hie"].to_i }
        expect(total).to be <= cap, "#{label} spends #{total} high-intent efforts against a cap of #{cap}"
      end
      expect(checked).to eq(WEEKS)
    end

    it "spends nothing on Sunday or Monday and at most 5 on Friday" do
      checked = 0
      each_day do |d, label|
        ceiling = { "sun" => 0, "mon" => 0, "fri" => 5 }[d["dow"]]
        next if ceiling.nil?
        checked += 1
        expect(d["hie"].to_i).to be <= ceiling, "#{label} spends #{d['hie']}, ceiling is #{ceiling}"
      end
      expect(checked).to eq(HIE_CAPPED)
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

      checked = 0
      home.each_cons(2) do |a, b|
        checked += 1
        both_high = a["intensity"].to_i >= 3 && b["intensity"].to_i >= 3
        expect(both_high).to be(false),
          "#{a['date']} (#{a['dow']}) and #{b['date']} (#{b['dow']}) are both high impact"
      end
      expect(checked).to eq(HOME_PAIRS)
    end

    it "gives every day card a high-intent effort count" do
      checked = 0
      each_day do |d, label|
        checked += 1
        expect(d["hie"]).to be_an(Integer), "#{label} has no hie"
      end
      expect(checked).to eq(DAYS)
    end

    it "counts ball skills in touches rather than minutes" do
      # This one genuinely needs full cards. A week whose cards are not written
      # yet carries its volume in those cards when they arrive, so there is
      # nothing here to count. The tally is against the number of carded weeks
      # the plans actually hold, so authoring a week's cards without counted
      # volume fails here rather than raising the bar this rule quietly clears.
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

      expect(checked).to eq(CARDED_WEEKS)
      expect(checked).to be >= 1, "no week has full day cards, so this rule checked nothing"
    end

    it "marks week 8 of a block Trials and no other week" do
      # Read both ways round. "Week 8 is Trials" on its own has no subject until
      # a block is eight weeks long in the files, which is why it sat green and
      # empty for the whole of September. "No other week is Trials" has every
      # week as its subject from the first one authored, so the rule is live
      # now and turns into the positive form by itself the day week 8 lands.
      checked = 0

      each_week do |w, label|
        checked += 1
        trials = w["position_in_block"] == 8

        expect(w["trials"]).to be(trials),
          "#{label} is position_in_block #{w['position_in_block']} and trials: #{w['trials'].inspect}"
        expect(w["theme"].to_s.match?(/trials/i)).to be(trials),
          "#{label} theme #{w['theme'].inspect} does not agree with trials: #{trials}"
      end

      expect(checked).to eq(WEEKS)
      # No separate tally of week 8s here on purpose. A count built from
      # `position_in_block == 8` and checked against a count built the same
      # way from the same weeks is true no matter what the data says, and it
      # never looks at the `trials` field at all. The two expects above are
      # the real guard: they fail the moment a week's `trials` flag disagrees
      # with its position, which is the actual rule.
    end

    it "leaves Saturday's home program off" do
      # Every day card carries minutes, written or not, so this reads all of
      # Saturday rather than the one Saturday that happens to have full cards.
      # The old form counted blocks, and a week with no blocks counted zero and
      # passed, which is two Saturdays in three never looked at.
      checked = 0
      each_day do |d, label|
        next unless d["dow"] == "sat"
        checked += 1
        expect(d["minutes"]).to eq("off"), "#{label} has minutes #{d['minutes'].inspect}"
        expect(d["hie"].to_i).to eq(0), "#{label} spends #{d['hie']} high-intent efforts"
      end
      expect(checked).to eq(SATURDAYS)
    end

    it "uses only the two tags the cards are written with" do
      # Every left angle bracket has to begin one of these four. Scanning for
      # complete tags misses an unclosed one, and an unclosed bracket is exactly
      # what the old build treats as markup and never scans for drills, so a
      # body starting "<30s rest" links a different set there than here.
      #
      # Summary lines are read too. They are stored and rendered raw with no
      # tokenizer, so a stray bracket there reaches the client verbatim, and on
      # a part-written month they are two thirds of the prose there is.
      allowed = %w[<b> </b> <q> </q>]
      days = 0
      texts = 0

      each_day do |d, label|
        days += 1
        prose = d["blocks"].to_a.flat_map { |b| [ b["name"], b["body"] ] }
        prose += d["summary_lines"].to_a

        prose.compact.each do |text|
          texts += 1
          text.to_enum(:scan, /</).each do
            at = Regexp.last_match.begin(0)
            opens_a_tag = allowed.any? { |tag| text[at, tag.length] == tag }
            expect(opens_a_tag).to be(true),
              "#{label} has a stray < at #{at}: #{text[at, 24].inspect}"
          end
        end
      end

      expect(days).to eq(DAYS)
      expect(texts).to eq(ALL_DAYS.sum { |d| d["blocks"].to_a.flat_map { |b| [ b["name"], b["body"] ] }.compact.size + d["summary_lines"].to_a.size })
      expect(texts).to be >= DAYS, "fewer texts than days means most cards were never read"
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
      checked = 0
      each_day do |d, label|
        next if Date.parse(d["date"].to_s) >= Date.new(2026, 12, 1)
        checked += 1

        prose = d["blocks"].to_a.map { |b| [ b["name"], b["body"] ].compact.join(" ") }
        prose += d["summary_lines"].to_a

        prose.each do |text|
          expect(text.to_s).not_to match(DAD_RUNS), "#{label}: #{text}"
        end
      end

      expect(checked).to eq(ALL_DAYS.count { |d| Date.parse(d["date"].to_s) < Date.new(2026, 12, 1) })
      expect(checked).to be >= 1, "no day falls before December, so this rule checked nothing"
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
