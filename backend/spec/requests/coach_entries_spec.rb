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

  # The queue replays a write onto the same row on purpose. Without a stamp on
  # the payload, a phone that has been offline two days overwrites yesterday's
  # laptop edit and neither end can tell. Two devices and one coach makes that
  # uncommon, not impossible, and the day it happens Jeff loses a session note.
  it "stamps the entry with when it was last written" do
    post "/api/v1/coach_entries", params: body, as: :json, headers: auth(coach)
    written = JSON.parse(response.body)["coach_entry"]
    expect(written["updated_at"]).to be_present

    get "/api/v1/coach_entries", headers: auth(coach)
    expect(JSON.parse(response.body)["coach_entries"].first["updated_at"]).to eq(written["updated_at"])

    travel_to(2.days.from_now) do
      patch "/api/v1/coach_entries/#{written['id']}",
        params: { coach_entry: { note: "Second thoughts." } }, as: :json, headers: auth(coach)
    end
    expect(JSON.parse(response.body)["coach_entry"]["updated_at"]).to be > written["updated_at"]
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

    # The whole write is one transaction: a bad rating must not leave the
    # entry committed with only some of its ratings saved.
    expect(CoachEntry.count).to eq(0)
    expect(DrillRating.count).to eq(0)
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

  # Two entries, one deleted, for the same reason the athlete's own spec uses
  # two: a list that came back empty would look identical whether the filter
  # picked the right row or threw away everything.
  describe "an entry he has deleted" do
    let!(:kept) do
      create(:coach_entry, user: coach, program_year: year,
             session_date: Date.new(2026, 9, 16), note: "Split step landed every time.")
    end
    let!(:deleted) do
      create(:coach_entry, :deleted, user: coach, program_year: year,
             session_date: Date.new(2026, 9, 17), note: "The note he took back.")
    end

    it "is gone from the list, and the entry beside it is not" do
      get "/api/v1/coach_entries", headers: auth(coach)

      listed = JSON.parse(response.body)["coach_entries"]
      expect(listed.map { |e| e["id"] }).to eq([ kept.id ])
      expect(listed.first["note"]).to eq("Split step landed every time.")
      expect(response.body).not_to include("The note he took back.")
    end

    it "is gone from a date range that contains it" do
      get "/api/v1/coach_entries?from=2026-09-15&to=2026-09-18", headers: auth(coach)

      dates = JSON.parse(response.body)["coach_entries"].map { |e| e["session_date"] }
      expect(dates).to eq([ "2026-09-16" ])
    end

    it "cannot be edited back into view" do
      patch "/api/v1/coach_entries/#{deleted.id}",
        params: { coach_entry: { note: "Undeleted" } }, as: :json, headers: auth(coach)
      expect(response).to have_http_status(:not_found)
      expect(deleted.reload.note).to eq("The note he took back.")
    end

    it "keeps every word it had" do
      expect(CoachEntry.count).to eq(2)
      expect(deleted.reload.note).to eq("The note he took back.")
    end

    it "leaves the day free to be written about again, on a new row" do
      post "/api/v1/coach_entries",
        params: { coach_entry: { program_year_id: year.id, session_date: "2026-09-17",
                                 note: "A second go at Thursday." } },
        as: :json, headers: auth(coach)
      expect(response).to have_http_status(:ok)

      written = JSON.parse(response.body)["coach_entry"]
      expect(written["id"]).not_to eq(deleted.id)
      expect(deleted.reload.note).to eq("The note he took back.")
      expect(CoachEntry.count).to eq(3)
    end
  end

  describe "DELETE /api/v1/coach_entries/:id" do
    let!(:kept) do
      create(:coach_entry, user: coach, program_year: year,
             session_date: Date.new(2026, 9, 16), note: "Split step landed every time.")
    end
    let!(:mine) do
      create(:coach_entry, user: coach, program_year: year,
             session_date: Date.new(2026, 9, 17), note: "The note he took back.")
    end

    it "lets Jeff delete his own, and leaves the entry beside it alone" do
      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(coach)
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body))
        .to eq("deleted" => { "id" => mine.id, "session_date" => "2026-09-17" })

      get "/api/v1/coach_entries", headers: auth(coach)
      expect(JSON.parse(response.body)["coach_entries"].map { |e| e["id"] }).to eq([ kept.id ])
    end

    it "keeps the row, its words and its drill ratings" do
      mine.replace_ratings!({ "split-step" => "owns" })

      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(coach)

      expect(CoachEntry.count).to eq(2)
      expect(mine.reload.note).to eq("The note he took back.")
      expect(mine.deleted_at).to be_present
      expect(mine.drill_ratings.count).to eq(1)
    end

    it "refuses Teddy, so he cannot delete Dad's notes" do
      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(teddy)
      expect(response).to have_http_status(:not_found)
      expect(mine.reload.deleted_at).to be_nil
    end

    it "refuses a second coach account reaching for this one's note" do
      someone_else = create(:user, :coach)

      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(someone_else)
      expect(response).to have_http_status(:not_found)
      expect(mine.reload.deleted_at).to be_nil
    end

    it "refuses a viewer" do
      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(viewer)
      expect(response).to have_http_status(:not_found)
      expect(mine.reload.deleted_at).to be_nil
    end

    it "refuses an unauthenticated caller" do
      delete "/api/v1/coach_entries/#{mine.id}"
      expect(response).to have_http_status(:unauthorized)
      expect(mine.reload.deleted_at).to be_nil
    end

    it "answers a second delete with not found and leaves the first stamp alone" do
      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(coach)
      first_stamp = mine.reload.deleted_at

      delete "/api/v1/coach_entries/#{mine.id}", headers: auth(coach)
      expect(response).to have_http_status(:not_found)
      expect(mine.reload.deleted_at).to eq(first_stamp)
      expect(CoachEntry.count).to eq(2)
    end
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
