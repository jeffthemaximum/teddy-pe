// Tests for the parts of the diary API that do not need a database.
// Run: node tools/test_diary_api.mjs
import assert from 'node:assert/strict';
import { clean, authorized } from '../api/diary.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

const good = {
  id: 'e-20260916-abc123', session_date: '2026-09-16', dow: 'Wed', plan_month: '2026-09',
  week: 1, overall: 4, energy: 3, flag_pain: false, note: 'Good session.',
  ratings: { 'tick-tocks': 'owns', 'sole-rolls': 'getting' }, challenge_num: '7', device: 'iPhone',
};

console.log('clean()');
test('accepts a well formed entry', () => {
  const { errors, entry } = clean(good);
  assert.deepEqual(errors, []);
  assert.equal(entry.overall, 4);
  assert.deepEqual(entry.ratings, { 'tick-tocks': 'owns', 'sole-rolls': 'getting' });
});
test('rejects a bad id', () => {
  assert.ok(clean({ ...good, id: 'no spaces!' }).errors.some(e => /id must be/.test(e)));
});
test('rejects a short id', () => {
  assert.ok(clean({ ...good, id: 'abc' }).errors.length > 0);
});
test('rejects a bad date', () => {
  assert.ok(clean({ ...good, session_date: '16/09/2026' }).errors.some(e => /YYYY-MM-DD/.test(e)));
});
test('rejects an out of range scale', () => {
  assert.ok(clean({ ...good, overall: 9 }).errors.some(e => /overall must be 1 to 5/.test(e)));
});
test('rejects a non integer scale', () => {
  assert.ok(clean({ ...good, energy: 2.5 }).errors.length > 0);
});
test('allows empty scales', () => {
  const { errors, entry } = clean({ ...good, overall: '', energy: null });
  assert.deepEqual(errors, []);
  assert.equal(entry.overall, null);
  assert.equal(entry.energy, null);
});
test('rejects an unknown rating value', () => {
  assert.ok(clean({ ...good, ratings: { 'tick-tocks': 'brilliant' } }).errors.some(e => /bad rating/.test(e)));
});
test('rejects a malformed drill id', () => {
  assert.ok(clean({ ...good, ratings: { 'Tick Tocks': 'owns' } }).errors.some(e => /bad drill id/.test(e)));
});
test('drops bad ratings but keeps good ones', () => {
  const { entry } = clean({ ...good, ratings: { 'tick-tocks': 'owns', 'x': 'nope' } });
  assert.deepEqual(entry.ratings, { 'tick-tocks': 'owns' });
});
test('truncates an overlong note', () => {
  assert.equal(clean({ ...good, note: 'x'.repeat(5000) }).entry.note.length, 2000);
});
test('coerces flag_pain to a real boolean', () => {
  assert.equal(clean({ ...good, flag_pain: 'yes' }).entry.flag_pain, false);
  assert.equal(clean({ ...good, flag_pain: true }).entry.flag_pain, true);
});
test('nulls a bad plan_month rather than failing', () => {
  assert.equal(clean({ ...good, plan_month: 'Sept' }).entry.plan_month, null);
});
test('ignores prototype pollution attempts in ratings', () => {
  const { entry } = clean({ ...good, ratings: { __proto__: 'owns', 'tick-tocks': 'owns' } });
  assert.deepEqual(Object.keys(entry.ratings), ['tick-tocks']);
  assert.equal({}.owns, undefined);
});

console.log('authorized()');
const req = key => ({ headers: key === undefined ? {} : { 'x-diary-key': key } });
test('rejects when no secret is configured', () => {
  delete process.env.DIARY_PASSPHRASE;
  assert.equal(authorized(req('anything')), false);
});
test('accepts the right passphrase', () => {
  process.env.DIARY_PASSPHRASE = 'correct horse battery';
  assert.equal(authorized(req('correct horse battery')), true);
});
test('rejects the wrong passphrase', () => {
  assert.equal(authorized(req('wrong')), false);
});
test('rejects a missing header without throwing', () => {
  assert.equal(authorized(req()), false);
});
test('rejects a longer passphrase without throwing', () => {
  assert.equal(authorized(req('correct horse battery staple')), false);
});

console.log('\nhandler() paths that need no database');
const { default: handler } = await import('../api/diary.js');
const mockRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
{
  delete process.env.DATABASE_URL;
  process.env.DIARY_PASSPHRASE = 'pw';
  const res = mockRes();
  await handler({ method: 'GET', headers: { 'x-diary-key': 'pw' } }, res);
  test('503 when DATABASE_URL is missing', () => assert.equal(res.code, 503));
}
{
  process.env.DATABASE_URL = 'postgres://user:pw@example.neon.tech/db';
  process.env.DIARY_PASSPHRASE = 'pw';
  const res = mockRes();
  await handler({ method: 'GET', headers: { 'x-diary-key': 'nope' } }, res);
  test('401 on a wrong passphrase', () => assert.equal(res.code, 401));
}
{
  const res = mockRes();
  await handler({ method: 'DELETE', headers: { 'x-diary-key': 'pw' } }, res);
  test('405 on an unsupported method', () => assert.equal(res.code, 405));
}
{
  const res = mockRes();
  await handler({ method: 'POST', headers: { 'x-diary-key': 'pw' }, body: { id: 'bad' } }, res);
  test('400 on an invalid entry, before any database call', () => assert.equal(res.code, 400));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
