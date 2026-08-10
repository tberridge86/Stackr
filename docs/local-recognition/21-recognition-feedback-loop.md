# Stackr Recognition Feedback Loop

Date: 2026-07-26

## What Was Found

- `scan_learning_events` already records scanner attempts and some correction context.
- Scan Lab already supports internal/admin capture collection with explicit image upload consent.
- Ordinary scan-result corrections did not yet have a dedicated consent-controlled queue.
- User-submitted labels needed a stronger separation from reviewed training labels.

## What Changed

- Added a dedicated recognition-feedback schema and backend route.
- Added a local queue for scan-result feedback.
- Added explicit feedback actions:
  - confirm result
  - choose another candidate
  - manually correct the card
  - correct variant
  - report missing card
  - report bad scan
- Added local storage for:
  - anonymous scan ID
  - predicted identity
  - corrected identity
  - top candidate scores
  - capture-quality summary
  - OCR evidence summary
  - model version
  - catalogue version
  - device class
  - consent state
- Added opt-in rectified-image contribution:
  - no image uploads by default
  - upload explanation is shown before consent
  - only the rectified card crop is uploaded
  - consent can be withdrawn and uploads can be deleted
- Added internal review controls:
  - approve identity
  - change identity
  - mark ambiguous
  - reject poor image
  - group rows by physical card
- Added a manual export command for reviewed examples:
  - `npm run export:recognition-feedback-dataset`
  - output is a candidate dataset manifest only
  - no model is trained or deployed automatically

## Backend And RLS

Migration:

- `supabase/migrations/20260726234500_recognition_feedback_loop.sql`

Tables:

- `recognition_feedback_items`
- `recognition_feedback_events`

Storage bucket:

- `recognition-feedback`

Important gates:

- Users can create and manage their own feedback metadata.
- Review fields are protected by a trigger and reviewer/admin policy.
- Service-role storage access is isolated to the backend route.
- User labels start as `user_submitted` or `queued_for_review`.
- Training export requires reviewed or verified labels and approved review status.

## Review Status Versus User Labels

User-submitted labels are not ground truth.

- User label status records what the user submitted.
- Review status records what internal reviewers decided.
- Export accepts only reviewed rows with approved identity decisions.
- Ambiguous, poor-image, withdrawn, deleted and unreviewed rows are rejected from the ML manifest.

## Image Consent

Image contribution is explicit and reversible.

When the user opts in, Stackr explains that the upload contains:

- rectified card crop
- correction/action
- capture-quality summary
- OCR evidence summary
- model/catalogue versions
- anonymous scan ID

It does not upload unrelated camera surroundings by default.

## What Was Deliberately Left Untouched

- Existing recognition engine decisions.
- Existing Scan Lab capture workflow.
- Binder/listing save semantics.
- Marketplace and pricing behavior.
- Full Pre-Grade and grading features.
- Model training and deployment.

## Remaining Risks

- Real image upload cannot be verified locally without backend credentials and a signed-in session.
- Review queue UI depends on the deployed backend route and Supabase migration being applied.
- Current scan result routes only pass a crop URI when the scanner produced one.
- Export produces candidate data only; training and model approval remain separate future tasks.
