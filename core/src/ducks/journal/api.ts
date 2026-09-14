import { apiRequest } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { AthleteEntry, CoachEntry } from "../../types";
import type { JournalSide } from "./actions";

// Everything this duck knows about the shape of a journal response lives
// here, once. Both controllers wrap what they send:
//
//   render json: { athlete_entry: serialize(entry) }   # create, update, show
//   render json: { athlete_entries: [...] }            # index
//
// and the same two lines exist in CoachEntriesController with `coach_`
// names. `apiRequest` returns the parsed body verbatim and unwraps nothing,
// which is right: that is each duck's own job. The journal duck used to skip
// the job entirely, store the wrapper as though it were the entry, and file
// it under the key "undefined". One unwrap, named here and called from every
// path that receives an entry, is what stops that happening a second time.

const ENTRY_KEY: Record<JournalSide, string> = {
  athlete: "athlete_entry",
  coach: "coach_entry",
};

const LIST_KEY: Record<JournalSide, string> = {
  athlete: "athlete_entries",
  coach: "coach_entries",
};

// `session_date` is what makes something an entry at all: without it the
// reducer keys it under the literal string "undefined" and it sits there
// forever, matching no real date. `note` is required too, though it may
// legitimately be `null` (CoachEntry#note and AthleteEntry#note both are),
// because `{session_date: "2026-09-17"}` on its own is a plausible-looking
// stub rather than a row, and folding it in would overwrite a real entry
// with nothing. `updated_at` is required because the fold rule in reducer.ts
// compares it: an entry with no timestamp cannot be ordered against the copy
// already on record.
function isEntry(value: unknown): value is { session_date: string; note: string | null; updated_at: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { session_date?: unknown; note?: unknown; updated_at?: unknown };
  if (typeof v.session_date !== "string") return false;
  if (typeof v.updated_at !== "string") return false;
  return v.note === null || typeof v.note === "string";
}

function read(body: unknown, key: string): unknown {
  if (typeof body !== "object" || body === null) return undefined;
  return (body as Record<string, unknown>)[key];
}

// One entry, already out of its envelope: the week payload carries its
// entries inline on each day card rather than wrapped. Same guard, so
// however an entry arrives it is checked once, here.
export function asEntry(side: "athlete", value: unknown): AthleteEntry | null;
export function asEntry(side: "coach", value: unknown): CoachEntry | null;
export function asEntry(side: JournalSide, value: unknown): AthleteEntry | CoachEntry | null;
export function asEntry(_side: JournalSide, value: unknown): AthleteEntry | CoachEntry | null {
  return isEntry(value) ? (value as AthleteEntry | CoachEntry) : null;
}

// One entry out of one envelope, or null if what came back is not an entry.
// Null is a real answer here rather than a thrown error: the caller decides
// what a response it cannot read means, and a save and a replay mean
// different things by it.
export function unwrapEntry(side: "athlete", body: unknown): AthleteEntry | null;
export function unwrapEntry(side: "coach", body: unknown): CoachEntry | null;
export function unwrapEntry(side: JournalSide, body: unknown): AthleteEntry | CoachEntry | null {
  return asEntry(side, read(body, ENTRY_KEY[side]));
}

// The list form of the same thing. A row that is not an entry is dropped
// rather than allowed into state, the same rule the single unwrap applies,
// so one bad row in a long list costs that row and not the screen.
function unwrapList(side: JournalSide, body: unknown): unknown[] {
  const list = read(body, LIST_KEY[side]);
  if (!Array.isArray(list)) return [];
  return list.filter(isEntry);
}

// GET /api/v1/athlete_entries. No query parameters: the controller is
// `policy_scope(AthleteEntry).order(:session_date)` and nothing else, so the
// Pundit scope alone decides what comes back. Teddy gets his own entries,
// Jeff gets only the ones Teddy shared, a viewer gets none.
export async function fetchAthleteEntries(
  config: CoreConfig,
  token: string | null,
): Promise<AthleteEntry[]> {
  const body = await apiRequest<unknown>(config, { path: "/api/v1/athlete_entries", token });
  return unwrapList("athlete", body) as AthleteEntry[];
}

// GET /api/v1/coach_entries, with the optional window the controller
// supports: `entries.between(params[:from], params[:to]) if params[:from]
// && params[:to]`. Both dates or neither, never one.
export async function fetchCoachEntries(
  config: CoreConfig,
  token: string | null,
  range?: { from: string; to: string } | null,
): Promise<CoachEntry[]> {
  const query = range
    ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    : "";
  const body = await apiRequest<unknown>(config, {
    path: `/api/v1/coach_entries${query}`,
    token,
  });
  return unwrapList("coach", body) as CoachEntry[];
}
