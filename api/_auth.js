// Shared auth for the whole site.
//
// One passphrase gates everything: the page itself, not just the diary. The page
// is served by a function rather than as a static file precisely so that an
// unauthenticated visitor never receives the HTML at all. Vercel gives the
// filesystem precedence over rewrites, so site/index.html must stay out of the
// deployed output directory or it would be served straight past this check.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'teddy_pe_session';
export const MAX_AGE = 90 * 24 * 60 * 60;      // seconds; long, this is a family site

const secret = () => process.env.DIARY_PASSPHRASE || '';

export const configured = () => Boolean(secret());

const sign = exp => createHmac('sha256', secret()).update(String(exp)).digest('base64url');

function equal(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A signed, expiring token. The passphrase itself is never put in the cookie. */
export function issue() {
  const exp = Date.now() + MAX_AGE * 1000;
  return `${exp}.${sign(exp)}`;
}

export function validToken(token) {
  if (!configured() || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  return equal(token.slice(dot + 1), sign(exp));
}

export function cookie(token, maxAge) {
  const bits = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.VERCEL) bits.push('Secure');
  return bits.join('; ');
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export const passphraseOk = given => configured() && equal(given, secret());

/** A browser session cookie, or the passphrase header that tools/diary_pull.py uses. */
export function authorized(req) {
  return validToken(readCookie(req)) || passphraseOk(req.headers?.['x-diary-key']);
}
