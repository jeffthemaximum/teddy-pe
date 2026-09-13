require "rails_helper"

RSpec.describe "athlete entries", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:teddy)  { create(:user, :athlete) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  let(:body) do
    { athlete_entry: { program_year_id: year.id, session_date: "2026-09-17", felt: 5,
                       best: "The cartwheel felt like flying", hard: "Left hand dribbling" } }
  end

  it "lets Teddy write his own entry" do
    post "/api/v1/athlete_entries", params: body, as: :json, headers: auth(teddy)
    expect(response).to have_http_status(:ok)
    expect(AthleteEntry.sole.best).to eq("The cartwheel felt like flying")
  end

  it "keeps it private until he says otherwise" do
    post "/api/v1/athlete_entries", params: body, as: :json, headers: auth(teddy)
    expect(AthleteEntry.sole.shared).to be(false)
  end

  it "hides an unshared entry from the coach entirely" do
    entry = create(:athlete_entry, user: teddy, program_year: year)

    get "/api/v1/athlete_entries", headers: auth(coach)
    expect(JSON.parse(response.body)["athlete_entries"]).to be_empty

    get "/api/v1/athlete_entries/#{entry.id}", headers: auth(coach)
    expect(response).to have_http_status(:not_found)
    expect(response.body).not_to include("cartwheel")
  end

  it "shows the coach an entry once Teddy shares it" do
    entry = create(:athlete_entry, :shared, user: teddy, program_year: year)
    get "/api/v1/athlete_entries/#{entry.id}", headers: auth(coach)
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).dig("athlete_entry", "best")).to eq("The cartwheel")
  end

  it "lets Teddy flip the toggle back off" do
    entry = create(:athlete_entry, :shared, user: teddy, program_year: year)
    patch "/api/v1/athlete_entries/#{entry.id}",
      params: { athlete_entry: { shared: false } }, as: :json, headers: auth(teddy)
    expect(response).to have_http_status(:ok)

    get "/api/v1/athlete_entries", headers: auth(coach)
    expect(JSON.parse(response.body)["athlete_entries"]).to be_empty
  end

  it "never lets the coach write one" do
    post "/api/v1/athlete_entries", params: body, as: :json, headers: auth(coach)
    expect(response).to have_http_status(:forbidden)
  end

  it "shows a viewer nothing, shared or not" do
    create(:athlete_entry, :shared, user: teddy, program_year: year)
    get "/api/v1/athlete_entries", headers: auth(viewer)
    expect(response).to have_http_status(:forbidden)

    # The first real Pundit denial in the app: our envelope, not Rails' shape.
    parsed = JSON.parse(response.body)
    expect(parsed).to eq("error" => { "code" => "forbidden", "message" => "You do not have access to that." })
    expect(parsed).not_to have_key("status")
  end

  it "updates rather than duplicating when the same date is posted twice" do
    post "/api/v1/athlete_entries", params: body, as: :json, headers: auth(teddy)
    post "/api/v1/athlete_entries",
      params: body.deep_merge(athlete_entry: { felt: 3 }), as: :json, headers: auth(teddy)
    expect(AthleteEntry.count).to eq(1)
    expect(AthleteEntry.sole.felt).to eq(3)
  end
end
