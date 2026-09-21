---
project: car-service-history
researched_at: 2026-09-21
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: js
  framework: astro
  runtime: cloudflare-workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers scored 5/5 Pass across all agent-friendly criteria (CLI-first via `wrangler`, fully managed/serverless, best-in-class agent-readable docs via `llms.txt`, deterministic deploy/rollback API, GA remote MCP support) and its free tier comfortably covers the project's expected 10k-100k monthly requests at near-zero cost. The interview found no persistent-connection requirement, no strong platform familiarity, and single-region users — none of which favor an alternative — while the tech-stack hand-off already targets Cloudflare (`deployment_target: cloudflare-pages`), so this recommendation formalizes and corrects that starting point rather than reversing it. The anti-bias cross-check surfaced real risks (see below); the user reviewed them and chose to proceed with Cloudflare, tracked in the risk register.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Notes |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass (`llms.txt`/`llms-full.txt`, GA) | Pass (`wrangler deploy`/`rollback`/`tail`, GA) | Pass (GA remote MCP) | Best overall score; free tier covers ~3M req/month; requires using Workers (not Pages, which is in legacy/frozen state) and watching the 10ms CPU-time/invocation free-tier limit. |
| Vercel | Pass | Pass | Fail (docs not published as markdown/on GitHub) | Pass | Pass (GA hosted MCP) | Strong all-around; Hobby (free) plan is non-commercial-only and caps cron at once-daily with imprecise timing — usable for the FR-008 reminder but not for commercial use without Pro ($20/mo). |
| Railway | Partial (rollback to an arbitrary deploy is dashboard-only) | Pass | Pass (`llms-full.txt`, GA) | Pass | Pass (GA, official) | Solid container-based alternative with no per-request CPU ceiling; has a documented IPv6 gotcha connecting directly to Supabase (must use the session pooler) and a ~$5-15/mo estimated cost. |
| Netlify | Partial (rollback dashboard-only) | Pass | Partial (pages available as `.md` but no confirmed `llms.txt`) | Pass | Pass (GA, official) | Scheduled Functions — needed for the must-have FR-008 email reminder — remain in **beta**, and Netlify itself recommends against relying on them for production-critical workflows. Excluded from shortlist mainly on this risk. |
| Fly.io | Partial (rollback = manual redeploy of a prior image, no single command) | Pass (Machines are managed VMs) | Partial (source on GitHub but HTML/templated, not plain markdown) | Partial | Partial (MCP tooling exists but is early/rapidly evolving) | No meaningful free tier anymore (~$7-15/mo for web + cron process); cron needs a second always-on machine for exact scheduling. |
| Render | Partial (rollback path not clearly documented via CLI) | Pass | Fail (no `llms.txt`; only a narrow agent-skills repo) | Pass | Pass (GA, official hosted) | Free tier spins down after 15 min idle — unsuitable for reliable production reminders; needs Starter ($7/mo). |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Highest score across all five criteria, cheapest at this traffic scale, and the strongest agent-tooling story (native `llms.txt` docs, GA remote MCP, deterministic `wrangler` CLI for deploy/rollback/logs). The stack is already scaffolded toward Cloudflare, so this keeps continuity while correcting the target from the legacy `Pages` product to `Workers`.

#### 2. Vercel

Excellent developer experience and a first-class Astro adapter, but two real gaps versus Cloudflare: no agent-readable docs mirror (fails criterion 3), and the free Hobby tier is restricted to non-commercial use with once-daily, imprecisely-timed cron — workable for FR-008 but a ceiling if the project becomes commercial or needs tighter scheduling.

#### 3. Railway

Runs Astro as a plain Node container, avoiding Cloudflare's per-request CPU-time ceiling entirely. Good agent-doc support and GA MCP server. Held back by a documented IPv6 connectivity gotcha to Supabase (must use the pooler connection string) and a rollback flow that isn't scriptable from the CLI.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. The project is already scaffolded with `deployment_target: cloudflare-pages` in `tech-stack.md`; a real deploy requires migrating to `wrangler deploy` (Workers) instead of the existing Pages-oriented flow, adding rework risk to the CI setup (GitHub Actions with `auto-deploy-on-merge`).
2. The free plan's 10ms CPU-time-per-invocation limit is tight for SSR pages that round-trip to an external Supabase Postgres instance; the MVP will likely exceed it during early testing, forcing an early move to the $5/mo paid plan rather than only at scale.
3. Supabase Postgres is single-region while Workers run at the edge; a region mismatch adds latency to every SSR request unless Hyperdrive is configured — an extra service to set up correctly.
4. Some npm packages (potentially including email or Supabase-adjacent libraries) require the `nodejs_compat` flag to run on Workers; incompatibilities may only surface during implementation, not during planning.
5. The free-tier Cron Trigger limits were not fully verified against Cloudflare's dedicated limits page during research — worth a manual check before relying on it for FR-008.

### Pre-Mortem — How This Could Fail

