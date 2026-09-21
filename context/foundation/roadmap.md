---
project: "car-service-history"
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-21
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-usable-service-history-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: car-service-history

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First usable service-history loop** — Status: open

- **Intent:** Prove the core mechanic → client service-history loop works end-to-end — on top of the already-deployed auth/data scaffold — within the 3-week, after-hours-only solo MVP budget.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, US-01, Access Control, Success Criteria (Primary/Secondary/Guardrails).

## Vision recap

The vehicle's service history today lives only in a paper booklet: clients lose it, mechanics at other shops can't see it, and proving history at resale is hard. A digital, portable record removes that single point of failure and lets a client share verified history independent of which shop performed the work.

## North star

**S-01: A mechanic adds a client's vehicle and first service entry; the client logs in and sees it.** — This is the PRD's Primary Success Criterion verbatim and its only defined user story (US-01); nothing else in the product matters until this loop works.

> The "north star" here means the smallest end-to-end slice whose successful delivery proves the core product hypothesis — placed as early as its prerequisites allow, because every other slice only matters once this one works.

## At a glance

| ID   | Change ID                             | Outcome (user can …)                                                  | Prerequisites | PRD refs                          | Status   |
| ---- | -------------------------------------- | ----------------------------------------------------------------------- | -------------- | ---------------------------------- | -------- |
| F-01 | roles-and-domain-schema-foundation     | (foundation) mechanic/client roles + domain schema + RLS in place       | —              | Access Control, NFR (privacy)      | ready    |
| S-01 | first-service-entry-visible-to-client  | Mechanic adds client+vehicle+entry; client sees it in their history    | F-01           | FR-001, FR-002, FR-003, FR-004, US-01 | proposed |
| S-02 | mechanic-edits-service-entry           | Mechanic corrects a mistake in a service entry they created            | S-01           | FR-006                            | proposed |
| S-03 | shareable-vehicle-history-link         | Client generates a 24h read-only share link (no cost shown) for a buyer | S-01           | FR-005                            | proposed |
| S-04 | client-flags-incorrect-entry           | Client flags a service entry as incorrect, visible to the mechanic     | S-01           | FR-007                            | proposed |
| S-05 | next-service-email-reminder            | Client receives an email reminder as the next service point approaches | S-01           | FR-008                            | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                | Chain             | Note                                                                 |
| ------ | --------------------- | ------------------ | --------------------------------------------------------------------- |
| A      | Core loop             | `F-01` → `S-01`    | The north star; everything else only matters once this ships.        |
| B      | Entry integrity        | `S-02`             | Joins Stream A at `S-01`; lets mechanics fix mistakes safely.          |
| C      | Trust & sharing         | `S-03` → `S-04`    | Joins Stream A at `S-01`; both are nice-to-have, parked-adjacent.      |
| D      | Retention              | `S-05`             | Joins Stream A at `S-01`; new integration surface (cron + email).      |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro + React + shadcn/ui scaffold with a working auth module (signin/signup/dashboard placeholder — `src/pages/dashboard.astro:1-25`); no domain UI (clients/vehicles/entries) yet.
- **Backend / API:** absent (domain routes) — only auth endpoints exist (`src/pages/api/auth/{signin,signup,signout}.ts`).
- **Data:** partial — Supabase client wired (`src/lib/supabase.ts:9`); no migrations/schema for clients, vehicles, or service entries; no seeds.
- **Auth:** partial — Supabase session auth + route middleware work (`src/middleware.ts`); no mechanic/client role distinction, no RLS.
- **Deploy / infra:** present — `wrangler.jsonc` configured; CI (lint/build/smoke) plus Cloudflare Workers Builds git-integration deploy; first deployment verified (`context/changes/deployment/deployment-plan.md`).
- **Observability:** absent — no logging/error-tracking/metrics library.

## Foundations

### F-01: Roles and domain schema foundation

- **Outcome:** (foundation) a `role` distinction (mechanic/client) exists on registered users, a minimal domain schema (clients, vehicles, service_entries) exists with RLS enforcing "a mechanic sees only clients assigned to their own workshop" and "a client sees only their own vehicle," and the two dashboard routes are gated by role. No domain CRUD UI/API is built here — that's S-01's job.
- **Change ID:** roles-and-domain-schema-foundation
- **PRD refs:** Access Control, NFR (privacy: "a client's vehicle data and service history are visible only to that client, their assigned service/mechanic, and holders of a valid share link")
- **Unlocks:** S-01 (north star) and, transitively, S-02 through S-05 — every downstream slice needs the role distinction and the RLS boundary this establishes; it also directly reduces the privacy guardrail risk named in PRD Success Criteria.
- **Prerequisites:** — (Supabase project already present per Baseline)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Is mechanic-side client visibility (FR-003) scoped per individual mechanic account, or per a separate "workshop/service" entity that could later hold multiple mechanics? PRD's FR-003 and Non-Goals both say "workshop/service" but Access Control never defines a workshop entity distinct from the mechanic account. — Owner: team (resolve during `/10x-plan` for F-01). Block: no — MVP scale (solo dev, `target_scale.users: small`) supports a safe default of one mechanic = one workshop; this only refines the RLS design, it doesn't stop planning.
- **Risk:** Gets the mechanic/client RLS boundary right before any domain CRUD exists, since a mistake here would violate the privacy guardrail across every downstream slice — worth sequencing first even though it ships nothing user-visible by itself.
- **Status:** ready

