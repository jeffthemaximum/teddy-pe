# Phase 1: Rails API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Rails 8 API that owns Teddy's program, serves every view as one authenticated payload, and fails a test when a plan breaks a program rule.

**Architecture:** Program content is authored as YAML in `backend/content/` and seeded into Postgres by an idempotent rake task, so the repo stays the memory of the program while Postgres owns what Jeff and Teddy generate. Every endpoint sits under `/api/v1`, verifies a JWT bearer token, and returns one fat payload per view rather than many chatty endpoints. A content spec validates the YAML with no database at all, so a bad plan fails CI instead of reaching Teddy.

**Tech Stack:** Ruby 3.3.5, Rails 8.0 API-only, PostgreSQL (Neon), RSpec, FactoryBot, Pundit, JWT, bcrypt, active_model_serializers, Fly.io.

**Spec:** `docs/superpowers/specs/2026-09-13-rewrite-design.md`. Read it before Task 1. The brief it derives from is `docs/rewrite-prompt.md`.

## Global Constraints

- **Ruby 3.3.5, Rails ~> 8.0.** Pin in `.ruby-version` and `Gemfile`.
- **Gemfile is closed.** `rails`, `puma`, `pg`, `active_model_serializers`, `jwt`, `bcrypt`, `pundit`, `rack-cors`, `bootsnap`, `okcomputer`, plus dev and test: `rspec-rails`, `factory_bot_rails`, `faker`, `shoulda-matchers`, `database_cleaner-active_record`, `simplecov`, `rubocop-rails-omakase`, `brakeman`, `debug`. Anything else needs justification at the gate.
- **Never build:** Sidekiq, Redis, any worker process, `sidekiq-cron`, PostGIS, `rgeo`, `exponent-server-sdk`, a staging environment, or a second Fly app.
- **Error envelope is exactly `{ error: { code, message } }`** on every failure path. `core/`'s apiClient parses that and nothing else.
- **Nothing is hardcoded to "year one".** No constant, default, scope or serializer may assume a single `ProgramYear`. Every user-generated row carries `program_year_id`.
- **Writing style for all copy, comments and docs:** direct, warm, specific. Cues in Teddy's language. No em dashes anywhere. Avoid "it is not X, it is Y" constructions. Dad notes are one to three sentences of what to watch.
- **Branch discipline:** every commit lands on `feature/rails-react-rewrite`. Never commit to `main`, never rebase onto it, never merge it in.
- **Accounts:** Jeff Maxim `frey.maxim@gmail.com` coach, Teddy Maxim `teddymaxim225@gmail.com` athlete, Emily Barker `emmabark22@gmail.com` viewer. Teddy's birthday is 2019-01-09. No password is ever committed or seeded.
- **Run every command from `backend/`** unless a step says otherwise.

---

### Task 1: Rails skeleton that boots, tests and answers a health check

**Files:**
- Create: `backend/` (generated), `backend/.ruby-version`, `backend/Gemfile`, `backend/config/initializers/cors.rb`, `backend/config/routes.rb`, `backend/spec/spec_helper.rb`, `backend/spec/rails_helper.rb`, `backend/spec/requests/health_spec.rb`
- Modify: `backend/config/database.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a booting Rails app, `bundle exec rspec` as the test command, `GET /healthz` returning 200.

- [ ] **Step 1: Generate the app**

From the repo root:

```bash
gem install rails -v '~> 8.0.0'
rails new backend --api --database=postgresql \
  --skip-test --skip-action-mailbox --skip-action-text \
  --skip-active-storage --skip-action-cable --skip-jbuilder \
  --skip-kamal --skip-solid
echo '3.3.5' > backend/.ruby-version
```

- [ ] **Step 2: Write the Gemfile**

Replace `backend/Gemfile` entirely:

```ruby
source "https://rubygems.org"

ruby "3.3.5"

gem "rails", "~> 8.0.0"
gem "puma", "~> 6.4"
gem "pg", "~> 1.5"

# JSON API
gem "active_model_serializers", "~> 0.10"

# Auth
gem "jwt", "~> 2.8"
gem "bcrypt", "~> 3.1"

# Authorization
gem "pundit", "~> 2.4"

# CORS for the web app origin
gem "rack-cors", "~> 2.0"

# Boot speed
gem "bootsnap", ">= 1.18", require: false

# Health check for Fly
gem "okcomputer", "~> 1.18"

group :development, :test do
  gem "rspec-rails", "~> 7.0"
  gem "factory_bot_rails", "~> 6.4"
  gem "faker", "~> 3.4"
  gem "debug", platforms: %i[mri], require: "debug/prelude"
  gem "rubocop-rails-omakase", require: false
  gem "brakeman", require: false
end

group :test do
  gem "shoulda-matchers", "~> 6.4"
  gem "database_cleaner-active_record", "~> 2.2"
  gem "simplecov", require: false
end
```

Then:

```bash
cd backend && bundle install
```

- [ ] **Step 3: Point the database at DATABASE_URL when it is set**

Replace `backend/config/database.yml`:

```yaml
default: &default
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS", 5) %>

development:
  <<: *default
  url: <%= ENV.fetch("DATABASE_URL", "postgresql://localhost/teddy_pe_development") %>

# Tests run against a local Postgres so the suite is fast and needs no network.
# If there is no local Postgres, set TEST_DATABASE_URL to a Neon branch.
test:
  <<: *default
  url: <%= ENV.fetch("TEST_DATABASE_URL", "postgresql://localhost/teddy_pe_test") %>

production:
  <<: *default
  url: <%= ENV.fetch("DATABASE_URL") %>
```

- [ ] **Step 4: Install RSpec and configure it**

```bash
bundle exec rails generate rspec:install
```

Replace `backend/spec/rails_helper.rb`:

```ruby
require "spec_helper"
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"

abort("The Rails environment is running in production mode!") if Rails.env.production?

require "rspec/rails"
require "database_cleaner/active_record"
require "simplecov"
SimpleCov.start "rails"

Dir[Rails.root.join("spec/support/**/*.rb")].sort.each { |f| require f }

ActiveRecord::Migration.maintain_test_schema!

RSpec.configure do |config|
  config.fixture_paths = [Rails.root.join("spec/fixtures")]
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  config.include FactoryBot::Syntax::Methods

  config.before(:suite) { DatabaseCleaner.clean_with(:truncation) }
  config.before(:each) { DatabaseCleaner.strategy = :transaction }
  config.around(:each) { |example| DatabaseCleaner.cleaning { example.run } }
end

Shoulda::Matchers.configure do |config|
  config.integrate do |with|
    with.test_framework :rspec
    with.library :rails
  end
end
```

The content spec in Task 3 deliberately requires only `spec_helper`, so it runs with no database and no Rails boot.

- [ ] **Step 5: Add the health check and CORS**

`backend/config/routes.rb`:

```ruby
Rails.application.routes.draw do
  # Liveness and readiness for Fly.
  mount OkComputer::Engine, at: "/healthz"

  namespace :api do
    namespace :v1 do
      # Endpoints arrive in later tasks.
    end
  end

  root to: ->(_env) { [ 200, { "Content-Type" => "text/plain" }, [ "Teddy PE API" ] ] }
end
```

`backend/config/initializers/cors.rb`:

```ruby
# The web app is the only browser origin that talks to this API. The native app
# sends no Origin header, so it needs no entry here.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("WEB_ORIGIN", "http://localhost:5173").split(",")
    resource "/api/*",
      headers: :any,
      methods: %i[get post patch put delete options head],
      credentials: false
  end
end
```

- [ ] **Step 6: Write the failing health spec**

`backend/spec/requests/health_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "health", type: :request do
  it "answers on /healthz" do
    get "/healthz"
    expect(response).to have_http_status(:ok)
  end

  it "names itself at the root" do
    get "/"
    expect(response.body).to eq("Teddy PE API")
  end
end
```

- [ ] **Step 7: Create the databases and run the suite**

```bash
bundle exec rails db:create
bundle exec rspec
```

Expected: 2 examples, 0 failures. If `db:create` fails because there is no local Postgres, stop and tell Jeff before setting `TEST_DATABASE_URL` to a Neon branch, because that makes every later task slower.

- [ ] **Step 8: Commit**

```bash
git add backend .gitignore
git commit -m "Rails 8 API skeleton that boots, tests and answers a health check

API-only, Ruby 3.3.5, Postgres through DATABASE_URL. RSpec with
FactoryBot, shoulda and database_cleaner. okcomputer at /healthz because
Fly wants one, and rack-cors scoped to the web origin only.

No Sidekiq, no Redis, no worker, no PostGIS, no staging. The Gemfile is
the closed list from the spec.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Convert `data/*.json` into `backend/content/`

**Files:**
- Create: `backend/script/convert_legacy_content.rb`
- Create (generated, then committed): `backend/content/program_years/2026-27/program.yml`, `backend/content/program_years/2026-27/drills.yml`, `backend/content/program_years/2026-27/plans/2026-09.yml`

**Interfaces:**
- Consumes: `data/program.json`, `data/drills.json`, `data/plans/2026-09.json` at the repo root.
- Produces: the three YAML files whose exact shape Task 3 validates and Tasks 6 to 9 seed from.

The converter is one-shot. It is deleted in Phase 3 along with `data/`. It exists so the conversion is reviewable and repeatable rather than hand-typed.

- [ ] **Step 1: Write the converter**

`backend/script/convert_legacy_content.rb`:

```ruby
#!/usr/bin/env ruby
# One-shot conversion of the legacy data/*.json into backend/content/.
# Deleted in Phase 3 with the rest of the old pipeline. Run from backend/:
#   bundle exec ruby script/convert_legacy_content.rb
require "json"
require "yaml"
require "date"
require "fileutils"

ROOT    = File.expand_path("../..", __dir__)
LEGACY  = File.join(ROOT, "data")
OUT     = File.expand_path("../content/program_years/2026-27", __dir__)

program = JSON.parse(File.read(File.join(LEGACY, "program.json")))
drills  = JSON.parse(File.read(File.join(LEGACY, "drills.json")))
plan    = JSON.parse(File.read(File.join(LEGACY, "plans/2026-09.json")))

# Areas carry no slug in the legacy data. These are the nine, in order.
AREA_SLUGS = {
  "Speed & Acceleration"  => "speed",
  "Power & Landing"       => "power",
  "Coordination & Balance" => "coordination",
  "Strength & Resilience" => "strength",
  "Throw & Catch"         => "throw",
  "Tennis"                => "tennis",
  "Basketball"            => "basketball",
  "Soccer"                => "soccer",
  "Compete & Mindset"     => "mindset"
}.freeze

# Patch labels are shortened versions of the area names, so they need an
# explicit mapping rather than a fuzzy match.
PATCH_AREA = {
  "Speed" => "speed", "Power & Landing" => "power", "Coordination" => "coordination",
  "Strength" => "strength", "Throw & Catch" => "throw", "Tennis" => "tennis",
  "Basketball" => "basketball", "Soccer" => "soccer", "Compete & Mindset" => "mindset"
}.freeze

DOW = %w[mon tue wed thu fri sat sun].freeze
MONTH_ABBR = %w[Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec]
  .each_with_index.to_h { |m, i| [ m, i + 1 ] }.freeze

# sheetRows is the 15 recordable rows. Map each to the battery test it belongs
# to by position; height belongs to none.
MEASURE_TEST = {
  "t1" => 1, "t2" => 2, "t3r" => 3, "t3l" => 3, "t4r" => 4, "t4l" => 4,
  "t5" => 5, "t6" => 6, "t7" => 7, "t8" => 8, "t9" => 9, "t10" => 10,
  "t11r" => nil, "t11l" => nil, "h" => nil
}.freeze

def die(message)
  warn "convert: #{message}"
  exit 1
end

blocks = program["blocks"].each_with_index.map do |b, i|
  { "key" => b["k"], "name" => b["name"], "position" => i + 1,
    "starts_on" => b["start"], "ends_on" => b["end"], "focus" => b["focus"] }
end
block_keys = blocks.map { |b| b["key"] }

areas = program["areas"].each_with_index.map do |a, i|
  slug = AREA_SLUGS.fetch(a["n"]) { die("unknown area #{a['n']}") }
  cells = program["cells"][i]
  die("area #{slug} has #{cells.size} cells, expected #{block_keys.size}") unless cells.size == block_keys.size
  { "slug" => slug, "position" => i + 1, "name" => a["n"], "summary" => a["s"],
    "cells" => block_keys.zip(cells).to_h }
end

# The authored patches are the Cub rank's nine. Later ranks are written when
# their block is planned.
patches = program["patches"].map do |(label, requirement)|
  { "block" => "cub", "area" => PATCH_AREA.fetch(label) { die("unknown patch area #{label}") },
    "name" => label, "requirement" => requirement }
end

ball_gates = program["gates"].each_with_index.map do |(from, to, label, requirement, status), i|
  { "position" => i + 1, "from_ball" => from, "to_ball" => to,
    "label" => label, "requirement" => requirement, "status" => status }
end

battery_tests = program["battery"].each_with_index.map do |(name, protocol, area_name, unit), i|
  { "position" => i + 1, "name" => name, "protocol" => protocol,
    "area_name" => area_name, "unit" => unit }
end

measures = program["sheetRows"].each_with_index.map do |(label, unit, test_id, direction), i|
  die("sheetRow #{test_id} is not mapped") unless MEASURE_TEST.key?(test_id)
  { "test_id" => test_id, "position" => i + 1, "label" => label, "unit" => unit,
    "direction" => direction, "battery_test_position" => MEASURE_TEST[test_id] }
end

test_dates = program["testDates"].each_with_index.map do |(window, label, display), i|
  { "window" => window, "label" => label, "display" => display, "position" => i + 1 }
end

day_roles = program["roles"].each_with_index.map do |(dow, name, _org, minutes, intensity, note), i|
  { "dow" => dow.downcase, "position" => i, "name" => name,
    "organized" => program["org"].fetch(dow), "minutes" => minutes,
    "intensity" => intensity, "note" => note }
end

File.write(File.join(OUT, "program.yml"), {
  "athlete" => { "name" => "Teddy Maxim", "birthday" => "2019-01-09" },
  "program_year" => {
    "label" => "2026-27", "starts_on" => blocks.first["starts_on"],
    "ends_on" => blocks.last["ends_on"], "status" => "active",
    "ball_now" => program["ballNow"], "rank_rule" => program["rankRule"],
    "north_star" => program["northStar"]
  },
  "blocks" => blocks, "areas" => areas, "patches" => patches,
  "ball_gates" => ball_gates, "battery_tests" => battery_tests,
  "battery_measures" => measures, "test_dates" => test_dates, "day_roles" => day_roles
}.to_yaml)

File.write(File.join(OUT, "drills.yml"), {
  "drills" => drills.map do |slug, d|
    { "slug" => slug, "name" => d["name"], "area_name" => d["area"],
      "aliases" => d["aliases"] || [], "short" => d["short"], "how" => d["how"],
      "watch" => d["watch"], "cue" => d["cue"], "video" => d["video"] }
  end
}.to_yaml)

# ---- the month plan -------------------------------------------------------
# A day is written twice in the legacy file: a compact entry in weeks[].days
# and, for the current week only, a full card in cards.days. They are merged
# into one day here, and the converter fails if their names disagree.
plan_year, plan_month = plan["month"].split("-").map(&:to_i)
role_by_dow = day_roles.to_h { |r| [ r["dow"], r ] }

full_cards = plan["cards"]["days"].to_h do |d|
  abbr, dnum = d["date"].split
  mm = MONTH_ABBR.fetch(abbr)
  yyyy = plan_year + (mm < plan_month ? 1 : 0)
  [ Date.new(yyyy, mm, dnum.to_i).iso8601, d ]
end

weeks = plan["weeks"].map do |w|
  days = w["days"].map do |(dow, dnum, name, lines)|
    date = Date.new(plan_year, plan_month, dnum).iso8601
    role = role_by_dow.fetch(dow.downcase)
    card = full_cards[date]
    if card && card["name"] != name
      die("#{date} is named '#{name}' in the week list and '#{card['name']}' on the card")
    end
    day = { "dow" => dow.downcase, "date" => date, "name" => name,
            "role" => role["name"], "minutes" => role["minutes"],
            "intensity" => role["intensity"], "summary_lines" => lines }
    if card
      day["minutes"]  = card["mins"]
      day["intensity"] = card["level"]
      day["dad_note"] = card["dad"]
      day["blocks"] = card["blocks"].map do |(mins, bname, body, tag)|
        { "minutes" => mins, "name" => bname, "body" => body,
          "tag" => { "test" => "test", "ch" => "challenge" }[tag] }
      end
    end
    day
  end

  { "number" => w["n"], "position_in_block" => w["n"], "theme" => w["theme"],
    "dates_display" => w["dates"], "trials" => w["theme"].downcase.include?("trials"),
    "targets" => w["targets"], "challenge" => w["challenge"], "days" => days }
end

FileUtils.mkdir_p(File.join(OUT, "plans"))
File.write(File.join(OUT, "plans", "#{plan['month']}.yml"), {
  "month_plan" => { "month" => plan["month"], "block" => plan["block"],
                    "label" => plan["label"], "range_display" => plan["range"] },
  "weeks" => weeks
}.to_yaml)

puts "wrote program.yml (#{areas.size} areas, #{blocks.size} blocks, #{measures.size} measures)"
puts "wrote drills.yml (#{drills.size} drills)"
puts "wrote plans/#{plan['month']}.yml (#{weeks.size} weeks, #{weeks.sum { |w| w['days'].size }} days)"
```

- [ ] **Step 2: Run it**

```bash
mkdir -p content/program_years/2026-27/plans
bundle exec ruby script/convert_legacy_content.rb
```

Expected output:

```
wrote program.yml (9 areas, 6 blocks, 15 measures)
wrote drills.yml (84 drills)
wrote plans/2026-09.yml (3 weeks, 21 days)
```

