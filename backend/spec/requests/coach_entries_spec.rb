require "rails_helper"

RSpec.describe "coach entries", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)    { ProgramYear.sole }
  let(:coach)   { create(:user, :coach) }
  let(:teddy)   { create(:user, :athlete) }
  let(:viewer)  { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  let(:body) do
    { coach_entry: { program_year_id: year.id, session_date: "2026-09-17", overall: 4,
                     energy: 3, flag_pain: false, note: "Finish stayed high all session.",
                     challenge_num: "12" },
      ratings: { "split-step" => "owns", "cartwheel-step-2" => "getting" } }
  end

  it "creates an entry with its drill ratings" do
    post "/api/v1/coach_entries", params: body, as: :json, headers: auth(coach)
    expect(response).to have_http_status(:ok)

    entry = CoachEntry.sole
    expect(entry.session_date).to eq(Date.new(2026, 9, 17))
    expect(entry.user).to eq(coach)
    expect(entry.program_year).to eq(year)
    expect(entry.drill_ratings.count).to eq(2)
    expect(entry.drill_ratings.joins(:drill).find_by(drills: { slug: "split-step" }).rating).to eq("owns")
  end

  it "links the entry to that date's day card" do
    post "/api/v1/coach_entries", params: body, as: :json, headers: auth(coach)
    expect(CoachEntry.sole.day_card.name).to eq("Wall & Ball")
  end

  # This is what makes the Phase 2 offline queue safe.
  it "updates rather than duplicating when the same date is posted twice" do
    post "/api/v1/coach_entries", params: body, as: :json, headers: auth(coach)
    post "/api/v1/coach_entries",
      params: body.deep_merge(coach_entry: { overall: 2 }), as: :json, headers: auth(coach)

    expect(CoachEntry.count).to eq(1)
    expect(CoachEntry.sole.overall).to eq(2)
  end

  it "keeps a rating that a later partial save leaves out" do
    post "/api/v1/coach_entries", params: body, as: :json, headers: auth(coach)
    post "/api/v1/coach_entries",
      params: body.merge(ratings: { "split-step" => "not_yet" }), as: :json, headers: auth(coach)

    entry = CoachEntry.sole
    expect(entry.drill_ratings.count).to eq(2)
    expect(entry.drill_ratings.joins(:drill).find_by(drills: { slug: "split-step" }).rating).to eq("not_yet")
  end

  it "refuses a rating that is not one of the three" do
    post "/api/v1/coach_entries",
      params: body.merge(ratings: { "split-step" => "brilliant" }), as: :json, headers: auth(coach)
    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body).dig("error", "code")).to eq("unprocessable")
  end

  it "ignores a drill slug that does not exist rather than failing the save" do
    post "/api/v1/coach_entries",
      params: body.merge(ratings: { "not-a-drill" => "owns" }), as: :json, headers: auth(coach)
    expect(response).to have_http_status(:ok)
    expect(CoachEntry.sole.drill_ratings.count).to eq(0)
  end

  it "lists a date range" do
    create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 16))
    create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 20))

    get "/api/v1/coach_entries?from=2026-09-15&to=2026-09-18", headers: auth(coach)
    dates = JSON.parse(response.body)["coach_entries"].map { |e| e["session_date"] }
    expect(dates).to eq([ "2026-09-16" ])
  end

  it "refuses the athlete and the viewer" do
    [ teddy, viewer ].each do |user|
      post "/api/v1/coach_entries", params: body, as: :json, headers: auth(user)
      expect(response).to have_http_status(:forbidden), user.role
    end
  end

  # Task 5 shipped render_forbidden with no caller. This is the first real
  # Pundit denial in the app, so this is where the envelope gets proven.
  it "denies the viewer in our envelope, not Rails' default shape" do
    post "/api/v1/coach_entries", params: body, as: :json, headers: auth(viewer)
    expect(response).to have_http_status(:forbidden)

    parsed = JSON.parse(response.body)
    expect(parsed).to eq("error" => { "code" => "forbidden", "message" => "You do not have access to that." })
    expect(parsed["error"]).to be_a(Hash)
    expect(parsed).not_to have_key("status")
  end
end
