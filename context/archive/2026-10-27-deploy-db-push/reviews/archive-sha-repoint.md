# Archive SHA repoint

## 2026-10-27

- **Target:** `origin/main` @ `f4bc86c` (`f4bc86cfb0ace39b1d9769be2c0ad05302d4bc00`)
- **Integration commit:** `f4bc86c` "Deploy: apply Supabase migrations before wrangler deploy (#20)"
- **PR:** https://github.com/gitprzemekoz/car-service-history/pull/20 (merged, squash, base `main`; PR commits `19740c4`, `dc77e1d`)
- **Evidence:** `git diff dc77e1d f4bc86c` is empty; the squash carries the PR's 5 files (`README.md`, `package.json`, `scripts/deploy.mjs`, `context/changes/deploy-db-push/{change,plan}.md`). `19740c4` is not an ancestor of the target; `f4bc86c` is.
- **Decision:** user chose "Update and archive".

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1 | `19740c4` (`19740c4` feat(deploy-db-push): Deploy script runs migrations before wrangler deploy (p1)) | `f4bc86c` |
| 1.2 | `19740c4` (same) | `f4bc86c` |

Rows repointed: 2.