If it dies on a name disagreement or an unknown area, that is a real inconsistency in the legacy data. Report it to Jeff rather than loosening the check.

- [ ] **Step 3: Eyeball the output**

```bash
head -40 content/program_years/2026-27/program.yml
ruby -ryaml -e 'd=YAML.load_file("content/program_years/2026-27/plans/2026-09.yml"); w=d["weeks"][0]["days"][3]; puts w["date"], w["name"], w["blocks"].size, w["blocks"][3]["tag"].inspect'
```

Expected: `2026-09-17`, `Wall & Ball`, `9`, `"test"`.

- [ ] **Step 4: Commit**

```bash
git add backend/script backend/content
git commit -m "Convert data/*.json into backend/content/ YAML

Areas get slugs, which the legacy data never had, and patch labels map to
them explicitly because a patch is called Speed where its area is called
Speed & Acceleration.

The 15 sheetRows become battery measures, each pointing at the battery
test it belongs to. Single-leg balance and height point at none, which is
why the link is nullable.

A day was written twice in the legacy file, compact in weeks[].days and
full in cards.days. They are merged into one day, and the converter fails
loudly if the two names disagree.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The content spec, shape and referential integrity

**Files:**
- Create: `backend/spec/content_spec.rb`

**Interfaces:**
- Consumes: the three YAML files from Task 2.
- Produces: `bundle exec rspec spec/content_spec.rb` as the gate every future plan edit must pass.

This spec requires only `spec_helper`. It never boots Rails and never touches Postgres, so it runs in CI with no database and gives an answer in under a second.

- [ ] **Step 1: Write the spec**

`backend/spec/content_spec.rb`:

```ruby
require "spec_helper"
require "yaml"
require "date"

# Guards the hand-authored program against drift. It validates the YAML the
# seeder consumes, so a bad edit fails here instead of reaching Teddy.
#
# No Rails, no database. Everything this needs is in the files.
RSpec.describe "content integrity" do
  CONTENT = File.expand_path("../content/program_years/2026-27", __dir__)
  PROGRAM = YAML.load_file(File.join(CONTENT, "program.yml"))
  DRILLS  = YAML.load_file(File.join(CONTENT, "drills.yml"))["drills"]
  PLANS   = Dir[File.join(CONTENT, "plans/*.yml")].sort.map { |f| YAML.load_file(f) }

  DAY_ROLES = {
    "mon" => "Floor Day", "tue" => "Rings Day", "wed" => "Fast Day",
    "thu" => "Wall Day",  "fri" => "Skate Day", "sat" => "Game Day",
    "sun" => "Court Day"
  }.freeze

  let(:block_keys) { PROGRAM["blocks"].map { |b| b["key"] } }
  let(:area_slugs) { PROGRAM["areas"].map { |a| a["slug"] } }

  describe "the year" do
    it "runs from the first block to the last" do
      py = PROGRAM["program_year"]
      expect(py["starts_on"].to_s).to eq(PROGRAM["blocks"].first["starts_on"].to_s)
      expect(py["ends_on"].to_s).to eq(PROGRAM["blocks"].last["ends_on"].to_s)
    end

    it "has six blocks in order with no gaps" do
      expect(PROGRAM["blocks"].size).to eq(6)
      PROGRAM["blocks"].each_cons(2) do |a, b|
        expect(Date.parse(b["starts_on"].to_s)).to eq(Date.parse(a["ends_on"].to_s) + 1),
          "#{b['key']} starts #{b['starts_on']}, but #{a['key']} ends #{a['ends_on']}"
      end
    end
  end

  describe "areas" do
    it "has exactly nine, with unique slugs" do
      expect(area_slugs.size).to eq(9)
      expect(area_slugs.uniq.size).to eq(9)
    end

    it "gives every area a cell for every block" do
      PROGRAM["areas"].each do |a|
        expect(a["cells"].keys).to match_array(block_keys), "area #{a['slug']}"
        a["cells"].each { |k, v| expect(v.to_s.strip).not_to be_empty, "#{a['slug']}/#{k} is blank" }
      end
    end
  end

  describe "patches" do
    it "has nine for each rank that has any" do
      PROGRAM["patches"].group_by { |p| p["block"] }.each do |block, ps|
        expect(ps.size).to eq(9), "#{block} has #{ps.size} patches, needs 9"
        expect(ps.map { |p| p["area"] }.uniq.size).to eq(9), "#{block} repeats an area"
      end
    end

    it "references known blocks and areas" do
      PROGRAM["patches"].each do |p|
        expect(block_keys).to include(p["block"])
        expect(area_slugs).to include(p["area"])
      end
    end
  end

  describe "the tennis ball progression" do
    it "is gated on skill and never on a date" do
      PROGRAM["ball_gates"].each do |g|
        expect(g.keys).not_to include("date", "starts_on", "expected_on"),
          "#{g['label']} carries a date, and the gates move on skill only"
        expect(g["requirement"].to_s.strip).not_to be_empty
      end
    end

    it "has exactly one active gate" do
      expect(PROGRAM["ball_gates"].count { |g| g["status"] == "active" }).to eq(1)
    end
  end

  describe "the test battery" do
    it "has ten tests and fifteen recordable measures" do
      expect(PROGRAM["battery_tests"].size).to eq(10)
      expect(PROGRAM["battery_measures"].size).to eq(15)
    end

    it "records height at every test date" do
      expect(PROGRAM["battery_measures"].map { |m| m["test_id"] }).to include("h")
      height = PROGRAM["battery_measures"].find { |m| m["test_id"] == "h" }
      expect(height["direction"]).to eq("growth")
    end

    it "gives every measure a direction the chart can read" do
      PROGRAM["battery_measures"].each do |m|
        expect(%w[lower higher growth]).to include(m["direction"]), "measure #{m['test_id']}"
      end
    end

    it "points every measure at a real battery test, or at none on purpose" do
      positions = PROGRAM["battery_tests"].map { |t| t["position"] }
      PROGRAM["battery_measures"].each do |m|
        next if m["battery_test_position"].nil?
        expect(positions).to include(m["battery_test_position"]), "measure #{m['test_id']}"
      end
    end

    it "has unique test ids" do
      ids = PROGRAM["battery_measures"].map { |m| m["test_id"] }
      expect(ids.uniq.size).to eq(ids.size)
    end
  end

  describe "day roles" do
    it "are the seven fixed roles, in week order" do
      actual = PROGRAM["day_roles"].sort_by { |r| r["position"] }.to_h { |r| [ r["dow"], r["name"] ] }
      expect(actual).to eq(DAY_ROLES)
    end

    it "keeps Saturday off for the home program" do
      sat = PROGRAM["day_roles"].find { |r| r["dow"] == "sat" }
      expect(sat["minutes"]).to eq("off")
    end
  end

  describe "drills" do
    it "has unique slugs and no blank fields" do
      slugs = DRILLS.map { |d| d["slug"] }
      expect(slugs.uniq.size).to eq(slugs.size)
      DRILLS.each do |d|
        %w[name area_name short watch cue].each do |field|
          expect(d[field].to_s.strip).not_to be_empty, "#{d['slug']} has a blank #{field}"
        end
        expect(d["how"]).to be_an(Array).and(satisfy { |h| h.any? }), "#{d['slug']} has no how-to"
      end
    end

    it "names an area the year actually has" do
      names = PROGRAM["areas"].map { |a| a["name"] }
      DRILLS.each { |d| expect(names).to include(d["area_name"]), "drill #{d['slug']}" }
    end
  end

  describe "every month plan" do
    it "names a block the year has" do
      PLANS.each { |p| expect(block_keys).to include(p["month_plan"]["block"]) }
    end

    it "gives every week one theme, 5 or 6 sub-targets and a challenge" do
      each_week do |w, label|
        expect(w["theme"].to_s.strip).not_to be_empty, label
        expect(w["targets"].size).to be_between(5, 6), "#{label} has #{w['targets'].size} sub-targets"
        expect(w["challenge"].to_s.strip).not_to be_empty, label
      end
    end

    it "includes a tennis, a basketball and a soccer sub-target every week" do
      { "tennis" => /tennis/i, "basketball" => /basketball/i, "soccer" => /soccer|keeper/i }
        .each do |sport, pattern|
          each_week do |w, label|
            expect(w["targets"].any? { |t| t =~ pattern }).to be(true),
              "#{label} has no #{sport} sub-target"
          end
        end
    end

    it "puts every day on the role its weekday owns" do
      each_day do |d, label|
        expect(d["role"]).to eq(DAY_ROLES.fetch(d["dow"])), label
        expect(Date.parse(d["date"].to_s).strftime("%a").downcase).to eq(d["dow"]), label
      end
    end

    it "attempts the Challenge of the Week early and late" do
      each_week do |w, label|
        carded = w["days"].select { |d| d["blocks"] }
        next if carded.empty?
        early = carded.select { |d| %w[mon tue].include?(d["dow"]) }
        late  = carded.select { |d| d["dow"] == "fri" }
        expect(early.any? { |d| challenge?(d) }).to be(true), "#{label} has no early challenge attempt"
        expect(late.any? { |d| challenge?(d) }).to be(true), "#{label} has no Friday challenge attempt"
      end
    end

    it "counts ball skills in touches rather than minutes" do
      each_week do |w, label|
        carded = w["days"].select { |d| d["blocks"] }
        next if carded.empty?
        counted = carded.flat_map { |d| d["blocks"] }
          .select { |b| b["name"] =~ /basketball|soccer|tennis/i }
          .count { |b| b["body"] =~ /\d+\s*(dribbles|touches|passes|reps|swings|throws)/i }
        expect(counted).to be >= 1, "#{label} has no ball-skill block with a counted volume"
      end
    end

    it "makes week 8 of a block Trials" do
      each_week do |w, label|
        next unless w["position_in_block"] == 8
        expect(w["trials"]).to be(true), label
        expect(w["theme"]).to match(/trials/i), label
      end
    end

    it "leaves Saturday's home program off" do
      each_day do |d, label|
        next unless d["dow"] == "sat"
        expect(d["blocks"].to_a.count { |b| b["minutes"].to_s =~ /\d/ }).to be <= 1, label
      end
    end
  end

  describe "Jeff's running, limited through fall 2026" do
    # Fall cards keep him feeding, timing, demonstrating and competing from a
    # fixed position. Chase and race games phase in during the Coyote block.
    DAD_RUNS = /\bdad (?:sprints|races|chases|runs)\b|\brace (?:dad|him)\b|\bchase (?:dad|him)\b/i

    it "asks him to sprint, race or chase nowhere before December" do
      each_day do |d, label|
        next if Date.parse(d["date"].to_s) >= Date.new(2026, 12, 1)
        d["blocks"].to_a.each do |b|
          expect(b["body"].to_s).not_to match(DAD_RUNS), "#{label} #{b['name']}: #{b['body']}"
        end
      end
    end
  end

  def each_week
    PLANS.each do |p|
      p["weeks"].each { |w| yield w, "#{p['month_plan']['month']} week #{w['number']}" }
    end
  end

  def each_day
    each_week { |w, label| w["days"].each { |d| yield d, "#{label} #{d['dow']} #{d['date']}" } }
  end

  def challenge?(day)
    day["blocks"].to_a.any? { |b| b["tag"] == "challenge" || b["name"] =~ /challenge/i }
  end
end
```

- [ ] **Step 2: Run it**

```bash
bundle exec rspec spec/content_spec.rb
```

Expected: every example passes. If one fails, read the message before changing the spec. These are Jeff's rules, and a failure usually means the content is wrong rather than the test.

- [ ] **Step 3: Confirm it needs no database**

```bash
TEST_DATABASE_URL=postgresql://nowhere/nothing bundle exec rspec spec/content_spec.rb
```

Expected: still green. This is the property that lets it run in CI with no Postgres.

- [ ] **Step 4: Commit**

```bash
git add backend/spec/content_spec.rb
git commit -m "Content spec: the program's rules, as tests

Nine areas with a cell per block, nine patches per rank, the seven fixed
day roles, one theme and 5 or 6 sub-targets a week including tennis,
basketball and soccer, the challenge attempted early and late, ball
skills counted in touches, week 8 as Trials, height in the battery, and
one active ball gate carrying no date.

Also asserts no fall card asks Jeff to sprint, race or chase, because his
running is limited through fall 2026.

Requires spec_helper only, so it runs with no database and no Rails boot.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The high-intent effort budget

**Files:**
- Modify: `backend/content/program_years/2026-27/plans/2026-09.yml`
- Modify: `backend/script/convert_legacy_content.rb`
- Modify: `backend/spec/content_spec.rb`

**Interfaces:**
- Consumes: the plan YAML from Task 2 and the spec from Task 3.
- Produces: an `hie` integer on every day card, and the four load rules as tests.

**The numbers are already written.** Jeff's dad notes state them in prose, so this is extraction rather than estimation. Wednesday's note says "High-intent efforts today: 3 sprints, 3 jumps, 4 hops, 2 shuttles, 3 challenge jumps, about 15." Monday's says "Zero sprinting and zero jumping for distance today." Thursday's says "High-intent efforts stay near zero today." Friday's says "high-intent efforts 5 or fewer."

- [ ] **Step 1: Add `hie` to the converter's day hash**

In `convert_legacy_content.rb`, inside the `days = w["days"].map do ...` block, after `day["dad_note"] = card["dad"]`, add:

```ruby
      # Counted from Jeff's own dad notes, which state the number in prose.
      # See docs/superpowers/plans/2026-09-13-phase-1-rails-api.md, Task 4.
      day["hie"] = HIE.fetch(date) { die("no hie recorded for #{date}") }
```

and near the other constants:

```ruby
# High-intent efforts per day card, read out of the dad notes on each card.
# Week 1 totals 28 against a budget of 40.
HIE = {
  "2026-09-14" => 0,   # "Zero sprinting and zero jumping for distance today."
  "2026-09-15" => 6,   # 3 max throws each arm, "these are max efforts"
  "2026-09-16" => 15,  # "3 sprints, 3 jumps, 4 hops, 2 shuttles, 3 challenge jumps, about 15"
  "2026-09-17" => 2,   # "High-intent efforts stay near zero today"
  "2026-09-18" => 5,   # "high-intent efforts 5 or fewer"
  "2026-09-19" => 0,   # Game Day, home program off
  "2026-09-20" => 0    # Court Day, quick card and ball skills
}.freeze
```

Days with no full card (weeks 2 and 3) get `hie` from the day role's ceiling instead. Add, in the same block but outside the `if card` branch:

```ruby
    day["hie"] ||= ROLE_HIE.fetch(day["dow"])
```

and:

```ruby
# Ceilings for a day that has no full card yet. Wednesday carries most of the
# home budget, Thursday a little, Friday at most 5, Sunday and Monday zero.
ROLE_HIE = { "mon" => 0, "tue" => 6, "wed" => 20, "thu" => 8, "fri" => 5, "sat" => 0, "sun" => 0 }.freeze
```

- [ ] **Step 2: Re-run the converter and check the numbers landed**

```bash
bundle exec ruby script/convert_legacy_content.rb
ruby -ryaml -e 'd=YAML.load_file("content/program_years/2026-27/plans/2026-09.yml"); d["weeks"].each { |w| puts "week #{w["number"]}: " + w["days"].map { |x| "#{x["dow"]}=#{x["hie"]}" }.join(" ") + " total=#{w["days"].sum { |x| x["hie"] }}" }'
```

Expected:

```
week 1: mon=0 tue=6 wed=15 thu=2 fri=5 sat=0 sun=0 total=28
week 2: mon=0 tue=6 wed=20 thu=8 fri=5 sat=0 sun=0 total=39
week 3: mon=0 tue=6 wed=20 thu=8 fri=5 sat=0 sun=0 total=39
```

- [ ] **Step 3: Write the failing load rules**

Add to `spec/content_spec.rb`, inside `describe "every month plan"`:

```ruby
    it "stays inside the weekly high-intent effort budget" do
      each_week do |w, label|
        cap = w["trials"] ? 20 : 40
        total = w["days"].sum { |d| d["hie"].to_i }
        expect(total).to be <= cap, "#{label} spends #{total} high-intent efforts against a cap of #{cap}"
      end
    end

    it "spends nothing on Sunday or Monday and at most 5 on Friday" do
      each_day do |d, label|
        ceiling = { "sun" => 0, "mon" => 0, "fri" => 5 }[d["dow"]]
        next if ceiling.nil?
        expect(d["hie"].to_i).to be <= ceiling, "#{label} spends #{d['hie']}, ceiling is #{ceiling}"
      end
    end

    it "never runs two high-impact home days back to back" do
      each_week do |w, label|
        home = w["days"].reject { |d| d["dow"] == "sat" }.sort_by { |d| d["date"].to_s }
        home.each_cons(2) do |a, b|
          both_high = a["intensity"].to_i >= 3 && b["intensity"].to_i >= 3
          expect(both_high).to be(false), "#{label}: #{a['dow']} and #{b['dow']} are both high impact"
        end
      end
    end

    it "gives every day card a high-intent effort count" do
      each_day { |d, label| expect(d["hie"]).to be_an(Integer), "#{label} has no hie" }
    end
```

- [ ] **Step 4: Run the spec**

```bash
bundle exec rspec spec/content_spec.rb
```

Expected: all green. If the budget test fails, the content is over budget and Jeff decides what comes out. Do not raise the cap.

- [ ] **Step 5: Print the table for Jeff's correction at the gate**

```bash
ruby -ryaml -e 'd=YAML.load_file("content/program_years/2026-27/plans/2026-09.yml"); puts "%-5s %-12s %-22s %4s %4s" % %w[dow date name int hie]; d["weeks"].each { |w| w["days"].each { |x| puts "%-5s %-12s %-22s %4s %4s" % [x["dow"], x["date"], x["name"][0,22], x["intensity"], x["hie"]] }; puts "week #{w["number"]} total #{w["days"].sum { |y| y["hie"] }}"; puts }'
```

