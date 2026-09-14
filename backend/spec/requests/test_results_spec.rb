require "rails_helper"

RSpec.describe "test results", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:teddy)  { create(:user, :athlete) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  def post_result(user, test_id:, window: "2026-09", value:)
    post "/api/v1/test_results",
      params: { test_result: { program_year_id: year.id, window: window,
                               test_id: test_id, value: value } },
      as: :json, headers: auth(user)
  end

  it "records a number and parses it for the chart" do
    post_result(coach, test_id: "t1", value: "4.42")
    expect(response).to have_http_status(:ok)

    result = TestResult.sole
    expect(result.raw_value).to eq("4.42")
    expect(result.numeric_value).to eq(4.42)
    expect(result.battery_measure.test_id).to eq("t1")
    expect(result.test_date.window).to eq("2026-09")
  end

  # The offline queue replays a write onto the same row by design, so a phone
  # that has been offline two days can overwrite what the laptop saved
  # yesterday. It can only notice that it is about to when the payload says how
  # old the row it is holding is. Phase 2 cannot add this from the client.
  it "stamps every result with when it was last written" do
    post_result(coach, test_id: "t1", value: "4.42")
    written = JSON.parse(response.body)["test_result"]
    expect(written["updated_at"]).to be_present

    get "/api/v1/test_results?program_year_id=#{year.id}", headers: auth(coach)
    listed = JSON.parse(response.body)["test_results"].first
    expect(listed["updated_at"]).to eq(written["updated_at"])

    # A second write has to move it, or a client comparing stamps can never
    # tell a stale replay from a fresh one.
    travel_to(2.days.from_now) { post_result(coach, test_id: "t1", value: "4.31") }
    expect(JSON.parse(response.body)["test_result"]["updated_at"]).to be > written["updated_at"]
  end

  it "keeps a value it cannot parse rather than dropping it" do
    post_result(coach, test_id: "t8", value: "15 to 18")
    expect(response).to have_http_status(:ok)
    expect(TestResult.sole.raw_value).to eq("15 to 18")
    expect(TestResult.sole.numeric_value).to eq(15)
  end

  it "refuses a value with no digit in it" do
    post_result(coach, test_id: "t1", value: "pretty fast")
    expect(response).to have_http_status(:unprocessable_entity)
    expect(TestResult.count).to eq(0)
  end

  it "overwrites rather than duplicating on a second save" do
    post_result(coach, test_id: "t1", value: "4.42")
    post_result(coach, test_id: "t1", value: "4.31")
    expect(TestResult.count).to eq(1)
    expect(TestResult.sole.raw_value).to eq("4.31")
  end

  it "deletes the row when the value is cleared, so a mistype can be taken back" do
    post_result(coach, test_id: "t1", value: "4.42")
    post_result(coach, test_id: "t1", value: "")
    expect(response).to have_http_status(:ok)
    expect(TestResult.count).to eq(0)
  end

  it "refuses a measure that is not in this year's battery" do
    post_result(coach, test_id: "t99", value: "10")
    expect(response).to have_http_status(:not_found)
    expect(TestResult.count).to eq(0)
  end

  it "lets Teddy record his own numbers and a viewer record none" do
    post_result(teddy, test_id: "t5", value: "22")
    expect(response).to have_http_status(:ok)

    post_result(viewer, test_id: "t5", value: "30")
    expect(response).to have_http_status(:forbidden)
  end

  describe "GET /api/v1/test_results" do
    before do
      post_result(coach, test_id: "t1", window: "2026-09", value: "4.42")
      post_result(coach, test_id: "t5", window: "2026-09", value: "22")
    end

    it "lets the coach read what has been recorded" do
      get "/api/v1/test_results", headers: auth(coach)
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)["test_results"]
      expect(body.map { |r| r["test_id"] }).to contain_exactly("t1", "t5")
    end

    it "filters to the program year asked for" do
      other_year = create(:program_year)
      TestResult.create!(
        program_year: other_year, athlete: other_year.athlete,
        test_date: year.test_dates.first, battery_measure: year.battery_measures.first,
        raw_value: "99", numeric_value: 99, recorded_by_user: coach, recorded_at: Time.current
      )

      get "/api/v1/test_results", headers: auth(coach)
      expect(JSON.parse(response.body)["test_results"].size).to eq(3)

      get "/api/v1/test_results", params: { program_year_id: year.id }, headers: auth(coach)
      body = JSON.parse(response.body)["test_results"]
      expect(body.size).to eq(2)
      expect(body.map { |r| r["test_id"] }).to contain_exactly("t1", "t5")
    end

    it "lets a viewer read the results, since a viewer may read the program" do
      get "/api/v1/test_results", headers: auth(viewer)
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["test_results"].size).to eq(2)
    end

    it "refuses an unauthenticated visitor and gives back no numbers" do
      get "/api/v1/test_results"
      expect(response).to have_http_status(:unauthorized)
      expect(response.body).not_to include("4.42")
      expect(JSON.parse(response.body)).not_to have_key("test_results")
    end
  end

  describe "the progress panel" do
    before do
      post_result(coach, test_id: "t1", window: "2026-09", value: "4.60")
      post_result(coach, test_id: "t1", window: "2026-12", value: "4.31")
      post_result(coach, test_id: "h",  window: "2026-09", value: "128")
      post_result(coach, test_id: "h",  window: "2026-12", value: "131")
    end

    it "reports each measure's latest value and direction of travel" do
      get "/api/v1/program_years/#{year.id}", headers: auth(coach)
      progress = JSON.parse(response.body).dig("battery", "progress")

      sprint = progress.find { |p| p["test_id"] == "t1" }
      expect(sprint["baseline"]).to eq("4.6")
      expect(sprint["latest"]).to eq("4.31")
      expect(sprint["change"]).to eq("better")
      expect(sprint["series"].size).to eq(2)
    end

    it "reads height as growth rather than as better or worse" do
      get "/api/v1/program_years/#{year.id}", headers: auth(coach)
      height = JSON.parse(response.body).dig("battery", "progress").find { |p| p["test_id"] == "h" }
      expect(height["change"]).to eq("same")
      expect(height["cm_per_year"]).to be_within(0.5).of(12.0)
    end
  end
end
