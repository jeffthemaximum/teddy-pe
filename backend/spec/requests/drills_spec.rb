require "rails_helper"

RSpec.describe "drills", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:coach)  { create(:user, :coach) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  it "lists every drill to a signed-in user" do
    get "/api/v1/drills", headers: auth(coach)
    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body["drills"].size).to eq(84)
    expect(body["drills"].first.keys).to match_array(
      %w[slug name area_name aliases short how watch cue video]
    )
  end

  it "shows one drill by slug" do
    get "/api/v1/drills/a-march", headers: auth(coach)
    expect(response).to have_http_status(:ok)
    drill = JSON.parse(response.body)["drill"]
    expect(drill["name"]).to eq("A-march")
    expect(drill["how"]).to be_an(Array).and(satisfy(&:any?))
  end

  it "lets a viewer read them, because drills are program content" do
    get "/api/v1/drills", headers: auth(viewer)
    expect(response).to have_http_status(:ok)
  end

  # The privacy model inverts in this rewrite: the bundle is public, so every
  # word of program content has to sit behind the token.
  it "tells an unauthenticated visitor nothing" do
    get "/api/v1/drills"
    expect(response).to have_http_status(:unauthorized)
    expect(response.body).not_to include("cartwheel")
  end

  it "404s an unknown slug with the standard envelope" do
    get "/api/v1/drills/not-a-drill", headers: auth(coach)
    expect(response).to have_http_status(:not_found)
    expect(JSON.parse(response.body).dig("error", "code")).to eq("not_found")
  end
end
