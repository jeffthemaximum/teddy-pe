# Working session, Sunday night into Monday 14 September 2026: the core package

The sixth session on the rewrite and the first one Jeff slept through. Phase 1's Rails API was finished and deployed at the start of it. This session built `core/`, the package both the web app and the eventual native app import, and started the web app.

## What Jeff asked

"Let's start phase 2." Then, before going to bed, two instructions that shaped everything after: keep going through the plan and into building the web app rather than stopping at the gate, and when something is genuinely ambiguous, rule on it and record what it costs if the ruling is wrong rather than parking it until morning.

He also asked what he could do to stop the work stalling. The honest answer was to keep the Mac awake, which he did.

## What got built

`core/`, a TypeScript package holding ten ducks: auth, six that read the program, the two journals, test results, and an offline outbox. 176 tests. Then `web/`, a Vite and React app, as far as its scaffold and the test that reads its own bundle.

Ten tasks, each with its own review and fix rounds, then a review of the whole package. `main` was never touched.

## The rule the package exists to keep

The brief says no duck may be redefined for the native app in Phase 4. Everything in `core/` follows from that.

It owns the ducks and the network and owns no storage. Storage arrives as a three-method interface each app supplies, and that is the only seam where the two apps differ. Anything an app cannot reach through the package's public surface it would reimplement, so that surface is asserted as an exact set rather than a list of expected names: something exported by accident fails the test.

## Twenty-two tests that checked nothing, and seven fixtures that could not fail

Phase 1 ended with eighteen assertions found passing while checking nothing. This session added four more, and then found something worse and more interesting.

Seven times, an assertion was written correctly, by someone reasoning carefully about the exact failure it was meant to catch, against a **fixture that could not produce that failure**:

- a glossary alias search where the drill was named `Cartwheel` and the alias was `wheel`, so the name matched anyway
- a test proving an unsent note survives a share toggle, seeded from state only a server response writes, so it exercised the one ordering that already worked
- a test-window tie-break where the fixture's windows were three months apart and no tie could occur
- a queue lookup by date where the queue held one item, so any lookup returned it
- a sign-out reset where nothing populated the flag whose clearing was the point
- a bundle-privacy control that passed by matching an unrelated string, in the test written to stop exactly that
- the end-to-end test for the offline queue, written from the same wrong assumption as the code it was testing

The last one is the one to remember. It was the single test that would have caught two Criticals, and it asserted a request shape that the server rejects and mocked a response shape the server does not send. The suite was green, 135 tests, against a journal that returned 400 on every save.

Reading does not find these. The code is right, the assertion is right, and only the data is wrong. Every one was found by breaking the implementation and watching what failed, which is now a required step in every dispatch.

## The three things the final review found

**Every journal save would have failed.** Neither save sent `program_year_id`, which both controllers require. The identical defect had been found and fixed in the test-results duck hours earlier, and never swept across. Phase 1's ledger records that exact lesson, in those words. Writing a lesson down is not applying it.

**The journal stored the API's envelope as the entry**, so an entry filed under the key `"undefined"` and the day's saving flag never cleared.

**A queued write outlived the person who wrote it.** This is the one worth understanding, because three correct decisions produced it.

Teddy writes something he does not share. There is no signal, so it queues. His token expires. The sign-out reset spares the outbox deliberately, because words typed at a court are still owed to the server. Jeff signs in on the same iPad, the replay fires, and Teddy's private note goes out under Jeff's token. The only thing stopping it being written as Jeff's own entry was a server rule the client does not know about. And the whole time it sat queued, the note was readable by Jeff through a selector on the package's public surface.

Sparing the outbox on sign-out is right. Keying the queue by content rather than by person is right. Exposing a selector so a screen can show a pending count is right. The failure lives between them, and no review of any one task could see it.

A queued write now records who made it. A replay sends only the signed-in person's writes and leaves the others queued for when they come back, because Teddy's words are still his and still owed.

## Where the good findings came from

Not from the checklists. Three of the best came from a reviewer doing something it was not asked to do: inventing a fourth mutation after the three it was given all passed, trying orderings nobody had enumerated, writing a throwaway file that compiles against the public surface to prove the surface is sufficient.

The instruction worth keeping is the last one. A surface is judged by what can be built on it, not by what is on it. Reading an export list is how two screens ended up unbuildable without anyone noticing.

## Left for Jeff

The soft delete he asked for is owed, and is built in Phase 2c next to the journal screen it belongs to, because an endpoint with no button gets designed against an imagined interaction.

The web app has a scaffold and a bundle test and no screens yet. Phase 2b's plan covers signing in, the year, the month, this week and the glossary; 2c covers the journals, the test sheet, the charts, the delete and the deploy.

`main` is still where it was.