Save the output. It goes in the Phase 1 gate report.

- [ ] **Step 6: Commit**

```bash
git add backend/script backend/content backend/spec/content_spec.rb
git commit -m "High-intent effort budget, as a number per day card

Jeff's dad notes already state the count in prose, so these are read out
rather than estimated. Wednesday's note says '3 sprints, 3 jumps, 4 hops,
2 shuttles, 3 challenge jumps, about 15'. Monday's says zero sprinting and
zero jumping. Thursday's says near zero. Friday's says 5 or fewer.

Week 1 totals 28 against a budget of 40. Weeks 2 and 3 have no full cards
yet, so they take the day role's ceiling.

Four rules now fail a test: the weekly cap of 40 and 20 in Trials weeks,
zero on Sunday and Monday, at most 5 on Friday, and never two consecutive
high-impact home days.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Auth, and the accounts that use it

**Files:**
- Create: `backend/app/services/jwt_service.rb`, `backend/app/models/user.rb`, `backend/app/models/athlete.rb`, `backend/app/controllers/api/v1/api_controller.rb`, `backend/app/controllers/api/v1/auth_controller.rb`, `backend/app/controllers/api/v1/me_controller.rb`, `backend/app/serializers/user_serializer.rb`, `backend/app/policies/application_policy.rb`, `backend/lib/tasks/users.rake`
- Create: `backend/spec/factories/users.rb`, `backend/spec/factories/athletes.rb`, `backend/spec/services/jwt_service_spec.rb`, `backend/spec/requests/auth_spec.rb`
- Modify: `backend/config/routes.rb`, `backend/app/controllers/application_controller.rb`

**Interfaces:**
- Consumes: the skeleton from Task 1.
- Produces: `JwtService.encode(user_id:, ttl:)` and `.decode(token)`; `Api::V1::ApiController` with `authorize_request`, `current_user`, `render_error(code, message, status)`, `render_unauthorized`, `render_forbidden`, `render_not_found`, `render_unprocessable`; `User#coach?`, `#athlete?`, `#viewer?`; `Athlete#age_on(date)`; `POST /api/v1/auth/login`; `GET /api/v1/me`; `PATCH /api/v1/me`.

- [ ] **Step 1: Write the migrations**

`backend/db/migrate/<ts>_create_users.rb`:

```ruby
class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    enable_extension "citext" unless extension_enabled?("citext")

    create_table :users do |t|
      t.citext :email, null: false
      t.string :password_digest, null: false
      t.string :name, null: false
      t.string :role, null: false, default: "viewer"
      t.datetime :last_seen_at
      t.timestamps
    end

    add_index :users, :email, unique: true
    add_check_constraint :users, "role in ('coach','athlete','viewer')", name: "users_role_check"
  end
end
```

`backend/db/migrate/<ts>_create_athletes.rb`:

```ruby
class CreateAthletes < ActiveRecord::Migration[8.0]
  def change
    create_table :athletes do |t|
      t.string :name, null: false
      t.date :birthday, null: false
      # Nullable so an athlete can exist before they have a login, and so a
      # second child needs no migration.
      t.references :user, foreign_key: true, index: { unique: true }
      t.timestamps
    end
  end
end
```

- [ ] **Step 2: Write the failing JWT spec**

`backend/spec/services/jwt_service_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe JwtService do
  it "round-trips a user id" do
    token = described_class.encode(user_id: 42)
    expect(described_class.decode(token)[:sub]).to eq(42)
  end

  it "rejects a token signed with another secret" do
    forged = JWT.encode({ sub: 1, exp: 1.day.from_now.to_i }, "not-our-secret", "HS256")
    expect { described_class.decode(forged) }.to raise_error(JwtService::InvalidToken)
  end

  it "rejects an expired token" do
    token = described_class.encode(user_id: 1, ttl: -1.second)
    expect { described_class.decode(token) }.to raise_error(JwtService::InvalidToken)
  end

  it "rejects gibberish" do
    expect { described_class.decode("nonsense") }.to raise_error(JwtService::InvalidToken)
  end
end
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bundle exec rspec spec/services/jwt_service_spec.rb`
Expected: FAIL with `uninitialized constant JwtService`.

- [ ] **Step 4: Write JwtService**

`backend/app/services/jwt_service.rb`:

```ruby
# HS256 tokens signed with secret_key_base.
#
# 90 days matches the life of the cookie the old passphrase gate issued, so
# signing in keeps feeling the same. A rejected token drops the client back to
# the login screen, which is the whole recovery path.
class JwtService
  ALG = "HS256".freeze
  DEFAULT_TTL = 90.days

  class InvalidToken < StandardError; end

  def self.encode(user_id:, ttl: DEFAULT_TTL)
    JWT.encode({ sub: user_id, iat: Time.current.to_i, exp: (Time.current + ttl).to_i }, secret, ALG)
  end

  def self.decode(token)
    decoded, _header = JWT.decode(token, secret, true, { algorithm: ALG })
    decoded.with_indifferent_access
  rescue JWT::DecodeError => e
    raise InvalidToken, e.message
  end

  def self.secret
    Rails.application.secret_key_base
  end
end
```

- [ ] **Step 5: Run it and watch it pass**

Run: `bundle exec rspec spec/services/jwt_service_spec.rb`
Expected: 4 examples, 0 failures.

- [ ] **Step 6: Write the models and factories**

`backend/app/models/user.rb`:

```ruby
class User < ApplicationRecord
  ROLES = %w[coach athlete viewer].freeze

  has_secure_password
  has_one :athlete, dependent: :nullify

  before_validation { self.email = email.to_s.strip.downcase.presence }

  validates :email, presence: true, uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true
  validates :role, inclusion: { in: ROLES }
  validates :password, length: { minimum: 12 }, allow_nil: true

  ROLES.each { |r| define_method("#{r}?") { role == r } }
end
```

`backend/app/models/athlete.rb`:

```ruby
class Athlete < ApplicationRecord
  belongs_to :user, optional: true
  has_many :program_years, dependent: :destroy

  validates :name, presence: true
  validates :birthday, presence: true

  def age_on(date)
    years = date.year - birthday.year
    date < birthday + years.years ? years - 1 : years
  end
end
```

`backend/spec/factories/users.rb`:

```ruby
FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "person#{n}@example.com" }
    name { Faker::Name.name }
    password { "a-long-enough-password" }
    role { "viewer" }

    trait(:coach)   { role { "coach" } }
    trait(:athlete) { role { "athlete" } }
  end
end
```

`backend/spec/factories/athletes.rb`:

```ruby
FactoryBot.define do
  factory :athlete do
    name { "Teddy Maxim" }
    birthday { Date.new(2019, 1, 9) }
  end
end
```

- [ ] **Step 7: Write the failing request spec**

`backend/spec/requests/auth_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "auth", type: :request do
  let!(:user) { create(:user, :coach, email: "jeff@example.com", password: "a-long-enough-password") }
  let(:token) { JwtService.encode(user_id: user.id) }

  describe "POST /api/v1/auth/login" do
    it "returns a jwt and the user" do
      post "/api/v1/auth/login", params: { email: "jeff@example.com", password: "a-long-enough-password" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["jwt"]).to be_present
      expect(body["user"]).to include("email" => "jeff@example.com", "role" => "coach")
      expect(body["user"]).not_to have_key("password_digest")
    end

    it "ignores the case of the email" do
      post "/api/v1/auth/login", params: { email: "JEFF@Example.COM", password: "a-long-enough-password" }
      expect(response).to have_http_status(:ok)
    end

    it "refuses a wrong password with the standard envelope" do
      post "/api/v1/auth/login", params: { email: "jeff@example.com", password: "wrong" }
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body)).to eq(
        "error" => { "code" => "unauthorized", "message" => "That email and password do not match." }
      )
    end

    it "says the same thing for an unknown email, so it leaks no account list" do
      post "/api/v1/auth/login", params: { email: "nobody@example.com", password: "whatever" }
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body).dig("error", "message")).to eq("That email and password do not match.")
    end
  end

  describe "GET /api/v1/me" do
    it "returns the signed-in user" do
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig("user", "email")).to eq("jeff@example.com")
    end

    it "refuses a missing token" do
      get "/api/v1/me"
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body).dig("error", "code")).to eq("unauthorized")
    end

    it "refuses a token for a user who no longer exists" do
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{JwtService.encode(user_id: 999_999)}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "refuses a forged token" do
      forged = JWT.encode({ sub: user.id, exp: 1.day.from_now.to_i }, "wrong", "HS256")
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{forged}" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "PATCH /api/v1/me" do
    it "updates the name" do
      patch "/api/v1/me", params: { user: { name: "Jeff Maxim" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(user.reload.name).to eq("Jeff Maxim")
    end

    it "refuses to promote itself" do
      viewer = create(:user)
      patch "/api/v1/me", params: { user: { role: "coach" } },
        headers: { "Authorization" => "Bearer #{JwtService.encode(user_id: viewer.id)}" }
      expect(response).to have_http_status(:ok)
      expect(viewer.reload.role).to eq("viewer")
    end
  end
end
```

- [ ] **Step 8: Run it and watch it fail**

Run: `bundle exec rspec spec/requests/auth_spec.rb`
Expected: FAIL with routing errors, since no route exists yet.

- [ ] **Step 9: Write the controllers, serializer and policy base**

`backend/app/controllers/application_controller.rb`:

```ruby
class ApplicationController < ActionController::API
  include Pundit::Authorization
end
```

`backend/app/controllers/api/v1/api_controller.rb`:

```ruby
module Api
  module V1
    # Base for every v1 endpoint. authorize_request runs before every action
    # unless a controller skips it explicitly.
    class ApiController < ApplicationController
      before_action :authorize_request
      after_action  :touch_last_seen

      attr_reader :current_user

      rescue_from JwtService::InvalidToken,           with: :render_unauthorized
      rescue_from Pundit::NotAuthorizedError,         with: :render_forbidden
      rescue_from ActiveRecord::RecordNotFound,       with: :render_not_found
      rescue_from ActiveRecord::RecordInvalid,        with: :render_unprocessable
      rescue_from ActionController::ParameterMissing, with: :render_bad_request

      # One write per session's worth of polling rather than hundreds.
      LAST_SEEN_THROTTLE = 15.minutes

      private

      def authorize_request
        token = bearer_token
        return render_unauthorized unless token

        payload = JwtService.decode(token)
        @current_user = User.find_by(id: payload[:sub])
        render_unauthorized unless @current_user
      end

      def bearer_token
        header = request.headers["Authorization"].to_s
        header.start_with?("Bearer ") ? header.split(" ", 2).last.presence : nil
      end

      def touch_last_seen
        return if current_user.nil?
        last = current_user.last_seen_at
        return if last.present? && last > LAST_SEEN_THROTTLE.ago
        current_user.update_column(:last_seen_at, Time.current)
      rescue StandardError => e
        # Never fail a real request over a bookkeeping write.
        Rails.logger.warn("[api] last_seen_at failed for user=#{current_user&.id}: #{e.message}")
      end

      def render_error(code, message, status)
        render json: { error: { code: code, message: message } }, status: status
      end

      def render_unauthorized(_e = nil) = render_error("unauthorized", "Invalid or missing token.", :unauthorized)
      def render_forbidden(_e = nil)    = render_error("forbidden", "You do not have access to that.", :forbidden)
      def render_not_found(_e = nil)    = render_error("not_found", "Not found.", :not_found)
      def render_unprocessable(e)       = render_error("unprocessable", e.record.errors.full_messages.join(", "), :unprocessable_entity)
      def render_bad_request(e)         = render_error("bad_request", e.message, :bad_request)
    end
  end
end
```

`backend/app/controllers/api/v1/auth_controller.rb`:

```ruby
module Api
  module V1
    class AuthController < ApiController
      skip_before_action :authorize_request, only: :login

      # POST /api/v1/auth/login
      def login
        user = User.find_by(email: params[:email].to_s.strip.downcase)

        # Same answer for a wrong password and an unknown email, so this never
        # tells a stranger which addresses have accounts.
        unless user&.authenticate(params[:password].to_s)
          return render_error("unauthorized", "That email and password do not match.", :unauthorized)
        end

        render json: { jwt: JwtService.encode(user_id: user.id), user: UserSerializer.new(user).as_json }
      end
    end
  end
end
```

`backend/app/controllers/api/v1/me_controller.rb`:

```ruby
module Api
  module V1
    class MeController < ApiController
      # GET /api/v1/me
      def show = render json: payload

      # PATCH /api/v1/me
      def update
        current_user.update!(update_params)
        render json: payload
      end

      private

      def payload
        athlete = current_user.athlete || Athlete.first
        {
          user: UserSerializer.new(current_user).as_json,
          athlete: athlete && { id: athlete.id, name: athlete.name, birthday: athlete.birthday },
          current_program_year_id: ProgramYear.current_for(athlete)&.id
        }
      end

      # Role is deliberately absent. Nobody promotes themselves.
      def update_params = params.require(:user).permit(:name, :password)
    end
  end
end
```

`backend/app/serializers/user_serializer.rb`:

```ruby
class UserSerializer < ActiveModel::Serializer
  attributes :id, :email, :name, :role
end
```

`backend/app/policies/application_policy.rb`:

```ruby
class ApplicationPolicy
  attr_reader :user, :record

  def initialize(user, record)
    @user = user
    @record = record
  end

  def index?   = false
  def show?    = false
  def create?  = false
  def update?  = false
  def destroy? = false

  # Everyone signed in can read the program itself. Journals and results
  # narrow this in their own policies.
  def read_program? = user.present?

  class Scope
    attr_reader :user, :scope

    def initialize(user, scope)
      @user = user
      @scope = scope
    end

    def resolve = scope.none
  end
end
```

`MeController` calls `ProgramYear.current_for`, which Task 6 writes. Create a stand-in now so this task's specs run, and let Task 6 replace the file completely. `backend/app/models/program_year.rb`:

```ruby
class ProgramYear < ApplicationRecord
  def self.current_for(_athlete, on: Date.current) = nil
end
```

Because no `program_years` table exists yet, add an empty migration for it in this task so the class loads:

```ruby
class CreateProgramYearsPlaceholder < ActiveRecord::Migration[8.0]
  def change
    create_table :program_years do |t|
      t.timestamps
    end
  end
end
```

Task 6 drops and recreates it with the real columns.

- [ ] **Step 10: Add the routes**

In `backend/config/routes.rb`, inside `namespace :v1 do`:

```ruby
      post  "auth/login", to: "auth#login"
      get   "me",         to: "me#show"
      patch "me",         to: "me#update"
```

- [ ] **Step 11: Migrate and run the spec**

Run:

```bash
bundle exec rails db:migrate
bundle exec rspec spec/requests/auth_spec.rb spec/services/jwt_service_spec.rb
```

Expected: 14 examples, 0 failures.

- [ ] **Step 12: Write the account rake task**

`backend/lib/tasks/users.rake`:

```ruby
namespace :users do
  desc "Create or update a user. EMAIL= NAME= ROLE=coach|athlete|viewer [PASSWORD=]"
  task create: :environment do
    email = ENV.fetch("EMAIL").strip.downcase
    # Generated and printed once. Nothing is ever committed or seeded.
    password = ENV["PASSWORD"].presence || SecureRandom.alphanumeric(20)

    user = User.find_or_initialize_by(email: email)
    user.assign_attributes(name: ENV.fetch("NAME"), role: ENV.fetch("ROLE"), password: password)
    user.save!

    puts "#{user.email}  #{user.role}"
    puts "password: #{password}"
    puts "Change it after the first sign-in. This is the only time it is shown."
  end

  desc "Link a user to the athlete record. EMAIL="
  task link_athlete: :environment do
    user = User.find_by!(email: ENV.fetch("EMAIL").strip.downcase)
    athlete = Athlete.first or abort("No athlete yet. Run content:seed first.")
    athlete.update!(user: user)
    puts "#{athlete.name} is now #{user.email}"
  end
end
```

- [ ] **Step 13: Run the whole suite and commit**

```bash
bundle exec rspec
git add backend
git commit -m "Auth: email and password to a JWT bearer token

has_secure_password with bcrypt, 90 day tokens signed with
secret_key_base, and authorize_request on every endpoint by default. The
error envelope is { error: { code, message } } everywhere, because the
shared apiClient parses that and nothing else.

A wrong password and an unknown email get the same answer, so the login
never tells a stranger which addresses have accounts. PATCH /me cannot
change a role.

Athlete is its own model with a nullable user_id, so a second child needs
no migration and an athlete can exist before they have a login.

Accounts come from rails users:create, which generates a password and
prints it once.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The year skeleton, and the seeder that fills it

**Files:**
- Create: `backend/db/migrate/<ts>_create_program_structure.rb`
- Create: `backend/app/models/{block,area,area_cell,patch,ball_gate,test_date,day_role}.rb`
- Create: `backend/app/services/content_seeder.rb`, `backend/lib/tasks/content.rake`
- Create: `backend/spec/services/content_seeder_spec.rb`
- Modify: `backend/app/models/program_year.rb` (replace the Task 5 stand-in)

**Interfaces:**
- Consumes: `content/program_years/2026-27/program.yml` (Task 2), `Athlete` (Task 5).
- Produces: `ContentSeeder.new(year_label:).seed!` returning a counts hash keyed by table name; `ProgramYear.current_for(athlete, on:)`; `ProgramYear#blocks/#areas/#patches/#ball_gates/#test_dates/#day_roles`; `ProgramYear#current_block(on:)`; `Area#area_cells`; `Block#current?(on:)`; `DayRole::FIXED`.

- [ ] **Step 1: Write the migration**

