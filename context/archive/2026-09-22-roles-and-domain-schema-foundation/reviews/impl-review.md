# Implementation Review — roles-and-domain-schema-foundation

- **Plan:** `context/changes/roles-and-domain-schema-foundation/plan.md`
- **Reviewed phases:** 1, 2, 3 (all phases in `## Progress`)
- **Reviewed range:** `78c3b4b..e943ad3` (Phase 1 `78c3b4b`, Phase 2 `9d80b44`, Phase 3 `69c8480`, epilogue `e943ad3`)
- **Method:** manual `/code-review` pass
- **Date:** 2026-09-23
- **Verdict:** approved. No finding blocks the change; all findings fixed in `38aa8da`.

## Findings

- [x] **`src/middleware.ts:33-39` — Mechanic dashboard route is fail-open on a missing/failed profile lookup.** The gate only redirects a *confirmed client* away from `/dashboard/mechanic`; it never requires `role === "mechanic"` to get in. If the `profiles` select at line 17 errors or returns nothing (misconfigured Supabase, transient failure, a user row with no profile row), `context.locals.profile` is `null`, neither redirect condition matches, and the request falls through to `next()` — reaching the mechanic dashboard without a confirmed mechanic role. Low impact today (the page renders no domain data yet), but should be tightened to an explicit `role === "mechanic"` allow-check before S-01 puts real data behind this route. — fixed in `38aa8da`
- [x] **`src/middleware.ts:33,37` — Exact-match redirect misses a trailing slash.** `context.url.pathname === "/dashboard"` / `=== "/dashboard/mechanic"` don't match `/dashboard/` (trailing slash), so a mechanic hitting that variant lands on the generic client dashboard instead of being redirected. — fixed in `38aa8da`
- [x] **`src/middleware.ts:5` — Redundant `PROTECTED_ROUTES` entry.** `"/dashboard/mechanic"` is already covered by `"/dashboard"` via `.startsWith()`; the explicit second entry is dead weight and could mislead a future reader into thinking prefix coverage isn't already complete. — fixed in `38aa8da`
- [x] **`src/middleware.ts:17` — Profile lookup runs on every authenticated request, not just dashboard routes.** Adds one extra Supabase round-trip to every authenticated page/API load even where `context.locals.profile` is never consumed. Minor; worth scoping to protected routes if it shows up as real latency. — fixed in `38aa8da`

## Reviewed and not an issue

- `context/foundation/roadmap.md` showing F-01 as `in-progress` rather than `done` — **by design**. `/10x-implement` only ever advances a roadmap item to `in-progress`; only `/10x-archive` flips it to `done`.
