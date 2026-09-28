# Migrate roadmap.md → GitHub Issues

## Context

The project's current task-management system is **file-based**: `context/foundation/roadmap.md`, generated and maintained by the `/10x-roadmap` skill. It already has a `## Backlog Handoff` table explicitly designed as "the clean handoff to Jira/Linear or any MCP-backed backlog" — one row per roadmap item (`F-NN`/`S-NN`), each with a Change ID and suggested issue title.

Target: `gitprzemekoz/car-service-history` on GitHub (confirmed via `gh repo view`, `gh auth status` — logged in as `gitprzemekoz`, scopes include `repo`). The repo currently has **zero issues, zero milestones**, and only the default label set (`bug`, `enhancement`, `documentation`, etc.).

Goal: convert the milestone **M-1: First usable service-history loop** (1 foundation + 5 slices) into GitHub Issues + a GitHub Milestone, then write the resulting issue numbers back into `roadmap.md`'s `## Backlog Handoff` table so the two stay cross-referenced.

## Mapping

| Roadmap concept | GitHub concept |
| --- | --- |
| Milestone `M-1: First usable service-history loop` | GitHub Milestone, same title |
| Each `F-NN` / `S-NN` | One GitHub Issue |
| `Outcome`, `PRD refs`, `Prerequisites`, `Parallel with`, `Unknowns`, `Risk`, `Change ID` | Structured sections in the issue body |
| Foundation vs. slice | Label `roadmap-foundation` / `roadmap-slice` |
| PRD FR priority (must-have vs. nice-to-have) | Label `priority-must-have` / `priority-nice-to-have` |
| Roadmap `Status` (ready/proposed) | Label `status-ready` / `status-proposed` |
| `Prerequisites` (dependency) | "Blocked by #N" line in body, added once the prerequisite issue's number is known (created in dependency order) |

Scope: only the 6 Backlog Handoff rows (`F-01`, `S-01`..`S-05`). The Open Roadmap Question and Parked items are **not** converted to issues — they stay in `roadmap.md` as-is (the open question is non-blocking per the roadmap, and Parked items are explicitly out of scope for this milestone).

## Steps

1. **Create labels** (6 new, via `gh label create`, skip if already present):
   - `roadmap-foundation` (#5319e7) — "Cross-cutting enabler from context/foundation/roadmap.md"
   - `roadmap-slice` (#0e8a16) — "Vertical user-visible slice from context/foundation/roadmap.md"
   - `priority-must-have` (#d93f0b)
   - `priority-nice-to-have` (#fbca04)
   - `status-ready` (#0e8a16)
   - `status-proposed` (#c5def5)

2. **Create the milestone**: `gh api repos/gitprzemekoz/car-service-history/milestones -f title="M-1: First usable service-history loop" -f description="..."` (description = the Milestone card's Intent line from roadmap.md).

3. **Create issues in dependency order** (F-01 → S-01 → S-02/S-03/S-04/S-05), via `gh issue create --title ... --body-file <tmp> --label ... --milestone "M-1: First usable service-history loop"`, capturing each returned issue number so later issues can reference `Blocked by #N`:
   - **F-01** → title `[F-01] Roles and domain schema foundation`, labels: `roadmap-foundation`, `priority-must-have`, `status-ready`
   - **S-01** → title `[S-01] First service entry visible to client`, labels: `roadmap-slice`, `priority-must-have`, `status-proposed`, body notes "Blocked by #<F-01>"
   - **S-02** → title `[S-02] Mechanic edits service entry`, labels: `roadmap-slice`, `priority-must-have`, `status-proposed`, "Blocked by #<S-01>"
   - **S-03** → title `[S-03] Shareable vehicle history link`, labels: `roadmap-slice`, `priority-nice-to-have`, `status-proposed`, "Blocked by #<S-01>"
   - **S-04** → title `[S-04] Client flags incorrect entry`, labels: `roadmap-slice`, `priority-nice-to-have`, `status-proposed`, "Blocked by #<S-01>"
   - **S-05** → title `[S-05] Next-service email reminder`, labels: `roadmap-slice`, `priority-must-have`, `status-proposed`, "Blocked by #<S-01>"

   Each body follows this template (content pulled verbatim from the corresponding roadmap.md section):
   ```
   **Roadmap ID:** F-01 · **Change ID:** `roles-and-domain-schema-foundation`

   ## Outcome
   <Outcome text>

   ## PRD refs
   <PRD refs>

   ## Prerequisites
   <Prerequisites, with #N links once known>

   ## Parallel with
   <Parallel with, with #N links once known — added in a follow-up edit pass after all 6 issues exist>

   ## Unknowns
   <Unknowns list, or "—">

   ## Risk
   <Risk text>

   ---
   Generated from `context/foundation/roadmap.md`, milestone **M-1: First usable service-history loop**.
   ```

4. **Second pass**: once all 6 issues exist, `gh issue edit` each one to fill in `Parallel with` cross-links (e.g. S-02's body gets "Parallel with #<S-03>, #<S-04>, #<S-05>") since those numbers aren't known until every sibling issue is created.

5. **Write back to `roadmap.md`**: update the `## Backlog Handoff` table's `Notes` column for all 6 rows to `→ #<issue-number>` (e.g. `→ #2`), replacing the current "Blocked on ..." text. Leave every other section of `roadmap.md` untouched.

## Verification

- `gh issue list --repo gitprzemekoz/car-service-history --milestone "M-1: First usable service-history loop"` → 6 issues, all open.
- `gh issue view <F-01 number> --repo gitprzemekoz/car-service-history` → confirm labels, milestone, and body render correctly.
- Spot-check one dependent issue (e.g. S-02) has a working "Blocked by #<S-01>" reference and the milestone link.
- Diff `context/foundation/roadmap.md` to confirm only the `Notes` column of `## Backlog Handoff` changed.
