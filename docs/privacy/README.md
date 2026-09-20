# Privacy notice draft — source inventory

Status: **draft only; not a published policy or legal advice.** Prepared 20 September 2026 from current Stackr source and the existing public page.

The editable notice is [privacy-policy-draft.md](privacy-policy-draft.md). The matching static draft is [privacy-policy-draft.html](privacy-policy-draft.html).

## Source-backed inventory

| Area | What source supports | Limit |
| --- | --- | --- |
| Account and collection | Supabase authentication and account-scoped collection, binder and related app data. | Controller, hosting and transfer arrangements are unconfirmed. |
| Device permissions | Camera and photo access are managed in device settings. | A device control is not a data-deletion control. |
| Standard scanner | Camera capture supports OCR and manual correction. Paid recognition fallback is disabled by default; the local embedding model is blocked. | Do not claim local-only recognition or an active paid provider. |
| Recognition feedback | A user can create feedback locally. Metadata may be uploaded when signed in; a rectified image requires explicit image-upload consent. Dataset use has review/approval gates. | Remote deletion completion and operational retention are unverified. |
| Scanner operational records | First-party scanner event/diagnostic code and an admin-only analytics view exist. | This is not a production telemetry audit. |
| Minty | Minty insight code exists. | It does not establish a live provider, personal-data flow or provider contract. |
| Family/child accounts | No family, household, guardian or child-account flow was found in this bounded review. | This is not age-assurance evidence. |
| Account/privacy controls | Settings labels account deletion, session management, data export and blocked-user controls unavailable; binder visibility is per binder. | Recheck after the final release changes. |

## Existing public page reconciliation

The page at <https://tberridge86.github.io/stackr-support/privacy.html> is dated 22 May 2026 and describes Ximilar, Stripe, Discord and in-app deletion. Current source does not establish that each is active for an ordinary user today, nor that in-app deletion is available. This draft therefore leaves them unresolved.

## Publication blockers

1. Controller legal name, postal address, jurisdiction, representative and DPO position.
2. Purpose and lawful basis for account, community/marketplace, diagnostics, recognition feedback and support.
3. Current processors, locations, transfer safeguards and contracts for Supabase, Railway and any active recognition, payment, analytics, insight or support provider.
4. Retention and actual deletion for accounts, binders, images/captures, feedback, logs, support messages and backups.
5. A confirmed monitored request channel. `tberridge86@gmail.com` is public, but monitoring and response ownership are unverified.
6. Authenticated account deletion and recorded completion evidence.
7. Intended age/child-data policy.

The ICO says UK privacy information must identify the organisation, purposes, lawful basis, recipients, transfers, retention and applicable rights. See its [privacy-information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).