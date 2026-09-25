<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI theme change to olive

- **Plan**: context/changes/ui-theme-change-to-olive/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Focus indicators too faint on the light background

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css:121 (`* { @apply border-border outline-ring/50 }`), src/components/auth/FormField.tsx:6,53, src/components/mechanic/AddServiceEntryForm.tsx:130
- **Detail**: The inputs use `focus:outline-none focus:ring-2 focus:ring-ring`, but the olive `--ring` (L 0.737) is only about 2.3:1 against white, below the WCAG 1.4.11 minimum of 3:1. Hand-rolled links and buttons (Topbar, Welcome CTAs, sign-out, client list) fall back to the browser outline coloured `ring/50`, which is about 1.5:1 and nearly invisible. On the old dark background this didn't matter; on the light theme it is a regression.
- **Fix A ⭐ Recommended**: Darken `--ring` in `:root` to about L 0.55 and change `outline-ring/50` to `outline-ring` in `@layer base`.
  - Strength: A single CSS edit fixes every input and hand-rolled control at once, and the tokens stay the single source of truth.
  - Tradeoff: It departs from the preset value, so a future `shadcn apply` would overwrite it.
  - Confidence: MED — the contrast figures are computed from OKLCH L and were not measured in a browser.
  - Blind spot: The `button.tsx` `ring-ring/50` focus ring gets darker too; this has not been checked visually.
- **Fix B**: Leave the tokens alone; on the inputs use `focus:ring-primary`, and move the hand-rolled buttons to `buttonVariants` (see F3).
  - Strength: The preset tokens stay untouched.
  - Tradeoff: Many edits across files, and links still use the faint outline.
  - Confidence: MED — this fixes inputs and buttons, not plain links.
  - Blind spot: The Topbar and back links would still need their own focus style.
- **Decision**: PENDING

### F2 — `--muted-foreground` is below WCAG AA for small text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css (`:root --muted-foreground`), used in src/components/ServiceHistory.astro:21-27, src/pages/dashboard/mechanic.astro:67
- **Detail**: The olive `oklch(0.58 0.031 107.3)` gives about 4.3:1 on white and 3.9–4.1:1 on `bg-muted/50`, below 4.5:1 for `text-sm`/`text-xs`. The old neutral value (0.556) gave about 4.8:1.
- **Fix**: Darken `--muted-foreground` in `:root` to about `oklch(0.53 0.031 107.3)`.
  - Strength: One token change covers every secondary text.
  - Tradeoff: It departs from the preset, and `shadcn apply` would overwrite it.
  - Confidence: MED — the contrast figures are computed, not measured.
  - Blind spot: Not checked visually against the olive `bg-muted`.
- **Decision**: PENDING

### F3 — Hand-rolled buttons diverge from `buttonVariants`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:48, src/pages/dashboard/mechanic.astro:46, src/components/Welcome.astro:29,35 (plus Topbar sign-out)
- **Detail**: The sign-out and CTA buttons copy the table's classes (`rounded-lg`, no focus-visible ring, no `shadow-xs`). `SubmitButton` now uses the real `Button` (`rounded-md h-9`). The same control therefore looks different on different pages, and the copies lack the focus styles from `button.tsx`.
- **Fix**: In Astro, `import { buttonVariants } from "@/components/ui/button"` and use `class={buttonVariants({ variant: "outline" })}` / `buttonVariants({ size: "lg" })` for the CTAs.
  - Strength: One source of button styling, and the focus ring comes from `button.tsx` for free (it partly covers F1).
  - Tradeoff: Changes rounding and height slightly on those pages; goes a bit beyond the plan's pure translation table.
  - Confidence: HIGH — `buttonVariants` is exported from button.tsx and can be used in .astro files.
  - Blind spot: Not checked whether `<form>` buttons in Astro keep their layout.
- **Decision**: PENDING

### F4 — Progress 3.6 ticked while smoke test was 7/8

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-theme-change-to-olive/plan.md (Progress 3.6), scripts/smoke.mjs:56
- **Detail**: "dashboard renders for signed-in user" returns 302 → /dashboard/mechanic, because a fresh signup gets the mechanic role (the src/middleware.ts role gate predates this change). The user accepted it, and it is recorded in change.md and the commit 2e3a664 body, but the smoke script is still stale.
- **Fix**: Queue a follow-up to update the smoke.mjs expectation (accept 200 or a 302 to /dashboard/mechanic, or create a client-role user).
- **Decision**: PENDING

### F5 — Leftover star-field decoration in Welcome

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/Welcome.astro:12-15
- **Detail**: The inline `style` with `rgba(255,255,255,…)` radial gradients still exists but is invisible on the light background, so it is dead markup. The class grep 3.1 can't see it. (The copy "cosmic developer experience" at :24 also stays, which the plan allows.)
- **Fix**: Remove the star-field div.
- **Decision**: PENDING

### F6 — Secondary text hierarchy flattened

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:41-42, src/pages/dashboard/mechanic.astro:39-40, src/pages/dashboard/mechanic/clients/[id].astro:65, src/components/Topbar.astro:5
- **Detail**: Following the table (`text-blue-100/80` → `text-foreground`), "Signed in as …", the client email on the detail page and the vehicle summaries are now full foreground. The same email is `text-muted-foreground` in the mechanic list, so the two views are inconsistent.
- **Fix**: Change these secondary metadata lines to `text-muted-foreground`.
- **Decision**: PENDING

### F7 — Client-list hover almost invisible

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard/mechanic.astro:63
- **Detail**: `bg-muted/50 hover:bg-accent`: `--accent` equals `--muted` (L 0.966), so the hover only moves from 50% to 100% of an almost-white colour.
- **Fix**: Add `hover:border-primary/40` (or use `hover:bg-secondary`) on the row.
- **Decision**: PENDING
