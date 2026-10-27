---
change_id: e2e-ci-timeouts
title: Stop the e2e CI job timing out on slow apt and Docker image downloads
status: implementing
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

the e2e CI job times out at 15 min on slow downloads (Ubuntu apt mirror during playwright install --with-deps, Docker Hub "toomanyrequests: Data limit exceeded" while pulling Supabase images) even though the tests pass in ~12s; make the job reliable, e.g. run in the official Playwright container image and authenticate/cache Docker image pulls
