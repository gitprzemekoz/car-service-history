# UI theme change to olive — Plan Brief

> Full plan: `context/changes/ui-theme-change-to-olive/plan.md`
> Research: `context/changes/ui-theme-change-to-olive/research.md`

## What & Why

Switch the app from its dark blue/purple "cosmic" look to a light olive theme generated on ui.shadcn.com as preset `b6thjh1sG`. The generated `shadcn init` command alone would barely change anything visible: the pages don't use the theme's colour variables. So the plan pairs a narrow preset apply with a migration of the markup to shadcn semantic tokens.

## Starting Point

shadcn is set up (`new-york`, neutral tokens in `src/styles/global.css`), but only `button.tsx` uses the tokens. Its single usage overrides the colour with purple. The 7 pages and ~12 components use hardcoded `white`/`blue`/`purple` classes on a `bg-cosmic` dark gradient.

## Desired End State

Every page is light olive, and all text is set in Manrope:
- cards are white with olive borders;
- primary buttons are dark olive, and links and focus rings are olive;
- errors use the destructive red, and the green/amber status labels are readable.

No blue/purple/white palette class (apart from shadcn's generated `button.tsx`) and no `bg-cosmic` remain in `src/`, so the next theme change is a CSS-only edit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Command | `shadcn apply --preset b6thjh1sG --only theme,font`, not `init --template astro` | `init` would switch to `sera` style, overwrite components.json and offer to reinstall components; `--template` only matters for new projects | Research |
| Preset scope | Theme + Manrope font; keep `new-york` style and `button.tsx` | Full look of the chosen preset without reinstalling or mixing component styles | Plan |
| Look | Light olive (`:root` tokens), drop the dark gradient | Uses the preset as designed; no dark-mode toggle to build or maintain | Plan |
| Markup | Migrate hardcoded classes to semantic tokens via one translation table | Makes olive visible everywhere and future theme swaps CSS-only | Plan |
| Status colours | Errors → `destructive` token; green/amber keep hue, darkened to 700; Banner info → theme tokens, warning keeps hex | Keeps status meaning recognisable while matching the theme | Plan |
| Dark mode | Not applied; `.dark` block left as generated | Nothing applies `.dark` today; a toggle is a separate feature | Plan |

## Scope

**In scope:**
- Preset tokens and font in `global.css`/`components.json`/`package.json`
- The 7 pages (landing, 3 auth, 3 dashboards)
- Auth components, `Topbar`, `ServiceHistory`, `AddServiceEntryForm`, `Banner`, `LibBadge`
- Removing `bg-cosmic`

**Out of scope:**
- `sera` style, component reinstall
- Dark mode or a toggle
- New status tokens
- Layout or copy changes
- Deleting the unused `LibBadge`
- Visual regression tooling

## Architecture / Approach

The CLI writes the olive oklch tokens and the Fontsource Manrope import. This was verified on a scratch copy: the apply changes only `components.json`, `package.json`, `package-lock.json` and `global.css`. Markup is then rewritten file by file with a fixed mapping. For example:
- a `white/10` card becomes `bg-card border-border`;
- a gradient heading becomes `text-foreground`;
- `text-blue-100/60` becomes `text-muted-foreground`;
- purple links and buttons become `primary`;
- red becomes `destructive`.

Only `class`/`className` strings and the Banner's scoped CSS change. No logic changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Apply olive tokens and Manrope font | Preset colours and font in place, style unchanged | CLI touching more files than expected — diff checked against a verified list |
| 2. Migrate the auth flow | Signin/signup/confirm pages, auth components and Banner on tokens | Error states losing contrast on light backgrounds |
| 3. Migrate landing and dashboards, remove `bg-cosmic` | Whole app olive; grep proves no hardcoded theme colours | Half-migrated look between phases; status labels readability |

**Prerequisites:** Clean working tree (commit the current change folder first), network access for `npx shadcn` and npm install.
**Estimated effort:** ~1–2 sessions across 3 phases (UI-only, ~19 files).

## Open Risks & Assumptions

- Between phases 1 and 3, unmigrated pages still look dark. This is accepted, and each phase is a coherent user flow.
- The preset's `.dark --sidebar-primary` stays blue. The sidebar is unused and `.dark` is inert, so this has no effect now.
- No automated visual tests exist, so correctness of the look relies on the manual checks in each phase.

## Success Criteria (Summary)

- Every page renders light olive with Manrope and readable text, including the error and status states.
- `grep` finds no `blue`/`purple`/`indigo`/`pink`/`white`/`black` palette classes (apart from shadcn's generated `button.tsx`) and no `bg-cosmic` in `src/`.
- Lint, unit tests, build and the smoke test pass.
