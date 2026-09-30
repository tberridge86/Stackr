# Railway restoration and collector search — 30 September 2026

The owner confirmed Railway was updated. Protected backend-only run [36680646429, attempt 3](https://github.com/tberridge86/Stackr/actions/runs/36680646429) successfully deployed reviewed PR259 source `2ef619c2f4b4761d7c4734c746d0d48192ca6af7` as Railway deployment `86f56722-c2ff-4f2f-afb7-f0c494e443c2`. No migrations, catalogue writes, mobile build, gateway promotion or billing change occurred in that run.

Its receipt attests the backend source, health and anonymous pricing rejection on direct and gateway routes. `ownerPricingValidated` is false: these privacy checks are not authenticated price or phone acceptance.

Public readback returned the expected Japanese WAT card after deployment. English Mew collector R still returned 400 because the gateway rejected every one-character query before the backend. This patch aligns only selected-set collector validation with the deployed backend: one ASCII letter/digit is permitted on `/v1/search` with a canonical set UUID. General short queries, wildcards, invalid language/IDs and duplicate parameters stay rejected. It changes no artwork, metadata, holdings, provider configuration or pricing policy.

Validation: 46 gateway tests pass, including forwarding the query/set/language and rejecting malformed searches before any origin call. Gateway dry build, privacy smoke tests, protected deployment contract and secret scan pass. Gateway delivery and new live R readback are pending.

Railway queue redeployment `6ac0d538-4917-4c72-8740-ea0ecf9a032b` ran older source `478b3a5bf1fc955f31119f03367efcf65a05fe47`, processed an empty queue and published a valuation. Automatic redeployment `57360417-d8fa-49bd-9d25-a53c8814ff32` also targets that older source. These rebuilds do not deliver the newer saved-language/general-price fixes. Current reviewed source `32606e9053e7ad28d0d1ed6409bd44963a2d3ed2` dry-run selected 317 identities with no failures; source archive SHA256 `730c312c2824241e383ecf08453ec4a077a48d4565889ece69db807cbcaae345` contains only tracked worker dependencies. Updated worker delivery and persisted-price readback remain pending.

Read-only provider checks at 17:56 UTC still returned Scrydex `INVALID_CREDENTIALS` and PikaQian `invalid_api_key` (HTTP401). Restoring Railway does not resolve those credentials. Existing TCGdex worker recovery is separate.

Historical morning blockers remain in `october-1-progress-20260930.md`; this receipt supersedes only the expired-Railway/backend-delivery statements. Remaining artwork/checklist/logo cases and installed-device/TestFlight acceptance are not closed by this backend deployment.
