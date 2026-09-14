require "rails_helper"

RSpec.describe "athlete entries", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:teddy)  { create(:user, :athlete) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user: user)}" }

  let(:stamp_body) do
    { athlete_entry: { program_year_id: year.id, session_date: "2026-09-17", felt: 5 } }
  end

  # Same reason as the coach's entry: the offline queue can replay a stale
  # write onto a newer one, and nothing in the payload said how old the row
  # the client is holding was.
  it "stamps the entry with when it was last written" do
    post "/api/v1/athlete_entries", params: stamp_body, as: :json, headers: auth(teddy)
    written = JSON.parse(response.body)["athlete_entry"]
    expect(written["updated_at"]).to be_present

    get "/api/v1/athlete_entries", headers: auth(teddy)
    expect(JSON.parse(response.body)["athlete_entries"].first["updated_at"]).to eq(written["updated_at"])

    travel_to(2.days.from_now) do
      patch "/api/v1/athlete_entries/#{written['id']}",
        params: { athlete_entry: { best: "Actually the jump rope" } }, as: :json, headers: auth(teddy)
    end
    expect(JSON.parse(response.body)["athlete_entry"]["updated_at"]).to be > written["updated_at"]
  end

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

  # A deleted entry is excluded everywhere an unshared one is. These read the
  # column set directly by the factory rather than through the endpoint, so
  # they fail if a read path forgets, whether or not the endpoint works.
  #
  # Two entries, one deleted. One entry on its own proves nothing here: an
  # empty list looks exactly the same whether the filter picked the right row
  # or removed everything it was given.
  describe "an entry he has deleted" do
    let!(:kept) do
      create(:athlete_entry, user: teddy, program_year: year,
             session_date: Date.new(2026, 9, 16), best: "The wall rally")
    end
    let!(:deleted) do
      create(:athlete_entry, :deleted, user: teddy, program_year: year,
             session_date: Date.new(2026, 9, 17), best: "The one he took back")
    end

    it "is gone from his own list, and the entry beside it is not" do
      get "/api/v1/athlete_entries", headers: auth(teddy)

      listed = JSON.parse(response.body)["athlete_entries"]
      expect(listed.map { |e| e["id"] }).to eq([ kept.id ])
      expect(listed.first["best"]).to eq("The wall rally")
      expect(response.body).not_to include("The one he took back")
    end

    it "is not found on show, while the entry beside it still is" do
      get "/api/v1/athlete_entries/#{deleted.id}", headers: auth(teddy)
      expect(response).to have_http_status(:not_found)
      expect(response.body).not_to include("The one he took back")

      get "/api/v1/athlete_entries/#{kept.id}", headers: auth(teddy)
      expect(response).to have_http_status(:ok)
    end

    it "cannot be edited back into view" do
      patch "/api/v1/athlete_entries/#{deleted.id}",
        params: { athlete_entry: { best: "Undeleted" } }, as: :json, headers: auth(teddy)
      expect(response).to have_http_status(:not_found)
      expect(deleted.reload.best).to eq("The one he took back")
    end

    it "keeps every word it had" do
      expect(AthleteEntry.count).to eq(2)
      expect(deleted.reload.best).to eq("The one he took back")
    end

    # The partial unique index earning its keep: the day he deleted is his to
    # write about again, and writing about it must not reopen the row that is
    # holding the words he took back.
    it "leaves the day free to be written about again, on a new row" do
      post "/api/v1/athlete_entries",
        params: { athlete_entry: { program_year_id: year.id, session_date: "2026-09-17",
                                   best: "A second go at Thursday" } },
        as: :json, headers: auth(teddy)
      expect(response).to have_http_status(:ok)

      written = JSON.parse(response.body)["athlete_entry"]
      expect(written["id"]).not_to eq(deleted.id)
      expect(deleted.reload.best).to eq("The one he took back")
      expect(AthleteEntry.count).to eq(3)
    end
  end

  it "updates rather than duplicating when the same date is posted twice" do
    post "/api/v1/athlete_entries", params: body, as: :json, headers: auth(teddy)
    post "/api/v1/athlete_entries",
      params: body.deep_merge(athlete_entry: { felt: 3 }), as: :json, headers: auth(teddy)
    expect(AthleteEntry.count).to eq(1)
    expect(AthleteEntry.sole.felt).to eq(3)
  end
end
