# Stackr agent ownership

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
