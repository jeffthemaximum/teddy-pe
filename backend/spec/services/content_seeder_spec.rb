require "rails_helper"

RSpec.describe ContentSeeder do
  subject(:seed) { described_class.new(year_label: "2026-27").seed! }

  it "creates the athlete, the year and its structure" do
    seed

    athlete = Athlete.sole
    expect(athlete.name).to eq("Teddy Maxim")
    expect(athlete.birthday).to eq(Date.new(2019, 1, 9))

    year = ProgramYear.sole
    expect(year.label).to eq("2026-27")
    expect(year.ball_now).to eq("green")
    expect(year.blocks.map(&:key)).to eq(%w[cub fox coyote wolf puma cheetah])
    expect(year.areas.count).to eq(9)
    expect(year.day_roles.count).to eq(7)
    expect(year.test_dates.map(&:window)).to eq(%w[2026-09 2026-12 2027-03 2027-06 2027-08])
  end

  it "gives every area a cell for every block" do
    seed
    expect(AreaCell.count).to eq(9 * 6)
  end

  it "creates nine Cub patches, one per area" do
    seed
    cub = Block.find_by!(key: "cub")
    expect(cub.patches.count).to eq(9)
    expect(cub.patches.map { |p| p.area.slug }.uniq.size).to eq(9)
  end

  it "has one active ball gate, and no date column to gate on" do
    seed
    expect(BallGate.where(status: "active").count).to eq(1)
    expect(BallGate.column_names).not_to include("date", "starts_on", "expected_on")
  end

  it "is idempotent, so a second run changes no row and no id" do
    seed
    snapshot = lambda do
      {
        program_years: ProgramYear.order(:id).pluck(:id),
        blocks: Block.order(:id).pluck(:id),
        areas: Area.order(:id).pluck(:id),
        area_cells: AreaCell.order(:id).pluck(:id),
        patches: Patch.order(:id).pluck(:id),
        ball_gates: BallGate.order(:id).pluck(:id),
        test_dates: TestDate.order(:id).pluck(:id),
        day_roles: DayRole.order(:id).pluck(:id),
        battery_tests: BatteryTest.order(:id).pluck(:id),
        battery_measures: BatteryMeasure.order(:id).pluck(:id),
        athletes: Athlete.order(:id).pluck(:id)
      }
    end
    before = snapshot.call

    described_class.new(year_label: "2026-27").seed!

    expect(snapshot.call).to eq(before)
  end

  it "picks the current year from a date, with nothing hardcoded" do
    seed
    athlete = Athlete.sole
    expect(ProgramYear.current_for(athlete, on: Date.new(2026, 10, 1))&.label).to eq("2026-27")
    # Outside every year's range, fall back to the newest active year.
    expect(ProgramYear.current_for(athlete, on: Date.new(2030, 1, 1))&.label).to eq("2026-27")
    expect(ProgramYear.current_for(nil)).to be_nil
  end

  it "names the current block from a date" do
    seed
    year = ProgramYear.sole
    expect(year.current_block(on: Date.new(2026, 9, 20))&.key).to eq("cub")
    expect(year.current_block(on: Date.new(2027, 1, 20))&.key).to eq("coyote")
  end

  it "refuses a day role whose name does not match its weekday" do
    seed
    role = DayRole.find_by!(dow: "wed")
    role.name = "Wall Day"
    expect(role).not_to be_valid
    expect(role.errors[:name].first).to eq("on wed must be Fast Day")
  end

  # fly.toml runs content:seed as the release command on every deploy, so
  # "edit the YAML and deploy" is the only way a content change reaches
  # production. Until this, that road went one way: a row the YAML no longer
  # had survived in Postgres forever, in every payload and in the exported
  # docs. Content gets edited by deletion as often as by addition.
  #
  # These run against a copy of the real content so an example can delete
  # something and seed again, which is exactly what the deploy does.
  describe "pruning what the YAML no longer has" do
    around do |example|
      Dir.mktmpdir do |tmp|
        @root = Pathname(tmp)
        FileUtils.cp_r(Rails.root.join("content/program_years/2026-27"), @root.join("2026-27"))
        example.run
      end
    end

    def seed_copy = described_class.new(year_label: "2026-27", root: @root).seed!
    def plan_path = @root.join("2026-27/plans/2026-09.yml")
    def plan_doc = YAML.load_file(plan_path, permitted_classes: [ Date ])
    def rewrite(doc) = File.write(plan_path, doc.to_yaml)

    def edit_plan
      doc = plan_doc
      yield doc
      rewrite(doc)
      seed_copy
    end

    it "removes a day block the day no longer has" do
      seed_copy
      thursday = DayCard.find_by!(date: Date.new(2026, 9, 17))
      was = thursday.day_blocks.count
      expect(was).to be > 1

      dropped = nil
      edit_plan do |doc|
        day = doc["weeks"][0]["days"].find { |d| d["date"].to_s == "2026-09-17" }
        dropped = day["blocks"].pop
      end

      expect(thursday.reload.day_blocks.count).to eq(was - 1)
      expect(thursday.day_blocks.map(&:name)).not_to include(dropped["name"])
    end

    it "removes a day card the week no longer has" do
      seed_copy
      week = Week.find_by!(number: 1)
      expect(week.day_cards.count).to eq(7)

      dropped = nil
      edit_plan { |doc| dropped = doc["weeks"][0]["days"].pop }

      expect(week.reload.day_cards.count).to eq(6)
      expect(DayCard.find_by(date: dropped["date"])).to be_nil
    end

    it "removes a week the plan no longer has, and its cards and blocks with it" do
      seed_copy
      plan = MonthPlan.sole
      expect(plan.weeks.count).to eq(3)
      third = Week.find_by!(number: 3)
      card_ids = third.day_cards.pluck(:id)
      expect(card_ids).not_to be_empty

      edit_plan { |doc| doc["weeks"].pop }

      expect(plan.reload.weeks.count).to eq(2)
      expect(Week.find_by(number: 3)).to be_nil
      expect(DayCard.where(id: card_ids)).to be_empty
      expect(DayBlock.where(day_card_id: card_ids)).to be_empty
    end

    it "removes a month plan whose file is gone, when another month still stands" do
      october_path = @root.join("2026-27/plans/2026-10.yml")
      october = plan_doc
      october["month_plan"]["month"] = "2026-10"
      october["month_plan"]["label"] = "October"
      File.write(october_path, october.to_yaml)
      seed_copy
      expect(MonthPlan.count).to eq(2)

      File.delete(plan_path)
      seed_copy

      expect(MonthPlan.count).to eq(1)
      expect(MonthPlan.sole.month).to eq("2026-10")
    end

    # A plans/ directory that matched nothing is not a real removal, it is a
    # deploy that shipped without its content. This is the one glob in the
    # seeder that is not driven off program.yml, so an empty or missing
    # plans/ folder cannot raise MissingContent the way a bad key does. Refuse
    # instead of quietly emptying every month plan the year has.
    it "refuses to prune every month plan when the plans directory has none, and changes nothing" do
      seed_copy
      before = { month_plans: MonthPlan.count, weeks: Week.count,
                 day_cards: DayCard.count, day_blocks: DayBlock.count }
      expect(before[:month_plans]).to eq(1)

      File.delete(plan_path)

      expect { seed_copy }.to raise_error(ContentSeeder::MissingContent, /plan/i)

      expect({ month_plans: MonthPlan.count, weeks: Week.count,
               day_cards: DayCard.count, day_blocks: DayBlock.count }).to eq(before)
    end

    it "refuses to prune when the plans directory itself does not exist" do
      seed_copy
      before = { month_plans: MonthPlan.count, weeks: Week.count, day_cards: DayCard.count }

      FileUtils.rm_rf(@root.join("2026-27/plans"))

      expect { seed_copy }.to raise_error(ContentSeeder::MissingContent, /plan/i)

      expect({ month_plans: MonthPlan.count, weeks: Week.count,
               day_cards: DayCard.count }).to eq(before)
    end

    # The one that matters. A week can only be removed from the YAML if doing
    # it leaves Teddy's diary and his numbers exactly where they were.
    it "keeps the journal and the test results when their week is removed" do
      seed_copy
      year = ProgramYear.sole
      coach = create(:user, :coach)
      teddy = create(:user, :athlete)
      session = Date.new(2026, 9, 29)   # a Tuesday in week 3

      entry = CoachEntry.upsert_for(user: coach, program_year: year, session_date: session,
                                    attrs: { note: "Rings felt strong." })
      his = AthleteEntry.upsert_for(user: teddy, program_year: year, session_date: session,
                                    attrs: { best: "The cartwheel", shared: false })
      result = TestResult.upsert_for(program_year: year,
                                     test_date: year.test_dates.find_by!(window: "2026-09"),
                                     battery_measure: year.battery_measures.find_by!(test_id: "t1"),
                                     value: "4.42", user: coach)

      # Both entries were linked to the day card that is about to be deleted.
      expect(entry.day_card_id).to be_present
      expect(his.day_card_id).to be_present

      edit_plan { |doc| doc["weeks"].pop }

      expect(Week.find_by(number: 3)).to be_nil
      expect(DayCard.find_by(date: session)).to be_nil

      # The rows survive, with everything Jeff and Teddy wrote in them.
      expect(entry.reload.note).to eq("Rings felt strong.")
      expect(his.reload.best).to eq("The cartwheel")
      expect(his.shared).to be(false)
      expect(result.reload.raw_value).to eq("4.42")

      # And this is what happens to the foreign keys. day_card_id nullifies,
      # because DayCard declares dependent: :nullify on both journals. It does
      # not cascade and it does not raise. Nothing looks an entry up by
      # day_card_id: the API addresses them by (user, year, session_date), and
      # the week payload by session_date, so both still read back.
      expect(entry.day_card_id).to be_nil
      expect(his.day_card_id).to be_nil
      expect(entry.session_date).to eq(session)
      expect(CoachEntry.find_by(user: coach, program_year: year, session_date: session)).to eq(entry)

      # A test result never referenced a day card, only the test date and the
      # measure, and neither of those is ever pruned.
      expect(result.test_date.window).to eq("2026-09")
      expect(result.battery_measure.test_id).to eq("t1")
    end

    # The limit of the prune, pinned so it stays a decision. Every one of these
    # tables has a row of Jeff's or Teddy's pointing at it, and a battery
    # measure declares dependent: :destroy on test results, so pruning one
    # would delete Teddy's numbers on the strength of a YAML edit.
    it "leaves alone the content that Teddy's own records hang off" do
      seed_copy
      year = ProgramYear.sole
      coach = create(:user, :coach)
      TestResult.upsert_for(program_year: year,
                            test_date: year.test_dates.find_by!(window: "2027-03"),
                            battery_measure: year.battery_measures.find_by!(test_id: "t2"),
                            value: "131", user: coach)

      program_path = @root.join("2026-27/program.yml")
      program = YAML.load_file(program_path, permitted_classes: [ Date ])
      program["battery_measures"].reject! { |m| m["test_id"] == "t2" }
      program["test_dates"].reject! { |d| d["window"] == "2027-03" }
      program["patches"].pop
      File.write(program_path, program.to_yaml)
      drills_path = @root.join("2026-27/drills.yml")
      drills = YAML.load_file(drills_path)
      dropped_drill = drills["drills"].pop
      File.write(drills_path, drills.to_yaml)
      seed_copy

      expect(year.battery_measures.find_by(test_id: "t2")).to be_present
      expect(year.test_dates.find_by(window: "2027-03")).to be_present
      expect(year.patches.count).to eq(9)
      expect(Drill.find_by(slug: dropped_drill["slug"])).to be_present
      expect(TestResult.count).to eq(1)
    end

    it "prunes only inside the year it is seeding" do
      seed_copy
      other_athlete = create(:athlete, slug: "other-child", name: "A Second Child")
      other = ProgramYear.create!(athlete: other_athlete, label: "2025-26",
                                  starts_on: Date.new(2025, 9, 14), ends_on: Date.new(2026, 8, 14),
                                  status: "archived", ball_now: "red")
      block = other.blocks.create!(key: "cub", name: "Cub", position: 1,
                                   starts_on: other.starts_on, ends_on: other.ends_on, focus: "Land")
      other_plan = MonthPlan.create!(program_year: other, block: block, month: "2025-09",
                                     label: "September", range_display: "Sep 2025")
      other_plan.weeks.create!(block: block, number: 1, position_in_block: 1, theme: "Old",
                               dates_display: "Sep 15-21", challenge: "Old challenge",
                               targets: [ "tennis rally", "basketball dribble", "soccer touch", "jump", "breathe" ])

      edit_plan { |doc| doc["weeks"].pop }

      expect(other_plan.reload.weeks.count).to eq(1)
      expect(other.blocks.count).to eq(1)
      expect(MonthPlan.find_by(month: "2025-09")).to be_present
    end

    it "prunes nothing on a second run of unchanged content" do
      seed_copy
      before = { weeks: Week.order(:id).pluck(:id), day_cards: DayCard.order(:id).pluck(:id),
                 day_blocks: DayBlock.order(:id).pluck(:id), area_cells: AreaCell.order(:id).pluck(:id),
                 month_plans: MonthPlan.order(:id).pluck(:id), ball_gates: BallGate.order(:id).pluck(:id) }

      seed_copy

      expect({ weeks: Week.order(:id).pluck(:id), day_cards: DayCard.order(:id).pluck(:id),
               day_blocks: DayBlock.order(:id).pluck(:id), area_cells: AreaCell.order(:id).pluck(:id),
               month_plans: MonthPlan.order(:id).pluck(:id), ball_gates: BallGate.order(:id).pluck(:id) }).to eq(before)
    end
  end

  describe "the battery" do
    before { seed }

    it "has ten tests and fifteen measures" do
      expect(BatteryTest.count).to eq(10)
      expect(BatteryMeasure.count).to eq(15)
    end

    it "records height, as growth, belonging to no test" do
      height = BatteryMeasure.find_by!(test_id: "h")
      expect(height.direction).to eq("growth")
      expect(height.battery_test).to be_nil
      expect(height.unit).to eq("cm")
    end

    it "ties both sides of a paired test to the same test" do
      right = BatteryMeasure.find_by!(test_id: "t3r")
      left  = BatteryMeasure.find_by!(test_id: "t3l")
      expect(right.battery_test).to eq(left.battery_test)
      expect(right.battery_test.name).to eq("Single-leg hop, each leg")
    end

    it "knows which way is progress" do
      sprint = BatteryMeasure.find_by!(test_id: "t1")   # lower is better
      jump   = BatteryMeasure.find_by!(test_id: "t2")   # higher is better
      expect(sprint.improvement_from(4.5, 4.2)).to eq(:better)
      expect(sprint.improvement_from(4.5, 4.8)).to eq(:worse)
      expect(jump.improvement_from(120, 131)).to eq(:better)
      expect(jump.improvement_from(120, 120)).to eq(:same)
      expect(jump.improvement_from(nil, 120)).to be_nil
      expect(sprint.improvement_from(4.5, 4.5)).to eq(:same)
      expect(jump.improvement_from(120, 110)).to eq(:worse)
    end

    it "reads height as neither better nor worse" do
      height = BatteryMeasure.find_by!(test_id: "h")
      expect(height.improvement_from(120, 126)).to eq(:same)
    end
  end
end
