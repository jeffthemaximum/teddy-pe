require "rails_helper"

RSpec.describe "progression", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)    { ProgramYear.sole }
  let(:athlete) { year.athlete }
  let(:coach)   { create(:user, :coach) }
  let(:viewer)  { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  # A second year, so nothing can quietly assume there is one.
  let!(:next_year) do
    ProgramYear.create!(athlete: athlete, label: "2027-28", starts_on: Date.new(2027, 9, 13),
                        ends_on: Date.new(2028, 8, 13), status: "draft", ball_now: "green").tap do |y|
      y.battery_measures.create!(test_id: "t1", position: 1, label: "20m sprint", unit: "s", direction: "lower")
      y.battery_measures.create!(test_id: "h", position: 15, label: "Height", unit: "cm", direction: "growth")
      y.test_dates.create!(window: "2027-09", label: "Baseline", display: "Sep 13-17", position: 1)
    end
  end

  def record(year, window, test_id, value, on:)
    TestResult.create!(program_year: year, athlete: athlete,
                       test_date: year.test_dates.find_by!(window: window),
                       battery_measure: year.battery_measures.find_by!(test_id: test_id),
                       recorded_by_user: coach, raw_value: value, recorded_at: on)
  end

  before do
    record(year, "2026-09", "t1", "4.60", on: Time.zone.local(2026, 9, 16))
    record(year, "2026-12", "t1", "4.31", on: Time.zone.local(2026, 12, 9))
    record(next_year, "2027-09", "t1", "4.05", on: Time.zone.local(2027, 9, 15))
    record(year, "2026-09", "h", "128", on: Time.zone.local(2026, 9, 15))
    record(next_year, "2027-09", "h", "140", on: Time.zone.local(2027, 9, 15))
  end

  it "charts a battery measure across every year, not just this one" do
    get "/api/v1/progression", headers: auth(coach)
    expect(response).to have_http_status(:ok)

    sprint = JSON.parse(response.body)["battery"].find { |m| m["test_id"] == "t1" }
    expect(sprint["series"].map { |p| p["window"] }).to eq(%w[2026-09 2026-12 2027-09])
    expect(sprint["series"].map { |p| p["year_label"] }).to eq(%w[2026-27 2026-27 2027-28])
    expect(sprint["first"]).to eq("4.6")
    expect(sprint["latest"]).to eq("4.05")
    expect(sprint["change"]).to eq("better")
  end

  it "reports height over time with a growth pace" do
    get "/api/v1/progression", headers: auth(coach)
    height = JSON.parse(response.body)["height"]
    expect(height["series"].size).to eq(2)
    expect(height["cm_per_year"]).to be_within(0.5).of(12.0)
  end

  it "returns rank history in order" do
    cub = year.blocks.find_by!(key: "cub")
    cub.patches.order(:id).first(7).each do |patch|
      PatchAward.create!(athlete: athlete, program_year: year, patch: patch, awarded_on: Date.new(2026, 11, 8))
    end
    RankAward.create!(athlete: athlete, program_year: year, block: cub,
                      awarded_on: Date.new(2026, 11, 8), patch_count: 7)

    get "/api/v1/progression", headers: auth(coach)
    ranks = JSON.parse(response.body)["ranks"]
    expect(ranks.first).to include("block_key" => "cub", "patch_count" => 7, "year_label" => "2026-27")
  end

  it "carries drill mastery forward across years" do
    entry_2026 = create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17))
    entry_2027 = create(:coach_entry, user: coach, program_year: next_year, session_date: Date.new(2027, 9, 16))
    drill = Drill.find_by!(slug: "split-step")
    DrillRating.create!(coach_entry: entry_2026, drill: drill, program_year: year,
                        session_date: entry_2026.session_date, rating: "not_yet")
    DrillRating.create!(coach_entry: entry_2027, drill: drill, program_year: next_year,
                        session_date: entry_2027.session_date, rating: "owns")

    get "/api/v1/progression", headers: auth(coach)
    mastery = JSON.parse(response.body)["drills"].find { |d| d["slug"] == "split-step" }
    expect(mastery["latest"]).to eq("owns")
    expect(mastery["history"].map { |h| h["rating"] }).to eq(%w[not_yet owns])
    expect(mastery["history"].map { |h| h["year_label"] }).to eq(%w[2026-27 2027-28])
  end

  it "lets a viewer see progress but no journal-derived mastery" do
    # Real mastery data must exist, or this proves nothing: without it,
    # drills would come back empty whether the role check works or not.
    entry = create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17))
    drill = Drill.find_by!(slug: "split-step")
    DrillRating.create!(coach_entry: entry, drill: drill, program_year: year,
                        session_date: entry.session_date, rating: "owns")

    get "/api/v1/progression", headers: auth(viewer)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body["battery"]).to be_present
    expect(body["drills"]).to eq([])

    # The same data, read by the coach, does carry the mastery through.
    get "/api/v1/progression", headers: auth(coach)
    expect(JSON.parse(response.body)["drills"]).not_to be_empty
  end

  it "refuses an unauthenticated visitor" do
    get "/api/v1/progression"
    expect(response).to have_http_status(:unauthorized)
  end
end
