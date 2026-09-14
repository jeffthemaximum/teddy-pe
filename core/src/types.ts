// Shared request/response shapes for the API client. Kept apart from
// apiClient.ts so a duck can describe the request it wants to make without
// importing the client's implementation.

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequest {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  // Absent or null means "no token": no Authorization header goes out.
  token?: string | null;
}

// The API's error envelope, exactly as the deployed server sends it:
// {"error":{"code":"...","message":"..."}}
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

// Auth duck shapes. Shared here rather than in ducks/auth so a later duck can
// describe a User without importing the auth duck's implementation.

export type Role = "coach" | "athlete" | "viewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  jwt: string;
  user: User;
}

// GET /api/v1/me. Read from backend/app/controllers/api/v1/me_controller.rb,
// not guessed from the one payload captured in production: `athlete` is
// null whenever `athlete_for(current_user)` finds none, and
// `current_program_year_id` is null whenever `ProgramYear.current_for`
// finds no current year for that athlete, so both are nullable here even
// though Teddy's own account has never sent either null.
export interface Athlete {
  id: number;
  name: string;
  birthday: string;
}

export interface MeResponse {
  user: User;
  athlete: Athlete | null;
  current_program_year_id: number | null;
}

// Program-year, month, week, drill glossary and progression shapes. Captured
// from the live API on 2026-09-13; these are facts about what the server
// sends, not a proposal to redesign.

export interface ProgramYearSummary {
  id: number;
  label: string;
  starts_on: string;
  ends_on: string;
  status: string;
  is_current: boolean;
}

export interface Token {
  text: string;
  type: string;
  style: string;
  slug?: string;
}

export interface DayBlock {
  id: number;
  position: number;
  minutes: string;
  name: string;
  tag: string | null;
  name_tokens: Token[];
  body_tokens: Token[];
  drill_slugs: string[];
}

// Journal entry shapes belong to the journal duck (Task 6), which is the
// place that owns saveCoachEntry/saveAthleteEntry and the sharing rule. They
// are declared here, ahead of that duck, only because DayCard's week payload
// carries them inline and needs somewhere to point. Fields taken from
// backend/db/schema.rb (coach_entries, athlete_entries, drill_ratings) and
// backend/app/serializers/{coach,athlete}_entry_serializer.rb, not from the
// live payload: production has no entries yet, so the API only ever returns
// null for both.

// drill_ratings.rating is a database enum, checked in Postgres itself
// (drill_ratings_rating_check), not a number. A form that wrote 1, 2, 3 into
// this column would pass its own validation and fail at the server with a
// constraint violation nobody could read as "pick one of three words."
export type DrillRatingValue = "not_yet" | "getting" | "owns";

export interface CoachEntry {
  id: number;
  session_date: string;
  program_year_id: number;
  day_card_id: number | null;
  // 1 to 5, both nullable: the coach can save a note before scoring.
  overall: number | null;
  energy: number | null;
  flag_pain: boolean;
  pain_note: string | null;
  note: string | null;
  challenge_num: string | null;
  // Keyed by drill slug, per CoachEntrySerializer#ratings.
  ratings: Record<string, DrillRatingValue>;
  updated_at: string;
}

export interface AthleteEntry {
  id: number;
  session_date: string;
  program_year_id: number;
  day_card_id: number | null;
  // 1 to 5, nullable: Teddy's own reflection, written in his language.
  felt: number | null;
  best: string | null;
  hard: string | null;
  note: string | null;
  // Teddy's choice, and the only thing that decides whether Dad sees it.
  shared: boolean;
  updated_at: string;
}

export interface DayCard {
  id: number;
  dow: string;
  date: string;
  name: string;
  role: string;
  minutes: string;
  intensity: number;
  hie: number;
  summary_lines: string[];
  drill_slugs: string[];
  // Present only in the week payload, absent from the month payload.
  dad_note?: string;
  blocks?: DayBlock[];
  coach_entry?: CoachEntry | null;
  athlete_entry?: AthleteEntry | null;
}

export interface Week {
  id: number;
  number: number;
  position_in_block: number;
  theme: string;
  dates_display: string;
  targets: string[];
  challenge: string;
  trials: boolean;
  block_key: string;
  high_intent_efforts: number;
  budget: number;
  days: DayCard[];
}

export interface MonthPlan {
  month: string;
  label: string;
  range_display: string;
  block_key: string;
  weeks: Week[];
}

export interface Drill {
  slug: string;
  name: string;
  area_name: string;
  aliases: string[];
  short: string;
  how: string[];
  watch: string;
  cue: string;
  video: string | null;
}