Drop the Task 5 placeholder and build the real thing. `backend/db/migrate/<ts>_create_program_structure.rb`:

```ruby
class CreateProgramStructure < ActiveRecord::Migration[8.0]
  def change
    drop_table :program_years, if_exists: true

    create_table :program_years do |t|
      t.references :athlete, null: false, foreign_key: true
      t.string :label, null: false
      t.date :starts_on, null: false
      t.date :ends_on, null: false
      t.string :status, null: false, default: "draft"
      t.string :ball_now, null: false
      t.text :rank_rule
      t.text :north_star
      t.timestamps
    end
    add_index :program_years, %i[athlete_id label], unique: true

    create_table :blocks do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :key, null: false
      t.string :name, null: false
      t.integer :position, null: false
      t.date :starts_on, null: false
      t.date :ends_on, null: false
      t.text :focus
      t.timestamps
    end
    add_index :blocks, %i[program_year_id key], unique: true
    add_index :blocks, %i[program_year_id position], unique: true

    create_table :areas do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :slug, null: false
      t.integer :position, null: false
      t.string :name, null: false
      t.text :summary
      t.timestamps
    end
    add_index :areas, %i[program_year_id slug], unique: true

    create_table :area_cells do |t|
      t.references :area, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.text :body, null: false
      t.timestamps
    end
    add_index :area_cells, %i[area_id block_id], unique: true

    create_table :patches do |t|
      t.references :program_year, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.references :area, null: false, foreign_key: true
      t.string :name, null: false
      t.text :requirement, null: false
      t.timestamps
    end
    add_index :patches, %i[block_id area_id], unique: true

    # No date column anywhere on this table. The gates move on skill.
    create_table :ball_gates do |t|
      t.references :program_year, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :from_ball, null: false
      t.string :to_ball, null: false
      t.string :label, null: false
      t.text :requirement, null: false
      t.string :status, null: false
      t.timestamps
    end
    add_index :ball_gates, %i[program_year_id position], unique: true

    create_table :test_dates do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :window, null: false
      t.string :label, null: false
      t.string :display, null: false
      t.integer :position, null: false
      t.timestamps
    end
    add_index :test_dates, %i[program_year_id window], unique: true

    create_table :day_roles do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :dow, null: false
      t.integer :position, null: false
      t.string :name, null: false
      t.string :organized, array: true, null: false, default: []
      t.string :minutes, null: false
      t.integer :intensity, null: false
      t.text :note
      t.timestamps
    end
    add_index :day_roles, %i[program_year_id dow], unique: true
  end
end
```

- [ ] **Step 2: Write the failing seeder spec**

`backend/spec/services/content_seeder_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe ContentSeeder do
  subject(:seed) { described_class.new(year_label: "2026-27").seed! }

  it "creates the athlete, the year and its structure" do
    seed

    athlete = Athlete.sole
    expect(athlete.name).to eq("Teddy Maxim")
    expect(athlete.birthday).to eq(Date.new(2019, 1, 9))

    year = ProgramYear.sole
    expect(year.label).to eq("2026-27")
    expect(year.ball_now).to eq("green")
    expect(year.blocks.map(&:key)).to eq(%w[cub fox coyote wolf puma cheetah])
    expect(year.areas.count).to eq(9)
    expect(year.day_roles.count).to eq(7)
    expect(year.test_dates.map(&:window)).to eq(%w[2026-09 2026-12 2027-03 2027-06 2027-08])
  end

  it "gives every area a cell for every block" do
    seed
    expect(AreaCell.count).to eq(9 * 6)
  end

  it "creates nine Cub patches, one per area" do
    seed
    cub = Block.find_by!(key: "cub")
    expect(cub.patches.count).to eq(9)
    expect(cub.patches.map { |p| p.area.slug }.uniq.size).to eq(9)
  end

  it "has one active ball gate, and no date column to gate on" do
    seed
    expect(BallGate.where(status: "active").count).to eq(1)
    expect(BallGate.column_names).not_to include("date", "starts_on", "expected_on")
  end

  it "is idempotent, so a second run changes no counts and no ids" do
    seed
    before = { ProgramYear.count => :years, AreaCell.count => :cells }
    year_id = ProgramYear.sole.id
    counts_before = [ ProgramYear.count, Block.count, Area.count, AreaCell.count,
                      Patch.count, BallGate.count, TestDate.count, DayRole.count ]

    described_class.new(year_label: "2026-27").seed!

    counts_after = [ ProgramYear.count, Block.count, Area.count, AreaCell.count,
                     Patch.count, BallGate.count, TestDate.count, DayRole.count ]
    expect(counts_after).to eq(counts_before)
    expect(ProgramYear.sole.id).to eq(year_id)
    expect(before).to be_present
  end

  it "picks the current year from a date, with nothing hardcoded" do
    seed
    athlete = Athlete.sole
    expect(ProgramYear.current_for(athlete, on: Date.new(2026, 10, 1))&.label).to eq("2026-27")
    # Outside every year's range, fall back to the newest active year.
    expect(ProgramYear.current_for(athlete, on: Date.new(2030, 1, 1))&.label).to eq("2026-27")
    expect(ProgramYear.current_for(nil)).to be_nil
  end

  it "names the current block from a date" do
    seed
    year = ProgramYear.sole
    expect(year.current_block(on: Date.new(2026, 9, 20))&.key).to eq("cub")
    expect(year.current_block(on: Date.new(2027, 1, 20))&.key).to eq("coyote")
  end

  it "refuses a day role whose name does not match its weekday" do
    seed
    role = DayRole.find_by!(dow: "wed")
    role.name = "Wall Day"
    expect(role).not_to be_valid
    expect(role.errors[:name].first).to eq("on wed must be Fast Day")
  end
end
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bundle exec rspec spec/services/content_seeder_spec.rb`
Expected: FAIL with `uninitialized constant ContentSeeder`.

- [ ] **Step 4: Write the models**

`backend/app/models/program_year.rb` (replacing the Task 5 stand-in entirely):

```ruby
class ProgramYear < ApplicationRecord
  STATUSES = %w[draft active archived].freeze

  belongs_to :athlete
  has_many :blocks,     -> { order(:position) }, dependent: :destroy
  has_many :areas,      -> { order(:position) }, dependent: :destroy
  has_many :patches,    dependent: :destroy
  has_many :ball_gates, -> { order(:position) }, dependent: :destroy
  has_many :test_dates, -> { order(:position) }, dependent: :destroy
  has_many :day_roles,  -> { order(:position) }, dependent: :destroy

  validates :label, presence: true, uniqueness: { scope: :athlete_id }
  validates :ball_now, presence: true
  validates :status, inclusion: { in: STATUSES }
  validate  :ends_after_it_starts

  scope :active, -> { where(status: "active") }

  # Nothing anywhere may assume there is one year. This takes a date, finds
  # the year containing it, and falls back to the newest active year.
  def self.current_for(athlete, on: Date.current)
    return nil if athlete.nil?
    scope = where(athlete: athlete)
    scope.where("starts_on <= ? and ends_on >= ?", on, on).order(starts_on: :desc).first ||
      scope.active.order(starts_on: :desc).first
  end

  def current_block(on: Date.current)
    blocks.find { |b| b.current?(on: on) }
  end

  private

  def ends_after_it_starts
    return if starts_on.blank? || ends_on.blank? || ends_on > starts_on
    errors.add(:ends_on, "must fall after the year starts")
  end
end
```

`backend/app/models/block.rb`:

```ruby
class Block < ApplicationRecord
  belongs_to :program_year
  has_many :area_cells, dependent: :destroy
  has_many :patches, dependent: :destroy

  validates :key, :name, :position, :starts_on, :ends_on, presence: true
  validates :key, uniqueness: { scope: :program_year_id }

  def current?(on: Date.current) = starts_on <= on && ends_on >= on
end
```

`backend/app/models/area.rb`:

```ruby
class Area < ApplicationRecord
  belongs_to :program_year
  has_many :area_cells, dependent: :destroy
  has_many :patches, dependent: :destroy

  validates :slug, :name, :position, presence: true
  validates :slug, uniqueness: { scope: :program_year_id }
end
```

`backend/app/models/area_cell.rb`:

```ruby
class AreaCell < ApplicationRecord
  belongs_to :area
  belongs_to :block
  validates :body, presence: true
end
```

`backend/app/models/patch.rb`:

```ruby
class Patch < ApplicationRecord
  belongs_to :program_year
  belongs_to :block
  belongs_to :area

  validates :name, :requirement, presence: true
end
```

`backend/app/models/ball_gate.rb`:

```ruby
class BallGate < ApplicationRecord
  STATUSES = %w[cleared active held].freeze

  belongs_to :program_year

  validates :from_ball, :to_ball, :label, :requirement, presence: true
  validates :status, inclusion: { in: STATUSES }
end
```

`backend/app/models/test_date.rb`:

```ruby
class TestDate < ApplicationRecord
  belongs_to :program_year

  validates :window, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :display, presence: true
end
```

`backend/app/models/day_role.rb`:

```ruby
class DayRole < ApplicationRecord
  DOWS = %w[mon tue wed thu fri sat sun].freeze

  # The roles are fixed. The content spec catches a bad plan before it reaches
  # the database, and this is the backstop behind it.
  FIXED = {
    "mon" => "Floor Day", "tue" => "Rings Day", "wed" => "Fast Day",
    "thu" => "Wall Day",  "fri" => "Skate Day", "sat" => "Game Day",
    "sun" => "Court Day"
  }.freeze

  belongs_to :program_year

  validates :dow, inclusion: { in: DOWS }
  validates :minutes, presence: true
  validates :intensity, inclusion: { in: 1..4 }
  validate  :name_matches_the_fixed_role

  private

  def name_matches_the_fixed_role
    return if dow.blank? || name == FIXED[dow]
    errors.add(:name, "on #{dow} must be #{FIXED[dow]}")
  end
end
```

- [ ] **Step 5: Write the seeder**

`backend/app/services/content_seeder.rb`:

```ruby
# Loads backend/content/ into Postgres. Idempotent: every row is addressed by
# a natural key, so a second run updates in place rather than duplicating.
#
# The repo owns the program. Postgres owns what Jeff and Teddy generate. This
# is the one place the two meet.
class ContentSeeder
  class MissingContent < StandardError; end

  attr_reader :year_label, :counts, :year

  def initialize(year_label:, root: Rails.root.join("content/program_years"))
    @year_label = year_label
    @dir = root.join(year_label)
    @counts = Hash.new(0)
    raise MissingContent, "no content at #{@dir}" unless File.directory?(@dir)
  end

  def seed!
    ActiveRecord::Base.transaction do
      program = load_yaml("program.yml")
      athlete = seed_athlete(program.fetch("athlete"))
      @year   = seed_year(athlete, program.fetch("program_year"))
      blocks  = seed_blocks(program.fetch("blocks"))
      areas   = seed_areas(program.fetch("areas"), blocks)
      seed_patches(program.fetch("patches"), blocks, areas)
      seed_ball_gates(program.fetch("ball_gates"))
      seed_test_dates(program.fetch("test_dates"))
      seed_day_roles(program.fetch("day_roles"))
    end
    counts
  end

  private

  def load_yaml(name)
    path = @dir.join(name)
    raise MissingContent, "no #{name} at #{path}" unless File.exist?(path)
    YAML.load_file(path, permitted_classes: [ Date ])
  end

  def track(record) = @counts[record.class.table_name] += 1

  def upsert(scope, finder, attrs)
    record = scope.find_or_initialize_by(finder)
    record.assign_attributes(attrs)
    record.save!
    track(record)
    record
  end

  def seed_athlete(attrs)
    upsert(Athlete, { name: attrs.fetch("name") }, { birthday: attrs.fetch("birthday") })
  end

  def seed_year(athlete, attrs)
    upsert(ProgramYear, { athlete: athlete, label: attrs.fetch("label") },
           attrs.slice("starts_on", "ends_on", "status", "ball_now", "rank_rule", "north_star"))
  end

  def seed_blocks(rows)
    rows.to_h do |row|
      block = upsert(year.blocks, { key: row.fetch("key") },
                     row.slice("name", "position", "starts_on", "ends_on", "focus"))
      [ row.fetch("key"), block ]
    end
  end

  def seed_areas(rows, blocks)
    rows.to_h do |row|
      area = upsert(year.areas, { slug: row.fetch("slug") }, row.slice("position", "name", "summary"))

      row.fetch("cells").each do |block_key, body|
        block = blocks[block_key] or raise MissingContent, "area #{area.slug} names unknown block #{block_key}"
        upsert(AreaCell, { area: area, block: block }, { body: body })
      end

      [ row.fetch("slug"), area ]
    end
  end

  def seed_patches(rows, blocks, areas)
    rows.each do |row|
      block = blocks[row.fetch("block")] or raise MissingContent, "patch names unknown block #{row['block']}"
      area  = areas[row.fetch("area")]   or raise MissingContent, "patch names unknown area #{row['area']}"
      upsert(Patch, { block: block, area: area },
             { program_year: year, name: row.fetch("name"), requirement: row.fetch("requirement") })
    end
  end

  def seed_ball_gates(rows)
    rows.each do |row|
      upsert(year.ball_gates, { position: row.fetch("position") },
             row.slice("from_ball", "to_ball", "label", "requirement", "status"))
    end
  end

  def seed_test_dates(rows)
    rows.each do |row|
      upsert(year.test_dates, { window: row.fetch("window") }, row.slice("label", "display", "position"))
    end
  end

  def seed_day_roles(rows)
    rows.each do |row|
      upsert(year.day_roles, { dow: row.fetch("dow") },
             row.slice("position", "name", "organized", "minutes", "intensity", "note"))
    end
  end
end
```

`backend/lib/tasks/content.rake`:

```ruby
namespace :content do
  desc "Seed backend/content into Postgres. Idempotent. YEAR=2026-27"
  task seed: :environment do
    counts = ContentSeeder.new(year_label: ENV.fetch("YEAR", "2026-27")).seed!
    counts.sort.each { |table, n| puts "#{table}: #{n}" }
  end
end
```

- [ ] **Step 6: Migrate and run the spec**

Run:

```bash
bundle exec rails db:migrate
bundle exec rspec spec/services/content_seeder_spec.rb
```

Expected: 8 examples, 0 failures.

- [ ] **Step 7: Prove idempotence by hand too**

```bash
bundle exec rails content:seed
bundle exec rails content:seed
```

Expected: identical counts printed both times, including `area_cells: 54`, `patches: 9`, `day_roles: 7`, `ball_gates: 3`, `test_dates: 5`.

- [ ] **Step 8: Run the whole suite and commit**

```bash
bundle exec rspec
git add backend
git commit -m "The year skeleton, and an idempotent seeder

ProgramYear owns blocks, areas, the area-by-block cell grid, patches,
ball gates, test dates and day roles. Every row is addressed by a natural
key, so content:seed run twice changes no counts and no ids.

Nothing assumes year one. ProgramYear.current_for takes a date, finds the
year containing it, and falls back to the newest active year.

DayRole validates its own name against the fixed weekday roles, as the
backstop behind the content spec.

ball_gates has no date column at all, which is how gated on skill rather
than on date becomes something the schema will not let you violate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The test battery, ten tests and fifteen measures

**Files:**
- Create: `backend/db/migrate/<ts>_create_battery.rb`, `backend/app/models/battery_test.rb`, `backend/app/models/battery_measure.rb`
- Modify: `backend/app/services/content_seeder.rb`, `backend/spec/services/content_seeder_spec.rb`

**Interfaces:**
- Consumes: `battery_tests` and `battery_measures` from `program.yml`; `ProgramYear` from Task 6.
- Produces: `ProgramYear#battery_tests`, `#battery_measures`; `BatteryTest#battery_measures`; `BatteryMeasure#direction`, `#improvement_from(baseline, latest)` returning `:better`, `:worse`, `:same` or `nil`.

This is the table the brief's model list did not name. Fifteen recordable rows sit against ten tests, because hop, throw and balance each record left and right, and height stands outside the ten. Unit and direction live at the row level because that is where `TestResult` keys.

- [ ] **Step 1: Write the migration**

```ruby
class CreateBattery < ActiveRecord::Migration[8.0]
  def change
    create_table :battery_tests do |t|
      t.references :program_year, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :name, null: false
      t.text :protocol, null: false
      t.string :area_name, null: false
      t.string :unit, null: false
      t.timestamps
    end
    add_index :battery_tests, %i[program_year_id position], unique: true

    create_table :battery_measures do |t|
      t.references :program_year, null: false, foreign_key: true
      # Nullable on purpose. Height and single-leg balance are recordable rows
      # that belong to none of the ten tests.
      t.references :battery_test, foreign_key: true
      t.string :test_id, null: false
      t.integer :position, null: false
      t.string :label, null: false
      t.string :unit, null: false
      t.string :direction, null: false
      t.timestamps
    end
    add_index :battery_measures, %i[program_year_id test_id], unique: true
    add_check_constraint :battery_measures,
      "direction in ('lower','higher','growth')", name: "battery_measures_direction_check"
  end
end
```

- [ ] **Step 2: Write the failing spec**

Add to `backend/spec/services/content_seeder_spec.rb`:

