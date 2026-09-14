// What a form says about itself, in one line, read off real state rather
// than an optimistic flag somebody set when a button was pressed.
//
// One line per form and not one per field. A form that marked each field
// would be a wall of "saved" on a phone, and the question he actually has
// mid-session is whether the entry is safe, never which of nine fields is.
const WAITING_TEXT =
  "Waiting to send. It is saved on this phone and will go out once you have a connection.";

export function SaveStatus({
  saving,
  queued,
  savedAt,
  waitingText = WAITING_TEXT,
}: {
  saving: boolean;
  queued: boolean;
  // An entry's `updated_at`, or null when the server holds no entry for
  // this date yet.
  savedAt: string | null;
  // What to say while a write is waiting on the outbox. Optional because
  // most forms are fine with the default, adult phrasing above; Teddy's
  // form passes its own sentence, already written in his language, rather
  // than have this default speak to a 7-year-old as if he were his dad.
  waitingText?: string;
}) {
  // Saving wins over queued: both are true for the moment between a write
  // leaving the form and the outbox taking it, and "Saving." is the truer
  // of the two there.
  if (saving) return <p role="status">Saving.</p>;
  // A queued write has not reached the server, so whatever `savedAt` says
  // was last stored is older than what he is looking at. Say the honest
  // thing rather than the reassuring one.
  if (queued) return <p role="status">{waitingText}</p>;
  if (!savedAt) return null;

  const at = new Date(savedAt);
  // An unparseable timestamp says nothing rather than "Saved Invalid Date".
  if (Number.isNaN(at.getTime())) return null;

  return (
    <p role="status">
      Saved {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </p>
  );
}
