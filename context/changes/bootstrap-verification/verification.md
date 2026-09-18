---
bootstrapped_at: 2026-09-18T06:58:10Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: car-service-history
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: car-service-history
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
```

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

## Pre-scaffold verification

| Signal             | Value                                          | Severity | Notes                              |
| ------------------- | ---------------------------------------------- | -------- | ----------------------------------- |
| npm package        | not run                                        | n/a      | `cmd_template` starts with `git clone`; no npm package to resolve |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-09-12 | fresh    | from card `docs_url`               |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: full scaffold tree (`.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `AGENTS.md`, `CLAUDE.md` (see conflict below), `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `scripts/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (cwd already had a CLAUDE.md from the tech-stack-selector/bootstrapper skill chain; existing wins)
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (after removing the cloned `.git/` per git-clone strategy)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not distinguished — 0 findings total (377 prod, 269 dev, 167 optional dependencies; 0 advisories)

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ----------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                               |
| path_taken                 | standard                           |
| self_check_answers         | null                                |
| team_size                  | solo                                |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge                |
| has_auth                   | true                                |
| has_payments               | false                               |
| has_realtime               | false                               |
| has_ai                     | false                               |
| has_background_jobs        | true                                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. In this run: `CLAUDE.md.scaffold` carries the starter's own agent-rules file; diff it against your existing `CLAUDE.md` and merge anything useful (e.g. Astro/Supabase/Cloudflare-specific conventions) before deleting it.
- Address audit findings per your project's risk tolerance — none were found in this run.
- FR-008 (service-reminder email / background job) has no built-in support in this starter — plan a Cloudflare Cron Trigger + Supabase function manually, per the hand-off's `## Why this stack` rationale.
