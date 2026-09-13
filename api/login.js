// Exchanges the passphrase for a signed session cookie.
import { configured, passphraseOk, issue, cookie, COOKIE, MAX_AGE } from './_auth.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'GET' && req.query?.logout !== undefined) {
    res.setHeader('set-cookie', cookie('', 0));
    res.setHeader('location', '/');
    return res.status(303).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (!configured()) {
    return res.status(503).json({ error: 'DIARY_PASSPHRASE is not set in Vercel.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    body = Object.fromEntries(new URLSearchParams(body));
  }
  if (!passphraseOk(body?.passphrase)) {
    await sleep(500);                      // a little friction against guessing
    res.setHeader('location', '/?bad=1');
    return res.status(303).end();
  }

  res.setHeader('set-cookie', cookie(issue(), MAX_AGE));
  res.setHeader('location', '/');
  return res.status(303).end();
}

export { COOKIE };
