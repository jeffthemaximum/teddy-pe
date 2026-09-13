// Coach's diary API.
//
// The site is static and stays that way; this single function exists so Jeff can
// write an entry on his phone at the field and have it turn up everywhere else.
// Entries are the raw material for plan adjustments, so they are pulled into the
// repo by tools/diary_pull.py and the repo stays the source of truth.
//
// Env: DATABASE_URL (Neon), DIARY_PASSPHRASE (shared secret, read and write).
import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

const RATINGS = new Set(['not_yet', 'getting', 'owns']);
const MAX_NOTE = 2000;

let schemaReady = null;
function ready(sql) {
  // Runs once per cold start, so there is no separate migration step to forget.
  schemaReady ||= sql.query(`
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
  return schemaReady;
}

export function authorized(req) {
  const secret = process.env.DIARY_PASSPHRASE || '';
  const given = req.headers['x-diary-key'] || '';
  if (!secret) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(secret);
  // timingSafeEqual throws on a length mismatch, so check that first.
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v, max) =>
  v === null || v === undefined || v === '' ? null : String(v).slice(0, max);

export function clean(body) {
  const errors = [];
  const id = String(body.id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) errors.push('id must be 8 to 64 url-safe characters');
  const date = String(body.session_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('session_date must be YYYY-MM-DD');

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
      id,
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

  if (!process.env.DATABASE_URL || !process.env.DIARY_PASSPHRASE) {
    return res.status(503).json({ error: 'Diary is not configured yet. Set DATABASE_URL and DIARY_PASSPHRASE in Vercel.' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: 'Wrong passphrase.' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      await ready(sql);
      const since = String(req.query?.since || '');
      const rows = /^\d{4}-\d{2}-\d{2}$/.test(since)
        ? await sql.query('select * from diary_entry where session_date >= $1 order by session_date, created_at', [since])
        : await sql.query('select * from diary_entry order by session_date, created_at');
      return res.status(200).json({ count: rows.length, entries: rows });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { errors, entry } = clean(body);
      // Validate before touching the database: a malformed entry is the client's
      // bug, and it should not cost a round trip or look like an outage.
      if (errors.length) return res.status(400).json({ error: errors.join('; ') });
      await ready(sql);

      // Re-sending a queued entry must not create a second row, so the client's
      // id is the primary key and a repeat write simply updates it.
      const rows = await sql.query(
        `insert into diary_entry
           (id, session_date, dow, plan_month, week, overall, energy, flag_pain, pain_note, note, ratings, challenge_num, device)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
         on conflict (id) do update set
           session_date=excluded.session_date, dow=excluded.dow, plan_month=excluded.plan_month,
           week=excluded.week, overall=excluded.overall, energy=excluded.energy,
           flag_pain=excluded.flag_pain, pain_note=excluded.pain_note, note=excluded.note,
           ratings=excluded.ratings, challenge_num=excluded.challenge_num, device=excluded.device
         returning id, created_at`,
        [entry.id, entry.session_date, entry.dow, entry.plan_month, entry.week, entry.overall,
         entry.energy, entry.flag_pain, entry.pain_note, entry.note, JSON.stringify(entry.ratings),
         entry.challenge_num, entry.device]
      );
      return res.status(200).json({ saved: rows[0].id, created_at: rows[0].created_at });
    }

    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  } catch (err) {
    console.error('diary error', err);
    return res.status(500).json({ error: 'Database error. The entry is still saved on your device.' });
  }
}
