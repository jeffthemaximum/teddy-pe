# 2026-11-18: longer coach notes

**What Jeff asked.** Allow longer notes; the Notes page said "Note is too long
(maximum is 2000 characters)".

**Done.** `CoachEntry` note and pain note cap raised to 20,000. No migration;
the columns are `text`. One model spec. Needs a deploy:
`cd backend && fly deploy -a teddy-pe-api` from `main`.