// ranks, battery and drills were unknown[] because production had no awards
// or results yet and nobody was going to invent a shape nobody had seen.
// Typed here instead from backend/app/services/progression_payload.rb itself
// (the models and serialisers it touches: RankAward, TestResult,
// BatteryMeasure, DrillRating, Drill), then proven against a real payload
// captured from a locally seeded database — see
// .superpowers/sdd/2026-09-14-phase-2c-writing-screens/progression-payload.json
// and progression-shape-report.md for how.
//
// Three things a chart needs to know, established from the producer:
//
// - Every entry in `battery` carries `direction`: "lower" or "higher", never
//   "growth" (growth is height, filtered out of `battery` and reported
//   separately below with no direction of its own, since a pace is never
//   read as worse). BatteryMeasure#direction is a NOT-NULL enum column, so
//   this is guaranteed, not just observed.
// - Every numeric value the payload sends — `first`, `latest`, `change` (a
//   verdict word, not a number) and every `series[].value`, including
//   height's — is a string or null, from `numeric_value&.to_s`, the same
//   deliberate choice test_results_controller.rb makes. None of these are
//   numbers on the wire; a chart parses them.
// - A battery_measure with zero TestResults is not a card with an empty
//   series: `battery` groups only over rows that exist, so that measure's
//   whole entry is absent from the array. A chart cannot assume one card
//   per defined measure. `height` is the one exception with a fixed shape:
//   it is always present, `{ series: [], cm_per_year: null }` when nothing
//   is recorded yet, because it is a single named key rather than a
//   group-by result.
export interface Progression {
  years: { id: number; label: string; starts_on: string; ends_on: string; status: string }[];
  ranks: {
    block_key: string;
    block_name: string;
    awarded_on: string;
    patch_count: number;
    year_label: string;
  }[];
  battery: {
    test_id: string;
    label: string;
    unit: string;
    direction: "lower" | "higher";
    first: string | null;
    latest: string | null;
    change: "better" | "worse" | "same" | null;
    series: { window: string; value: string | null; recorded_at: string; year_label: string }[];
  }[];
  height: {
    series: { window: string; value: string | null; recorded_at: string; year_label: string }[];
    cm_per_year: number | null;
  };
  // Mastery comes out of the coach's journal, so a viewer's request gets []
  // regardless of what is actually recorded (ProgressionPayload#drills).
  drills: {
    slug: string;
    name: string;
    latest: DrillRatingValue;
    history: { session_date: string; rating: DrillRatingValue; year_label: string }[];
  }[];
}

// Test-battery shapes belong to the testResults duck (Task 8), declared here
// ahead of it the same way journal's entry shapes were ahead of Task 6:
// ProgramYearDetail's `test_dates` and `battery.results` point at these
// before that duck exists to claim them.

export interface TestDate {
  id: number;
  window: string;
  label: string;
  display: string;
  // The range the window covers. Optional on purpose, and not because the
  // server treats them as optional: TestDate validates both as present, so
  // a row written after 14 September 2026 always has them. The gap is the
  // deploy. Merging to `main` rebuilds the web app and does not deploy the
  // API (CLAUDE.md), so there is a real window in which this front end runs
  // against a server whose payload omits both keys entirely, which reads as
  // undefined rather than as null. selectTestDayFor treats either as a
  // window it cannot place, so Today shows no test section instead of
  // breaking.
  starts_on?: string | null;
  ends_on?: string | null;
  position: number;
}

export interface TestResult {
  id: number;
  test_id: string;
  window: string;
  raw_value: string;
  // TestResultsController#serialize sends `result.numeric_value&.to_s`: a
  // string or null, never a number. A chart that treated this as a number
  // without parsing it would do arithmetic on a string.
  numeric_value: string | null;
  // When the measurement was taken. Distinct from `updated_at`, which is
  // when this row was last written and the one the offline queue needs: a
  // replay from a phone that was offline for two days lands on the same
  // row by design, and only `updated_at` tells either end it overwrote
  // something newer.
  recorded_at: string;
  updated_at: string;
}

export interface ProgramYearDetail {
  id: number;
  label: string;
  starts_on: string;
  ends_on: string;
  status: string;
  ball_now: string;
  rank_rule: string;
  north_star: string;
  blocks: { key: string; name: string; position: number; starts_on: string; ends_on: string; focus: string; current: boolean }[];
  areas: { slug: string; position: number; name: string; summary: string; cells: { block_key: string; body: string }[] }[];
  patches: { id: number; block_key: string; area_slug: string; name: string; requirement: string }[];
  ball_gates: { position: number; from_ball: string; to_ball: string; label: string; requirement: string; status: string }[];
  battery: {
    tests: { id: number; position: number; name: string; protocol: string; area_name: string; unit: string }[];
    measures: { id: number; test_id: string; position: number; label: string; unit: string; direction: string; battery_test_id: number }[];
    results: unknown[];
    progress: { test_id: string; label: string; unit: string; direction: string; baseline: number | null; latest: number | null; change: number | null; series: { window: string; value: number }[] }[];
  };
  test_dates: { id: number; window: string; label: string; display: string; position: number }[];
  day_roles: { dow: string; position: number; name: string; organized: string[]; minutes: string; intensity: number; note: string }[];
  current_block_key: string;
  current_week_id: number;
  patch_awards: unknown[];
  rank_awards: unknown[];
}
