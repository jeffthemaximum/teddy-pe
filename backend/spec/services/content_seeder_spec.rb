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

  it "is idempotent, so a second run changes no counts and no ids" do
    seed
    year_id = ProgramYear.sole.id
    counts = -> { [ ProgramYear.count, Block.count, Area.count, AreaCell.count,
                    Patch.count, BallGate.count, TestDate.count, DayRole.count ] }
    before = counts.call

    described_class.new(year_label: "2026-27").seed!

    expect(counts.call).to eq(before)
    expect(ProgramYear.sole.id).to eq(year_id)
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
end
