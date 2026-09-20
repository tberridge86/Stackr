# Complete owner price checks twice daily — 20 September 2026

The owner requested reliable general prices and accepted twice-daily provider
checks in place of more frequent background requests. This is collection-scoped
maintenance, not activation of the whole-catalogue sweep or a new provider.

## Cause

The existing scheduled worker checks at most 30 identities every six hours.
It prioritises identities without a stored quote, but an unavailable result does
not create a quote or advance persistent selection state. Those identities can
therefore occupy the front of every run. Even successful, unchanged provider
quotes preserve their original snapshot dates, so snapshot ordering alone cannot
prove which identities were recently checked. Simply changing the old job to
twice daily would reduce coverage further.

The repair adds an explicit complete-owned mode: freeze the resolved owner
candidate list once, deduplicate exact and general-base variants, check every
supported identity once in serial order, and publish the resulting stored
valuation. Requests are paced at least one second apart. A conservative cohort
bound, rate-limit stop and repeated-error stop prevent uncontrolled work.
Unavailable quotes remain recorded outcomes and cannot consume another card's
turn within a pass. The existing small manual queue remains a separate mode.

The production target is the existing owner Railway worker
`ff1e8d30-4307-45be-855c-5f83f092d8a5`, production environment
`b4304736-cac8-4ca9-92a7-93f7f6499c2f`, with the complete-owned/general mode at
06:00 and 18:00 UTC. The existing manual-request queue does no provider work
without explicit queued requests. Its duplicate GitHub scheduled consumer is
disabled; manual reviewed dispatch remains available.

TCGdex's [FAQ](https://tcgdex.dev/faq) documents a free API with no published hard
rate limit and asks clients to cache responsibly. Its [pricing documentation](https://tcgdex.dev/markets-prices)
describes hourly-to-daily TCGplayer updates and daily Cardmarket updates.
Twice-daily checks do not justify altering provider quote dates or claiming that
unchanged quotes are new prices. Existing estimates and their provenance remain
intact, including when a newer provider request returns no quote.

## Coverage and delivery boundaries

The pre-change live valuation at 17:16 UTC has 266/366 copies priced: 166 exact
and 100 labelled general estimates, GBP217.62 priced subtotal. The remaining
100 are 11 pending, 86 unresolved and three unsupported. These outcome categories
do not mean all86 have ambiguous languages: detailed identity evidence includes
missing saved set/card references, missing provider mappings, and Japanese holo
bases without a supported refresh path. A complete provider pass is not a claim
that every card has an available quote.

No saved holding, language, physical finish or catalogue record is rewritten.
The full-catalogue sweep, expanded provider-capacity flag, prepared refresh queue
and paid/sold-provider integrations stay disabled. Preparation after the pass
uses the already-deployed prepared-valuation path.

The code runs server-side and does not require a new iOS binary for background
checks. Display of PR216's general collection mode still needs the pending
general-pricing client. The separate iOS build allowance and physical phone
acceptance remain separate release requirements. No TestFlight checker is
recreated.

## Validation and rollout evidence

Focused tests cover complete passes beyond30 identities, unique selection,
unavailable-card isolation, serial pacing, dry runs, bounds, manual-queue
separation and provider backoff. The corresponding PR and ignored release
receipt record exact checks, merged source, reviewed dry-run plan, applied
provider outcomes, persisted/readable totals and live scheduler configuration.

Rollback uses the recorded previous Railway start command and six-hour schedule;
it does not remove snapshots or rewrite holdings. A failed/partial pass retains
last known prices and reports its incomplete state explicitly.
