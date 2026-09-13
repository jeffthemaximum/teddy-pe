// Test battery results.
//
// Same shape of thinking as the diary: the database is the record, the row id is
// derived on the server from the test window and the test id, so every device
// reads and writes the same numbers. These are the year's comparison points and
// most of them cannot be measured again, so they do not live in a browser.
import { neon } from '@neondatabase/serverless';
import { authorized, configured } from './_auth.js';

const WINDOW = /^\d{4}-\d{2}$/;
const TEST_ID = /^[a-z0-9]{1,8}$/;

export const resultId = (win, testId) => `${win}:${testId}`;

let schemaReady = null;
function ready(sql) {
  schemaReady ||= sql.query(`
    create table if not exists test_result (
      id          text primary key,
      test_window text        not null,
      test_id     text        not null,
      value       text        not null,
      recorded_at timestamptz not null default now(),
      device      text
    )`);
  return schemaReady;
}

export function clean(body) {
  const errors = [];
  const win = String(body.window || '');
  const testId = String(body.test_id || '');
  if (!WINDOW.test(win)) errors.push('window must be YYYY-MM');
  if (!TEST_ID.test(testId)) errors.push('test_id must be a short id like t1 or t3r');

  // Kept as text: some rows are typed as ranges or with a unit, and a number
  // that will not parse is still worth storing rather than silently dropping.
  const value = body.value === null || body.value === undefined ? '' : String(body.value).trim().slice(0, 40);
  if (value && !/\d/.test(value)) errors.push('a result needs at least one digit');

  return { errors, entry: { id: resultId(win, testId), test_window: win, test_id: testId, value,
                            device: body.device ? String(body.device).slice(0, 60) : null } };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (!process.env.DATABASE_URL || !configured()) {
    return res.status(503).json({ error: 'Results are not configured yet. Set DATABASE_URL and DIARY_PASSPHRASE in Vercel.' });
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Not signed in.' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      await ready(sql);
      const rows = await sql.query('select * from test_result order by test_window, test_id');
      return res.status(200).json({ count: rows.length, results: rows });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { errors, entry } = clean(body);
      // Validate before touching the database, so a mistyped number reads as a
      // mistyped number rather than as an outage.
      if (errors.length) return res.status(400).json({ error: errors.join('; ') });
      await ready(sql);

      // Clearing a field deletes the row rather than storing an empty string,
      // so a mistyped number can be taken back.
      if (!entry.value) {
        await sql.query('delete from test_result where id = $1', [entry.id]);
        return res.status(200).json({ deleted: entry.id });
      }

      const rows = await sql.query(
        `insert into test_result (id, test_window, test_id, value, device)
         values ($1,$2,$3,$4,$5)
         on conflict (id) do update set
           value=excluded.value, device=excluded.device, recorded_at=now()
         returning *`,
        [entry.id, entry.test_window, entry.test_id, entry.value, entry.device]
      );
      return res.status(200).json({ result: rows[0] });
    }

    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  } catch (err) {
    console.error('results error', err);
    return res.status(500).json({ error: 'The database did not answer. Nothing was saved.' });
  }
}
