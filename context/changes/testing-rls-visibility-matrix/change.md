---
change_id: testing-rls-visibility-matrix
title: RLS visibility matrix and CI test gate (test-plan Phase 1)
status: implementing
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "RLS visibility matrix + test gate".
Risks covered: #2 (an RLS policy or migration change hides a client's own data, or exposes another client's / another workshop's data). Test types planned: DB integration (Vitest + local Supabase), CI gate (run `npm test` in CI).
Risk response intent: #2 — prove a role x resource matrix where each role (client, mechanic) reads exactly its own rows and foreign rows return zero rows; challenge "authenticated means authorized" and "empty result means correct result"; avoid querying with the service-role key (bypasses RLS) or mocking Supabase.
After creating the folder, follow the downstream continuation rule.