```ruby
  describe "the battery" do
    before { seed }

    it "has ten tests and fifteen measures" do
      expect(BatteryTest.count).to eq(10)
      expect(BatteryMeasure.count).to eq(15)
    end

    it "records height, as growth, belonging to no test" do
      height = BatteryMeasure.find_by!(test_id: "h")
      expect(height.direction).to eq("growth")
      expect(height.battery_test).to be_nil
      expect(height.unit).to eq("cm")
    end

    it "ties both sides of a paired test to the same test" do
      right = BatteryMeasure.find_by!(test_id: "t3r")
      left  = BatteryMeasure.find_by!(test_id: "t3l")
      expect(right.battery_test).to eq(left.battery_test)
      expect(right.battery_test.name).to eq("Single-leg hop, each leg")
    end

    it "knows which way is progress" do
      sprint = BatteryMeasure.find_by!(test_id: "t1")   # lower is better
      jump   = BatteryMeasure.find_by!(test_id: "t2")   # higher is better
      expect(sprint.improvement_from(4.5, 4.2)).to eq(:better)
      expect(sprint.improvement_from(4.5, 4.8)).to eq(:worse)
      expect(jump.improvement_from(120, 131)).to eq(:better)
      expect(jump.improvement_from(120, 120)).to eq(:same)
      expect(jump.improvement_from(nil, 120)).to be_nil
    end

    it "reads height as neither better nor worse" do
      height = BatteryMeasure.find_by!(test_id: "h")
      expect(height.improvement_from(120, 126)).to eq(:same)
    end
  end
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bundle exec rspec spec/services/content_seeder_spec.rb -e "the battery"`
Expected: FAIL with `uninitialized constant BatteryTest`.

- [ ] **Step 4: Write the models**

`backend/app/models/battery_test.rb`:

```ruby
class BatteryTest < ApplicationRecord
  belongs_to :program_year
  has_many :battery_measures, -> { order(:position) }, dependent: :nullify

  validates :name, :protocol, :area_name, :unit, :position, presence: true
end
```

`backend/app/models/battery_measure.rb`:

```ruby
# One recordable row on the test sheet. There are fifteen of these against ten
# battery tests, because hop, throw and balance each record left and right, and
# height stands outside the ten.
class BatteryMeasure < ApplicationRecord
  DIRECTIONS = %w[lower higher growth].freeze

  belongs_to :program_year
  belongs_to :battery_test, optional: true
  has_many :test_results, dependent: :destroy

  validates :test_id, presence: true, uniqueness: { scope: :program_year_id }
  validates :label, :unit, :position, presence: true
  validates :direction, inclusion: { in: DIRECTIONS }

  # Which way counts as progress. A faster sprint and a longer jump are both
  # better; a shorter dead hang is not. Height is growth, so it reports a pace
  # rather than a verdict and never reads as worse.
  def improvement_from(baseline, latest)
    return nil if baseline.nil? || latest.nil?
    return :same if direction == "growth"

    delta = latest.to_f - baseline.to_f
    return :same if delta.zero?

    better = direction == "lower" ? delta.negative? : delta.positive?
    better ? :better : :worse
  end
end
```

- [ ] **Step 5: Seed them**

In `content_seeder.rb`, add to `seed!` after `seed_day_roles(...)`:

```ruby
      tests = seed_battery_tests(program.fetch("battery_tests"))
      seed_battery_measures(program.fetch("battery_measures"), tests)
```

and the two private methods:

```ruby
  def seed_battery_tests(rows)
    rows.to_h do |row|
      test = upsert(year.battery_tests, { position: row.fetch("position") },
                    row.slice("name", "protocol", "area_name", "unit"))
      [ row.fetch("position"), test ]
    end
  end

  def seed_battery_measures(rows, tests)
    rows.each do |row|
      position = row["battery_test_position"]
      test = position && (tests[position] or raise MissingContent,
        "measure #{row['test_id']} names unknown battery test #{position}")
      upsert(year.battery_measures, { test_id: row.fetch("test_id") },
             row.slice("position", "label", "unit", "direction").merge("battery_test" => test))
    end
  end
```

Add the associations to `ProgramYear`:

```ruby
  has_many :battery_tests,    -> { order(:position) }, dependent: :destroy
  has_many :battery_measures, -> { order(:position) }, dependent: :destroy
```

- [ ] **Step 6: Migrate, seed and run**

```bash
bundle exec rails db:migrate
bundle exec rspec spec/services/content_seeder_spec.rb
bundle exec rails content:seed
```

Expected: all examples pass, and the seed prints `battery_tests: 10` and `battery_measures: 15`.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "The test battery: ten tests, fifteen recordable measures

BatteryMeasure is the table the brief's model list did not name. There
are fifteen recordable rows against ten tests, because hop, throw and
balance each record left and right, and height stands outside the ten.
Unit and direction live at the row level, because that is where a result
keys.

battery_test_id is nullable on purpose, so height is a first class row
rather than a special case.

improvement_from applies the direction, so a faster sprint and a longer
jump both read as progress and a shorter dead hang does not. Height is
growth, so it reports a pace and never reads as worse.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Drills, global across years

**Files:**
- Create: `backend/db/migrate/<ts>_create_drills.rb`, `backend/app/models/drill.rb`, `backend/app/serializers/drill_serializer.rb`, `backend/app/controllers/api/v1/drills_controller.rb`, `backend/app/policies/drill_policy.rb`
- Create: `backend/spec/requests/drills_spec.rb`
- Modify: `backend/app/services/content_seeder.rb`, `backend/config/routes.rb`

**Interfaces:**
- Consumes: `drills.yml` (Task 2), `ApiController` (Task 5).
- Produces: `Drill` with `slug`, `name`, `area_name`, `aliases`, `short`, `how`, `watch`, `cue`, `video`; `Drill.terms` returning `[[term, slug], ...]` sorted longest first, which Task 9's tokenizer consumes; `GET /api/v1/drills`; `GET /api/v1/drills/:slug`.

`Drill` carries no `program_year_id`. Mastery has to carry forward, so a drill is one row across every year.

- [ ] **Step 1: Write the migration**

```ruby
class CreateDrills < ActiveRecord::Migration[8.0]
  def change
    # Global across years, with no program_year_id, so drill mastery carries
    # forward rather than restarting each September.
    create_table :drills do |t|
      t.string :slug, null: false
      t.string :name, null: false
      t.string :area_name, null: false
      t.string :aliases, array: true, null: false, default: []
      t.text :short, null: false
      t.text :how, array: true, null: false, default: []
      t.text :watch
      t.text :cue
      t.string :video
      t.timestamps
    end
    add_index :drills, :slug, unique: true
  end
end
```

- [ ] **Step 2: Write the failing request spec**

`backend/spec/requests/drills_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "drills", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:coach)  { create(:user, :coach) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bundle exec rspec spec/requests/drills_spec.rb`
Expected: FAIL with routing errors.

- [ ] **Step 4: Write the model, serializer, policy and controller**

`backend/app/models/drill.rb`:

```ruby
class Drill < ApplicationRecord
  validates :slug, presence: true, uniqueness: true
  validates :name, :area_name, :short, presence: true

  scope :alphabetical, -> { order(:name) }

  # Every name and alias, longest first, so the tokenizer matches "bear crawl"
  # before it matches "crawl". Memoised per process because the seeder calls
  # this once per block and the set changes only when content is reseeded.
  def self.terms
    @terms = nil if @terms_generation != generation
    @terms_generation = generation
    @terms ||= pluck(:slug, :name, :aliases)
      .flat_map { |slug, name, aliases| ([ name ] + aliases).map { |t| [ t, slug ] } }
      .sort_by { |term, _| -term.length }
  end

  def self.generation = maximum(:updated_at)&.to_f
end
```

`backend/app/serializers/drill_serializer.rb`:

```ruby
class DrillSerializer < ActiveModel::Serializer
  attributes :slug, :name, :area_name, :aliases, :short, :how, :watch, :cue, :video
end
```

`backend/app/policies/drill_policy.rb`:

```ruby
# Drills are program content. Everyone signed in reads them, nobody writes
# them through the API, because the repo owns the program.
class DrillPolicy < ApplicationPolicy
  def index? = read_program?
  def show?  = read_program?

  class Scope < Scope
    def resolve = user ? scope.all : scope.none
  end
end
```

`backend/app/controllers/api/v1/drills_controller.rb`:

```ruby
module Api
  module V1
    class DrillsController < ApiController
      # GET /api/v1/drills
      def index
        authorize Drill
        drills = policy_scope(Drill).alphabetical
        render json: { drills: ActiveModelSerializers::SerializableResource.new(drills).as_json }
      end

      # GET /api/v1/drills/:slug
      def show
        drill = policy_scope(Drill).find_by!(slug: params[:slug])
        authorize drill
        render json: { drill: DrillSerializer.new(drill).as_json }
      end
    end
  end
end
```

Routes, inside `namespace :v1`:

```ruby
      get "drills",       to: "drills#index"
      get "drills/:slug", to: "drills#show"
```

- [ ] **Step 5: Seed the drills**

In `content_seeder.rb`, add to `seed!` before `seed_battery_tests`:

```ruby
      seed_drills(load_yaml("drills.yml").fetch("drills"))
```

and:

```ruby
  # Drills are global, so they are keyed on slug alone and never on the year.
  def seed_drills(rows)
    rows.each do |row|
      upsert(Drill, { slug: row.fetch("slug") },
             row.slice("name", "area_name", "aliases", "short", "how", "watch", "cue", "video"))
    end
  end
```

- [ ] **Step 6: Migrate, run and commit**

```bash
bundle exec rails db:migrate
bundle exec rspec spec/requests/drills_spec.rb spec/services/content_seeder_spec.rb
bundle exec rails content:seed
```

Expected: all green, and the seed prints `drills: 84`.

```bash
git add backend
git commit -m "Drills, global across years

No program_year_id, because drill mastery has to carry forward rather
than restarting each September.

Drill.terms returns every name and alias sorted longest first, which is
what the tokenizer in the next task consumes so that bear crawl matches
before crawl does.

The unauthenticated request spec is the first assertion of the inverted
privacy model: the bundle is public now, so every word of program content
sits behind the token.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The body tokenizer, and the month plan it fills

**Files:**
- Create: `backend/app/services/body_tokenizer.rb`
- Create: `backend/db/migrate/<ts>_create_plans.rb`
- Create: `backend/app/models/{month_plan,week,day_card,day_block}.rb`
- Create: `backend/spec/services/body_tokenizer_spec.rb`, `backend/spec/services/plan_seeder_spec.rb`
- Modify: `backend/app/services/content_seeder.rb`

**Interfaces:**
- Consumes: `plans/2026-09.yml` (Tasks 2 and 4), `Drill.terms` (Task 8), `ProgramYear`, `Block`, `DayRole` (Task 6).
- Produces: `BodyTokenizer.new(terms)` with `#tokenize(name:, body:)` returning `{ name_tokens:, body_tokens:, drill_slugs: }`; `MonthPlan#weeks`; `Week#day_cards`; `DayCard#day_blocks`, `#drill_slugs`, `#hie`; `DayBlock#body_tokens`, `#drill_slugs`.

**A design refinement worth naming.** The spec said `core/` would tokenize. Doing it in the seeder instead is better: the matcher then exists once rather than twice, the content spec can assert its output, and the clients only render an array. `day_blocks.body` keeps the raw prose for export and search, `body_tokens` holds the render tree, and `drill_slugs` falls out of it. Flag this at the Phase 1 gate.

Token shape, flat so React Native can render it as `Text` children:

```json
[
  { "type": "text",  "style": "bold",  "text": "Test: " },
  { "type": "drill", "style": "bold",  "text": "rally count", "slug": "tennis-rally-count" },
  { "type": "text",  "style": "plain", "text": " with Dad, cooperative." }
]
```

- [ ] **Step 1: Write the failing tokenizer spec**

`backend/spec/services/body_tokenizer_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe BodyTokenizer do
  # Longest first, the way Drill.terms hands them over.
  let(:terms) do
    [ [ "bear crawl", "bear-crawl" ], [ "split step", "split-step" ],
      [ "crawl", "crawl" ], [ "pass", "pass" ] ].sort_by { |t, _| -t.length }
  end
  let(:tokenizer) { described_class.new(terms) }

  def tokenize(name: "", body: "") = tokenizer.tokenize(name: name, body: body)

  it "wraps a drill it finds in the prose" do
    result = tokenize(body: "Then a bear crawl across the mat.")
    expect(result[:body_tokens]).to eq([
      { "type" => "text",  "style" => "plain", "text" => "Then a " },
      { "type" => "drill", "style" => "plain", "text" => "bear crawl", "slug" => "bear-crawl" },
      { "type" => "text",  "style" => "plain", "text" => " across the mat." }
    ])
    expect(result[:drill_slugs]).to eq([ "bear-crawl" ])
  end

  it "prefers the longest term, so bear crawl beats crawl" do
    expect(tokenize(body: "bear crawl")[:drill_slugs]).to eq([ "bear-crawl" ])
  end

  it "tolerates a plural" do
    expect(tokenize(body: "Ten split steps on the clap.")[:drill_slugs]).to eq([ "split-step" ])
  end

  it "never matches inside a longer word" do
    expect(tokenize(body: "Inside-foot passing at 3m.")[:drill_slugs]).to eq([])
  end

  it "links only the first mention in a block" do
    result = tokenize(body: "A bear crawl, then another bear crawl.")
    expect(result[:drill_slugs]).to eq([ "bear-crawl" ])
    expect(result[:body_tokens].count { |t| t["type"] == "drill" }).to eq(1)
  end

  it "treats the block title and the body as one unit, linking on the title" do
    result = tokenize(name: "Split step drill", body: "Ten split steps.")
    expect(result[:name_tokens].any? { |t| t["type"] == "drill" }).to be(true)
    expect(result[:body_tokens].none? { |t| t["type"] == "drill" }).to be(true)
    expect(result[:drill_slugs]).to eq([ "split-step" ])
  end

  it "carries bold and quote through as a style rather than as markup" do
    result = tokenize(body: "<b>Test: bear crawl</b> then <q>land like a cat</q>.")
    bolded = result[:body_tokens].select { |t| t["style"] == "bold" }
    expect(bolded.map { |t| t["text"] }).to eq([ "Test: ", "bear crawl" ])
    expect(result[:body_tokens].find { |t| t["style"] == "quote" }["text"]).to eq("land like a cat")
    expect(result[:body_tokens].map { |t| t["text"] }.join).not_to include("<")
  end

  it "matches whatever the case is" do
    expect(tokenize(body: "Bear Crawl to the cone.")[:drill_slugs]).to eq([ "bear-crawl" ])
  end

  it "returns no tokens for empty prose" do
    expect(tokenize(body: "")[:body_tokens]).to eq([])
    expect(tokenize(body: "")[:drill_slugs]).to eq([])
  end

  it "loses no text, whatever it does with it" do
    body = "<b>Test: bear crawl</b> then ten split steps and a pass."
    rebuilt = tokenize(body: body)[:body_tokens].map { |t| t["text"] }.join
    expect(rebuilt).to eq("Test: bear crawl then ten split steps and a pass.")
  end
end
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bundle exec rspec spec/services/body_tokenizer_spec.rb`
Expected: FAIL with `uninitialized constant BodyTokenizer`.

- [ ] **Step 3: Write the tokenizer**

`backend/app/services/body_tokenizer.rb`:

```ruby
# Turns a day block's prose into a flat token array the clients render.
#
# This is the Ruby port of the linker that lived in build.py. It runs at seed
# time rather than in the clients, so the matching rules exist once and the
# content spec can assert what came out. React Native cannot render an HTML
# string, which is why the output is tokens rather than markup.
#
# The rules, unchanged from build.py:
#   longest term first, so "bear crawl" beats "crawl"
#   word boundaries on both sides, so "pass" never matches inside "passing"
#   a trailing s or es tolerated, so "split steps" finds "split step"
#   case insensitive
#   one link per drill per block, with the title and body sharing the count,
#     so a drill named in both links on the title
class BodyTokenizer
  TAG = /(<\/?[a-z]+>)/i
  STYLE_FOR = { "b" => "bold", "q" => "quote" }.freeze

  def initialize(terms)
    @slug_for = {}
    alternatives = terms.each_with_index.map do |(term, slug), i|
      group = "t#{i}"
      @slug_for[group] = slug
      "(?<#{group}>#{Regexp.escape(term)}(?:e?s)?)"
    end
    @pattern = alternatives.empty? ? nil : /(?<![\w-])(?:#{alternatives.join('|')})(?![\w-])/i
  end

  # Returns { name_tokens:, body_tokens:, drill_slugs: } with drill_slugs in
  # first-mention order across the title and then the body.
  def tokenize(name:, body:)
    found = []
    name_tokens = tokens_for(name.to_s, found)
    body_tokens = tokens_for(body.to_s, found)
    { name_tokens: name_tokens, body_tokens: body_tokens, drill_slugs: found }
  end

  private

  def tokens_for(text, found)
    return [] if text.empty?

    styles = []
    text.split(TAG).each_with_object([]) do |part, out|
      next if part.empty?

      if (tag = part[/\A<(\/?)([a-z]+)>\z/i, 2]&.downcase)
        closing = part.start_with?("</")
        style = STYLE_FOR[tag]
        next if style.nil?
        closing ? styles.pop : styles.push(style)
        next
      end

      out.concat(link(part, styles.last || "plain", found))
    end
  end

  def link(part, style, found)
    spans = accepted_spans(part, found)
    return [ text_token(part, style) ].compact if spans.empty?

    out = []
    cursor = 0
    spans.each do |from, to, slug|
      out << text_token(part[cursor...from], style)
      out << { "type" => "drill", "style" => style, "text" => part[from...to], "slug" => slug }
      cursor = to
    end
    out << text_token(part[cursor..], style)
    out.compact
  end

  # Scans left to right, keeping only the first mention of each drill. A repeat
  # stays plain text rather than becoming a second link.
  def accepted_spans(part, found)
    return [] if @pattern.nil?

    spans = []
    pos = 0
    while (match = @pattern.match(part, pos))
      group = match.names.find { |n| match[n] }
      slug  = @slug_for[group]
      unless found.include?(slug)
        found << slug
        spans << [ match.begin(0), match.end(0), slug ]
      end
      pos = match.end(0)
    end
    spans
  end

  def text_token(string, style)
    return nil if string.nil? || string.empty?
    { "type" => "text", "style" => style, "text" => string }
  end
end
```

