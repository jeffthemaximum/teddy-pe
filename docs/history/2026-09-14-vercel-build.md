# 2026-09-14: the merge, and the first Vercel build of the web app

## What Jeff asked

Three things, across the session. First, to be walked through the Vercel setup the way we had done Neon. Then he reported two problems: he could not find the "include files outside the root directory" setting, and no build had triggered even after the project was configured. Then he merged `feature/rails-react-rewrite` into `main` on GitHub and pasted the build log from the failure that followed.

## What was answered

### The merge

`c6a94d6`, PR #7, a squash. GitHub deleted the branch behind it, which is why the new Vercel project's production branch pointed at nothing and no build ever triggered. The fix was to repoint it at `main`.

**The old site survived the merge intact.** `vercel.json`, `api/page.js`, `site/index.html`, `public/robots.txt`, `build.py` and `src/page.html` are all still on `main`, so the project that has always served Teddy's page keeps serving it. Both Vercel projects now build from `main`, independently, with different root directories.

Merging before cutover rather than after changes Phase 3's shape, in Jeff's favour. The brief had the old pipeline deleted on the branch and reaching `main` only at cutover. Having both systems on `main` at once means the current site keeps serving until Phase 3 explicitly removes it, and there is no window where the program is unavailable. That was the whole point of the rule the early merge appeared to break.

### The setting he could not find

There was nothing to find. Vercel clones the whole repository and then changes into the root directory, so `../core` was present in the build all along, which the log proves: every error names a path under `../core/src/`. The files were never the problem.

### The build

72 TypeScript errors. All of them from four missing packages.

Vercel installs only `web/`'s own dependencies. `core/` is a `file:../core` dependency, which links source and installs nothing, and npm had recorded core's four dependencies in `web/package-lock.json` as a bare declaration with no resolved tree under it. TypeScript and Vite both resolve an import from the real path of the file that wrote it, so an import inside `core/src/` searches `core/node_modules` and then the repo root, and never `web/node_modules`.

Sixteen errors said so directly. The other fifty-six were implicit `any` and missing-property errors that looked like real type bugs in the screens and were not: with the four packages present, the same tree typechecks clean.

It had never failed on a developer's machine because `core/node_modules` is always there, installed for core's own Jest suite. The machine that ran the tests was the only machine where the build could work. A `prebuild` hook now installs core's dependencies when they are missing, and only then.

## Verification

The failure was reproduced rather than reasoned about. `core/node_modules` moved aside, `tsc --noEmit` produced all 72 errors with the same first lines as Jeff's log, and `npm run build` then went green from an empty tree. `web/` 250 tests, `core/` 257, both green afterwards.

## What is still owed

`WEB_ORIGIN` on the Fly app once the site has a URL, so CORS admits it, and the check the brief asks for: open the deployed site signed out and record what a stranger sees.

## A correction

I told Jeff the rewrite branch had never been pushed. It had been pushed, opened as PR #7 and merged, and GitHub deleted it on merge. `git ls-remote` showed the aftermath and I read the absence as the branch never having existed.
