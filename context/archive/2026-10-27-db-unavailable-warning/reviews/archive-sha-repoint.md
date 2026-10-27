# Archive SHA repoint

## 2026-10-27

- **Target:** `origin/main` @ `460249cf70f39beb032313f5765009f18ca32cbe` (fetched before archive)
- **Integration commit:** `460249c` "Show a warning on the main page when the database is unavailable (#24)"
- **Association:** PR https://github.com/gitprzemekoz/car-service-history/pull/24 (merged, base `main`, squash). Its commit list contains `f98e6b9` and `1f25bea`.
- **Evidence / scope:** the squash commit's tree is identical to the PR head `09e645b`; it adds the health endpoint (`src/pages/api/health.ts`, `src/lib/db-health.ts`), the main-page warning and their unit/HTTP/E2E tests. Neither branch commit is an ancestor of the target.
- **Decision:** user chose "Update and archive".

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1 | f98e6b9 (f98e6b96dee1ce5d626f37346302218dced687a1) | 460249c |
| 1.2 | f98e6b9 (f98e6b96dee1ce5d626f37346302218dced687a1) | 460249c |
| 1.3 | f98e6b9 (f98e6b96dee1ce5d626f37346302218dced687a1) | 460249c |
| 1.4 | f98e6b9 (f98e6b96dee1ce5d626f37346302218dced687a1) | 460249c |
| 1.5 | f98e6b9 (f98e6b96dee1ce5d626f37346302218dced687a1) | 460249c |
| 2.1 | 1f25bea (1f25bea6c891c1b2f5d0a0c680cb3de0853101f6) | 460249c |
| 2.2 | 1f25bea (1f25bea6c891c1b2f5d0a0c680cb3de0853101f6) | 460249c |
| 2.3 | 1f25bea (1f25bea6c891c1b2f5d0a0c680cb3de0853101f6) | 460249c |
| 2.4 | 1f25bea (1f25bea6c891c1b2f5d0a0c680cb3de0853101f6) | 460249c |
| 2.5 | 1f25bea (1f25bea6c891c1b2f5d0a0c680cb3de0853101f6) | 460249c |

Rows repointed: 10
