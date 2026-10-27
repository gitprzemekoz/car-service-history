---
change_id: deploy-db-push
title: Apply Supabase migrations in the deploy workflow before wrangler deploy
status: implemented
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

apply Supabase migrations (supabase db push) to the remote project in the deploy workflow before wrangler deploy, so production never runs code against a missing schema
