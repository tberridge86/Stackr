# Direct / Tracked — release planning contract

Status: **rules and synthetic test fixtures only; live service selection and fulfilment held**. This is the 6 September 2026 TestFlight preparation packet, not a launched delivery service.

The approved dirty-workspace selector was selection/recordkeeping only. It did not enforce tracking, and its database migration has not been verified or included in this release branch. Current-main Gate 0 controls therefore take precedence: card-only agreements remain possible through the existing flow; cash, payments, free-form offer messages, shipping and fulfilment remain disabled. No selector is shown, no service columns are read/written, and no new remote state is created by these rules.

## Proposed service rules

| Rule | Direct | Tracked |
| --- | --- | --- |
| Intended selection | Sender chooses; default for a future service-enabled offer | Sender requests; recipient explicitly agrees |
| Intended delivery | Participants arrange delivery | Every participant sending physical cards supplies carrier and reference |
| Card-for-card tracking | No service-imposed requirement | Both outward legs |
| One physical-card sender | No service-imposed requirement | Only the physical-card sender; cash examples are synthetic future scenarios, not enabled commerce |
| Stackr service fee | None proposed | None proposed |
| Independent authentication | Not included | Not included |
| Insurance, escrow, guaranteed delivery or refunds | Not promised | Not promised |
| In this TestFlight packet | No live service selector or fulfilment | No live service selector or fulfilment |

Listing evidence and delivery services are different concepts. Evidence about a photographed item is not authentication, payment protection or shipment cover. Entering a tracking reference would be participant-supplied evidence, not independently verified delivery.

## Gates before enabling either live service selection or Tracked fulfilment

1. Verify the persisted `service_level` and `service_terms_version` contract on the intended database. Freeze both on offer creation; altered terms require a new offer and new consent. Do not silently interpret unknown incoming terms as consent to Direct. The legacy display fallback in the planning helper is not an authorisation rule.
2. Verify immutable counters, expiry, quantity/ownership enforcement, atomic reservation and server-authoritative transitions with concurrent authenticated clients. The UI must not claim these are already enforced.
3. Require a carrier and tracking reference before each relevant party can mark a Tracked leg sent; enforce this on the server, not only in the client. Implement both legs of a card swap and recoverable failures.
4. Implement a genuine offer-linked issue record and truthful support workflow before promising a case, review or outcome. The existing `disputed` status is only exposed as **Problem flagged** in this packet.
5. Keep checkout, payments, orders, refunds, insurance and any eligible automatically included authentication service as separate future releases. No paid authentication or send-away charge is introduced.

The dirty-root migration `supabase/migrations/20260904162559_add_trade_service_level.sql` is deliberately **not queued or applied**. Its reviewed source SHA256 is `AB180987E18352739A0E2385E64F1D70D0B84124ABC82432EB875C52B6B59601`; this identifies the held input, not proof of its execution or database correctness.

## Deterministic fixtures and verification

`scripts/fixtures/tradeServicePreviewFixtures.ts` contains eight distinctly labelled planning fixtures: Direct swap, synthetic cash terms, Tracked request, accepted two-leg swap, single physical sender, declined request, revised offer, and one-sided warning. Carrier/reference labels are fictitious (`Preview carrier`, `PREVIEW-TRACK-001`), not customer records. These test-only fixtures are not imported by app screens or transaction modules.

`npm run test:ux-service-release` verifies pure service rules, fixture identity, the held selector flag, one-sided/invalid-quantity warnings, confirmation copy and actual control wiring. `npm run test:commerce-release-lock` verifies the existing source-locked commerce boundary. Neither suite is a database, concurrency, shipping-provider or physical-iPhone test.
