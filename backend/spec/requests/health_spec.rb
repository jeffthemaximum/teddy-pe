require "rails_helper"

RSpec.describe "health", type: :request do
  # /healthz is the engine root, which runs the check named "default" and
  # nothing else. That used to be "Application is running", so Fly's 30 second
  # probe and the release gate in fly.toml asked whether Puma answered and
  # never whether the database did. The real check is registered under both
  # names now, so these run over every path a caller can reach.
  PATHS = %w[/healthz /healthz/all /healthz/database].freeze

  # A PG::ConnectionBad message carries the host, the port, the database and
  # the user straight off the Neon connection string. These are the shapes
  # that must never reach a caller.
  NEON = 'connection to server at "ep-shy-frost-4871226.us-east-2.aws.neon.tech" ' \
         "(52.12.34.56), port 5432 failed: FATAL: password authentication failed " \
         'for user "teddy_pe_prod"'
  LEAKS = %w[neon.tech teddy_pe_prod 52.12.34.56 5432 PG:: password FATAL].freeze

  it "answers on every health path while the database is up" do
    PATHS.each do |path|
      get path
      expect(response).to have_http_status(:ok), path
      expect(response.body).to include("ok"), path
    end
  end

  # The healthy answer used to be the migration timestamp, which tells a
  # stranger which schema is running and tells Fly nothing it needs.
  it "says the database is up without saying anything else about it" do
    PATHS.each do |path|
      get path
      expect(response.body).not_to match(/\d{8,}/), "#{path} names a schema version"
      expect(response.body).not_to include("Schema"), path
    end
  end

  # Verified by breaking it. A check that cannot fail is decoration, and this
  # one is the deploy gate.
  it "fails on every health path when the database is unreachable" do
    allow(ActiveRecord::Base).to receive(:connection).and_raise(PG::ConnectionBad.new(NEON))

    PATHS.each do |path|
      get path
      expect(response).to have_http_status(:internal_server_error), path
      expect(response.body).to include("not ok"), path
    end
  end

  it "reports the failure without quoting the driver" do
    allow(ActiveRecord::Base).to receive(:connection).and_raise(PG::ConnectionBad.new(NEON))

    PATHS.each do |path|
      get path
      LEAKS.each { |secret| expect(response.body).not_to include(secret), "#{path} leaks #{secret}" }
    end
  end

  it "names itself at the root" do
    get "/"
    expect(response.body).to eq("Teddy PE API")
  end
end
