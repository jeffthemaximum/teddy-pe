// Coach's diary API.
//
// One entry per session date, shared by every device. The id is derived from the
// date on the server, never sent by the client, so opening the site on a phone
// and on a laptop lands on the same row and edits it rather than making a second
// one. There is no local copy anywhere: the database is the record.
//
// Env: DATABASE_URL (Neon), DIARY_PASSPHRASE (gates the whole site).
import { neon } from '@neondatabase/serverless';
import { authorized, configured } from './_auth.js';

const RATINGS = new Set(['not_yet', 'getting', 'owns']);
const MAX_NOTE = 2000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const entryId = sessionDate => `e-${sessionDate}`;

let schemaReady = null;
async function ready(sql) {
  // Runs once per cold start, so there is no separate migration step to forget.
  schemaReady ||= (async () => {
    await sql.query(`
      create table if not exists diary_entry (
        id            text primary key,
        created_at    timestamptz not null default now(),
        session_date  date        not null,
        dow           text,
        plan_month    text,
        week          integer,
        overall       smallint,
        energy        smallint,
        flag_pain     boolean     not null default false,
        pain_note     text,
        note          text,
        ratings       jsonb       not null default '{}'::jsonb,
        challenge_num text,
        device        text
      )`);
    // Entries used to be keyed per device, which is what stopped a phone seeing
    // what a laptop wrote. Collapse any such rows onto one per date, newest wins.
    await sql.query(`
      delete from diary_entry a using diary_entry b
       where a.session_date = b.session_date
         and (a.created_at < b.created_at
              or (a.created_at = b.created_at and a.id < b.id))`);
    await sql.query(`
      update diary_entry set id = 'e-' || to_char(session_date, 'YYYY-MM-DD')
       where id <> 'e-' || to_char(session_date, 'YYYY-MM-DD')`);
  })();
  return schemaReady;
}

const str = (v, max) =>
  v === null || v === undefined || v === '' ? null : String(v).slice(0, max);

export function clean(body) {
  const errors = [];
  const date = String(body.session_date || '');
  if (!DATE.test(date)) errors.push('session_date must be YYYY-MM-DD');

  const scale = (v, name) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) { errors.push(`${name} must be 1 to 5`); return null; }
    return n;
  };

  const ratings = {};
  const raw = body.ratings && typeof body.ratings === 'object' ? body.ratings : {};
  for (const [slug, value] of Object.entries(raw)) {
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) { errors.push(`bad drill id: ${slug}`); continue; }
    if (!RATINGS.has(value)) { errors.push(`bad rating for ${slug}: ${value}`); continue; }
    ratings[slug] = value;
  }

  return {
    errors,
    entry: {
      id: entryId(date),                    // derived, so every device agrees
      session_date: date,
      dow: str(body.dow, 3),
      plan_month: /^\d{4}-\d{2}$/.test(String(body.plan_month || '')) ? body.plan_month : null,
      week: Number.isInteger(Number(body.week)) ? Number(body.week) : null,
      overall: scale(body.overall, 'overall'),
      energy: scale(body.energy, 'energy'),
      flag_pain: body.flag_pain === true,
      pain_note: str(body.pain_note, MAX_NOTE),
      note: str(body.note, MAX_NOTE),
      ratings,
      challenge_num: str(body.challenge_num, 40),
      device: str(body.device, 60),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (!process.env.DATABASE_URL || !configured()) {
    return res.status(503).json({ error: 'Diary is not configured yet. Set DATABASE_URL and DIARY_PASSPHRASE in Vercel.' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      await ready(sql);
      const since = String(req.query?.since || '');
      const one = String(req.query?.date || '');
      if (DATE.test(one)) {
        const rows = await sql.query('select * from diary_entry where session_date = $1', [one]);
        return res.status(200).json({ count: rows.length, entries: rows });
      }
      const rows = DATE.test(since)
        ? await sql.query('select * from diary_entry where session_date >= $1 order by session_date', [since])
        : await sql.query('select * from diary_entry order by session_date');
      return res.status(200).json({ count: rows.length, entries: rows });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { errors, entry } = clean(body);
      // Validate before touching the database: a malformed entry is the client's
      // bug, and it should not cost a round trip or look like an outage.
      if (errors.length) return res.status(400).json({ error: errors.join('; ') });
      await ready(sql);

      const rows = await sql.query(
        `insert into diary_entry
           (id, session_date, dow, plan_month, week, overall, energy, flag_pain, pain_note, note, ratings, challenge_num, device)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
         on conflict (id) do update set
           session_date=excluded.session_date, dow=excluded.dow, plan_month=excluded.plan_month,
           week=excluded.week, overall=excluded.overall, energy=excluded.energy,
           flag_pain=excluded.flag_pain, pain_note=excluded.pain_note, note=excluded.note,
           ratings=excluded.ratings, challenge_num=excluded.challenge_num, device=excluded.device
         returning *`,
        [entry.id, entry.session_date, entry.dow, entry.plan_month, entry.week, entry.overall,
         entry.energy, entry.flag_pain, entry.pain_note, entry.note, JSON.stringify(entry.ratings),
         entry.challenge_num, entry.device]
      );
      return res.status(200).json({ entry: rows[0] });
    }

    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  } catch (err) {
    console.error('diary error', err);
    return res.status(500).json({ error: 'The diary database did not answer. Nothing was saved.' });
  }
}
