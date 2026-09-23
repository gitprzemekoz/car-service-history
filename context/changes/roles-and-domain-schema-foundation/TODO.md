# TODO — follow-ups from manual code review

Findings from a manual `/code-review` pass over `78c3b4b..e943ad3` (this change's full implementation). None block the change as shipped; tracked here for a future pass.

- [x] **`src/middleware.ts:33-39` — Mechanic dashboard route is fail-open on a missing/failed profile lookup.** The gate only redirects a *confirmed client* away from `/dashboard/mechanic`; it never requires `role === "mechanic"` to get in. If the `profiles` select at line 17 errors or returns nothing (misconfigured Supabase, transient failure, a user row with no profile row), `context.locals.profile` is `null`, neither redirect condition matches, and the request falls through to `next()` — reaching the mechanic dashboard without a confirmed mechanic role. Low impact today (the page renders no domain data yet), but should be tightened to an explicit `role === "mechanic"` allow-check before S-01 puts real data behind this route.
- [x] **`src/middleware.ts:33,37` — Exact-match redirect misses a trailing slash.** `context.url.pathname === "/dashboard"` / `=== "/dashboard/mechanic"` don't match `/dashboard/` (trailing slash), so a mechanic hitting that variant lands on the generic client dashboard instead of being redirected.
- [x] **`src/middleware.ts:5` — Redundant `PROTECTED_ROUTES` entry.** `"/dashboard/mechanic"` is already covered by `"/dashboard"` via `.startsWith()`; the explicit second entry is dead weight and could mislead a future reader into thinking prefix coverage isn't already complete.
- [x] **`src/middleware.ts:17` — Profile lookup runs on every authenticated request, not just dashboard routes.** Adds one extra Supabase round-trip to every authenticated page/API load even where `context.locals.profile` is never consumed. Minor; worth scoping to protected routes if it shows up as real latency.

## Reviewed and not an issue

- `context/foundation/roadmap.md` showing F-01 as `in-progress` rather than `done` — **by design**. `/10x-implement` only ever advances a roadmap item to `in-progress`; only `/10x-archive` flips it to `done`. No action needed.
