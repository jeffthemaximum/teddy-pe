# Working session, Sunday Sep 13, 2026 (evening): glossary and diary

Second session of the day. The first produced the program and the repo; this one added two features on `feature/drill-glossary-and-coach-diary`.

## What Jeff asked

Two features, planned before building.

1. **Find out what an activity is, from the daily view.** His example, from this week's Tuesday card: "At a wall. Pass, receive, pass: 25 with the right foot, 25 with the left. Then toe taps 30s, tick-tocks 30s, sole rolls 30s, twice through." He did not know what a tick-tock was. He asked for a way to click an activity and see a fuller description, or a gif, and asked to be walked through the options before building.
2. **A coach's diary** he fills in regularly, describing how Teddy is doing on the activities, with the plan updated from his entries.

Mid-session he also asked that all the work go on a feature branch he can review and merge.

## What the exploration turned up

- The confusing word lives inside cue prose, not in a block heading. Block names are things like "Soccer: Touch"; the drills are inside the sentence. So explanations had to key on terms.
- Cue strings already contain HTML (`<q>` tags in the data), and `src/page.html` interpolates them raw, so build-time markup needed no template surgery.
- Nothing in the data identified an individual drill. Weeks, days, areas, blocks and battery tests all had identifiers; activities did not. Both features needed one, which is why they were built together.
- The year's architecture names roughly 250 distinct drills; about 80 appear in what is already written.
- The same drill is already written several ways: drop feed and drop-feed, bear walk and bear crawl, hollow hold and hollow holds, Hanging knee tucks and hanging knee raises. Alias lists rather than single strings.

## Options put to Jeff, and his answers

- Explanation surface: inline expansion, tooltip, bottom sheet, glossary tab. **Bottom sheet plus glossary tab.**
- Media: text only, text plus a video link, hand-built SVG animations, clips of Teddy. **Text plus an optional video link.** Claude recommended against SVG animations and flagged that the claude.ai artifact's CSP blocks external images and video outright, so a gif would work on Vercel and silently show nothing on the artifact.
- Diary capture: local form with export, repo and conversation only, or a real backend. Claude recommended the first. **Jeff chose the real backend**, and the design absorbed the cost by pulling entries back into the repo.
- Store: GitHub API into the repo, Vercel KV, Neon Postgres. **Neon Postgres**, with a shared passphrase.
- Diary authority over plans: **proposals only.**

## What was built

Commit 1, the glossary: `data/drills.json` with 84 entries; a build-time linker matching names and aliases longest-first on word boundaries, never inside an HTML tag, first mention per block; a bottom sheet with Esc, backdrop, focus trap and focus return; a Glossary tab with a filter; a glossary appendix in the markdown export; a per-card drill list for the diary; and a build report naming any block where nothing matched.

Commit 2, the diary: `api/diary.js` on Vercel against Neon, passphrase-guarded, validating before touching the database and upserting on a client-supplied id so a queued retry cannot duplicate; a form on This Week that rates the drills from that day's card; a local-first save with a sync queue; `tools/diary_pull.py`; and `tools/test_diary_api.mjs`.

## Verification

The API's validation and auth were tested directly (23 assertions, including prototype-pollution attempts in the ratings object and a length-mismatch passphrase that would otherwise throw). The page was exercised in headless Chrome rather than eyeballed: term linking, sheet open and close by button, backdrop and Esc, focus return, the filter and its empty state, tab switching, then the diary's save, payload shape, prefill on session change, the offline queue, and the 401 and 503 messages.

Two real bugs were found and fixed this way. Escaping block titles turned `Champion's Log` into `Champion&#x27;s Log` and stopped it matching, fixed by escaping without quote conversion. And tapping a drill rating re-rendered the whole list, throwing away focus mid-form, fixed by repainting only the row that changed.

One thing noticed and deliberately not fixed: the Year tab has a 20px horizontal overflow at phone width from a timeline marker. It is identical before and after this work, so it was reported rather than quietly changed.

## Left for Jeff

Create the Neon database and set `DATABASE_URL` and `DIARY_PASSPHRASE` in Vercel. Until then the diary saves on the device and says plainly that it is not configured.