## Slices

### S-01: First service entry visible to client

- **Outcome:** A mechanic can add a client with their vehicle, log in, add a first service entry to it, and the client can log in and see that vehicle and entry in their history.
- **Change ID:** first-service-entry-visible-to-client
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Bundles the PRD's single Primary Success Criterion (add client+vehicle, add entry, mechanic-scoped list, client view) into one slice on purpose — splitting it further would mean shipping a "create" with no "view" to demo, defeating the point of a north star. If it proves too broad for one `/10x-plan` pass, split at the mechanic-side/client-side boundary.
- **Status:** proposed

### S-02: Mechanic edits service entry

- **Outcome:** A mechanic can edit a service entry they created, correcting a mistake without it staying wrong in the history indefinitely.
- **Change ID:** mechanic-edits-service-entry
- **PRD refs:** FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low risk; must respect the same RLS boundary as S-01 so a mechanic can't edit entries outside their own workshop's clients.
- **Status:** proposed

### S-03: Shareable vehicle history link

- **Outcome:** A client can generate a time-limited (24h) read-only share link showing service type and dates — never cost — for a prospective buyer.
- **Change ID:** shareable-vehicle-history-link
- **PRD refs:** FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nice-to-have; the 24h-expiry rule and the cost-hiding redaction (FR-005) are easy to get wrong, so the redacted-view contract needs its own explicit acceptance check.
- **Status:** proposed

### S-04: Client flags incorrect entry

- **Outcome:** A client can flag a service entry as incorrect, visible to the mechanic who created it.
- **Change ID:** client-flags-incorrect-entry
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nice-to-have; PRD defines no dispute-resolution workflow, so scope stays limited to "client flags, mechanic sees the flag" — no further automation.
- **Status:** proposed

### S-05: Next-service email reminder

- **Outcome:** A client receives an email reminder as the mechanic-declared next-service mileage/date point approaches.
- **Change ID:** next-service-email-reminder
- **PRD refs:** FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** New integration surface — tech-stack.md flags that the chosen starter has no built-in background-job support, so this needs a Cloudflare Cron Trigger plus an email-sending path that doesn't exist yet anywhere else in the codebase.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                             | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                   |
| ---------- | --------------------------------------- | --------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| F-01       | roles-and-domain-schema-foundation      | Add mechanic/client roles and domain schema with RLS            | yes                    | Run `/10x-plan roles-and-domain-schema-foundation` |
| S-01       | first-service-entry-visible-to-client   | Mechanic adds client+vehicle+entry; client sees it              | no                     | Blocked on F-01                            |
| S-02       | mechanic-edits-service-entry            | Mechanic can edit their own service entry                       | no                     | Blocked on S-01                            |
| S-03       | shareable-vehicle-history-link          | Client generates a 24h read-only share link                     | no                     | Blocked on S-01                            |
| S-04       | client-flags-incorrect-entry            | Client can flag an incorrect service entry                      | no                     | Blocked on S-01                            |
| S-05       | next-service-email-reminder             | Client gets an email reminder for the next service               | no                     | Blocked on S-01                            |

## Open Roadmap Questions

1. **What is the expected request rate (qps) and data volume?** — Owner: user. Block: none — carried over from `prd.md`'s Open Questions, but `tech-stack.md` has since sized the deployment for `target_scale.users: small` (Cloudflare free tier, ~10k-100k req/month), so this no longer gates any slice above.

## Parked

- **More than one vehicle per client** — Why parked: PRD Non-Goals; MVP supports exactly one vehicle per client.
- **Self-service client registration** — Why parked: PRD Non-Goals; clients are added only by a mechanic in MVP.
- **Integration with external workshop/CRM systems** — Why parked: PRD Non-Goals; no external integrations in MVP.
- **Native mobile app** — Why parked: PRD Non-Goals; MVP is web-only.
- **Cross-workshop history sharing** — Why parked: PRD Non-Goals and FR-003; tied to the workshop-scoping design decision left as an Unknown under F-01.

## Milestone History

(Empty — this is the first milestone.)

## Done

(Empty — no slice has been archived yet.)
