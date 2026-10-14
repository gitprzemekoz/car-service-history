# Opportunity Map

## Context

- **Project / context**: proces review pull requestów w zespole (GitHub)
- **Data constraint**: mock / lokalne / read-only, niewrażliwe
- **Date**: 2026-10-14

## Map

| Signal                                                                                    | Existing / default response                                                                        | Thin complement                                                                       | First useful version                                 | Data risk                                | Direction if valuable                                                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| PR-y czekają kilka dni na review (brak reviewera, PR za duży/niejasny, przeciążeni reviewerzy) | `CODEOWNERS` + auto-assign zespołu, szablon PR, scheduled reminders GitHub→Slack; SaaS (Swarmia, LinearB) | Raport czekających PR-ów: wiek, rozmiar, brak reviewera, liczba czekających review na osobę | Lokalny skrypt na `gh` CLI → raport markdown na żądanie | read-only, niewrażliwe (metadane PR-ów) | Narzędzie wewnętrzne → Review / CI gate; albo wait, jeśli ustawienia GitHuba wystarczą |

### Przyczyny: których da się uniknąć, a które są prawdziwe

- **Brak przypisanego reviewera**: da się tego uniknąć. Rozwiązuje to `CODEOWNERS` z automatycznym przypisaniem; nic nie trzeba budować.
- **PR za duży lub niejasny**: w dużej mierze da się tego uniknąć. Pomagają szablon PR, etykiety rozmiaru i automatyczne podsumowanie PR; w ostateczności sprawdzanie rozmiaru w CI.
- **Przeciążeni reviewerzy**: problem prawdziwy, bo brakuje czasu albo review ma niski priorytet. Pomaga umowa zespołu (ustalony czas na pierwszą reakcję, limit otwartych PR-ów na osobę). Narzędzie może najwyżej pokazać to obciążenie.

## Recommended First Candidate

**Krok 0 (zanim cokolwiek zbudujesz):** włącz `CODEOWNERS` z automatycznym przypisaniem, szablon PR i scheduled reminders na Slacku. Ustal w zespole maksymalny czas oczekiwania na pierwszą reakcję. Obserwuj efekt przez 2–3 tygodnie.

Jeśli PR-y nadal wiszą:

```text
Candidate:
Raport czekających PR-ów

Reads:
GitHub API przez gh CLI (otwarte PR-y, reviewerzy, rozmiar diffu,
daty pierwszego review); na start jedno repozytorium

Returns:
Raport markdown generowany na żądanie:
- PR-y bez reviewera
- PR-y czekające dłużej niż 24 h, posortowane od najstarszego
- PR-y powyżej progu rozmiaru (np. 400 linii)
- liczba czekających review na każdą osobę

Does not do:
Nie przypisuje reviewerów, nie pisze na Slacku, nie komentuje PR-ów,
nie blokuje merge'a, nie działa według harmonogramu

Data risk:
read-only, metadane PR-ów; wystarczy token z uprawnieniem do odczytu

Direction if it proves valuable:
Narzędzie wewnętrzne → Review / CI gate
```

## Why This Candidate

Przypomnienia mówią tylko, że PR czeka. Raport pokazuje też, dlaczego czeka: brak reviewera, zły rozmiar albo przeciążenie konkretnej osoby. Dzięki temu widać, którą przyczynę trzeba atakować. Jeśli ustawienia GitHuba z kroku 0 rozwiążą problem, raport nie jest potrzebny i to też jest dobry wynik.

Zastrzeżenie: mapa ma jeden sygnał, więc nie było porównania kandydatów. Dopisz kolejne sygnały, gdy się pojawią.

## Next Direction If Valuable

**Review / CI gate:** bramka rozmiaru PR w CI i ustalony czas na review. Później ewentualnie działanie asynchroniczne (raport wysyłany automatycznie na kanał zespołu).

Następny krok: `/10x-mom-test`. Sprawdź w rozmowach z zespołem, opierając się na tym, co faktycznie się działo, które z trzech przyczyn naprawdę dominują. Jeśli problem się obroni: `/10x-shape` → `/10x-prd` → `/10x-roadmap`.