The team deployed Astro on Cloudflare Workers for the vehicle service-history MVP. Six months later, the decision turned out to be a source of real friction. The developer assumed the existing `cloudflare-pages` scaffold would work on Workers unchanged — in practice, migrating the adapter and CI configuration took longer than expected, eating a week out of the three-week budget. After launch, SSR pages that queried Supabase regularly exceeded the free plan's CPU-time limit, forcing an emergency upgrade to the paid plan mid-testing with early users. The Cron Trigger responsible for FR-008 (service reminders) silently stopped firing for two weeks because the developer wasn't actively watching `wrangler tail` output, and the `scheduled()` handler's failure produced no visible alert. Clients reported never receiving their reminder emails, undermining confidence in the MVP right before a planned demo.

### Unknown Unknowns

- Cloudflare Pages is formally in a frozen/legacy state (not removed, but not recommended for new builds) — easy to miss that the project should target `Workers` directly rather than continuing the `Pages` path the bootstrapper chose.
- The 10ms CPU-time-per-invocation limit is invisible during local development (it doesn't apply locally) and only becomes visible after a real deploy.
- Debugging a Cron Trigger requires actively running `wrangler tail` at the moment it fires — there's no default alert for a silently failing scheduled job.
- WebSocket Hibernation (if ever needed later) only works for inbound connections, not outbound — a non-obvious limitation if scope expands.
- The Astro-Cloudflare adapter's API has changed across versions (dropped `hybrid` mode, changed env access) — upgrading Astro may require manual adapter reconfiguration, not a plain `npm update`.

## Operational Story

- **Preview deploys**: Each PR/branch push can get a preview URL via `wrangler versions upload` or Cloudflare's Git integration; protect preview URLs with Cloudflare Access if they should not be publicly reachable, since fork PRs may not have secrets available.
- **Secrets**: Environment variables and secrets (Supabase keys) live in Workers Secrets (`wrangler secret put`), separate from `wrangler.toml`; only project collaborators with Cloudflare dashboard/API access can read them. Rotate by re-running `wrangler secret put` and redeploying.
- **Rollback**: `wrangler rollback [<deployment-id>]` instantly reverts to a prior version (or the previous deploy if no ID given). No database rollback is implied — any Supabase schema migrations tied to the reverted code must be handled separately.
- **Approval**: A human should approve production deploys and any Workers Secret rotation. An agent may safely run `wrangler deploy` to a preview/staging environment and read logs/status unattended; production promotion and secret changes stay human-approved given they're hard to reverse cleanly.
- **Logs**: `wrangler tail` streams live logs with filters; `wrangler deployments list` shows the last 10 deploys for read-only audit. No MCP tool substitutes for actively watching `wrangler tail` during a Cron Trigger's scheduled fire time — this is the concrete mitigation for the silent-cron-failure risk below.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Migrating existing `cloudflare-pages` scaffold to `wrangler`/Workers deploy flow takes longer than budgeted | Devil's advocate | M | M | Do the Workers migration early (before feature work), not at the end of the 3-week budget; verify `wrangler deploy` succeeds before building further features on top. |
| Free-tier 10ms CPU-time-per-invocation limit is exceeded by SSR pages querying Supabase | Devil's advocate / Pre-mortem | H | M | Budget for the $5/mo Workers Standard plan from the start rather than assuming free tier suffices; monitor CPU time via `wrangler tail` during early testing. |
| Cron Trigger for FR-008 (service reminder) fails silently | Pre-mortem / Unknown unknowns | M | H | Add a lightweight success/failure log line in the `scheduled()` handler and check it manually after each deploy; consider a simple external uptime check (e.g. a ping service) hitting a status endpoint after the cron window. |
| Region mismatch between Cloudflare edge and single-region Supabase adds SSR latency | Devil's advocate | M | L | Pick a Cloudflare-adjacent Supabase region if configurable; use Hyperdrive if latency becomes noticeable post-launch — not required for MVP launch. |
| npm package incompatibility with Workers runtime (missing `nodejs_compat`) | Devil's advocate | L | M | Enable `nodejs_compat` in `wrangler.toml` proactively; test the email-sending library used for FR-008 early, since it's the most likely dependency to need Node APIs. |
| Astro-Cloudflare adapter API changes on version upgrades | Unknown unknowns | L | L | Pin the `@astrojs/cloudflare` adapter version; re-check its changelog before any Astro major-version upgrade. |
| Free-tier Cron Trigger limits not fully confirmed during research | Devil's advocate | L | L | Manually verify current limits at `developers.cloudflare.com/workers/platform/limits/` before finalizing the FR-008 implementation. |

## Getting Started

1. Confirm the Astro Cloudflare adapter targets Workers output, not the legacy Pages integration: `npx astro add cloudflare` (or verify `@astrojs/cloudflare` is already installed per `package.json`), and set `output: 'server'` in `astro.config.mjs`.
2. Update `wrangler.toml`/`wrangler.jsonc` for a Workers deployment (not Pages), enabling `nodejs_compat` if any dependency needs it.
3. Authenticate and deploy: `npx wrangler login`, then `npx wrangler deploy`.
4. Store Supabase credentials as Workers Secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (or the appropriate keys), rather than committing them to `wrangler.toml`.
5. Add a Cron Trigger for the FR-008 email reminder in `wrangler.toml` (`[triggers] crons = [...]`) and implement the `scheduled()` handler; verify it fires using `npx wrangler tail` during the trigger window before relying on it.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