- [ ] **Step 4: Run it and watch it pass**

Run: `bundle exec rspec spec/services/body_tokenizer_spec.rb`
Expected: 10 examples, 0 failures.

- [ ] **Step 5: Write the plan migration**

```ruby
class CreatePlans < ActiveRecord::Migration[8.0]
  def change
    create_table :month_plans do |t|
      t.references :program_year, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.string :month, null: false
      t.string :label, null: false
      t.string :range_display, null: false
      t.timestamps
    end
    add_index :month_plans, %i[program_year_id month], unique: true

    create_table :weeks do |t|
      t.references :month_plan, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.integer :number, null: false
      t.integer :position_in_block, null: false
      t.string :theme, null: false
      t.string :dates_display, null: false
      t.text :targets, array: true, null: false, default: []
      t.text :challenge, null: false
      t.boolean :trials, null: false, default: false
      t.timestamps
    end
    add_index :weeks, %i[month_plan_id number], unique: true

    create_table :day_cards do |t|
      t.references :week, null: false, foreign_key: true
      t.references :day_role, foreign_key: true
      t.date :date, null: false
      t.string :dow, null: false
      t.string :name, null: false
      t.string :minutes, null: false
      t.integer :intensity, null: false
      t.integer :hie, null: false, default: 0
      t.text :summary_lines, array: true, null: false, default: []
      t.text :dad_note
      t.string :drill_slugs, array: true, null: false, default: []
      t.integer :position, null: false
      t.timestamps
    end
    add_index :day_cards, %i[week_id date], unique: true

    create_table :day_blocks do |t|
      t.references :day_card, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :minutes, null: false
      t.string :name, null: false
      t.text :body
      t.string :tag
      t.jsonb :name_tokens, null: false, default: []
      t.jsonb :body_tokens, null: false, default: []
      t.string :drill_slugs, array: true, null: false, default: []
      t.timestamps
    end
    add_index :day_blocks, %i[day_card_id position], unique: true
    add_check_constraint :day_blocks, "tag is null or tag in ('test','challenge')",
      name: "day_blocks_tag_check"
  end
end
```

- [ ] **Step 6: Write the models**

`backend/app/models/month_plan.rb`:

```ruby
class MonthPlan < ApplicationRecord
  belongs_to :program_year
  belongs_to :block
  has_many :weeks, -> { order(:number) }, dependent: :destroy

  validates :month, presence: true, format: { with: /\A\d{4}-\d{2}\z/ }
  validates :label, :range_display, presence: true
end
```

`backend/app/models/week.rb`:

```ruby
class Week < ApplicationRecord
  HOME_BUDGET   = 40
  TRIALS_BUDGET = 20

  belongs_to :month_plan
  belongs_to :block
  has_many :day_cards, -> { order(:position) }, dependent: :destroy

  validates :theme, :challenge, :dates_display, presence: true
  validates :number, :position_in_block, presence: true
  validate  :targets_cover_the_three_ball_sports
  validate  :stays_inside_the_effort_budget

  def budget = trials? ? TRIALS_BUDGET : HOME_BUDGET
  def high_intent_efforts = day_cards.sum(&:hie)

  def self.current(program_year, on: Date.current)
    joins(:day_cards).where(day_cards: { date: on.beginning_of_week..on.end_of_week })
      .where(month_plans: { program_year_id: program_year.id })
      .joins(:month_plan).distinct.first
  end

  private

  # One theme, 5 to 6 sub-targets, always one tennis, one basketball and one
  # soccer. The content spec catches this first; this is the backstop.
  def targets_cover_the_three_ball_sports
    errors.add(:targets, "must number 5 or 6") unless targets.size.between?(5, 6)
    { "tennis" => /tennis/i, "basketball" => /basketball/i, "soccer" => /soccer|keeper/i }
      .each do |sport, pattern|
        next if targets.any? { |t| t =~ pattern }
        errors.add(:targets, "need a #{sport} sub-target")
      end
  end

  def stays_inside_the_effort_budget
    return if day_cards.none?
    spent = high_intent_efforts
    return if spent <= budget
    errors.add(:base, "spends #{spent} high-intent efforts against a budget of #{budget}")
  end
end
```

`backend/app/models/day_card.rb`:

```ruby
class DayCard < ApplicationRecord
  # Zero on Sunday and Monday, at most 5 on Friday. Saturday's load is the
  # organized calendar's, so the home program spends nothing.
  HIE_CEILING = { "sun" => 0, "mon" => 0, "fri" => 5, "sat" => 0 }.freeze

  belongs_to :week
  belongs_to :day_role, optional: true
  has_many :day_blocks, -> { order(:position) }, dependent: :destroy
  has_many :coach_entries, dependent: :nullify
  has_many :athlete_entries, dependent: :nullify

  validates :date, :dow, :name, :minutes, presence: true
  validates :intensity, inclusion: { in: 1..4 }
  validates :hie, numericality: { greater_than_or_equal_to: 0 }
  validate  :respects_the_day_ceiling
  validate  :falls_on_the_weekday_it_claims

  def full_card? = day_blocks.any?

  private

  def respects_the_day_ceiling
    ceiling = HIE_CEILING[dow]
    return if ceiling.nil? || hie.to_i <= ceiling
    errors.add(:hie, "on #{dow} may be at most #{ceiling}")
  end

  def falls_on_the_weekday_it_claims
    return if date.blank? || date.strftime("%a").downcase == dow
    errors.add(:dow, "says #{dow} but #{date} is a #{date.strftime('%a').downcase}")
  end
end
```

`backend/app/models/day_block.rb`:

```ruby
class DayBlock < ApplicationRecord
  TAGS = %w[test challenge].freeze

  belongs_to :day_card

  validates :minutes, :name, presence: true
  validates :tag, inclusion: { in: TAGS }, allow_nil: true

  scope :tests,      -> { where(tag: "test") }
  scope :challenges, -> { where(tag: "challenge") }
end
```

- [ ] **Step 7: Write the failing plan seeder spec**

`backend/spec/services/plan_seeder_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "seeding the month plan" do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:plan) { MonthPlan.sole }
  let(:week1) { plan.weeks.find_by!(number: 1) }
  let(:thursday) { week1.day_cards.find_by!(dow: "thu") }

  it "creates the month, its weeks and its days" do
    expect(plan.month).to eq("2026-09")
    expect(plan.block.key).to eq("cub")
    expect(plan.weeks.count).to eq(3)
    expect(plan.weeks.flat_map(&:day_cards).count).to eq(21)
  end

  it "gives week 1 full cards and the later weeks summaries" do
    expect(week1.day_cards.select(&:full_card?).count).to eq(7)
    expect(plan.weeks.find_by!(number: 2).day_cards.none?(&:full_card?)).to be(true)
    expect(plan.weeks.find_by!(number: 2).day_cards.all? { |d| d.summary_lines.any? }).to be(true)
  end

  it "puts every day on the role its weekday owns" do
    plan.weeks.flat_map(&:day_cards).each do |card|
      expect(card.day_role.name).to eq(DayRole::FIXED.fetch(card.dow)), card.date.to_s
    end
  end

  it "reads Thursday's card the way it is written" do
    expect(thursday.name).to eq("Wall & Ball")
    expect(thursday.date).to eq(Date.new(2026, 9, 17))
    expect(thursday.day_blocks.count).to eq(9)
    expect(thursday.day_blocks.tests.count).to eq(2)
    expect(thursday.day_blocks.challenges.count).to eq(1)
    expect(thursday.dad_note).to start_with("Form over volume on the tennis.")
  end

  it "carries the high-intent effort counts" do
    expect(week1.day_cards.order(:position).map(&:hie)).to eq([ 0, 6, 15, 2, 5, 0, 0 ])
    expect(week1.high_intent_efforts).to eq(28)
    expect(week1.high_intent_efforts).to be <= week1.budget
  end

  it "stores prose and tokens rather than markup" do
    block = thursday.day_blocks.find_by!(name: "New Thing")
    expect(block.body).to include("<q>")
    expect(block.body_tokens.map { |t| t["text"] }.join).not_to include("<")
    expect(block.body_tokens.any? { |t| t["style"] == "quote" }).to be(true)
  end

  # The regression target is the report build.py prints today.
  it "matches the drill linking the old build produced" do
    used = week1.day_cards.flat_map(&:drill_slugs).uniq
    expect(used.size).to eq(63)

    bare = week1.day_cards.flat_map(&:day_blocks).select { |b| b.drill_slugs.empty? }
    expect(bare.map { |b| "#{b.day_card.dow} · #{b.name}" }).to match_array([
      "tue · Test: Height", "fri · Play", "sat · Home program", "sun · Review"
    ])
  end

  it "names only drills that exist" do
    slugs = DayBlock.pluck(:drill_slugs).flatten.uniq
    expect(slugs - Drill.pluck(:slug)).to be_empty
  end

  it "is idempotent, like the rest of the seed" do
    counts = [ MonthPlan.count, Week.count, DayCard.count, DayBlock.count ]
    ContentSeeder.new(year_label: "2026-27").seed!
    expect([ MonthPlan.count, Week.count, DayCard.count, DayBlock.count ]).to eq(counts)
  end
end
```

- [ ] **Step 8: Run it and watch it fail**

Run: `bundle exec rspec spec/services/plan_seeder_spec.rb`
Expected: FAIL, because the seeder does not read the plans directory yet.

- [ ] **Step 9: Teach the seeder to read plans**

In `content_seeder.rb`, add to `seed!` after `seed_battery_measures(...)`:

```ruby
      seed_plans(blocks)
```

and these private methods:

```ruby
  def seed_plans(blocks)
    tokenizer = BodyTokenizer.new(Drill.terms)
    roles = year.day_roles.index_by(&:dow)

    Dir[@dir.join("plans/*.yml")].sort.each do |path|
      doc = YAML.load_file(path, permitted_classes: [ Date ])
      seed_month_plan(doc, blocks, roles, tokenizer)
    end
  end

  def seed_month_plan(doc, blocks, roles, tokenizer)
    attrs = doc.fetch("month_plan")
    block = blocks[attrs.fetch("block")] or
      raise MissingContent, "plan #{attrs['month']} names unknown block #{attrs['block']}"

    plan = upsert(MonthPlan, { program_year: year, month: attrs.fetch("month") },
                  attrs.slice("label", "range_display").merge("block" => block))

    doc.fetch("weeks").each do |row|
      week = upsert(plan.weeks, { number: row.fetch("number") },
                    row.slice("position_in_block", "theme", "dates_display", "targets", "challenge", "trials")
                       .merge("block" => block))
      seed_days(week, row.fetch("days"), roles, tokenizer)
    end
  end

  def seed_days(week, rows, roles, tokenizer)
    rows.each_with_index do |row, index|
      card = upsert(week.day_cards, { date: row.fetch("date") },
                    { day_role: roles[row.fetch("dow")], dow: row.fetch("dow"),
                      name: row.fetch("name"), minutes: row.fetch("minutes"),
                      intensity: row.fetch("intensity"), hie: row.fetch("hie"),
                      summary_lines: row.fetch("summary_lines", []),
                      dad_note: row["dad_note"], position: index, drill_slugs: [] })

      slugs = seed_blocks_for(card, row["blocks"] || [], tokenizer)
      card.update!(drill_slugs: slugs)
    end
  end

  # Returns the day's drill slugs in first-mention order, which is what the
  # journal's rating chips are built from.
  def seed_blocks_for(card, rows, tokenizer)
    day_slugs = []

    rows.each_with_index do |row, index|
      tokens = tokenizer.tokenize(name: row.fetch("name"), body: row["body"].to_s)
      upsert(card.day_blocks, { position: index },
             { minutes: row.fetch("minutes"), name: row.fetch("name"), body: row["body"],
               tag: row["tag"], name_tokens: tokens[:name_tokens],
               body_tokens: tokens[:body_tokens], drill_slugs: tokens[:drill_slugs] })
      day_slugs |= tokens[:drill_slugs]
    end

    # Blocks where nothing matched are the gaps to fill when the next month is
    # written. build.py printed this; so does the seeder.
    rows.each_with_index do |row, index|
      next unless card.day_blocks.find_by(position: index)&.drill_slugs&.empty?
      @bare << "#{card.dow} · #{row.fetch('name')}"
    end

    day_slugs
  end
```

Add `@bare = []` to `initialize`, expose it with `attr_reader :bare`, and print it from the rake task:

```ruby
    seeder = ContentSeeder.new(year_label: ENV.fetch("YEAR", "2026-27"))
    counts = seeder.seed!
    counts.sort.each { |table, n| puts "#{table}: #{n}" }
    if seeder.bare.any?
      puts "no drill matched in #{seeder.bare.size} block(s): #{seeder.bare.join('; ')}"
    end
```

- [ ] **Step 10: Migrate, run and compare against the old build**

```bash
bundle exec rails db:migrate
bundle exec rspec spec/services/plan_seeder_spec.rb
bundle exec rails content:seed
```

Expected from the seed, matching what `python3 build.py` prints from the repo root:

```
no drill matched in 4 block(s): tue · Test: Height; fri · Play; sat · Home program; sun · Review
```

If the count of used drills is not 63, the port has drifted from `build.py`. Compare term by term before changing the spec.

- [ ] **Step 11: Run the whole suite and commit**

```bash
bundle exec rspec
git add backend
git commit -m "Body tokenizer, and the month plan it fills

build.py's drill linker ported to Ruby and moved to seed time. The
matching rules are unchanged: longest term first so bear crawl beats
crawl, word boundaries so pass never matches inside passing, a tolerated
plural, case insensitive, and one link per drill per block with the title
and body sharing the count.

It emits flat tokens rather than HTML, because React Native cannot render
an HTML string. day_blocks keeps the raw prose for export and search,
body_tokens holds the render tree, and drill_slugs falls out of it. Doing
this in the seeder rather than in core/ means the matcher exists once and
the content spec can assert what came out.

A day is now one DayCard holding both the month-view summary and the full
card, so its name is written once instead of twice.

The regression target is the report build.py prints today: 63 drills used
across week 1 and the same 4 blocks where nothing matched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The Year view, in one payload

**Files:**
- Create: `backend/app/services/program_year_payload.rb`, `backend/app/controllers/api/v1/program_years_controller.rb`, `backend/app/policies/program_year_policy.rb`
- Create: `backend/spec/requests/program_years_spec.rb`
- Modify: `backend/config/routes.rb`

**Interfaces:**
- Consumes: everything seeded in Tasks 6 to 9.
- Produces: `ProgramYearPayload.new(year, on:).as_json`; `GET /api/v1/program_years`; `GET /api/v1/program_years/:id`.

One request returns the whole Year tab, the way `PassportController#payload` does it in the sibling. Splitting it only buys round trips on a server that may have just woken up. Patch awards, rank awards and test results join this payload in Tasks 13 and 14.

- [ ] **Step 1: Write the failing request spec**

`backend/spec/requests/program_years_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "program years", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

  describe "GET /api/v1/program_years" do
    it "lists the years with no program content in them" do
      get "/api/v1/program_years", headers: auth(coach)
      expect(response).to have_http_status(:ok)
      years = JSON.parse(response.body)["program_years"]
      expect(years.size).to eq(1)
      expect(years.first).to include("label" => "2026-27", "status" => "active", "is_current" => true)
      expect(years.first).not_to have_key("areas")
    end
  end

  describe "GET /api/v1/program_years/:id" do
    subject(:payload) do
      get "/api/v1/program_years/#{year.id}", headers: auth(coach)
      JSON.parse(response.body)
    end

    it "returns the whole year in one response" do
      expect(payload.keys).to include(
        "id", "label", "starts_on", "ends_on", "ball_now", "rank_rule", "north_star",
        "blocks", "areas", "patches", "ball_gates", "battery", "test_dates",
        "day_roles", "current_block_key", "current_week_id"
      )
    end

    it "carries the nine areas with a cell per block" do
      areas = payload["areas"]
      expect(areas.size).to eq(9)
      expect(areas.first["cells"].size).to eq(6)
      expect(areas.map { |a| a["slug"] }).to include("tennis", "basketball", "soccer", "mindset")
    end

    it "carries the battery as tests with their measures" do
      battery = payload["battery"]
      expect(battery["tests"].size).to eq(10)
      expect(battery["measures"].size).to eq(15)
      height = battery["measures"].find { |m| m["test_id"] == "h" }
      expect(height).to include("direction" => "growth", "battery_test_id" => nil)
    end

    it "names the active ball gate and carries no date on any gate" do
      gates = payload["ball_gates"]
      expect(gates.count { |g| g["status"] == "active" }).to eq(1)
      gates.each { |g| expect(g.keys).not_to include("date", "starts_on") }
    end

    it "names the current block from the date asked about" do
      get "/api/v1/program_years/#{year.id}?on=2027-01-20", headers: auth(coach)
      expect(JSON.parse(response.body)["current_block_key"]).to eq("coyote")
    end

    it "lets a viewer read the program" do
      get "/api/v1/program_years/#{year.id}", headers: auth(viewer)
      expect(response).to have_http_status(:ok)
    end

    it "tells an unauthenticated visitor nothing about Teddy" do
      get "/api/v1/program_years/#{year.id}"
      expect(response).to have_http_status(:unauthorized)
      expect(response.body).not_to match(/teddy|cartwheel|tennis/i)
    end

    it "404s a year that does not exist" do
      get "/api/v1/program_years/999999", headers: auth(coach)
      expect(response).to have_http_status(:not_found)
    end
  end
end
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bundle exec rspec spec/requests/program_years_spec.rb`
Expected: FAIL with routing errors.

- [ ] **Step 3: Write the payload builder**

`backend/app/services/program_year_payload.rb`:

