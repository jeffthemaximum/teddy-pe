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

export interface Progression {
  years: { id: number; label: string; starts_on: string; ends_on: string; status: string }[];
  // Production has no awards or results yet. Nobody here invents a shape
  // nobody has seen; these stay unknown[] until the API sends real ones.
  ranks: unknown[];
  battery: unknown[];
  height: { series: { window: string; value: number }[]; cm_per_year: number | null };
  drills: unknown[];
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
