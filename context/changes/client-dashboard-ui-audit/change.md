---
change_id: client-dashboard-ui-audit
title: Audit and improve the client dashboard view
status: implemented
created: 2026-09-26
updated: 2026-09-26
archived_at: null
---

## Notes

- **View (only one):** `/dashboard` — `src/pages/dashboard.astro` + `src/components/ServiceHistory.astro`.
- **Token source:** `src/styles/global.css` (`:root` / `.dark` values, published via `@theme inline`; olive palette from `ui-theme-change-to-olive`). Extend it — do not introduce a second palette.
- **Component catalog:** `src/components/ui/` (shadcn, `components.json`); currently only `button.tsx` + `LibBadge.astro`. New primitives via `npx shadcn add <name>`.
- **Goal:** full audit → charges list in `charges.md` is the plan input.
- **Scope guard:** `ServiceHistory.astro` is also rendered by `src/pages/dashboard/mechanic/clients/[id].astro`; any change there must be checked on that page too. Mechanic dashboard's duplicated header/button is out of scope (deferred).
- **Dark mode:** `.dark` values exist but nothing toggles the class — light theme only for the gate; not in scope.
