# Stackr privacy notice — draft for operator review

**Status:** Draft. Do not publish until every `[CONFIRM]` item is completed by the operator and final app/service behaviour is checked.

**Last reviewed against source:** 20 September 2026  
**Effective date:** `[CONFIRM]`

## Who is responsible for your information

`[CONFIRM controller legal name, postal address, jurisdiction and privacy-request channel.]`

The existing public support page lists `tberridge86@gmail.com`. Its monitored status and request-handling owner are not confirmed. Do not present it as a working privacy-request channel until confirmed.

## Information handled in the app source

| Category | Purpose supported by source | Choice or limit |
| --- | --- | --- |
| Account and session information | Sign-in and account-scoped access. | Session-management controls require final release verification. |
| Collection, binder and marketplace-related records | Show and organise cards, binders and related activity. | Binder visibility is configured per binder. |
| Camera/photo access | Capture a card when a person chooses to scan it. | Permission is controlled in device settings. |
| Scanner data | OCR, identification context, manual correction and limited diagnostics. | The normal route does not promise local-only recognition; paid fallback is disabled by default. |
| Recognition-feedback metadata | Record a correction or feedback for review. | Image upload requires separate explicit consent. |
| Optional recognition-feedback image | Send a rectified card image only after explicit consent and signed-in upload. | Dataset use remains subject to review/approval gates; no automatic training claim is made. |
| App diagnostics | Operate and troubleshoot scanner behaviour. | Source inventory found first-party scanner diagnostics, not a confirmed third-party product-analytics deployment. |
| Support correspondence | Respond to a request or report. | Request channel and retention period need confirmation. |

## How information is used and shared

`[CONFIRM a lawful basis for each purpose and the complete current recipient/processor list.]`

The source identifies Supabase authentication/data services and the Stackr backend as dependencies. It does not prove final hosting locations, transfer safeguards or processor terms. Do not name Ximilar, Stripe, Discord, Minty, analytics vendors or other providers as current recipients until the operator confirms they are active for the relevant feature and provides the applicable information.

## Retention and deletion

`[CONFIRM retention periods or criteria, including backups and security/fraud records.]`

The app can remove local recognition-feedback files and can request deletion of an uploaded feedback item where the authenticated server accepts it. This does not prove deletion of every remote copy, backup, account record or provider-held record. General account deletion and data export are currently labelled unavailable in Settings. Do not promise an in-app account deletion or fixed deletion time until an authenticated process and completion receipt are verified.

## Your choices and rights

Where applicable law gives rights of access, correction, deletion, restriction, objection or portability, the final notice must explain how to make a request, identity checks and the relevant regulator. For a UK-facing notice, confirm the controller/jurisdiction before naming the ICO.

## Children and family accounts

No family, household, guardian or child-account flow was identified in the reviewed source. `[CONFIRM age position, age-assurance approach and child-data safeguards.]`

## Operator completion checklist

- [ ] Controller identity and contact details
- [ ] Jurisdiction, representative and DPO position
- [ ] Purpose and lawful-basis matrix
- [ ] Current subprocessors, locations and transfer safeguards
- [ ] Retention and backup schedule
- [ ] Monitored privacy/support request channel
- [ ] Authenticated account-deletion and rights-request procedures
- [ ] Age/child-data policy
- [ ] Final app, backend and provider inventory checked against release

This draft follows the information categories in the ICO's [privacy-information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).