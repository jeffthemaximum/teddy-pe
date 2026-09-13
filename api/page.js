// Serves the site, but only to someone who has the passphrase.
//
// The built page lives at site/index.html and is deliberately NOT in the Vercel
// output directory, so this function is the only way to get it over the web.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { authorized, configured } from './_auth.js';

let cached = null;
async function page() {
  cached ||= await readFile(path.join(process.cwd(), 'site/index.html'), 'utf8');
  return cached;
}

const shell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{--bg:#F2F5F1;--surface:#FFFFFF;--ink:#16231C;--ink-2:#48584F;--ink-3:#7A897F;--line:#CBD5CD;--line-strong:#A9B7AC;--court:#1E5C46;--court-ink:#FFF;--ball:#C6DE3A}
@media (prefers-color-scheme:dark){:root{--bg:#0F1713;--surface:#161F19;--ink:#E9EFE9;--ink-2:#B3BFB6;--ink-3:#7F8D85;--line:#2C3A31;--line-strong:#40524A;--court:#3A9A73;--court-ink:#07130D;--ball:#D3E85A}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
  background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:15px;line-height:1.5}
.box{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--ball);border-radius:8px;padding:26px 24px}
h1{font-family:"Barlow Condensed",Impact,sans-serif;font-size:38px;font-weight:800;line-height:.95;text-transform:uppercase;margin:0 0 6px}
p{color:var(--ink-2);font-size:13.5px;margin:0 0 18px}
label{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
input{width:100%;font:inherit;font-size:16px;padding:10px 11px;border:1px solid var(--line-strong);border-radius:4px;background:var(--bg);color:var(--ink)}
input:focus-visible{outline:2px solid var(--court);outline-offset:1px}
button{width:100%;margin-top:14px;cursor:pointer;font-family:"Barlow Condensed",sans-serif;font-size:19px;font-weight:700;
  text-transform:uppercase;letter-spacing:.03em;padding:11px;border-radius:4px;border:1px solid var(--court);background:var(--court);color:var(--court-ink)}
button:hover{filter:brightness(1.08)}
.bad{background:#F7E3D2;color:#4A2306;border-radius:4px;padding:9px 11px;font-size:13px;margin-bottom:16px}
@media (prefers-color-scheme:dark){.bad{background:#3B2313;color:#F7DCC6}}
</style></head><body><div class="box">${inner}</div></body></html>`;

const loginPage = bad => shell("Teddy's Training Year", `
  <h1>Teddy's Training Year</h1>
  <p>This page is private. Enter the passphrase to continue.</p>
  ${bad ? '<div class="bad">That passphrase did not match. Try again.</div>' : ''}
  <form method="POST" action="/api/login">
    <label for="p">Passphrase</label>
    <input id="p" name="passphrase" type="password" autocomplete="current-password" autofocus required>
    <button type="submit">Enter</button>
  </form>`);

const setupPage = shell('Not configured', `
  <h1>Not configured</h1>
  <p>Set <code>DIARY_PASSPHRASE</code> and <code>DATABASE_URL</code> in the Vercel project, then redeploy.
  Until then there is no passphrase to check, so the site stays closed.</p>`);

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('x-robots-tag', 'noindex, nofollow');

  if (!configured()) return res.status(503).end(setupPage);
  if (!authorized(req)) return res.status(401).end(loginPage(req.query?.bad !== undefined));
  return res.status(200).end(await page());
}