```ruby
# The whole Year tab in one response.
#
# The Fly machine scales to zero, so the first request after an idle period
# already costs a wake-up. Splitting this into six endpoints would pay that
# latency six times over for a payload that is a few hundred rows.
class ProgramYearPayload
  def initialize(program_year, on: Date.current)
    @year = program_year
    @on = on
  end

  def as_json(*)
    {
      id: @year.id,
      label: @year.label,
      starts_on: @year.starts_on,
      ends_on: @year.ends_on,
      status: @year.status,
      ball_now: @year.ball_now,
      rank_rule: @year.rank_rule,
      north_star: @year.north_star,
      blocks: blocks,
      areas: areas,
      patches: patches,
      ball_gates: ball_gates,
      battery: battery,
      test_dates: test_dates,
      day_roles: day_roles,
      current_block_key: @year.current_block(on: @on)&.key,
      current_week_id: Week.current(@year, on: @on)&.id
    }
  end

  private

  def blocks
    @year.blocks.map do |b|
      { key: b.key, name: b.name, position: b.position, starts_on: b.starts_on,
        ends_on: b.ends_on, focus: b.focus, current: b.current?(on: @on) }
    end
  end

  def areas
    cells = AreaCell.where(area: @year.areas).includes(:block).group_by(&:area_id)
    @year.areas.map do |a|
      { slug: a.slug, position: a.position, name: a.name, summary: a.summary,
        cells: (cells[a.id] || []).sort_by { |c| c.block.position }
                                  .map { |c| { block_key: c.block.key, body: c.body } } }
    end
  end

  def patches
    @year.patches.includes(:block, :area).map do |p|
      { id: p.id, block_key: p.block.key, area_slug: p.area.slug,
        name: p.name, requirement: p.requirement }
    end
  end

  def ball_gates
    @year.ball_gates.map do |g|
      { position: g.position, from_ball: g.from_ball, to_ball: g.to_ball,
        label: g.label, requirement: g.requirement, status: g.status }
    end
  end

  def battery
    {
      tests: @year.battery_tests.map do |t|
        { id: t.id, position: t.position, name: t.name, protocol: t.protocol,
          area_name: t.area_name, unit: t.unit }
      end,
      measures: @year.battery_measures.map do |m|
        { id: m.id, test_id: m.test_id, position: m.position, label: m.label,
          unit: m.unit, direction: m.direction, battery_test_id: m.battery_test_id }
      end
    }
  end

  def test_dates
    @year.test_dates.map do |d|
      { id: d.id, window: d.window, label: d.label, display: d.display, position: d.position }
    end
  end

  def day_roles
    @year.day_roles.map do |r|
      { dow: r.dow, position: r.position, name: r.name, organized: r.organized,
        minutes: r.minutes, intensity: r.intensity, note: r.note }
    end
  end
end
```

- [ ] **Step 4: Write the policy and controller**

`backend/app/policies/program_year_policy.rb`:

```ruby
# The program itself is readable by everyone signed in, including a viewer.
# Journals and results narrow that in their own policies.
class ProgramYearPolicy < ApplicationPolicy
  def index? = read_program?
  def show?  = read_program?

  class Scope < Scope
    def resolve = user ? scope.all : scope.none
  end
end
```

`backend/app/controllers/api/v1/program_years_controller.rb`:

```ruby
module Api
  module V1
    class ProgramYearsController < ApiController
      # GET /api/v1/program_years
      def index
        authorize ProgramYear
        years = policy_scope(ProgramYear).order(starts_on: :desc)
        current = ProgramYear.current_for(years.first&.athlete, on: on)

        render json: {
          program_years: years.map do |y|
            { id: y.id, label: y.label, starts_on: y.starts_on, ends_on: y.ends_on,
              status: y.status, is_current: y.id == current&.id }
          end
        }
      end

      # GET /api/v1/program_years/:id
      def show
        year = policy_scope(ProgramYear).find(params[:id])
        authorize year
        render json: ProgramYearPayload.new(year, on: on).as_json
      end

      private

      # A date can be asked for, so the clients can look at any week of any
      # year without a second endpoint and without anything being hardcoded.
      def on
        Date.parse(params[:on].to_s)
      rescue ArgumentError, TypeError
        Date.current
      end
    end
  end
end
```

Routes, inside `namespace :v1`:

```ruby
      resources :program_years, only: %i[index show]
```

- [ ] **Step 5: Run and commit**

