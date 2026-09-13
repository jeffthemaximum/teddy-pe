require "rails_helper"

RSpec.describe "program years", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  describe "GET /api/v1/program_years" do
    it "lists the years with no program content in them" do
      get "/api/v1/program_years", headers: auth(coach)
      expect(response).to have_http_status(:ok)
      years = JSON.parse(response.body)["program_years"]
      expect(years.size).to eq(1)
      expect(years.first).to include("label" => "2026-27", "status" => "active", "is_current" => true)
      expect(years.first).not_to have_key("areas")
    end
  end

  describe "GET /api/v1/program_years/:id" do
    subject(:payload) do
      get "/api/v1/program_years/#{year.id}", headers: auth(coach)
      JSON.parse(response.body)
    end

    it "returns the whole year in one response" do
      expect(payload.keys).to include(
        "id", "label", "starts_on", "ends_on", "status", "ball_now", "rank_rule", "north_star",
        "blocks", "areas", "patches", "ball_gates", "battery", "test_dates",
        "day_roles", "current_block_key", "current_week_id"
      )
    end

    it "carries the year's own facts, not just the collections" do
      expect(payload).to include(
        "id" => year.id,
        "label" => "2026-27",
        "starts_on" => "2026-09-14",
        "ends_on" => "2027-08-15",
        "status" => "active",
        "ball_now" => "green"
      )
      expect(payload["rank_rule"]).to eq("Earn 7 of 9 to become a Fox")
      expect(payload["north_star"]).to be_present
    end

    it "names the week containing the date asked about" do
      # current_week_id had no assertion at all, so it could have been nil
      # forever without a failing test. This is the field This Week loads from.
      get "/api/v1/program_years/#{year.id}?on=2026-09-17", headers: auth(coach)
      body = JSON.parse(response.body)

      expect(body["current_week_id"]).to eq(
        Week.joins(:month_plan)
            .find_by(month_plans: { program_year_id: year.id, month: "2026-09" }, number: 1).id
      )
    end

    it "falls back to today when the date is unreadable" do
      # Pinned inside the Cub block, because the expected value has to be
      # something only a real fallback to today can produce. Asserting against
      # today's own block outside the program year compares nil to nil, which
      # passes whatever the fallback does.
      travel_to Date.new(2026, 10, 1) do
        get "/api/v1/program_years/#{year.id}?on=not-a-date", headers: auth(coach)

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["current_block_key"]).to eq("cub")
      end
    end

    it "carries the nine areas with a cell per block, in block order" do
      areas = payload["areas"]
      expect(areas.size).to eq(9)
      expect(areas).to all(satisfy { |a| a["cells"].size == 6 })
      expect(areas.map { |a| a["slug"] }).to include("tennis", "basketball", "soccer", "mindset")

      # Each area's six cells must read Cub, Fox, Coyote, Wolf, Puma, Cheetah,
      # the block order, not whatever order Postgres happens to return.
      block_key_order = payload["blocks"].sort_by { |b| b["position"] }.map { |b| b["key"] }
      areas.each do |area|
        expect(area["cells"].map { |c| c["block_key"] }).to eq(block_key_order)
      end
    end

    it "carries the six blocks in position order" do
      expect(payload["blocks"].map { |b| b["key"] }).to eq(
        %w[cub fox coyote wolf puma cheetah]
      )
    end

    it "carries the seven fixed day roles" do
      roles = payload["day_roles"]
      expect(roles.size).to eq(7)
      expect(roles.map { |r| [ r["dow"], r["name"] ] }).to match_array(
        [ [ "mon", "Floor Day" ], [ "tue", "Rings Day" ], [ "wed", "Fast Day" ],
          [ "thu", "Wall Day" ], [ "fri", "Skate Day" ], [ "sat", "Game Day" ],
          [ "sun", "Court Day" ] ]
      )
    end

    it "carries the test dates in position order" do
      dates = payload["test_dates"]
      expect(dates.size).to eq(5)
      expect(dates.map { |d| d["label"] }).to eq(
        [ "Baseline", "Retest 1", "Retest 2", "Retest 3", "Final" ]
      )
    end

    it "orders the nine patches by their area's position, not merely returning nine" do
      patches = payload["patches"]
      expect(patches.size).to eq(9)
      expect(patches.map { |p| p["area_slug"] }).to eq(
        %w[speed power coordination strength throw tennis basketball soccer mindset]
      )
    end

    it "carries the battery as tests with their measures" do
      battery = payload["battery"]
      expect(battery["tests"].size).to eq(10)
      expect(battery["measures"].size).to eq(15)
      height = battery["measures"].find { |m| m["test_id"] == "h" }
      expect(height).to include("direction" => "growth", "battery_test_id" => nil)
    end

    it "names the active ball gate and carries no date on any gate" do
      gates = payload["ball_gates"]
      expect(gates.count { |g| g["status"] == "active" }).to eq(1)
      gates.each { |g| expect(g.keys).not_to include("date", "starts_on") }
    end

    it "names the current block from the date asked about" do
      get "/api/v1/program_years/#{year.id}?on=2027-01-20", headers: auth(coach)
      expect(JSON.parse(response.body)["current_block_key"]).to eq("coyote")
    end

    it "lets a viewer read the program" do
      get "/api/v1/program_years/#{year.id}", headers: auth(viewer)
      expect(response).to have_http_status(:ok)
    end

    it "tells an unauthenticated visitor nothing about Teddy" do
      get "/api/v1/program_years/#{year.id}"
      expect(response).to have_http_status(:unauthorized)
      expect(response.body).not_to match(/teddy|cartwheel|tennis/i)
    end

    it "404s a year that does not exist" do
      get "/api/v1/program_years/999999", headers: auth(coach)
      expect(response).to have_http_status(:not_found)
    end
  end
end
