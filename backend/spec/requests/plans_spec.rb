require "rails_helper"

RSpec.describe "month plans", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)  { ProgramYear.sole }
  let(:coach) { create(:user, :coach) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  it "returns a month's weeks with their day summaries" do
    get "/api/v1/program_years/#{year.id}/plans/2026-09", headers: auth(coach)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)

    expect(body["month"]).to eq("2026-09")
    expect(body["label"]).to eq("Cub block · Weeks 1–3")
    expect(body["weeks"].size).to eq(3)

    week1 = body["weeks"].first
    expect(week1["theme"]).to eq("Baseline & Land")
    expect(week1["targets"].size).to be_between(5, 6)
    expect(week1["challenge"]).to be_present
    expect(week1["days"].size).to eq(7)
    expect(week1["days"].first).to include("dow" => "mon", "name" => "Land Like a Cat")
    expect(week1["days"].first["summary_lines"]).to be_an(Array)
  end

  it "reports the week's effort spend against its budget" do
    get "/api/v1/program_years/#{year.id}/plans/2026-09", headers: auth(coach)
    week1 = JSON.parse(response.body)["weeks"].first
    expect(week1).to include("high_intent_efforts" => 28, "budget" => 40)
  end

  it "404s a month with no plan" do
    get "/api/v1/program_years/#{year.id}/plans/2027-04", headers: auth(coach)
    expect(response).to have_http_status(:not_found)
  end

  it "refuses an unauthenticated visitor" do
    get "/api/v1/program_years/#{year.id}/plans/2026-09"
    expect(response).to have_http_status(:unauthorized)
  end
end