```bash
bundle exec rspec spec/requests/program_years_spec.rb
bundle exec rspec
git add backend
git commit -m "The Year view, in one payload

Blocks, the nine areas with a cell per block, patches, ball gates, the
battery with its measures, test dates and day roles in a single response,
the way the sibling's passport payload does it. The Fly machine scales to
zero, so splitting this would pay the wake-up latency six times over for
a few hundred rows.

An 'on' date parameter picks the current block and week, so the clients
can look at any week of any year without a second endpoint.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The month view and This Week

**Files:**
- Create: `backend/app/services/week_payload.rb`, `backend/app/controllers/api/v1/plans_controller.rb`, `backend/app/controllers/api/v1/weeks_controller.rb`
- Create: `backend/spec/requests/plans_spec.rb`, `backend/spec/requests/weeks_spec.rb`
- Modify: `backend/config/routes.rb`

**Interfaces:**
- Consumes: `MonthPlan`, `Week`, `DayCard`, `DayBlock` (Task 9); `ProgramYearPolicy` (Task 10).
- Produces: `WeekPayload.new(week, user:).as_json`; `GET /api/v1/program_years/:id/plans/:month`; `GET /api/v1/program_years/:id/weeks/current`.

Journal entries join the week payload in Task 12, so the form opens filled in rather than fetching twice.

- [ ] **Step 1: Write the failing specs**

`backend/spec/requests/plans_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "month plans", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)  { ProgramYear.sole }
  let(:coach) { create(:user, :coach) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

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
```

`backend/spec/requests/weeks_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "this week", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)  { ProgramYear.sole }
  let(:coach) { create(:user, :coach) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

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
end
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bundle exec rspec spec/requests/plans_spec.rb spec/requests/weeks_spec.rb`
Expected: FAIL with routing errors.

- [ ] **Step 3: Write the week payload**

`backend/app/services/week_payload.rb`:

```ruby
# One week with its full day cards. Task 12 adds the coach and athlete entries
# for each date, so the journal form opens filled in rather than fetching again.
class WeekPayload
  def initialize(week, user: nil, detailed: true)
    @week = week
    @user = user
    @detailed = detailed
  end

  def as_json(*)
    {
      id: @week.id,
      number: @week.number,
      position_in_block: @week.position_in_block,
      theme: @week.theme,
      dates_display: @week.dates_display,
      targets: @week.targets,
      challenge: @week.challenge,
      trials: @week.trials,
      block_key: @week.block.key,
      high_intent_efforts: @week.high_intent_efforts,
      budget: @week.budget,
      days: @week.day_cards.includes(:day_blocks, :day_role).map { |c| day(c) }
    }
  end

  private

  def day(card)
    base = {
      id: card.id,
      dow: card.dow,
      date: card.date,
      name: card.name,
      role: card.day_role&.name,
      minutes: card.minutes,
      intensity: card.intensity,
      hie: card.hie,
      summary_lines: card.summary_lines,
      drill_slugs: card.drill_slugs
    }
    return base unless @detailed

    base.merge(
      dad_note: card.dad_note,
      blocks: card.day_blocks.map do |b|
        { id: b.id, position: b.position, minutes: b.minutes, name: b.name,
          tag: b.tag, name_tokens: b.name_tokens, body_tokens: b.body_tokens,
          drill_slugs: b.drill_slugs }
      end
    )
  end
end
```

- [ ] **Step 4: Write the controllers**

`backend/app/controllers/api/v1/plans_controller.rb`:

```ruby
module Api
  module V1
    class PlansController < ApiController
      # GET /api/v1/program_years/:program_year_id/plans/:month
      def show
        year = policy_scope(ProgramYear).find(params[:program_year_id])
        authorize year, :show?

        plan = year.month_plans.find_by!(month: params[:month])

        render json: {
          month: plan.month,
          label: plan.label,
          range_display: plan.range_display,
          block_key: plan.block.key,
          # The month view wants summaries, not full cards. Detail arrives on
          # the week endpoint, which is the screen that uses it.
          weeks: plan.weeks.map { |w| WeekPayload.new(w, user: current_user, detailed: false).as_json }
        }
      end
    end
  end
end
```

`backend/app/controllers/api/v1/weeks_controller.rb`:

```ruby
module Api
  module V1
    class WeeksController < ApiController
      # GET /api/v1/program_years/:program_year_id/weeks/current
      def current
        year = policy_scope(ProgramYear).find(params[:program_year_id])
        authorize year, :show?

        week = Week.current(year, on: on) || first_week(year)
        return render_not_found if week.nil?

        render json: WeekPayload.new(week, user: current_user).as_json
      end

      private

      def first_week(year)
        Week.joins(:month_plan).where(month_plans: { program_year_id: year.id })
            .order(:number).first
      end

      def on
        Date.parse(params[:on].to_s)
      rescue ArgumentError, TypeError
        Date.current
      end
    end
  end
end
```

Add `has_many :month_plans, -> { order(:month) }, dependent: :destroy` to `ProgramYear`.

Routes, replacing the `resources :program_years` line:

```ruby
      resources :program_years, only: %i[index show] do
        get "plans/:month", to: "plans#show", as: :plan
        get "weeks/current", to: "weeks#current", as: :current_week
      end
```

- [ ] **Step 5: Run and commit**

```bash
bundle exec rspec spec/requests/plans_spec.rb spec/requests/weeks_spec.rb
bundle exec rspec
git add backend
git commit -m "The month view and This Week

The month endpoint returns week summaries, the week endpoint returns full
day cards with their blocks as tokens. Same payload builder, one flag
apart, so a day is described the same way on both screens.

Each week reports its high-intent effort spend beside its budget, so the
number is visible rather than buried in a doc.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The two journals, and Teddy's toggle

**Files:**
- Create: `backend/db/migrate/<ts>_create_journals.rb`
- Create: `backend/app/models/{coach_entry,athlete_entry,drill_rating}.rb`
- Create: `backend/app/policies/{coach_entry_policy,athlete_entry_policy}.rb`
- Create: `backend/app/controllers/api/v1/{coach_entries_controller,athlete_entries_controller}.rb`
- Create: `backend/spec/factories/{coach_entries,athlete_entries}.rb`, `backend/spec/requests/coach_entries_spec.rb`, `backend/spec/requests/athlete_entries_spec.rb`
- Modify: `backend/app/services/week_payload.rb`, `backend/config/routes.rb`

**Interfaces:**
- Consumes: `User`, `Athlete` (Task 5), `ProgramYear`, `DayCard`, `Drill`.
- Produces: `CoachEntry` with `drill_ratings`; `AthleteEntry` with `shared`; `CoachEntry.upsert_for(user:, program_year:, session_date:, attrs:, ratings:)`; the six journal endpoints; `WeekPayload` days carrying `coach_entry` and `athlete_entry`.

**Two things here are load-bearing.**

`POST` upserts on the natural key rather than creating blindly. One entry per user per year per session date, addressed by construction. That is what made the cross-device bug go away, and it is what will make the Phase 2 offline queue safe: a replayed write updates the same row instead of making a second one.

`AthleteEntry#shared` defaults to false and is enforced in the Pundit scope, so an unshared entry is absent from the coach's payload rather than present and hidden by the client. Emily, as a viewer, sees no journal entries at all. Shared means shared with Dad, not published.

- [ ] **Step 1: Write the migration**

```ruby
class CreateJournals < ActiveRecord::Migration[8.0]
  def change
    create_table :coach_entries do |t|
      t.references :user, null: false, foreign_key: true
      t.references :athlete, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.references :day_card, foreign_key: true
      t.date :session_date, null: false
      t.integer :overall
      t.integer :energy
      t.boolean :flag_pain, null: false, default: false
      t.text :pain_note
      t.text :note
      t.string :challenge_num
      t.timestamps
    end
    # One entry per author per year per session date, addressed by construction.
    add_index :coach_entries, %i[user_id program_year_id session_date], unique: true,
              name: "index_coach_entries_on_author_year_and_date"

    create_table :athlete_entries do |t|
      t.references :user, null: false, foreign_key: true
      t.references :athlete, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.references :day_card, foreign_key: true
      t.date :session_date, null: false
      t.integer :felt
      t.text :best
      t.text :hard
      t.text :note
      # Teddy's own switch. Off by default, so showing Dad is a choice he
      # makes rather than something he has to remember to turn off.
      t.boolean :shared, null: false, default: false
      t.timestamps
    end
    add_index :athlete_entries, %i[user_id program_year_id session_date], unique: true,
              name: "index_athlete_entries_on_author_year_and_date"

    # A table rather than the jsonb column the old diary used, because drill
    # mastery has to be queryable across years.
    create_table :drill_ratings do |t|
      t.references :coach_entry, null: false, foreign_key: true
      t.references :drill, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.date :session_date, null: false
      t.string :rating, null: false
      t.timestamps
    end
    add_index :drill_ratings, %i[coach_entry_id drill_id], unique: true
    add_index :drill_ratings, %i[drill_id session_date]
    add_check_constraint :drill_ratings, "rating in ('not_yet','getting','owns')",
      name: "drill_ratings_rating_check"
  end
end
```

- [ ] **Step 2: Write the models**

`backend/app/models/coach_entry.rb`:

```ruby
class CoachEntry < ApplicationRecord
  belongs_to :user
  belongs_to :athlete
  belongs_to :program_year
  belongs_to :day_card, optional: true
  has_many :drill_ratings, dependent: :destroy

  validates :session_date, presence: true,
            uniqueness: { scope: %i[user_id program_year_id] }
  validates :overall, :energy, inclusion: { in: 1..5 }, allow_nil: true
  validates :note, :pain_note, length: { maximum: 2000 }

  scope :between, ->(from, to) { where(session_date: from..to) }
  scope :flagged, -> { where(flag_pain: true) }

  # Addressed by (author, year, date), so a second device and a replayed
  # offline write both land on the same row.
  def self.upsert_for(user:, program_year:, session_date:, attrs: {}, ratings: nil)
    entry = find_or_initialize_by(user: user, program_year: program_year, session_date: session_date)
    entry.athlete ||= program_year.athlete
    entry.day_card ||= DayCard.joins(week: :month_plan)
                              .where(month_plans: { program_year_id: program_year.id })
                              .find_by(date: session_date)
    entry.assign_attributes(attrs)
    entry.save!
    entry.replace_ratings!(ratings) unless ratings.nil?
    entry
  end

  # A rating that is sent replaces what was there. A drill left out of the
  # payload keeps whatever it had, so a partly filled form loses nothing.
  def replace_ratings!(ratings)
    ratings.each do |slug, rating|
      drill = Drill.find_by(slug: slug) or next
      record = drill_ratings.find_or_initialize_by(drill: drill)
      record.assign_attributes(rating: rating, program_year: program_year, session_date: session_date)
      record.save!
    end
  end
end
```

`backend/app/models/athlete_entry.rb`:

```ruby
# Teddy's own reflection, in his own words. Different fields from the coach's
# entry, a different form, and a switch he controls.
#
# The Champion's Log stays on paper and never appears here. That notebook is
# his, and Dad reads it only when invited.
class AthleteEntry < ApplicationRecord
  belongs_to :user
  belongs_to :athlete
  belongs_to :program_year
  belongs_to :day_card, optional: true

  validates :session_date, presence: true,
            uniqueness: { scope: %i[user_id program_year_id] }
  validates :felt, inclusion: { in: 1..5 }, allow_nil: true
  validates :best, :hard, :note, length: { maximum: 2000 }

  scope :shared_with_coach, -> { where(shared: true) }

  def self.upsert_for(user:, program_year:, session_date:, attrs: {})
    entry = find_or_initialize_by(user: user, program_year: program_year, session_date: session_date)
    entry.athlete ||= program_year.athlete
    entry.day_card ||= DayCard.joins(week: :month_plan)
                              .where(month_plans: { program_year_id: program_year.id })
                              .find_by(date: session_date)
    entry.assign_attributes(attrs)
    entry.save!
    entry
  end
end
```

`backend/app/models/drill_rating.rb`:

```ruby
class DrillRating < ApplicationRecord
  RATINGS = %w[not_yet getting owns].freeze

  belongs_to :coach_entry
  belongs_to :drill
  belongs_to :program_year

  validates :rating, inclusion: { in: RATINGS }
  validates :drill_id, uniqueness: { scope: :coach_entry_id }

  # The whole reason this left jsonb: mastery across every year, for one drill.
  scope :for_drill, ->(slug) { joins(:drill).where(drills: { slug: slug }).order(:session_date) }

  # Three "owns it" in a row progresses or retires a drill. Three "not yet" in
  # a row drops it to an easier entry point. The diary proposes, never edits.
  def self.streak(slug, rating, length: 3)
    for_drill(slug).last(length).then { |rows| rows.size == length && rows.all? { |r| r.rating == rating } }
  end
end
```

- [ ] **Step 3: Write the policies**

`backend/app/policies/coach_entry_policy.rb`:

```ruby
class CoachEntryPolicy < ApplicationPolicy
  def index?  = user.coach?
  def show?   = user.coach? && record.user_id == user.id
  def create? = user.coach?
  def update? = show?

  class Scope < Scope
    # Only the coach reads coach entries, and only their own.
    def resolve = user&.coach? ? scope.where(user_id: user.id) : scope.none
  end
end
```

`backend/app/policies/athlete_entry_policy.rb`:

```ruby
# The toggle lives here rather than in the client. An entry Teddy has not
# shared is absent from the coach's payload, not present and hidden.
class AthleteEntryPolicy < ApplicationPolicy
  def index?  = user.coach? || user.athlete?
  def show?   = Scope.new(user, AthleteEntry).resolve.exists?(id: record.id)
  def create? = user.athlete?
  def update? = user.athlete? && record.user_id == user.id

  class Scope < Scope
    def resolve
      return scope.none if user.nil?
      return scope.where(user_id: user.id) if user.athlete?
      return scope.shared_with_coach if user.coach?
      scope.none   # a viewer sees no journal entries from either side
    end
  end
end
```

- [ ] **Step 4: Write the factories and the failing specs**

`backend/spec/factories/coach_entries.rb`:

```ruby
FactoryBot.define do
  factory :coach_entry do
    user { create(:user, :coach) }
    athlete { program_year.athlete }
    program_year { ProgramYear.first || create(:program_year) }
    session_date { Date.new(2026, 9, 17) }
    overall { 4 }
    energy { 4 }
    note { "Good session." }
  end
end
```

`backend/spec/factories/athlete_entries.rb`:

```ruby
FactoryBot.define do
  factory :athlete_entry do
    user { create(:user, :athlete) }
    athlete { program_year.athlete }
    program_year { ProgramYear.first || create(:program_year) }
    session_date { Date.new(2026, 9, 17) }
    felt { 5 }
    best { "The cartwheel" }
    shared { false }

    trait(:shared) { shared { true } }
  end
end
```

`backend/spec/requests/coach_entries_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "coach entries", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)    { ProgramYear.sole }
  let(:coach)   { create(:user, :coach) }
  let(:teddy)   { create(:user, :athlete) }
  let(:viewer)  { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

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
end
```

`backend/spec/requests/athlete_entries_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "athlete entries", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:teddy)  { create(:user, :athlete) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

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
  end

  it "updates rather than duplicating when the same date is posted twice" do
    post "/api/v1/athlete_entries", params: body, as: :json, headers: auth(teddy)
    post "/api/v1/athlete_entries",
      params: body.deep_merge(athlete_entry: { felt: 3 }), as: :json, headers: auth(teddy)
    expect(AthleteEntry.count).to eq(1)
    expect(AthleteEntry.sole.felt).to eq(3)
  end
end
```

- [ ] **Step 5: Run them and watch them fail**

Run: `bundle exec rspec spec/requests/coach_entries_spec.rb spec/requests/athlete_entries_spec.rb`
Expected: FAIL with routing errors.

- [ ] **Step 6: Write the controllers**

`backend/app/controllers/api/v1/coach_entries_controller.rb`:

```ruby
module Api
  module V1
    class CoachEntriesController < ApiController
      # GET /api/v1/coach_entries?from=&to=
      def index
        authorize CoachEntry
        entries = policy_scope(CoachEntry).includes(drill_ratings: :drill).order(:session_date)
        entries = entries.between(params[:from], params[:to]) if params[:from] && params[:to]
        render json: { coach_entries: entries.map { |e| serialize(e) } }
      end

      # POST /api/v1/coach_entries
      # Upserts on (author, year, session date), so a second device and a
      # replayed offline write land on the same row.
      def create
        authorize CoachEntry
        year = ProgramYear.find(entry_params.fetch(:program_year_id))

        entry = CoachEntry.upsert_for(
          user: current_user, program_year: year,
          session_date: entry_params.fetch(:session_date),
          attrs: entry_params.except(:program_year_id, :session_date),
          ratings: ratings_param
        )

        render json: { coach_entry: serialize(entry) }
      end

      # PATCH /api/v1/coach_entries/:id
      def update
        entry = policy_scope(CoachEntry).find(params[:id])
        authorize entry
        entry.update!(entry_params.except(:program_year_id, :session_date))
        entry.replace_ratings!(ratings_param) if ratings_param
        render json: { coach_entry: serialize(entry) }
      end

      private

      def entry_params
        params.require(:coach_entry).permit(
          :program_year_id, :session_date, :overall, :energy,
          :flag_pain, :pain_note, :note, :challenge_num
        )
      end

      # A slug that is not a drill is dropped rather than failing the save, so
      # a stale client never costs Jeff an entry. A bad rating still fails,
      # because that is a real mistake worth surfacing.
      def ratings_param
        raw = params[:ratings]
        return nil if raw.blank?
        raw.to_unsafe_h.select { |slug, _| slug.to_s.match?(/\A[a-z0-9-]{1,64}\z/) }
      end

      def serialize(entry)
        {
          id: entry.id, session_date: entry.session_date, program_year_id: entry.program_year_id,
          day_card_id: entry.day_card_id, overall: entry.overall, energy: entry.energy,
          flag_pain: entry.flag_pain, pain_note: entry.pain_note, note: entry.note,
          challenge_num: entry.challenge_num,
          ratings: entry.drill_ratings.to_h { |r| [ r.drill.slug, r.rating ] }
        }
      end
    end
  end
end
```

`backend/app/controllers/api/v1/athlete_entries_controller.rb`:

```ruby
module Api
  module V1
    class AthleteEntriesController < ApiController
      # GET /api/v1/athlete_entries
      def index
        authorize AthleteEntry
        entries = policy_scope(AthleteEntry).order(:session_date)
        render json: { athlete_entries: entries.map { |e| serialize(e) } }
      end

      # GET /api/v1/athlete_entries/:id
      def show
        entry = policy_scope(AthleteEntry).find(params[:id])
        authorize entry
        render json: { athlete_entry: serialize(entry) }
      end

      # POST /api/v1/athlete_entries
      def create
        authorize AthleteEntry
        year = ProgramYear.find(entry_params.fetch(:program_year_id))

        entry = AthleteEntry.upsert_for(
          user: current_user, program_year: year,
          session_date: entry_params.fetch(:session_date),
          attrs: entry_params.except(:program_year_id, :session_date)
        )

        render json: { athlete_entry: serialize(entry) }
      end

      # PATCH /api/v1/athlete_entries/:id
      def update
        entry = policy_scope(AthleteEntry).find(params[:id])
        authorize entry
        entry.update!(entry_params.except(:program_year_id, :session_date))
        render json: { athlete_entry: serialize(entry) }
      end

      private

      def entry_params
        params.require(:athlete_entry).permit(
          :program_year_id, :session_date, :felt, :best, :hard, :note, :shared
        )
      end

      def serialize(entry)
        { id: entry.id, session_date: entry.session_date, program_year_id: entry.program_year_id,
          day_card_id: entry.day_card_id, felt: entry.felt, best: entry.best,
          hard: entry.hard, note: entry.note, shared: entry.shared }
      end
    end
  end
end
```

Routes, inside `namespace :v1`:

```ruby
      resources :coach_entries,   only: %i[index show create update]
      resources :athlete_entries, only: %i[index show create update]
```

- [ ] **Step 7: Hang the entries off the week payload**

In `week_payload.rb`, add to `day(card)` inside the `@detailed` branch:

```ruby
      coach_entry: entry_for(CoachEntry, card),
      athlete_entry: entry_for(AthleteEntry, card),
```

and:

```ruby
  # Whatever the current user is allowed to see for this date, so the journal
  # form opens filled in rather than fetching a second time. The policy scope
  # does the filtering, which is how an unshared entry is absent rather than
  # hidden.
  def entry_for(klass, card)
    return nil if @user.nil?
    scope = Pundit.policy_scope!(@user, klass)
    entry = scope.find_by(program_year_id: @week.month_plan.program_year_id, session_date: card.date)
    entry && entry.as_json(except: %i[created_at updated_at])
  end
```

Add to `weeks_spec.rb`:

```ruby
  it "opens the journal form filled in, and hides what Teddy has not shared" do
    coach = create(:user, :coach)
    teddy = create(:user, :athlete)
    create(:coach_entry, user: coach, program_year: year, session_date: Date.new(2026, 9, 17), note: "Good day")
    create(:athlete_entry, user: teddy, program_year: year, session_date: Date.new(2026, 9, 17))

    get "/api/v1/program_years/#{year.id}/weeks/current?on=2026-09-17",
      headers: { "Authorization" => "Bearer #{JwtService.encode(user_id: coach.id)}" }

    thu = JSON.parse(response.body)["days"].find { |d| d["dow"] == "thu" }
    expect(thu["coach_entry"]["note"]).to eq("Good day")
    expect(thu["athlete_entry"]).to be_nil
  end
```

- [ ] **Step 8: Migrate, run and commit**

```bash
bundle exec rails db:migrate
bundle exec rspec
```

Expected: every example green.

```bash
git add backend
git commit -m "The two journals, and Teddy's toggle

CoachEntry and AthleteEntry are separate models attached to their own
author, with different fields and different forms. POST upserts on
(author, year, session date), so a second device and a replayed offline
write land on the same row. That is the property the old per-device queue
lacked, and it is what will make the Phase 2 queue safe.

AthleteEntry#shared defaults to false and is enforced in the Pundit
scope, so an entry Teddy has not shared is absent from Jeff's payload
rather than present and hidden by the client. A viewer sees no journal
entries from either side, because shared means shared with Dad rather
than published. The Champion's Log stays on paper.

Drill ratings are a table rather than the jsonb column the old diary
used, carrying program_year_id and session_date on the row, because
mastery across years is the question the diary exists to answer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Test results, and the progress they feed

**Files:**
- Create: `backend/db/migrate/<ts>_create_test_results.rb`, `backend/app/models/test_result.rb`
- Create: `backend/app/policies/test_result_policy.rb`, `backend/app/controllers/api/v1/test_results_controller.rb`
- Create: `backend/spec/requests/test_results_spec.rb`
- Modify: `backend/app/services/program_year_payload.rb`, `backend/config/routes.rb`

**Interfaces:**
- Consumes: `BatteryMeasure`, `TestDate` (Tasks 6 and 7).
- Produces: `TestResult` with `raw_value` and `numeric_value`; `TestResult.upsert_for(...)`; `GET /api/v1/test_results`; `POST /api/v1/test_results`; the Year payload's `battery.results` and `battery.progress`.

`api/results.js` deliberately stores the value as text, because a number that will not parse is still worth keeping. That judgment survives. `raw_value` keeps what was typed and `numeric_value` holds the parse when one is possible, so the chart reads what it can and nothing typed is ever discarded. Clearing a value deletes the row, so a mistyped number can be taken back.

- [ ] **Step 1: Write the migration**

```ruby
class CreateTestResults < ActiveRecord::Migration[8.0]
  def change
    create_table :test_results do |t|
      t.references :program_year, null: false, foreign_key: true
      t.references :athlete, null: false, foreign_key: true
      t.references :test_date, null: false, foreign_key: true
      t.references :battery_measure, null: false, foreign_key: true
      t.references :recorded_by_user, null: false, foreign_key: { to_table: :users }
      # What was typed, kept as text. Some rows get a range or a unit, and a
      # value that will not parse is still worth storing.
      t.string :raw_value, null: false
      t.decimal :numeric_value, precision: 10, scale: 3
      t.datetime :recorded_at, null: false
      t.timestamps
    end
    add_index :test_results, %i[program_year_id test_date_id battery_measure_id],
              unique: true, name: "index_test_results_on_year_window_and_measure"
  end
end
```

- [ ] **Step 2: Write the failing spec**

`backend/spec/requests/test_results_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "test results", type: :request do
  before { ContentSeeder.new(year_label: "2026-27").seed! }

  let(:year)   { ProgramYear.sole }
  let(:coach)  { create(:user, :coach) }
  let(:teddy)  { create(:user, :athlete) }
  let(:viewer) { create(:user) }
  def auth(user) = { "Authorization" => "Bearer #{JwtService.encode(user_id: user.id)}" }

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
  end

  it "lets Teddy record his own numbers and a viewer record none" do
    post_result(teddy, test_id: "t5", value: "22")
    expect(response).to have_http_status(:ok)

    post_result(viewer, test_id: "t5", value: "30")
    expect(response).to have_http_status(:forbidden)
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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bundle exec rspec spec/requests/test_results_spec.rb`
Expected: FAIL with `uninitialized constant TestResult`.

- [ ] **Step 4: Write the model**

`backend/app/models/test_result.rb`:

```ruby
class TestResult < ApplicationRecord
  belongs_to :program_year
  belongs_to :athlete
  belongs_to :test_date
  belongs_to :battery_measure
  belongs_to :recorded_by_user, class_name: "User"

  validates :raw_value, presence: true
  validate  :has_a_digit_in_it

  before_validation :parse_the_number
  before_validation { self.recorded_at ||= Time.current }

  scope :for_measure, ->(measure) { where(battery_measure: measure) }

  def self.upsert_for(program_year:, test_date:, battery_measure:, value:, user:)
    record = find_or_initialize_by(program_year: program_year, test_date: test_date,
                                   battery_measure: battery_measure)
    record.assign_attributes(athlete: program_year.athlete, recorded_by_user: user,
                             raw_value: value.to_s.strip, recorded_at: Time.current)
    record.save!
    record
  end

  private

  # Kept as text, parsed where possible. "15 to 18" stores as typed and charts
  # at 15, which beats refusing the entry or losing the range.
  def parse_the_number
    self.numeric_value = raw_value.to_s[/-?\d+(?:\.\d+)?/]&.to_d
  end

  def has_a_digit_in_it
    return if raw_value.to_s.match?(/\d/)
    errors.add(:raw_value, "needs at least one digit")
  end
end
```

- [ ] **Step 5: Write the policy and controller**

`backend/app/policies/test_result_policy.rb`:

```ruby
# The coach records everything. Teddy records his own numbers, because typing
# them in is part of the ceremony. A viewer records nothing.
class TestResultPolicy < ApplicationPolicy
  def index?  = read_program?
  def create? = user.coach? || user.athlete?

  class Scope < Scope
    def resolve = user ? scope.all : scope.none
  end
end
```

`backend/app/controllers/api/v1/test_results_controller.rb`:

```ruby
module Api
  module V1
    class TestResultsController < ApiController
      # GET /api/v1/test_results?program_year_id=
      def index
        authorize TestResult
        results = policy_scope(TestResult).includes(:battery_measure, :test_date)
        results = results.where(program_year_id: params[:program_year_id]) if params[:program_year_id]
        render json: { test_results: results.map { |r| serialize(r) } }
      end

      # POST /api/v1/test_results
      def create
        authorize TestResult
        year = ProgramYear.find(result_params.fetch(:program_year_id))
        date = year.test_dates.find_by!(window: result_params.fetch(:window))
        measure = year.battery_measures.find_by!(test_id: result_params.fetch(:test_id))

        value = result_params[:value].to_s.strip

        # Clearing a box deletes the row, so a mistyped number can be taken back.
        if value.empty?
          TestResult.where(program_year: year, test_date: date, battery_measure: measure).destroy_all
          return render json: { deleted: true, test_id: measure.test_id, window: date.window }
        end

        result = TestResult.upsert_for(program_year: year, test_date: date,
                                       battery_measure: measure, value: value, user: current_user)
        render json: { test_result: serialize(result) }
      end

      private

      def result_params
        params.require(:test_result).permit(:program_year_id, :window, :test_id, :value)
      end

      def serialize(result)
        { id: result.id, window: result.test_date.window, test_id: result.battery_measure.test_id,
          raw_value: result.raw_value, numeric_value: result.numeric_value&.to_s,
          recorded_at: result.recorded_at }
      end
    end
  end
end
```

Routes: `resources :test_results, only: %i[index create]`.

- [ ] **Step 6: Add results and progress to the Year payload**

In `program_year_payload.rb`, change `battery` to include them and add the private methods:

```ruby
  def battery
    {
      tests: ...,      # unchanged
      measures: ...,   # unchanged
      results: results.map { |r| { window: r.test_date.window, test_id: r.battery_measure.test_id,
                                   raw_value: r.raw_value, numeric_value: r.numeric_value&.to_s } },
      progress: progress
    }
  end

  def results
    @results ||= TestResult.where(program_year: @year)
                           .includes(:test_date, :battery_measure)
                           .sort_by { |r| r.test_date.position }
  end

  # One card per measure: latest value, change since baseline with the
  # direction applied, and a series for the sparkline. Fifteen tests in
  # different units on one axis would mean nothing, so they stay separate.
  def progress
    by_measure = results.group_by(&:battery_measure_id)

    @year.battery_measures.map do |measure|
      rows = (by_measure[measure.id] || [])
      baseline = rows.first
      latest = rows.last

      card = {
        test_id: measure.test_id, label: measure.label, unit: measure.unit,
        direction: measure.direction,
        baseline: baseline&.numeric_value&.to_s,
        latest: latest&.numeric_value&.to_s,
        change: measure.improvement_from(baseline&.numeric_value, latest&.numeric_value)&.to_s,
        series: rows.map { |r| { window: r.test_date.window, value: r.numeric_value&.to_s } }
      }
      measure.direction == "growth" ? card.merge(cm_per_year: cm_per_year(rows)) : card
    end
  end

  # Height reports a pace. A fast one is the trigger for the growth-load
  # protocol in the architecture: halve jumping and sprinting for 8 to 12
  # weeks and double down on skill and mobility.
  def cm_per_year(rows)
    return nil if rows.size < 2
    first, last = rows.first, rows.last
    days = (last.recorded_at.to_date - first.recorded_at.to_date).to_i
    return nil if days.zero?
    ((last.numeric_value - first.numeric_value) / days * 365.25).to_f.round(1)
  end
```

- [ ] **Step 7: Migrate, run and commit**

```bash
bundle exec rails db:migrate
bundle exec rspec
git add backend
git commit -m "Test results, and the progress they feed

raw_value keeps what was typed and numeric_value holds the parse when one
is possible, preserving the judgment in api/results.js that a number
which will not parse is still worth storing. '15 to 18' saves as typed
and charts at 15.

One row per year, window and measure, so a second save overwrites. An
empty value deletes the row, so a mistyped number can be taken back.

The Year payload gains a progress card per measure: latest value, change
since baseline with the direction applied, and a series for the
sparkline. Height reports a cm per year pace instead of a verdict,
because a fast one is the trigger for the growth-load protocol.

Teddy can type his own numbers. A viewer can type none.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
