// Tests for the diary API and the passphrase gate, minus anything needing a database.
// Run: node tools/test_diary_api.mjs
import assert from 'node:assert/strict';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};
const mockRes = () => {
  const r = { code: 0, body: null, sent: '', headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.end = b => { r.sent = b || ''; return r; };
  return r;
};

process.env.DIARY_PASSPHRASE = 'correct horse battery';
const auth = await import('../api/_auth.js');
const { clean, entryId } = await import('../api/diary.js');

console.log('_auth: tokens');
test('a fresh token verifies', () => assert.equal(auth.validToken(auth.issue()), true));
test('a tampered signature fails', () => {
  const t = auth.issue();
  assert.equal(auth.validToken(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')), false);
});
test('an expired token fails', () => {
  assert.equal(auth.validToken(`${Date.now() - 1000}.anything`), false);
});
test('a token signed with another secret fails', () => {
  const t = auth.issue();
  process.env.DIARY_PASSPHRASE = 'a different secret';
  assert.equal(auth.validToken(t), false);
  process.env.DIARY_PASSPHRASE = 'correct horse battery';
});
test('rubbish does not throw', () => {
  ['', '.', 'x.y', null, undefined, 12, 'abc.def.ghi'].forEach(v =>
    assert.equal(auth.validToken(v), false));
});
test('the cookie never contains the passphrase', () => {
  assert.equal(auth.cookie(auth.issue(), 100).includes('correct horse battery'), false);
});
test('the cookie is HttpOnly, SameSite and scoped to the site', () => {
  const c = auth.cookie(auth.issue(), 100);
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Path=\//);
});

console.log('_auth: request authorisation');
const withCookie = v => ({ headers: { cookie: `teddy_pe_session=${v}` } });
test('a valid session cookie authorises', () => assert.equal(auth.authorized(withCookie(auth.issue())), true));
test('a forged cookie does not', () => assert.equal(auth.authorized(withCookie('123.abc')), false));
test('no cookie and no header does not', () => assert.equal(auth.authorized({ headers: {} }), false));
test('the passphrase header still works, for diary_pull.py', () =>
  assert.equal(auth.authorized({ headers: { 'x-diary-key': 'correct horse battery' } }), true));
test('a wrong header does not', () =>
  assert.equal(auth.authorized({ headers: { 'x-diary-key': 'nope' } }), false));
test('a longer wrong header does not throw', () =>
  assert.equal(auth.authorized({ headers: { 'x-diary-key': 'correct horse battery staple' } }), false));
test('other cookies alongside it are parsed correctly', () =>
  assert.equal(auth.authorized({ headers: { cookie: `a=1; teddy_pe_session=${auth.issue()}; b=2` } }), true));
test('nothing authorises when no passphrase is configured', () => {
  const keep = process.env.DIARY_PASSPHRASE;
  delete process.env.DIARY_PASSPHRASE;
  assert.equal(auth.authorized({ headers: { 'x-diary-key': '' } }), false);
  assert.equal(auth.configured(), false);
  process.env.DIARY_PASSPHRASE = keep;
});

console.log('diary: one entry per day, id derived on the server');
const good = {
  session_date: '2026-09-16', dow: 'Wed', plan_month: '2026-09', week: 1,
  overall: 4, energy: 3, flag_pain: false, note: 'Good session.',
  ratings: { 'tick-tocks': 'owns' }, challenge_num: '7', device: 'iPhone',
};
test('the id comes from the date, not the device', () => {
  assert.equal(clean(good).entry.id, 'e-2026-09-16');
  assert.equal(clean({ ...good, device: 'Mac' }).entry.id, 'e-2026-09-16');
});
test('a client-supplied id is ignored', () => {
  assert.equal(clean({ ...good, id: 'e-something-else' }).entry.id, 'e-2026-09-16');
});
test('two devices on the same day produce the same row id', () => {
  assert.equal(clean({ ...good, device: 'iPhone' }).entry.id,
               clean({ ...good, device: 'Mac' }).entry.id);
});
test('different days produce different ids', () =>
  assert.notEqual(entryId('2026-09-16'), entryId('2026-09-17')));
test('rejects a bad date', () =>
  assert.ok(clean({ ...good, session_date: '16/09/2026' }).errors.some(e => /YYYY-MM-DD/.test(e))));
test('accepts a well formed entry', () => {
  const { errors, entry } = clean(good);
  assert.deepEqual(errors, []);
  assert.equal(entry.overall, 4);
  assert.deepEqual(entry.ratings, { 'tick-tocks': 'owns' });
});
test('rejects an out of range scale', () =>
  assert.ok(clean({ ...good, overall: 9 }).errors.some(e => /overall must be 1 to 5/.test(e))));
test('allows empty scales', () => {
  const { errors, entry } = clean({ ...good, overall: '', energy: null });
  assert.deepEqual(errors, []);
  assert.equal(entry.overall, null);
});
test('rejects an unknown rating value', () =>
  assert.ok(clean({ ...good, ratings: { 'tick-tocks': 'brilliant' } }).errors.some(e => /bad rating/.test(e))));
test('drops bad ratings but keeps good ones', () =>
  assert.deepEqual(clean({ ...good, ratings: { 'tick-tocks': 'owns', 'X': 'nope' } }).entry.ratings,
                   { 'tick-tocks': 'owns' }));
test('truncates an overlong note', () =>
  assert.equal(clean({ ...good, note: 'x'.repeat(5000) }).entry.note.length, 2000));
test('coerces flag_pain to a real boolean', () =>
  assert.equal(clean({ ...good, flag_pain: 'yes' }).entry.flag_pain, false));
test('ignores prototype pollution attempts in ratings', () => {
  const { entry } = clean({ ...good, ratings: { __proto__: 'owns', 'tick-tocks': 'owns' } });
  assert.deepEqual(Object.keys(entry.ratings), ['tick-tocks']);
  assert.equal({}.owns, undefined);
});

console.log('handler paths that need no database');
const diary = (await import('../api/diary.js')).default;
const login = (await import('../api/login.js')).default;
const page = (await import('../api/page.js')).default;

{
  delete process.env.DATABASE_URL;
  const res = mockRes();
  await diary({ method: 'GET', headers: { 'x-diary-key': 'correct horse battery' } }, res);
  test('diary 503 when DATABASE_URL is missing', () => assert.equal(res.code, 503));
}
process.env.DATABASE_URL = 'postgres://u:p@example.neon.tech/db';
{
  const res = mockRes();
  await diary({ method: 'GET', headers: {} }, res);
  test('diary 401 with no credentials', () => assert.equal(res.code, 401));
}
{
  const res = mockRes();
  await diary({ method: 'DELETE', headers: { 'x-diary-key': 'correct horse battery' } }, res);
  test('diary 405 on an unsupported method', () => assert.equal(res.code, 405));
}
{
  const res = mockRes();
  await diary({ method: 'POST', headers: { 'x-diary-key': 'correct horse battery' }, body: { session_date: 'nope' } }, res);
  test('diary 400 on a bad date, before any database call', () => assert.equal(res.code, 400));
}
{
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: { passphrase: 'wrong' } }, res);
  test('login redirects back with an error on a wrong passphrase', () =>
    assert.equal(res.headers.location, '/?bad=1'));
  test('login sets no cookie on failure', () => assert.equal(res.headers['set-cookie'], undefined));
}
{
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: { passphrase: 'correct horse battery' } }, res);
  test('login sets a session cookie on success', () => assert.match(res.headers['set-cookie'], /teddy_pe_session=/));
  test('login redirects to the site on success', () => assert.equal(res.headers.location, '/'));
  test('the cookie it sets actually authorises', () => {
    const token = /teddy_pe_session=([^;]+)/.exec(res.headers['set-cookie'])[1];
    assert.equal(auth.validToken(token), true);
  });
}
{
  const res = mockRes();
  await login({ method: 'POST', headers: {}, body: 'passphrase=correct+horse+battery' }, res);
  test('login accepts a urlencoded form body', () => assert.match(res.headers['set-cookie'] || '', /teddy_pe_session=/));
}
{
  const res = mockRes();
  await login({ method: 'GET', headers: {}, query: { logout: '' } }, res);
  test('logout clears the cookie', () => assert.match(res.headers['set-cookie'], /teddy_pe_session=; .*Max-Age=0/));
}
{
  const res = mockRes();
  await page({ method: 'GET', headers: {}, query: {} }, res);
  test('page 401 without a cookie', () => assert.equal(res.code, 401));
  test('page serves a login form, not the site', () => {
    assert.match(res.sent, /name="passphrase"/);
    assert.equal(/Teddy's Training Year<\/h1>/.test(res.sent), true);
    assert.equal(res.sent.includes('id="yeargrid"'), false, 'the site markup must not leak');
    assert.equal(res.sent.includes('Coach'.concat("'s diary")), false, 'no diary markup either');
  });
}
{
  const res = mockRes();
  await page({ method: 'GET', headers: { cookie: `teddy_pe_session=${auth.issue()}` }, query: {} }, res);
  test('page 200 with a valid cookie', () => assert.equal(res.code, 200));
  test('page serves the real site once signed in', () => {
    assert.ok(res.sent.includes('id="yeargrid"'));
    assert.ok(res.sent.includes('id="d-session"'));
  });
}
{
  const keep = process.env.DIARY_PASSPHRASE;
  delete process.env.DIARY_PASSPHRASE;
  const res = mockRes();
  await page({ method: 'GET', headers: {}, query: {} }, res);
  test('page 503, and still closed, when no passphrase is configured', () => {
    assert.equal(res.code, 503);
    assert.equal(res.sent.includes('id="yeargrid"'), false);
  });
  process.env.DIARY_PASSPHRASE = keep;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
