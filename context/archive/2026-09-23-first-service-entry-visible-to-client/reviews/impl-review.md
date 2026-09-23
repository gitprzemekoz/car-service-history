# Implementation Review — first-service-entry-visible-to-client

- **Plan:** `context/changes/first-service-entry-visible-to-client/plan.md`
- **Reviewed phases:** 1, 2, 3, 4 (all phases in `## Progress`)
- **Reviewed range:** `c50ed0c..9dee1c0` (Phase 1 `c50ed0c`, Phase 2 `a1814bd`, Phase 3 `12c9228`, Phase 4 `0342886`, epilogue `9dee1c0`)
- **Method:** manual review against the plan (per-phase after Phase 3, full cross-phase after Phase 4)
- **Date:** 2026-09-23
- **Verdict:** approved. Implementation conforms to the plan; all findings below are non-blockers and remain open.

## Findings (non-blockers)

- [ ] **`supabase/migrations/20260923120000_service_entry_loop.sql` — Unplanned but necessary drop of `profiles_update_own`.** Phase 1 removed the self-update policy on `profiles` so users cannot change their own `role`. Without it a client could promote themselves to `mechanic` and pass every new role-gated insert/update policy. The plan did not call this out; it is documented only in the migration comment and the Phase 1 commit message. Candidate for `/10x-lesson`: when gating writes on `profiles.role`, remove any policy that lets users update their own profile.
- [ ] **`src/pages/api/clients/index.ts` — Duplicate-email error reveals other workshops' clients.** The unique index `clients_email_key` spans all mechanics, so mechanic B adding an email already registered by mechanic A gets "A client with this email already exists", confirming that person is someone else's client. Follows from the plan's single-workshop-per-client decision; revisit before S-02/S-03 widen the surface.
- [ ] **`src/pages/api/clients/[id]/entries.ts`, `src/pages/dashboard/mechanic/clients/[id].astro` — "Today" is the server's calendar date.** `parseNewServiceEntry(form, new Date())` and the form's default date use `toLocalIsoDate` on the server, which is UTC on Cloudflare Workers. Between local midnight and ~02:00 (Poland), the default date shows yesterday and entering the real date is rejected as a future date. Matches the plan as written (`new Date()`); fix by passing the client's local date or a workshop timezone. Candidate for `/10x-lesson`.
- [ ] **`src/pages/api/clients/index.ts`, `src/pages/api/clients/[id]/entries.ts` — Raw database errors reach `?error=`.** Any RPC/insert failure other than a unique violation passes the Postgres message through (e.g. `new row violates row-level security policy…`). Allowed by the plan; consider mapping to a generic message and logging the original.
- [ ] **`src/pages/dashboard/mechanic/clients/[id].astro` — Any lookup error renders 404.** `data` is `null` both for "not visible under RLS" (intended) and for real query failures (e.g. database down), so outages show as "Client not found".
- [ ] **`src/components/mechanic/AddClientForm.tsx`, `src/components/mechanic/AddServiceEntryForm.tsx` — Form input lost on server-side validation errors.** The native POST + redirect pattern (inherited from `SignUpForm`) reloads the page with empty fields. UX only.
- [ ] **Commits `12c9228`, `0342886`, `9dee1c0` — Missing `Refs:` line.** The Phase 1 commit carries `Refs: https://github.com/gitprzemekoz/car-service-history/issues/2`; later commits do not. Not worth a history rewrite — reference the issue in the PR / archive step instead.

## Reviewed and not an issue

- `vehicles` embed handled as array-or-object in all three pages — defensive by design: one-vehicle-per-client is a unique *index*, so PostgREST may not infer a one-to-one relationship.
- `cost` rendered with `toFixed(2)` — manual check 3.7 confirmed PostgREST returns `numeric` as a JSON number locally.
- Client dashboard filters `.eq("user_id", user.id)` on top of RLS — intentional, since `clients_select_mechanic` would also match for a mechanic (who is redirected away by middleware anyway).
