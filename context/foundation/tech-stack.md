---
starter_id: 10x-astro-starter
package_manager: npm
project_name: car-service-history
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
---

## Why this stack

A solo, after-hours 3-week MVP for tracking vehicle service history across two roles
(mechanic, client) needs auth, a relational data model, and low ops overhead from day
one. 10x Astro Starter is the recommended default for `(web-app, js)` and bundles
Supabase (Postgres + auth + storage) with Cloudflare edge deployment, clearing all four
agent-friendly gates with `first-class` bootstrapper confidence. The starter has no
built-in background-job support, so the FR-008 service-reminder email will be added
manually post-scaffold (e.g. a Cloudflare Cron Trigger calling a Supabase function) —
no alternative in the registry for this product type and language family solves that
better. CI runs on GitHub Actions with auto-deploy-on-merge, matching the starter's
default shape.
