# Stackr agent ownership

## Platform architecture (23 October 2026)

Apply `docs/stackr-api/distributed-architecture-20261023.md` to new code and
infrastructure changes. GitHub owns source/configuration/migrations; Supabase
owns metadata, relationships, Auth and RLS; Cloudflare R2/CDN owns approved
public artwork and Pages hosts the web export; Railway owns backend compute
and workers. Keep binaries out of database rows and secrets out of clients.
New UI requests must use pages of at most 50 rows. Preserve existing identities,
rights and provider-correct URLs during migration. Never fabricate a CDN URL
for an object that has not been uploaded there.

Do not download or synchronize the catalogue asset library for local UI work;
use at most 50 explicitly selected mock assets. Keep large changes reviewable:
before a storage migration, scheduler cutover, schema restructuring, paid
provisioning or enforcement affecting installed clients, provide the exact
scope, evidence, costs and rollback for owner sign-off. Local implementation
and tests may proceed. Sub-100ms retrieval is a measured target, not a guarantee.

## Current repair and consolidation workspace (18 October 2026)

Use the independent repository `D:/Stackr` and the single integration branch
`codex/stackr-repair-consolidation-20261018`. Tif coordinates both the video
repairs and workspace consolidation. Keep preserved work, source assets and
private evidence under `D:/Stackr-organization`. The old `D:/Stackr-1` repository
and its linked checkouts remain recovery sources until their commits, tracked
changes, untracked files and necessary ignored material have been preserved and
restoration verified. Migrate the original shared Git repository last.

Run npm commands from this repository root unless explicitly targeting a
subproject. Search tracked source first and avoid generated/cache/data trees
unless directly relevant. TypeScript changes require `npm run typecheck` and
`npm run lint`; backend TypeScript also requires `npm run typecheck:backend`,
and gateway changes require `npm --prefix gateway test`. Use narrow regressions.

Keep at most two helpers alongside the coordinator. Assign exclusive file
ownership, preserve other edits and obtain independent review for substantial
logic, identity, pricing and account-boundary changes. Live deployments,
provider price refreshes, remote database scripts, catalogue mutations and production or
staging jobs retain explicit approval boundaries. Exact artwork replacements
retain the owner's standing operational authority and per-source rights gates.
Permanent cleanup uses an exact approved path list after recovery verification;
an old or clean checkout is not proof that its contents are disposable.

The current issue register is `docs/releases/video-repair-register-20261018.json`.
Local repairs, checks, review, merge, publication and installed-phone acceptance
are separate milestones. No video issue closes on source tests alone.

Read `docs/agents/README.md` before work, then the relevant specialist brief in
`docs/agents/`. These briefs define the five ownership areas requested by Jack:
release delivery, pricing, performance and retrieval, backend hygiene, and
catalogue metadata and images.

- Preserve the user's current instructions and existing authorisations. These
  documents do not create a new approval requirement for authorised routine work.
- Start from a verified repository revision in an isolated branch or worktree.
  Preserve other work, check existing PRs, and continue the matching workstream
  instead of opening duplicate repairs.
- Specialists own focused fixes and evidence. The release owner coordinates
  integration and production promotion through the existing release workflows.
  Existing operational refresh workers continue on their configured schedules.
- Report implemented, tested, merged, deployed, and device-verified states
  separately. Successful HTTP responses, completed jobs, and green CI do not
  establish correct card retrieval, prices, images, or installed app behaviour.
- Preserve language, printing, finish, condition, grade, price provenance, access
  controls, and commerce locks. Do not perform destructive cleanup as routine
  maintenance or rewrite applied migrations.
- Save material results and remaining handoffs in the repository or matching PR.
  Report only supported metrics with scope, denominator, timestamp and revision;
  otherwise record unmeasured. Never invent an overall completion percentage.
- Do not send email, Slack messages, or repeat old alerts. The previous catalogue
  reporting automation was paused and is not a work queue to reactivate.

## Independent specialist audits and backend repairs

Read `.codex/AUDIT_PROTOCOL.md` for the owner's requested specialist audits and
shared repair queue. Use the existing eight Stackr project specialists for their
own areas and `.codex/agents/stackr_backend.toml` for backend metadata repairs.
The coding lead assigns bounded work; each specialist reports its own evidence.
Background follow-through continues actionable repairs and targeted rechecks,
rather than repeating full audits. Preserve existing authorizations and report
local validation separately from live API and installed-device delivery.
