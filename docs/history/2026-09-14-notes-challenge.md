# Working session, Monday 14 September 2026: the challenge on the Notes page

## What was asked

Show the actual Challenge of the Week next to the field that records it, instead of a bare box.

## What was answered

The ask was one line of work. Reading the field first turned up something else.

The label said "Which challenge attempt this was", which asks for 1 or 2. Week 1's challenge is "Silent Landings. 10 jumps off a step, count the silent ones. Monday number, Friday number", and `DocsExporter` writes the stored value out as "Challenge number". So the column holds the score, and the label had been asking a different question with a different answer for as long as the screen has existed.

Put to Jeff with the evidence, and he confirmed: it is the score. So two things changed rather than one. The label reads `Challenge number` now, and the challenge itself sits above it.

## What got built

`web/src/screens/CoachJournal.tsx`, and nothing else. No fetch was added: the screen has read `selectWeek` and `selectDayByDate` since the drill filter, so this is the same payload used twice.

The challenge renders only when the picked date has a day card in the loaded week. The week payload only ever holds the current week, so a date outside it would otherwise be shown this week's challenge beside a session that ran under a different one, which is the one failure worth designing against.

When it does not render, nothing takes its place. The drill fieldset a few lines below already says the date is outside this week, and saying that twice on one screen is noise.

The block uses the same sunk panel as the per-drill fieldsets, so the two things on this screen that come from the plan rather than from Jeff look alike.

## How it was tested

Seven red first. Four new, and three existing ones that asked for the old label and had to move with it.

The new four: the challenge shows for a date inside the week, the field saves the number he typed under its new label, no challenge shows for a date outside the week, and none shows while the week is still on its way.

The fixture's challenge was lengthened to the shape production actually sends, a name plus how it is scored plus when the attempts fall. A bare name could not tell a screen that renders the whole field from one that renders only the first sentence.

`web/` 268 tests, all green, `tsc --noEmit` clean.

## What was not done

Teddy's own journal does not show the challenge. He was not asked about, and adding it is a separate decision about what a 7-year-old's page should carry.
