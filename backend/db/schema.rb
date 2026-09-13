# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_09_13_201000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "citext"
  enable_extension "pg_catalog.plpgsql"

  create_table "area_cells", force: :cascade do |t|
    t.bigint "area_id", null: false
    t.bigint "block_id", null: false
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["area_id", "block_id"], name: "index_area_cells_on_area_id_and_block_id", unique: true
    t.index ["area_id"], name: "index_area_cells_on_area_id"
    t.index ["block_id"], name: "index_area_cells_on_block_id"
  end

  create_table "areas", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.string "slug", null: false
    t.integer "position", null: false
    t.string "name", null: false
    t.text "summary"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["program_year_id", "slug"], name: "index_areas_on_program_year_id_and_slug", unique: true
    t.index ["program_year_id"], name: "index_areas_on_program_year_id"
  end

  create_table "athlete_entries", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "athlete_id", null: false
    t.bigint "program_year_id", null: false
    t.bigint "day_card_id"
    t.date "session_date", null: false
    t.integer "felt"
    t.text "best"
    t.text "hard"
    t.text "note"
    t.boolean "shared", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["athlete_id"], name: "index_athlete_entries_on_athlete_id"
    t.index ["day_card_id"], name: "index_athlete_entries_on_day_card_id"
    t.index ["program_year_id"], name: "index_athlete_entries_on_program_year_id"
    t.index ["user_id", "program_year_id", "session_date"], name: "index_athlete_entries_on_author_year_and_date", unique: true
    t.index ["user_id"], name: "index_athlete_entries_on_user_id"
  end

  create_table "athletes", force: :cascade do |t|
    t.string "name", null: false
    t.date "birthday", null: false
    t.bigint "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "slug", null: false
    t.index ["slug"], name: "index_athletes_on_slug", unique: true
    t.index ["user_id"], name: "index_athletes_on_user_id", unique: true
  end

  create_table "ball_gates", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.integer "position", null: false
    t.string "from_ball", null: false
    t.string "to_ball", null: false
    t.string "label", null: false
    t.text "requirement", null: false
    t.string "status", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["program_year_id", "from_ball", "to_ball"], name: "index_ball_gates_on_year_and_progression", unique: true
    t.index ["program_year_id"], name: "index_ball_gates_on_program_year_id"
  end

  create_table "battery_measures", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.bigint "battery_test_id"
    t.string "test_id", null: false
    t.integer "position", null: false
    t.string "label", null: false
    t.string "unit", null: false
    t.string "direction", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["battery_test_id"], name: "index_battery_measures_on_battery_test_id"
    t.index ["program_year_id", "test_id"], name: "index_battery_measures_on_program_year_id_and_test_id", unique: true
    t.index ["program_year_id"], name: "index_battery_measures_on_program_year_id"
    t.check_constraint "direction::text = ANY (ARRAY['lower'::character varying, 'higher'::character varying, 'growth'::character varying]::text[])", name: "battery_measures_direction_check"
  end

  create_table "battery_tests", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.integer "position", null: false
    t.string "name", null: false
    t.text "protocol", null: false
    t.string "area_name", null: false
    t.string "unit", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "key", null: false
    t.index ["program_year_id", "key"], name: "index_battery_tests_on_year_and_key", unique: true
    t.index ["program_year_id"], name: "index_battery_tests_on_program_year_id"
  end

  create_table "blocks", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.string "key", null: false
    t.string "name", null: false
    t.integer "position", null: false
    t.date "starts_on", null: false
    t.date "ends_on", null: false
    t.text "focus"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["program_year_id", "key"], name: "index_blocks_on_program_year_id_and_key", unique: true
    t.index ["program_year_id"], name: "index_blocks_on_program_year_id"
  end

  create_table "coach_entries", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "athlete_id", null: false
    t.bigint "program_year_id", null: false
    t.bigint "day_card_id"
    t.date "session_date", null: false
    t.integer "overall"
    t.integer "energy"
    t.boolean "flag_pain", default: false, null: false
    t.text "pain_note"
    t.text "note"
    t.string "challenge_num"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["athlete_id"], name: "index_coach_entries_on_athlete_id"
    t.index ["day_card_id"], name: "index_coach_entries_on_day_card_id"
    t.index ["program_year_id"], name: "index_coach_entries_on_program_year_id"
    t.index ["user_id", "program_year_id", "session_date"], name: "index_coach_entries_on_author_year_and_date", unique: true
    t.index ["user_id"], name: "index_coach_entries_on_user_id"
  end

  create_table "day_blocks", force: :cascade do |t|
    t.bigint "day_card_id", null: false
    t.integer "position", null: false
    t.string "minutes", null: false
    t.string "name", null: false
    t.text "body"
    t.string "tag"
    t.jsonb "name_tokens", default: [], null: false
    t.jsonb "body_tokens", default: [], null: false
    t.string "drill_slugs", default: [], null: false, array: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["day_card_id", "position"], name: "index_day_blocks_on_day_card_id_and_position", unique: true
    t.index ["day_card_id"], name: "index_day_blocks_on_day_card_id"
    t.check_constraint "tag IS NULL OR (tag::text = ANY (ARRAY['test'::character varying, 'challenge'::character varying]::text[]))", name: "day_blocks_tag_check"
  end

  create_table "day_cards", force: :cascade do |t|
    t.bigint "week_id", null: false
    t.bigint "day_role_id"
    t.date "date", null: false
    t.string "dow", null: false
    t.string "name", null: false
    t.string "minutes", null: false
    t.integer "intensity", null: false
    t.integer "hie", default: 0, null: false
    t.text "summary_lines", default: [], null: false, array: true
    t.text "dad_note"
    t.string "drill_slugs", default: [], null: false, array: true
    t.integer "position", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["day_role_id"], name: "index_day_cards_on_day_role_id"
    t.index ["week_id", "date"], name: "index_day_cards_on_week_id_and_date", unique: true
    t.index ["week_id"], name: "index_day_cards_on_week_id"
  end

  create_table "day_roles", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.string "dow", null: false
    t.integer "position", null: false
    t.string "name", null: false
    t.string "organized", default: [], null: false, array: true
    t.string "minutes", null: false
    t.integer "intensity", null: false
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["program_year_id", "dow"], name: "index_day_roles_on_program_year_id_and_dow", unique: true
    t.index ["program_year_id"], name: "index_day_roles_on_program_year_id"
  end

  create_table "drill_ratings", force: :cascade do |t|
    t.bigint "coach_entry_id", null: false
    t.bigint "drill_id", null: false
    t.bigint "program_year_id", null: false
    t.date "session_date", null: false
    t.string "rating", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["coach_entry_id", "drill_id"], name: "index_drill_ratings_on_coach_entry_id_and_drill_id", unique: true
    t.index ["coach_entry_id"], name: "index_drill_ratings_on_coach_entry_id"
    t.index ["drill_id", "session_date"], name: "index_drill_ratings_on_drill_id_and_session_date"
    t.index ["drill_id"], name: "index_drill_ratings_on_drill_id"
    t.index ["program_year_id"], name: "index_drill_ratings_on_program_year_id"
    t.check_constraint "rating::text = ANY (ARRAY['not_yet'::character varying, 'getting'::character varying, 'owns'::character varying]::text[])", name: "drill_ratings_rating_check"
  end

  create_table "drills", force: :cascade do |t|
    t.string "slug", null: false
    t.string "name", null: false
    t.string "area_name", null: false
    t.string "aliases", default: [], null: false, array: true
    t.text "short", null: false
    t.text "how", default: [], null: false, array: true
    t.text "watch"
    t.text "cue"
    t.string "video"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_drills_on_slug", unique: true
  end

  create_table "month_plans", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.bigint "block_id", null: false
    t.string "month", null: false
    t.string "label", null: false
    t.string "range_display", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["block_id"], name: "index_month_plans_on_block_id"
    t.index ["program_year_id", "month"], name: "index_month_plans_on_program_year_id_and_month", unique: true
    t.index ["program_year_id"], name: "index_month_plans_on_program_year_id"
  end

  create_table "patches", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.bigint "block_id", null: false
    t.bigint "area_id", null: false
    t.string "name", null: false
    t.text "requirement", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["area_id"], name: "index_patches_on_area_id"
    t.index ["block_id", "area_id"], name: "index_patches_on_block_id_and_area_id", unique: true
    t.index ["block_id"], name: "index_patches_on_block_id"
    t.index ["program_year_id"], name: "index_patches_on_program_year_id"
  end

  create_table "program_years", force: :cascade do |t|
    t.bigint "athlete_id", null: false
    t.string "label", null: false
    t.date "starts_on", null: false
    t.date "ends_on", null: false
    t.string "status", default: "draft", null: false
    t.string "ball_now", null: false
    t.text "rank_rule"
    t.text "north_star"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["athlete_id", "label"], name: "index_program_years_on_athlete_id_and_label", unique: true
    t.index ["athlete_id"], name: "index_program_years_on_athlete_id"
  end

  create_table "test_dates", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.string "window", null: false
    t.string "label", null: false
    t.string "display", null: false
    t.integer "position", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["program_year_id", "window"], name: "index_test_dates_on_program_year_id_and_window", unique: true
    t.index ["program_year_id"], name: "index_test_dates_on_program_year_id"
  end

  create_table "test_results", force: :cascade do |t|
    t.bigint "program_year_id", null: false
    t.bigint "athlete_id", null: false
    t.bigint "test_date_id", null: false
    t.bigint "battery_measure_id", null: false
    t.bigint "recorded_by_user_id", null: false
    t.string "raw_value", null: false
    t.decimal "numeric_value", precision: 10, scale: 3
    t.datetime "recorded_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["athlete_id"], name: "index_test_results_on_athlete_id"
    t.index ["battery_measure_id"], name: "index_test_results_on_battery_measure_id"
    t.index ["program_year_id", "test_date_id", "battery_measure_id"], name: "index_test_results_on_year_window_and_measure", unique: true
    t.index ["program_year_id"], name: "index_test_results_on_program_year_id"
    t.index ["recorded_by_user_id"], name: "index_test_results_on_recorded_by_user_id"
    t.index ["test_date_id"], name: "index_test_results_on_test_date_id"
  end

  create_table "users", force: :cascade do |t|
    t.citext "email", null: false
    t.string "password_digest", null: false
    t.string "name", null: false
    t.string "role", default: "viewer", null: false
    t.datetime "last_seen_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.check_constraint "role::text = ANY (ARRAY['coach'::character varying::text, 'athlete'::character varying::text, 'viewer'::character varying::text])", name: "users_role_check"
  end

  create_table "weeks", force: :cascade do |t|
    t.bigint "month_plan_id", null: false
    t.bigint "block_id", null: false
    t.integer "number", null: false
    t.integer "position_in_block", null: false
    t.string "theme", null: false
    t.string "dates_display", null: false
    t.text "targets", default: [], null: false, array: true
    t.text "challenge", null: false
    t.boolean "trials", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["block_id"], name: "index_weeks_on_block_id"
    t.index ["month_plan_id", "number"], name: "index_weeks_on_month_plan_id_and_number", unique: true
    t.index ["month_plan_id"], name: "index_weeks_on_month_plan_id"
  end

  add_foreign_key "area_cells", "areas"
  add_foreign_key "area_cells", "blocks"
  add_foreign_key "areas", "program_years"
  add_foreign_key "athlete_entries", "athletes"
  add_foreign_key "athlete_entries", "day_cards"
  add_foreign_key "athlete_entries", "program_years"
  add_foreign_key "athlete_entries", "users"
  add_foreign_key "athletes", "users"
  add_foreign_key "ball_gates", "program_years"
  add_foreign_key "battery_measures", "battery_tests"
  add_foreign_key "battery_measures", "program_years"
  add_foreign_key "battery_tests", "program_years"
  add_foreign_key "blocks", "program_years"
  add_foreign_key "coach_entries", "athletes"
  add_foreign_key "coach_entries", "day_cards"
  add_foreign_key "coach_entries", "program_years"
  add_foreign_key "coach_entries", "users"
  add_foreign_key "day_blocks", "day_cards"
  add_foreign_key "day_cards", "day_roles"
  add_foreign_key "day_cards", "weeks"
  add_foreign_key "day_roles", "program_years"
  add_foreign_key "drill_ratings", "coach_entries"
  add_foreign_key "drill_ratings", "drills"
  add_foreign_key "drill_ratings", "program_years"
  add_foreign_key "month_plans", "blocks"
  add_foreign_key "month_plans", "program_years"
  add_foreign_key "patches", "areas"
  add_foreign_key "patches", "blocks"
  add_foreign_key "patches", "program_years"
  add_foreign_key "program_years", "athletes"
  add_foreign_key "test_dates", "program_years"
  add_foreign_key "test_results", "athletes"
  add_foreign_key "test_results", "battery_measures"
  add_foreign_key "test_results", "program_years"
  add_foreign_key "test_results", "test_dates"
  add_foreign_key "test_results", "users", column: "recorded_by_user_id"
  add_foreign_key "weeks", "blocks"
  add_foreign_key "weeks", "month_plans"
end
