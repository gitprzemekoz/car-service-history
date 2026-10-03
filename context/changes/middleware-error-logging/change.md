---
change_id: middleware-error-logging
title: Structured error logging helper and middleware that fails loudly
status: implementing
created: 2026-10-03
updated: 2026-10-03
archived_at: null
---

## Notes

Wspólny helper strukturalnego logowania błędów + middleware rozróżnia błąd od braku danych (getUser, profil) i zwraca 503, plus try/catch wokół next() ze strukturalnym logiem. Zamyka D1, D2, D13 z context/audits/observability/2026-10-03_dashboard-entries.md (krok 1–2 zalecanej kolejności poprawek).
