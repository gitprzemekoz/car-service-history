---
project: "car-service-history"
context_type: greenfield
created: 2026-09-15
updated: 2026-09-15
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "data trapped in paper + service workflow friction + trust/verifiability, combined"
    - topic: "core insight"
      decision: "paper is a physical medium with no backup; a digital record removes the single point of failure and is portable across services"
    - topic: "primary persona"
      decision: "client/car owner is primary; mechanic/service is secondary"
    - topic: "access model"
      decision: "email+password login; two roles with different capabilities (mechanic writes, client reads); plus an unauthenticated tokenized share link for read-only history access"
  frs_drafted: 8
  quality_check_status: accepted
---

## Vision & Problem Statement

The vehicle's service history today exists only in a paper booklet: the client loses it, and even when it survives, an independent mechanic has no access to work done at other shops. The client cannot check what was done or what it cost without the physical document in hand, and at resale, proving the car's full service history to a prospective buyer is hard.

Paper is a physical medium with no backup — it is a single point of failure that a digital record removes. A digital, portable record also lets the client share verified history independent of which shop performed the work, including sharing it publicly (e.g. via a tokenized link) when selling the car.

## User & Persona

**Primary persona:** Client / car owner — wants to see their vehicle's full service history and costs from anywhere, and wants to be able to share that history (e.g. via a link) when selling the car.

### Secondary persona

Mechanic / service technician — needs quick access to a vehicle's prior service history (regardless of which shop performed it) when a client brings the car in.

## Access Control

Login via email + password for registered users. Two roles with distinct capabilities:

- **Mechanic / service** — can create and edit service entries for a vehicle.
- **Client / car owner** — read-only access to their own vehicle's(s') service history; cannot create/edit entries.

Additionally, a client can generate a public, tokenized share link that grants read-only access to a specific vehicle's service history to anyone holding the link, without requiring them to log in (e.g. to show history to a prospective buyer at resale).

## Success Criteria

### Primary
- A mechanic can add a vehicle (assigned to a client), log in, add a first service entry to it, and the client can log in and see that vehicle and service entry in their history.

### Secondary
- Client can generate a public tokenized link to share a vehicle's service history without requiring the viewer to log in.

### Guardrails
- One client cannot see another client's vehicles or service history (data privacy).
- Service entries cannot be lost or accidentally overwritten (history integrity).
- Client can access their vehicle's history from any device/location.

## User Stories

### US-01: Client sees a service entry added by a mechanic

- **Given** a mechanic is logged in and has added a client with their vehicle (one vehicle per client in MVP)
- **When** the mechanic adds a service entry for that vehicle (type of service, date, cost, notes)
- **Then** the client, upon logging in, sees that vehicle and the service entry in their service history

#### Acceptance Criteria
- Service entry captures at minimum: type of service, date, cost, notes
- Client sees only their own vehicle's history, never another client's data
- A newly added entry is visible to the client without any manual sync step

## Functional Requirements

- FR-001: Mechanic can add a new client together with their vehicle (one vehicle per client in MVP). Priority: must-have
  > Socratic: Counter-argument considered: "real clients often have more than one vehicle (e.g. a family), so a one-vehicle limit could block real adoption from day one." Resolution: kept at one vehicle per client for MVP; multi-vehicle support is deferred (see Non-Goals).
- FR-002: Mechanic can add a service entry linked to a client's vehicle, including the mileage/date interval at which the next service is recommended. Priority: must-have
  > Socratic: Counter-argument considered: "the mechanic has no way to fix a mistake in an entry, so an error would remain in the history indefinitely." Resolution: added FR-006 (mechanic can edit their own entry) to close this gap.
- FR-003: Mechanic can view the list of service entries only for clients assigned to their own workshop/service. Priority: must-have
  > Socratic: Counter-argument considered: "if any mechanic can view any client's history regardless of shop, that violates client privacy toward workshops the client never chose." Resolution: restricted visibility to clients assigned to the mechanic's own service, instead of a global open model.
- FR-004: Client can view their vehicle's service history. Priority: must-have
  > Socratic: Counter-argument considered: "the client has no way to flag an entry they believe is wrong, so an error would stay in the history indefinitely." Resolution: added FR-007 (client can flag an entry as incorrect) to close this gap.
- FR-005: Client can generate a time-limited (24h) shareable link granting read-only access to their vehicle's service history — showing service type and dates only, never cost — for a prospective buyer before selling the car. Priority: nice-to-have
  > Socratic: Counter-argument considered: "a shared link could expose repair costs the client may not want a buyer to see during negotiation." Resolution: the shared view never includes cost; it always shows service type and dates only.
- FR-006: Mechanic can edit a service entry they created. Priority: must-have
- FR-007: Client can flag a service entry as incorrect, visible to the mechanic who created it. Priority: nice-to-have
- FR-008: Client receives an email reminder when the next-service point (mileage/date, as declared by the mechanic) is approaching. Priority: must-have

## Business Logic

The app reminds the client of an upcoming service based on the mileage/date interval that the mechanic declares when logging each service entry.

The rule consumes the mileage and date of the last service entry together with the next-due mileage/date the mechanic declared for that entry. Its output is a reminder that the recommended next-service point is approaching or has been reached. The client encounters this as an email notification prompting them to book a service before that point.

## Non-Functional Requirements

- A client's vehicle data and service history are visible only to that client, their assigned service/mechanic, and holders of a valid share link — never to other clients or unrelated mechanics.
- A client can access their vehicle's service history from any device with an internet connection, from any location.

## Non-Goals

- More than one vehicle per client — MVP supports exactly one vehicle per client; multi-vehicle support is deferred.
- Self-service client registration — clients are added only by a mechanic; there is no client self-signup in MVP.
- Integration with external workshop/CRM systems — no integration with existing shop software in MVP.
- Native mobile app — MVP is web-only; no native iOS/Android app.
- Cross-workshop history sharing — per FR-003, a mechanic sees only clients assigned to their own service; there is no open, cross-workshop visibility model in MVP.

## Quality cross-check

All required elements are present: Access Control, Business Logic (one-sentence rule), Project artifacts, Timeline-cost acknowledgment (mvp_weeks ≤ 3), and Non-Goals. No gaps to carry into `/10x-prd` Open Questions.
