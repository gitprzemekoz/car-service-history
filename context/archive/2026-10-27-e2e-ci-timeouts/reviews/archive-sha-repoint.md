# Archive SHA repoint

## 2026-10-27

- **Target:** `origin/main` @ `8defe12`
- **Integration commit:** `8defe12` "CI: stop e2e timing out on slow apt and ECR image downloads (#22)"
- **PR:** https://github.com/gitprzemekoz/car-service-history/pull/22 (merged, squash, base `main`; PR commits `971826f`, `eb80005`)
- **Evidence:** `git diff eb80005 8defe12` is empty; the squash carries the PR's 5 files (`.github/workflows/ci.yml`, `context/changes/e2e-ci-timeouts/{change,research,plan,plan-brief}.md`). `971826f` is not an ancestor of the target; `8defe12` is.
- **Decision:** user chose "Update and archive".

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1 | `971826f` (fix(e2e-ci-timeouts): CI workflow skips apt deps, caches the browser and pulls Supabase images from ghcr.io (p1)) | `8defe12` |
| 1.2 | `971826f` (same) | `8defe12` |
| 1.3 | `971826f` (same) | `8defe12` |
| 1.4 | `971826f` (same) | `8defe12` |

Rows repointed: 4.
