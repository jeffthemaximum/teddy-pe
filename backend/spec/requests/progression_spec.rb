require "rails_helper"

RSpec.describe "progression", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)    { ProgramYear.find_by!(label: "2026-27") }
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
      y.test_dates.create!(window: "2027-09", label: "Baseline", display: "Sep 13-17", position: 1,
                           starts_on: Date.new(2027, 9, 13), ends_on: Date.new(2027, 9, 17))
    end
  end

  def record(year, window, test_id, value, on:)
    TestResult.create!(program_year: year, athlete: athlete,
                       test_date: year.test_dates.find_by!(window: window),
                       battery_measure: year.battery_measures.find_by!(test_id: test_id),
                       recorded_by_user: coach, raw_value: value, recorded_at: on)
  end

  # next_year carries no ContentSeeder content, so a block that can actually
  # rank up needs its own areas and patches built by hand.
  def rankable_block(program_year, key:)
    block = program_year.blocks.create!(key: key, name: key.capitalize, position: 99,
                                        starts_on: program_year.starts_on, ends_on: program_year.ends_on,
                                        focus: "probe")
    7.times do |i|
      area = program_year.areas.create!(slug: "#{key}-area-#{i}", name: "Area #{i}", position: i)
      program_year.patches.create!(block: block, area: area, name: "Patch #{i}", requirement: "Do it")
    end
    block
  end

  before do
    record(year, "2026-09", "t1", "4.60", on: Time.zone.local(2026, 9, 16))
    record(year, "2026-12", "t1", "4.31", on: Time.zone.local(2026, 12, 9))
    record(next_year, "2027-09", "t1", "4.05", on: Time.zone.local(2027, 9, 15))
    record(year, "2026-09", "h", "128", on: Time.zone.local(2026, 9, 15))
    record(next_year, "2027-09", "h", "140", on: Time.zone.local(2027, 9, 15))
  end

  # /me refuses to guess which child a request means once there are two, with
  # a comment saying why and a spec pinning it. This endpoint took Athlete.first
  # instead, and ProgressionPolicy#show? never looks at the record, so a second
  # child's whole rank history, battery and height series would be served to
  # anyone signed in, the viewer included. One child today, and the project's
  # stated position is that nothing may assume that.
  it "says nothing rather than guessing which child, once there are two" do
    create(:athlete, name: "A Second Child")

    get "/api/v1/progression", headers: auth(coach)

    expect(response).to have_http_status(:not_found)
    # Teddy's numbers are in the fixture above. None of them may appear.
    expect(response.body).not_to include("4.60", "4.05", "128", "140")
  end

  it "still answers for the coach's own child when the link is set" do
    create(:athlete, name: "A Second Child")
    coach.update!(athlete: athlete)

    get "/api/v1/progression", headers: auth(coach)

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)["battery"]).to be_present
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

  it "returns rank history in order, spanning every program year" do
    cub = year.blocks.find_by!(key: "cub")
    cub.patches.order(:id).first(7).each do |patch|
      PatchAward.create!(athlete: athlete, program_year: year, patch: patch, awarded_on: Date.new(2026, 11, 8))
    end
    RankAward.create!(athlete: athlete, program_year: year, block: cub,
                      awarded_on: Date.new(2026, 11, 8), patch_count: 7)

    # A second rank-up, on next_year's own block, dated after the first.
    # Deleting next_year should make this example fail: the year_label join
    # and the chronological order both depend on this second rank existing.
    next_cub = rankable_block(next_year, key: "cub")
    next_cub.patches.order(:id).first(7).each do |patch|
      PatchAward.create!(athlete: athlete, program_year: next_year, patch: patch, awarded_on: Date.new(2027, 11, 8))
    end
    RankAward.create!(athlete: athlete, program_year: next_year, block: next_cub,
                      awarded_on: Date.new(2027, 11, 8), patch_count: 7)

    get "/api/v1/progression", headers: auth(coach)
    ranks = JSON.parse(response.body)["ranks"]
    expect(ranks.map { |r| r["year_label"] }).to eq(%w[2026-27 2027-28])
    expect(ranks.first).to include("block_key" => "cub", "patch_count" => 7, "year_label" => "2026-27")
    expect(ranks.last).to include("block_key" => "cub", "patch_count" => 7, "year_label" => "2027-28")
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

  it "does not add queries as the athlete gains a third program year" do
    # Same pattern as plans_spec's per-week query guard: compare a smaller
    # request against a bigger one, so this only fails if scaling by year
    # returns rather than churning on every unrelated change.
    #
    # The rank award and drill rating below exist before either measurement,
    # so both associations already have something to eager-load. Skipping
    # this would make the "before" count reflect an empty collection, and
    # going from zero rows to one is a one-time preload query in Rails
    # regardless of year count, not evidence of per-year scaling either way.
    cub = year.blocks.find_by!(key: "cub")
    cub.patches.order(:id).first(7).each do |patch|
      PatchAward.create!(athlete: athlete, program_year: year, patch: patch, awarded_on: Date.new(2026, 11, 8))
    end
    RankAward.create!(athlete: athlete, program_year: year, block: cub,
                      awarded_on: Date.new(2026, 11, 8), patch_count: 7)

    entry = create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17))
    DrillRating.create!(coach_entry: entry, drill: Drill.find_by!(slug: "split-step"),
                        program_year: year, session_date: entry.session_date, rating: "owns")

    count = lambda do
      n = 0
      sub = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
        n += 1 unless payload[:name].to_s =~ /SCHEMA|TRANSACTION/
      end
      get "/api/v1/progression", headers: auth(coach)
      ActiveSupport::Notifications.unsubscribe(sub)
      n
    end

    # Warm up first: touch_last_seen only writes once per 15 minutes, so an
    # uncounted first request keeps that write out of both measurements.
    count.call
    before = count.call

    third_year = ProgramYear.create!(athlete: athlete, label: "2028-29", starts_on: Date.new(2028, 9, 11),
                                     ends_on: Date.new(2029, 8, 12), status: "draft", ball_now: "green")
    third_year.battery_measures.create!(test_id: "t1", position: 1, label: "20m sprint", unit: "s", direction: "lower")
    third_year.test_dates.create!(window: "2028-09", label: "Baseline", display: "Sep 11-15", position: 1,
                                  starts_on: Date.new(2028, 9, 11), ends_on: Date.new(2028, 9, 15))
    record(third_year, "2028-09", "t1", "3.90", on: Time.zone.local(2028, 9, 12))

    third_entry = create(:coach_entry, user: coach, program_year: third_year, session_date: Date.new(2028, 9, 12))
    DrillRating.create!(coach_entry: third_entry, drill: Drill.find_by!(slug: "split-step"),
                        program_year: third_year, session_date: third_entry.session_date, rating: "getting")

    third_block = rankable_block(third_year, key: "cub")
    third_block.patches.each do |patch|
      PatchAward.create!(athlete: athlete, program_year: third_year, patch: patch, awarded_on: Date.new(2028, 11, 1))
    end
    RankAward.create!(athlete: athlete, program_year: third_year, block: third_block,
                      awarded_on: Date.new(2028, 11, 1), patch_count: third_block.patches.count)

    expect(count.call).to eq(before)
  end
end
