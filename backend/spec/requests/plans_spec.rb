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
    expect(week1["challenge"]).to eq(
      "Silent Landings. 10 jumps off a step, count the silent ones. Monday number, Friday number."
    )
    expect(week1["days"].size).to eq(7)
    expect(week1["days"].first).to include("dow" => "mon", "name" => "Land Like a Cat")
    expect(week1["days"].first["summary_lines"]).to eq([
      "Stick landings, ground then curb",
      "Cartwheel step 1: bunny hops ×10 each way",
      "Basketball: pound, crossover, figure 8, 200 dribbles",
      "Challenge: Silent Landings (Mon)",
      "Champion's Log begins"
    ])
  end

  it "keeps the month view a summary" do
    get "/api/v1/program_years/#{year.id}/plans/2026-09", headers: auth(coach)
    day = JSON.parse(response.body)["weeks"].first["days"].first

    # One builder serves both screens, a flag apart. The month view is
    # summaries, so detail leaking in here means the flag stopped working.
    expect(day).not_to have_key("blocks")
    expect(day).not_to have_key("dad_note")
    expect(day).to include("summary_lines")
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

  it "does not add queries as a month gains weeks" do
    # The fix was to stop the count growing per week. An absolute number
    # would churn on every unrelated change, so this compares one month
    # against a wider one and only fails if per-week scaling returns.
    plan = MonthPlan.find_by!(month: "2026-09")
    count = lambda do
      n = 0
      sub = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
        n += 1 unless payload[:name].to_s =~ /SCHEMA|TRANSACTION/
      end
      get "/api/v1/program_years/#{year.id}/plans/2026-09", headers: auth(coach)
      ActiveSupport::Notifications.unsubscribe(sub)
      n
    end

    # Warm up first: touch_last_seen only writes once per 15 minutes, so an
    # uncounted first request keeps that write out of both measurements
    # below rather than making the "before" count look one higher.
    count.call
    before = count.call

    2.times do |i|
      week = plan.weeks.create!(block: plan.block, number: 90 + i, position_in_block: 90 + i,
                                theme: "Probe", dates_display: "probe", trials: false,
                                targets: [ "Tennis: probe", "Basketball: probe", "Soccer: probe",
                                           "probe four", "probe five" ],
                                challenge: "probe")
      week.day_cards.create!(date: Date.new(2027, 7, 1 + i), dow: Date.new(2027, 7, 1 + i).strftime("%a").downcase,
                             name: "Probe", minutes: "30", intensity: 1, hie: 0, position: 0)
    end

    expect(count.call).to eq(before)
  end
end
