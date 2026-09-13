require "rails_helper"

RSpec.describe "this week", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)  { ProgramYear.sole }
  let(:coach) { create(:user, :coach) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  it "returns the week containing the date asked about, with full cards" do
    get "/api/v1/program_years/#{year.id}/weeks/current?on=2026-09-17", headers: auth(coach)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)

    expect(body["number"]).to eq(1)
    expect(body["theme"]).to eq("Baseline & Land")
    expect(body["days"].size).to eq(7)

    thu = body["days"].find { |d| d["dow"] == "thu" }
    expect(thu).to include("name" => "Wall & Ball", "date" => "2026-09-17", "hie" => 2)
    expect(thu["dad_note"]).to start_with("Form over volume")
    expect(thu["blocks"].size).to eq(9)
  end

  it "renders block prose as tokens rather than markup" do
    get "/api/v1/program_years/#{year.id}/weeks/current?on=2026-09-17", headers: auth(coach)
    thu = JSON.parse(response.body)["days"].find { |d| d["dow"] == "thu" }
    block = thu["blocks"].find { |b| b["name"] == "New Thing" }

    expect(block["body_tokens"]).to be_an(Array)
    expect(block["body_tokens"].map { |t| t["text"] }.join).not_to include("<")
    expect(block["body_tokens"].any? { |t| t["type"] == "drill" }).to be(true)
    expect(block["drill_slugs"]).to be_an(Array).and(satisfy(&:any?))
  end

  it "carries the day's drill list, which the journal rates" do
    get "/api/v1/program_years/#{year.id}/weeks/current?on=2026-09-17", headers: auth(coach)
    thu = JSON.parse(response.body)["days"].find { |d| d["dow"] == "thu" }
    expect(thu["drill_slugs"]).to be_an(Array).and(satisfy(&:any?))
    expect(thu["drill_slugs"] - Drill.pluck(:slug)).to be_empty
  end

  it "falls back to the first week when the date is outside the plan" do
    get "/api/v1/program_years/#{year.id}/weeks/current?on=2027-05-01", headers: auth(coach)
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)["number"]).to eq(1)
  end

  it "refuses an unauthenticated visitor" do
    get "/api/v1/program_years/#{year.id}/weeks/current"
    expect(response).to have_http_status(:unauthorized)
  end

  it "opens the journal form filled in, and hides what Teddy has not shared" do
    coach = create(:user, :coach)
    teddy = create(:user, :athlete)
    create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17), note: "Good day")
    create(:athlete_entry, user: teddy, program_year: year, session_date: Date.new(2026, 9, 17))

    get "/api/v1/program_years/#{year.id}/weeks/current?on=2026-09-17",
      headers: { "Authorization" => "Bearer #{JwtService.encode(user: coach)}" }

    thu = JSON.parse(response.body)["days"].find { |d| d["dow"] == "thu" }
    expect(thu["coach_entry"]["note"]).to eq("Good day")
    expect(thu["athlete_entry"]).to be_nil
  end
end
