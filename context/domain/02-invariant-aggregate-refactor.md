---
title: "Niezmiennik wpisu serwisowego — plan refaktoru do agregatu-strażnika"
created: 2026-10-13
type: refactor-plan
---

# Niezmiennik wpisu serwisowego — plan refaktoru do agregatu-strażnika

> To plan, a nie implementacja. Kod produkcyjny pozostaje bez zmian. Każde `plik:linia` sprawdziłem w repo 2026-10-13 (commit `838d2b5`).
> Skróty migracji jak w `01-domain-distillation.md`: **M1** = `supabase/migrations/20260922120000_roles_and_domain_schema.sql`, **M2** = `…20260923120000_service_entry_loop.sql`, **M3** = `…20260928130000_share_links.sql`, **M4** = `…20260929120000_service_entry_edits.sql`. **S01** = `context/archive/2026-09-23-first-service-entry-visible-to-client/plan-brief.md`, **S02** = `context/changes/mechanic-edits-service-entry/plan-brief.md`.

## 0. Kontekst

- **Wymagania:** `context/foundation/prd.md`. Najważniejsze są Success Criteria (`prd.md:35`, `:42`), FR-002/FR-006/FR-008 (`prd.md:62`, `:70`, `:72`) i jedyna sekcja Business Logic (`prd.md:81-83`). Wcześniejsza mapa domeny jest w `context/domain/01-domain-distillation.md`.
- **Stack:** Astro SSR + React na Cloudflare Workers, Supabase (Postgres + Auth + PostgREST).
- **Gdzie żyje logika:**
  - **Baza:** RLS decyduje o dostępie, a triggery i RPC pilnują części reguł (M1–M4).
  - **API:** `src/pages/api/**` to cienkie route'y POST→redirect, które wołają walidator.
  - **Walidacja/domena TS:** wszystko jest w `src/lib/validation.ts` i `src/lib/service-history.ts`. Nie ma osobnej warstwy domeny, a typy tylko odbijają wiersze tabel (`src/lib/types.ts:3`).
  - **UI:** `src/components/mechanic/ServiceEntryForm.tsx`.
- **Kluczowy fakt architektoniczny:** aplikacja łączy się z bazą kluczem anon i JWT użytkownika (`src/lib/supabase.ts:9`), a pod tymi samymi danymi PostgREST przyjmuje zapisy bezpośrednio. Twardą gwarancję daje więc tylko to, co egzekwuje baza. Walidator w route'cie API da się obejść.
- **Dyscyplina testów:** Vitest unit (`npm test`), DB-integration przeciw lokalnemu Supabase (`npm run test:db`, `vitest.db.config.ts`), HTTP i E2E. Wszystkie są bramkami CI (`context/foundation/test-plan.md:125-131`). Repo ma skill `/10x-tdd`, a faza 3 planu testów („Write-path abuse”, `test-plan.md:71`) ma status `not started`.

## 1. Niezmienniki biznesowe

| #   | Niezmiennik (MUSI być zawsze prawdziwy)                                                                                          | Źródło w dokumentach                                    | Źródło w kodzie                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| I1  | **Każdy zapisany wpis serwisowy to kompletna deklaracja serwisu:** typ, data (nie z przyszłości), przebieg ≥ 0, koszt ≥ 0 **oraz** co najmniej jeden punkt następnego serwisu (przebieg i/lub data), który leży *za* bieżącym serwisem. | `prd.md:54` (US-01 AC), `prd.md:62` (FR-002), `prd.md:81-83`; S01:29 | `validation.ts:89-129`; M1:111-116; M2:16                          |
| I2  | Wpisu nie da się utracić ani nadpisać bez śladu: każda realna edycja zostawia rewizję, a wpisów się nie usuwa                    | `prd.md:42`; S02:21, S02:25                              | M4:41-92; brak polityk DELETE (M1:120-166); kaskady M1:59, M1:109  |
| I3  | Wpis edytuje tylko jego autor; pojazd, autor i `created_at` są niezmienne                                                        | `prd.md:70` (FR-006); S02:27                             | M2:143-158; M4:48-52                                               |
| I4  | Następny serwis wyznacza **najnowszy** wpis pojazdu                                                                               | `prd.md:83`                                             | `src/lib/service-history.ts:49-59`                                 |
| I5  | Klient i jego mechanik widzą historię, nikt inny jej nie widzi                                                                   | `prd.md:41`, `:64`, `:76`                               | RLS M1:122-166, M2:126-158; `tests/db/rls-visibility.test.ts`      |
| I6  | Klient ma dokładnie jeden pojazd; pojazd powstaje atomowo z klientem                                                             | `prd.md:60`, `:96`                                      | M2:13, M2:165-189                                                  |
| I7  | Link udostępniający wygasa po 24h i nigdy nie pokazuje kosztu                                                                    | `prd.md:68`                                             | M3:108, M3:160, M3:167-180                                         |
| I8  | Rola konta jest nadawana raz i użytkownik nie może jej zmienić                                                                   | `prd.md:87-90`                                          | M2:60-63; M1:191-195                                               |

## 2. Klasyfikacja i wybór

Skala: (a) rdzeń, czyli jak blisko sensu produktu; (b) rozsmarowanie, czyli w ilu warstwach i plikach żyje reguła; (c) egzekucja: **egzekwowany** (baza nie pozwala go złamać), **deklarowany** (pilnuje jedna ścieżka) albo **naruszalny** (da się go złamać istniejącym kanałem).

| #   | (a) Rdzeń                                                                                                                         | (b) Rozsmarowanie                                                                                                   | (c) Egzekucja                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | **Najwyższy.** Primary Success Criterion polega na dodaniu wpisu (`prd.md:35`), a next-due jest wejściem jedynej reguły biznesowej (`prd.md:81-83`, FR-008 must-have) | **Wysokie:** 6 warstw / 9 plików (schemat, RLS, trigger, walidator, 2 route'y, formularz, typy, czytelnicy w UI)     | **Naruszalny.** Baza przyjmuje `cost = null` i brak obu `next_due_*`. Dowód: fixture `tests/db/fixtures.ts:70-80` zapisuje taki wpis kluczem anon i zapis przechodzi.                                                     |
| I2  | Wysoki (guardrail `prd.md:42`)                                                                                                    | Średnie (M4 + FK)                                                                                                   | Edycje są **egzekwowane** (M4). Usuwanie jest **deklarowane**: brak polityk DELETE, ale kaskada M1:109 zadziała kluczem serwisowym. Aplikacja nie ma ścieżki usuwania.                                                   |
| I3  | Wysoki                                                                                                                            | Niskie (RLS + trigger)                                                                                              | **Egzekwowany**                                                                                                                                                                                                          |
| I4  | Wysoki (Business Logic)                                                                                                           | Niskie (jeden helper)                                                                                               | **Deklarowany**, ale dziś nie ma drugiego konsumenta (FR-008 nie istnieje)                                                                                                                                               |
| I5  | Wysoki (guardrail)                                                                                                                | Średnie                                                                                                             | **Egzekwowany** i pokryty testem                                                                                                                                                                                         |
| I6  | Średni                                                                                                                            | Niskie                                                                                                              | Górne ograniczenie egzekwowany, dolne deklarowany                                                                                                                                                                        |
| I7  | Średni (nice-to-have)                                                                                                             | Niskie                                                                                                              | **Egzekwowany**                                                                                                                                                                                                          |
| I8  | Niski (generic)                                                                                                                   | Niskie                                                                                                              | **Egzekwowany**                                                                                                                                                                                                          |

### Wybór #1: I1 „Wpis serwisowy jest kompletną deklaracją serwisu”

- **Najbardziej rdzeniowy:** produkt istnieje po to, żeby wpis zastąpił papierowy zeszyt (`prd.md:20-22`) i żeby z wpisu wynikało przypomnienie (`prd.md:81-83`). Wpis bez next-due nie zasila jedynej reguły biznesowej. Wpis bez kosztu łamie US-01 AC (`prd.md:54`).
- **Najsłabiej egzekwowany wśród rdzeniowych:** I2, I3 i I5 egzekwuje baza. I4 jest deklarowany, ale ma jednego konsumenta. I1 pilnuje wyłącznie funkcja TS wywoływana w dwóch route'ach. Bazę zasilają też inne kanały (PostgREST z JWT mechanika, seed, fixtures, SQL editor), które tę funkcję omijają. Repo **już dziś** ma kod, który zapisuje wpis łamiący I1 (`tests/db/fixtures.ts:70-80`).
- **Blokuje kolejną pracę:** S-05 (FR-008) będzie czytał `next_due_*` z bazy. Jeśli I1 nie trafi do bazy, job przypomnień musi obsługiwać wpisy, których nie powinno być, albo po cichu je pomijać. To ten sam połykany błąd, tylko w innej warstwie.
- Mieszczą się w nim też I2 i I3 (edycja = nowa wersja wpisu, która również musi spełniać I1). Dlatego agregat obejmuje cały cykl życia wpisu, a nie tylko insert.

## 3. Diagnoza I1: gdzie dziś żyje reguła

### 3.1 Mapa per warstwa

| Warstwa                          | Miejsce                                                                                            | Co robi                                                                                                                                                         | Ocena                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Schemat                          | M1:111-112                                                                                         | `service_type`, `service_date` są `not null`                                                                                                                   | egzekwuje (część)                                                                        |
| Schemat                          | M2:16                                                                                              | `mileage integer not null check (mileage >= 0)`                                                                                                                 | egzekwuje (część)                                                                        |
| Schemat                          | M1:113                                                                                             | `cost numeric`: nullable, brak `check (cost >= 0)`                                                                                                              | **nie egzekwuje**                                                                        |
| Schemat                          | M1:115-116                                                                                         | `next_due_mileage integer`, `next_due_date date`: oba nullable, brak reguły „co najmniej jedno” i „za bieżącym”                                                 | **nie egzekwuje**                                                                        |
| RLS                              | M2:126-141 (insert), M2:143-158 (update)                                                           | sprawdza tylko autoryzację (autor, warsztat, rola), nie treść                                                                                                   | poza zakresem I1                                                                         |
| Trigger                          | M4:41-92                                                                                           | pilnuje niezmiennych kolumn (M4:48-52) i zapisuje rewizję (M4:64-87), ale przepuści edycję, która *usuwa* koszt lub next-due                                    | **nie egzekwuje** (edycja może zepsuć poprawny wpis)                                     |
| Walidator TS                     | `src/lib/validation.ts:89-129`                                                                     | jedyne pełne źródło reguły: typ (:89), data i brak przyszłości (:91-93), przebieg (:95-98), koszt (:100-103), co najmniej jeden next-due (:105-107), next-due za bieżącym (:115, :125) | egzekwuje, ale **tylko na tej ścieżce**                                                  |
| Walidator TS: „dziś”             | `validation.ts:43-48`, `:93`; wywołania `entries.ts:32`, `[entryId].ts:39`, `[id].astro:99`        | „dziś” to data w strefie runtime'u (Workers = UTC), a warsztat liczy dni w `Europe/Warsaw` (`service-history.ts:10`)                                           | **niespójne:** między 00:00 a 01:00/02:00 czasu warszawskiego dzisiejsza data jest „z przyszłości” |
| API: dodanie                     | `src/pages/api/clients/[id]/entries.ts:32-35`, `:38-48`                                            | woła walidator, potem `insert`                                                                                                                                  | strażnik ścieżki, nie danych                                                             |
| API: edycja                      | `src/pages/api/clients/[id]/entries/[entryId].ts:39-42`, `:46-58`                                  | woła walidator, potem `update` bez warunku wersji                                                                                                               | strażnik ścieżki; **brak ochrony przed lost update** (I2, „accidentally overwritten”)    |
| UI                               | `src/components/mechanic/ServiceEntryForm.tsx:24-38`                                               | sprawdza tylko pola wymagane (komentarz :24 przyznaje, że pełne reguły są na serwerze)                                                                         | UX, poprawnie nie jest jedynym strażnikiem                                               |
| Typy                             | `src/lib/types.ts:31`, `:33-34` (wiersz), `:64`, `:66-67` (wejście)                                | wiersz dopuszcza `cost: null` i oba `next_due_*: null`; typ wejścia nie wyraża reguły „co najmniej jedno”                                                       | model typów nie zna niezmiennika                                                         |
| Czytelnicy                       | `service-history.ts:45-47`, `:55-57`; `src/components/ServiceHistory.astro:39`, `:42`, `:45`; `edit.astro:33-35` | kompensują wpisy łamiące I1 (koszt „—”, next service `null`, puste pole w formularzu edycji)                                                                    | kod obronny, który utrwala stan nielegalny jako „normalny”                               |
| Fixtures testów                  | `tests/db/fixtures.ts:70-80`                                                                       | zapisuje wpis bez `next_due_*` i bez notatek kluczem anon jako mechanik                                                                                         | **dowód naruszalności**                                                                  |

### 3.2 Gdzie błąd jest połykany zamiast zatrzymywać operację

| Miejsce                                                    | Co się dzieje                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entries.ts:21-24`, `[entryId].ts:23-26`                  | `error` z odczytu profilu jest ignorowany. Awaria bazy daje redirect na `/dashboard`, który wygląda jak „brak uprawnień”.                                                                                                                                         |
| `entries.ts:27-30`                                        | `error` z odczytu pojazdu jest ignorowany. Awaria daje komunikat „Client not found”.                                                                                                                                                                              |
| `[entryId].ts:29-37`                                      | `error` z odczytu wpisu jest ignorowany. Awaria daje komunikat „Entry not found”.                                                                                                                                                                                 |
| `[entryId].ts:64-67`                                      | 0 zaktualizowanych wierszy oznacza „Entry not found”, więc „nie jesteś autorem” (RLS M2:146) nie różni się od „nie istnieje”. Dla prywatności to akceptowalne, ale domena nie ma nazwy dla tego przypadku.                                                        |
| `entries.ts:50-52`, `[entryId].ts:60-62`                  | Surowy `error.message` z Postgresa trafia do UI. Gdy pojawią się constrainty, użytkownik zobaczy np. `new row … violates check constraint …`, a nie komunikat domenowy.                                                                                          |

### 3.3 Podsumowanie diagnozy

- **Gdzie reguła jest egzekwowana:** tylko w `parseNewServiceEntry`, wywoływanym przez dwa route'y.
- **Które warstwy jej nie egzekwują:** schemat, RLS i trigger edycji.
- **Gdzie jest niespójna:** w pojęciu „dziś” (UTC kontra Warszawa) i w typach (wiersz kontra wejście).
- **Kto jest jedynym strażnikiem:** nie UI, tylko **serwerowy walidator TS**, który jest jedynym strażnikiem *ścieżki aplikacji*. Danych nie pilnuje nikt.
- **Gdzie błąd jest połykany:** w odczytach przed zapisem (§3.2).

## 4. Projekt agregatu-strażnika

### 4.1 Decyzja: gdzie stoi agregat

Agregat musi stać tam, gdzie żadnej ścieżki zapisu nie da się obejść. W tym stacku to **baza**: PostgREST przyjmuje zapisy z JWT użytkownika, a aplikacja nie ma klucza serwisowego. Projekt:

- **Agregat `ServiceEntry`** (root) z wewnętrzną encją `ServiceEntryRevision`. Pojazd i autor są referencjami po id, spoza agregatu. Granica jest mała, bo I1 dotyczy jednego wpisu. Reguły między wpisami (I4, ewentualnie niemalejący przebieg) wymagałyby roota `VehicleServiceHistory` i są poza tym planem.
- **Metody domenowe = dwie funkcje Postgresa**: `record_service_entry(...)` i `correct_service_entry(...)`. Każda sprawdza preconditions i zapisuje w jednej transakcji. Nielegalna operacja rzuca **nazwany błąd** (własny SQLSTATE `SE…`).
- **Bezpośrednie INSERT/UPDATE na `service_entries` zostają zamknięte** (usunięcie polityk M2:126-158). Jedynym wejściem są metody agregatu.
- **Deklaratywne constrainty** (`check`) mówią to samo co precondition, w części wyrażalnej per wiersz. Stanowią zabezpieczenie dla seedów i SQL editora (rola `postgres` omija RLS i funkcje). Nie są drugim źródłem reguły: ich naruszenie to błąd programisty (500), nigdy komunikat dla użytkownika.
- **TS:** `ServiceEntryRepository` (jedyne miejsce, które dotyka `service_entries` przy zapisie) oraz mapowanie SQLSTATE na nazwane błędy domenowe. `parseNewServiceEntry` zostaje parserem *składni* formularza (string → number/date). Reguły semantyczne wychodzą z TS do agregatu.

Odrzucona alternatywa: klasa `ServiceEntry` w TS jako jedyny strażnik. Odrzuciłem ją, bo PostgREST omija każdy kod TS. Musiałaby i tak dostać lustrzane reguły w bazie, a wtedy byłyby dwa źródła prawdy.

### 4.2 Nazwane błędy domenowe

| SQLSTATE | Nazwa (TS)                    | Precondition, którą łamie                                    | HTTP / UX                         |
| -------- | ----------------------------- | ------------------------------------------------------------ | --------------------------------- |
| `SE001`  | `ServiceTypeRequired`         | `trim(service_type) <> ''`                                   | 422 → komunikat przy polu         |
| `SE002`  | `ServiceDateInFuture`         | `service_date <= (now() at time zone 'Europe/Warsaw')::date` | 422                               |
| `SE003`  | `MileageNegative`             | `mileage >= 0`                                               | 422                               |
| `SE004`  | `CostRequired`                | `cost is not null and cost >= 0`                             | 422                               |
| `SE005`  | `NextServiceDueMissing`       | `next_due_mileage is not null or next_due_date is not null`  | 422                               |
| `SE006`  | `NextDueMileageNotAhead`      | `next_due_mileage is null or next_due_mileage > mileage`     | 422                               |
| `SE007`  | `NextDueDateNotAhead`         | `next_due_date is null or next_due_date > service_date`      | 422                               |
| `SE401`  | `NotAMechanic`                | rola wywołującego = `mechanic`                               | redirect `/dashboard`             |
| `SE404`  | `VehicleNotFound` / `EntryNotFound` | pojazd lub wpis należy do warsztatu wywołującego       | 404 / redirect z komunikatem      |
| `SE403`  | `NotEntryAuthor`              | `entry.mechanic_id = auth.uid()`                             | 403 (w UI może zostać „not found”) |
| `SE409`  | `StaleEntry`                  | `entry.updated_at is not distinct from p_expected_updated_at` | 409 → „Entry changed, reload”     |
| inne     | `InvariantBreach` / infra     | naruszenie `check` lub błąd połączenia                        | 500/503 + `logError`, bez ukrywania |

### 4.3 Metody agregatu (pseudokod plpgsql)

```text
-- Wspólna reguła treści: JEDNO miejsce w SQL, używane przez obie metody.
function service_entry_assert_valid(type, date, mileage, cost, next_mileage, next_date)
  if trim(coalesce(type,'')) = ''                         raise SE001
  if date > (now() at time zone 'Europe/Warsaw')::date     raise SE002
  if mileage is null or mileage < 0                        raise SE003
  if cost is null or cost < 0                              raise SE004
  if next_mileage is null and next_date is null            raise SE005
  if next_mileage is not null and next_mileage <= mileage  raise SE006
  if next_date is not null and next_date <= date           raise SE007

-- Komenda 1: nowy wpis.  security definer, search_path = public
function record_service_entry(p_client_id uuid, <7 pól>) returns uuid
  assert caller is mechanic                               else raise SE401
  v_vehicle := vehicles ⋈ clients
               where clients.id = p_client_id and clients.mechanic_id = auth.uid()
               for share                                   -- missing → SE404 VehicleNotFound
  service_entry_assert_valid(<7 pól>)
  insert into service_entries(vehicle_id, mechanic_id = auth.uid(), <7 pól>) returning id

-- Komenda 2: korekta (FR-006).  security definer, search_path = public
function correct_service_entry(p_client_id uuid, p_entry_id uuid,
                               p_expected_updated_at timestamptz, <7 pól>) returns void
  assert caller is mechanic                               else raise SE401
  v_entry := service_entries ⋈ vehicles ⋈ clients
             where entry.id = p_entry_id and clients.id = p_client_id
               and clients.mechanic_id = auth.uid()
             for update                                    -- missing → SE404 EntryNotFound
  if v_entry.mechanic_id <> auth.uid()                     raise SE403
  if v_entry.updated_at is distinct from p_expected_updated_at  raise SE409
  service_entry_assert_valid(<7 pól>)
  update service_entries set <7 pól> where id = p_entry_id
     -- istniejący trigger M4 w TEJ SAMEJ transakcji: rewizja + updated_at
     -- (albo no-op, gdy nic się nie zmieniło: S02:26)
```

Atomowość: odczyt z blokadą (`for update`), sprawdzenie wersji, walidacja, update i insert rewizji (trigger M4:64-89) wykonują się w jednym wywołaniu funkcji, czyli w jednej transakcji. Każdy `raise` wycofuje całość, więc nie powstaje ani częściowy wpis, ani osierocona rewizja.

Zabezpieczenie schematu (migracja): `check (cost is not null and cost >= 0)`, `check (next_due_mileage is not null or next_due_date is not null)`, `check (next_due_mileage is null or next_due_mileage > mileage)`, `check (next_due_date is null or next_due_date > service_date)`, `check (trim(service_type) <> '')`. Wszystkie zakładamy jako `NOT VALID`, a `VALIDATE` robimy po audycie danych (faza 2). Reguły „nie z przyszłości” nie da się zapisać jako `check`, bo zależy od czasu. Pilnuje jej tylko metoda.

### 4.4 Repozytorium (TS)

```ts
// src/lib/service-entries/errors.ts
export type ServiceEntryErrorCode =
  | "ServiceTypeRequired" | "ServiceDateInFuture" | "MileageNegative" | "CostRequired"
  | "NextServiceDueMissing" | "NextDueMileageNotAhead" | "NextDueDateNotAhead"
  | "NotAMechanic" | "VehicleNotFound" | "EntryNotFound" | "NotEntryAuthor" | "StaleEntry";

export class ServiceEntryError extends Error {
  constructor(readonly code: ServiceEntryErrorCode) { super(code); }
}
// Wszystko spoza mapy SQLSTATE → rzucamy dalej (500/503 przez middleware), nigdy "not found".
export function toServiceEntryError(e: PostgrestError): ServiceEntryError | never;

// src/lib/service-entries/repository.ts
export interface ServiceEntryRepository {
  record(clientId: string, input: ServiceEntryInput): Promise<string>;           // → entry id
  correct(clientId: string, entryId: string,
          expectedUpdatedAt: string | null, input: ServiceEntryInput): Promise<void>;
  load(clientId: string, entryId: string): Promise<ServiceEntry>;               // EntryNotFound | infra error
}
export function serviceEntryRepository(supabase: SupabaseClient): ServiceEntryRepository;
// record  → supabase.rpc("record_service_entry", …)
// correct → supabase.rpc("correct_service_entry", …)
// error  → toServiceEntryError(error) albo throw (fail-fast), NIGDY data=null → "not found"
```

`ServiceEntryInput` to wynik parsowania składni: wszystkie 7 pól, `cost: number`, a `nextDue` jako unia `{ mileage: number; date?: string } | { date: string; mileage?: number }`. Typ wyraża więc regułę „co najmniej jedno”. Wiersz `ServiceEntry` w `types.ts` dostaje `cost: number` i ten sam kształt `nextDue` dopiero po fazie 2 (`VALIDATE`), bo wcześniej istniejące dane mogą go łamać.

### 4.5 Cienki route

```ts
// src/pages/api/clients/[id]/entries/[entryId].ts (po refaktorze)
export const POST: APIRoute = async (context) => {
  // auth → redirect /auth/signin (bez zmian)
  const parsed = parseServiceEntryForm(await context.request.formData()); // tylko składnia
  if (!parsed.ok) return redirectWithError(editPage, parsed.error);

  try {
    await serviceEntryRepository(supabase).correct(clientId, entryId, parsed.expectedUpdatedAt, parsed.data);
    return context.redirect(clientPage);
  } catch (e) {
    if (e instanceof ServiceEntryError) return redirectWithError(editPage, messageFor(e.code));
    throw e; // infra/InvariantBreach → middleware: logError + 500/503 (#19)
  }
};
```

Zmiany względem dzisiaj:

- Znika ręczny odczyt profilu, pojazdu i wpisu (`[entryId].ts:23-37`), a z nim trzy miejsca połykania błędów. Jest też mniej round-tripów do bazy.
- `messageFor` to jedno mapowanie kodu na komunikat w `errors.ts`. Surowe `error.message` przestaje trafiać do UI.
- Formularz edycji wysyła ukryte pole `expectedUpdatedAt` z `entry.updated_at` (`edit.astro:37-47`).

## 5. Before / after, plan faz, testy

### 5.1 Before / after

| Miejsce dziś                                                            | Before                                                                 | After                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| M1:113 `cost numeric`                                                    | nullable, bez dolnej granicy                                           | `check (cost is not null and cost >= 0)`, najpierw `NOT VALID`, potem `VALIDATE`                            |
| M1:115-116 `next_due_*`                                                  | oba nullable, bez relacji do bieżącego serwisu                         | 3 constrainty (co najmniej jedno, przebieg dalej, data dalej) jako zabezpieczenie; reguła w `service_entry_assert_valid` |
| M2:126-141, M2:143-158 polityki INSERT/UPDATE                           | bezpośredni zapis z JWT mechanika                                      | polityki usunięte; zapis tylko przez `record_service_entry` / `correct_service_entry` (autoryzacja przeniesiona do funkcji 1:1) |
| M4:41-92 trigger                                                         | rewizja i niezmienne kolumny                                           | bez zmian; od teraz uruchamia go wyłącznie metoda `correct`                                                 |
| `validation.ts:89-129`                                                   | pełna reguła semantyczna                                               | `parseServiceEntryForm`: tylko składnia (wymagane, liczba, format daty); semantyka w agregacie              |
| `validation.ts:43-48`, `:93`; `[id].astro:99`                            | „dziś” w UTC runtime'u                                                 | „dziś” liczy agregat w `Europe/Warsaw`; formularz dalej podpowiada datę, ale nie rozstrzyga                 |
| `entries.ts:21-30`, `[entryId].ts:23-37`                                 | 2–3 odczyty, błędy połykane jako „not found”                           | jedno wywołanie repozytorium; nieznany błąd = throw                                                         |
| `entries.ts:38-52`, `[entryId].ts:46-67`                                 | `insert`/`update` i surowy `error.message` w UI                        | `repo.record` / `repo.correct` i `messageFor(code)`                                                         |
| `ServiceEntryForm.tsx:25-38`                                             | sprawdza pola wymagane                                                 | bez zmian (UX), plus ukryte `expectedUpdatedAt` w trybie edycji                                             |
| `types.ts:31`, `:33-34`, `:60-68`                                        | `cost: number \| null`, oba `next_due_*` opcjonalne                    | `ServiceEntryInput` z unią `nextDue`; wiersz zawężony po `VALIDATE`                                         |
| `service-history.ts:45-47`, `:55-57`; `ServiceHistory.astro:39,42,45`    | kompensują nielegalny stan                                             | po fazie 2: `formatCost(number)`; `nextService` zwraca `null` tylko dla pustej historii                     |
| `tests/db/fixtures.ts:70-80`                                             | bezpośredni `insert` łamiący I1                                        | `rpc("record_service_entry", …)` z next-due; `fixtures.ts:86-88` → `rpc("correct_service_entry", …)`        |
| `supabase/seed.sql:66-79`                                                | `insert` jako `postgres` (z next-due, zgodny)                          | bez zmian; constrainty go sprawdzają                                                                        |

### 5.2 Fazy refaktoru

| Faza | Zakres                                                                                                                                                                                                                                         | Test-first?                                    | Gotowe, gdy…                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0    | **Decyzje:** (a) co zrobić z istniejącymi wpisami bez `cost`/`next_due_*` (uzupełnienie przez mechanika, czy wyjątek z datą odcięcia); (b) potwierdzenie strefy `Europe/Warsaw` dla „dziś”                                                       | —                                              | odpowiedzi zapisane w `change.md` nowej zmiany (`/10x-new`)                                                              |
| 1    | **Red:** testy DB z §5.3 w `tests/db/service-entry-invariant.test.ts`. Dziś testy „nielegalne” przechodzą zapisem, więc są czerwone                                                                                                            | **tak** (`/10x-tdd`)                           | `npm run test:db` jest czerwony dokładnie na przypadkach nielegalnych                                                    |
| 2    | **Migracja A:** `service_entry_assert_valid`, metody `record_`/`correct_service_entry`, constrainty `NOT VALID`, zapytanie audytowe naruszeń, `VALIDATE` po decyzji z fazy 0                                                                    | **tak** (zielenią testy z fazy 1)              | testy nielegalnych przypadków rzucają oczekiwany `SE…`, legalne przechodzą                                               |
| 3    | **Repozytorium + błędy TS** (`src/lib/service-entries/`), unit testy mapowania SQLSTATE → `ServiceEntryError` i „nieznany kod = throw”                                                                                                         | **tak** (Vitest unit)                          | `npm test` zielony, w tym test, że `error` nie zamienia się w `null`                                                     |
| 4    | **Route'y i formularz:** odchudzenie `entries.ts` i `[entryId].ts`, `expectedUpdatedAt`, `parseServiceEntryForm`                                                                                                                               | częściowo (HTTP test redirectu z `messageFor`) | `npm run test:http` i E2E E3 zielone; ręcznie: konflikt 2 kart edycji daje „Entry changed”                               |
| 5    | **Migracja B: zamknięcie drzwi.** `drop policy service_entries_insert_mechanic / _update_mechanic`; aktualizacja fixture'ów                                                                                                                    | **tak** (test „bezpośredni insert = błąd”)     | `from("service_entries").insert(...)` jako mechanik zwraca błąd RLS; macierz `rls-visibility` bez regresji              |
| 6    | **Sprzątanie:** zawężenie typów wiersza, usunięcie kompensacji w czytelnikach                                                                                                                                                                  | nie (refaktor przy zielonych testach)          | `astro check` zielony; brak `cost === null` w `src/`                                                                     |

Kolejność ma znaczenie. Faza 5 idzie po fazie 4, bo zamknięcie polityk wcześniej zepsułoby działające route'y. Faza 6 idzie po `VALIDATE`, bo wcześniej typy kłamałyby wobec starych danych.

### 5.3 Przypadki testowe niezmiennika (`tests/db`, jako mechanik A, kluczem anon)

**Legalne:**

1. `record` z kompletem pól i tylko `next_due_mileage > mileage` zwraca id.
2. `record` z tylko `next_due_date > service_date` zwraca id.
3. `record` z `service_date` = dziś w Warszawie przechodzi także o 00:30 czasu warszawskiego. Test ustawia `now()` przez transakcję z `set local timezone`; alternatywnie testujemy samą funkcję z parametrem czasu.
4. `record` z `cost = 0` przechodzi (usługa gwarancyjna).
5. `correct` z poprawnym `expectedUpdatedAt` zmienia wpis, zapisuje dokładnie 1 rewizję i ustawia `updated_at`.
6. `correct` bez zmian treści nie tworzy rewizji, a `updated_at` się nie zmienia (S02:26).

**Nielegalne:**

7. `record` z `cost = null` daje `SE004`, a w tabeli nie przybywa wiersza.
8. `record` bez obu `next_due_*` daje `SE005`.
9. `record` z `next_due_mileage = mileage` daje `SE006`.
10. `record` z `next_due_date = service_date` daje `SE007`.
11. `record` z `service_date` = jutro (Warszawa) daje `SE002`.
12. `record` z pustym/białym `service_type` daje `SE001`.
13. `record` dla klienta mechanika B daje `SE404`, a w tabeli nie przybywa wiersza.
14. `record` wywołany przez klienta (rola `client`) daje `SE401`.
15. `correct` poprawnego wpisu z `cost = null` daje `SE004`, wpis pozostaje bez zmian i bez nowej rewizji. To test atomowości: dzisiejsza luka w triggerze M4.
16. `correct` z nieaktualnym `expectedUpdatedAt` daje `SE409`, wpis i rewizje bez zmian.
17. `correct` wpisu mechanika B daje `SE404`. Nie może przy tym wyciekać, czy wpis istnieje.
18. Bezpośredni `from("service_entries").insert(...)` i `.update(...)` jako mechanik kończą się błędem lub 0 wierszy (po fazie 5).
19. Jako `postgres` (seed) `insert` z `cost = null` łamie `check` (zabezpieczenie po `VALIDATE`).

**Unit (`src/lib/service-entries/errors.test.ts`):**

20. Każdy kod `SE…` mapuje się na właściwy `ServiceEntryErrorCode`.
21. Nieznany kod lub błąd sieci zostaje rzucony dalej, a nie zamieniony na `EntryNotFound`.

### 5.4 Nowe nazwy load-bearing

Projekt **nie ma** rejestru kontraktów: `docs/reference/contract-surfaces.md` nie istnieje, więc `/10x-init` go nie utworzył. Proponuję założyć go przy fazie 2 i wpisać:

| Nazwa                                                                                                  | Rodzaj                  | Kto od niej zależy                         |
| ------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------ |
| `record_service_entry(uuid, text, date, integer, numeric, text, integer, date)`                       | RPC (publiczne API DB)  | repozytorium, fixtures testów              |
| `correct_service_entry(uuid, uuid, timestamptz, text, date, integer, numeric, text, integer, date)`   | RPC                     | repozytorium, fixtures testów              |
| `service_entry_assert_valid(...)`                                                                      | funkcja SQL (wewnętrzna) | obie metody, przyszły import danych        |
| Kody `SE001`–`SE007`, `SE401`, `SE403`, `SE404`, `SE409`                                               | kontrakt błędów DB→TS   | `toServiceEntryError`, testy               |
| `service_entries_cost_required`, `service_entries_next_due_present`, `service_entries_next_due_mileage_ahead`, `service_entries_next_due_date_ahead`, `service_entries_service_type_present` | nazwy constraintów      | migracje, testy zabezpieczenia             |
| `ServiceEntryError`, `ServiceEntryErrorCode`, `ServiceEntryRepository`, `ServiceEntryInput`            | typy TS                 | route'y, przyszły job FR-008 (odczyt)      |
| pole formularza `expectedUpdatedAt`                                                                    | kontrakt HTML→API       | `ServiceEntryForm`, `edit.astro`, route    |
| strefa domenowa „dziś” = `Europe/Warsaw`                                                               | reguła czasu            | agregat, `service-history.ts:10`           |

### 5.5 Otwarte pytania

| Pytanie                                                                                               | Kto                   | Blokuje       |
| ----------------------------------------------------------------------------------------------------- | --------------------- | ------------- |
| Co z istniejącymi wpisami bez kosztu lub next-due? Wymusić uzupełnienie przy następnej edycji czy uznać za historyczny wyjątek? | właściciel produktu   | `VALIDATE` (faza 2) |
| Czy `cost = 0` jest legalny (gwarancja, poprawka)?                                                     | mechanik              | przypadek 4   |
| Czy `NotEntryAuthor` ma być widoczny w UI, czy maskowany jako „not found”? W MVP 1 mechanik = 1 warsztat, więc dziś się nie zdarza | właściciel produktu   | faza 4        |
| Czy kaskady M1:59 / M1:109 (I2) wchodzą w ten refaktor? Rekomendacja: nie, osobna zmiana po decyzji RODO z `01-domain-distillation.md` §5 | właściciel + prawnik  | —             |

## Podsumowanie

Za niezmiennik #1 wybrałem I1: „każdy zapisany wpis serwisowy jest kompletną deklaracją serwisu”, czyli koszt ≥ 0 oraz co najmniej jeden punkt next-due leżący za bieżącym serwisem. Jest najbardziej rdzeniowy, bo zasila Primary Success Criterion i jedyną regułę biznesową PRD (przypomnienia FR-008). Jednocześnie jest najsłabiej egzekwowany. Pilnuje go wyłącznie `parseNewServiceEntry` (`validation.ts:89-129`) wołany z dwóch route'ów. Schemat (M1:113-116), RLS i trigger edycji (M4) go nie sprawdzają, a fixture `tests/db/fixtures.ts:70-80` już dziś zapisuje łamiący go wpis bezpośrednio przez PostgREST. Diagnoza znalazła też niespójne „dziś” (UTC runtime'u kontra Warszawa) oraz trzy miejsca, w których błędy bazy są połykane jako „not found”. Proponowany agregat `ServiceEntry` stoi w bazie, bo w tym stacku tylko tam nie da się go obejść. Jego dwie metody (`record_service_entry`, `correct_service_entry`) sprawdzają preconditions, blokują wiersz, kontrolują wersję i zapisują rewizję w jednej transakcji, a każde naruszenie rzuca nazwany błąd `SE…`. Bezpośrednie INSERT/UPDATE zostają zamknięte, a constrainty `check` służą tylko jako zabezpieczenie. Strona TS sprowadza się do repozytorium z mapowaniem błędów i cienkich route'ów, które przy nieznanym błędzie rzucają dalej, zamiast udawać „not found”. Plan ma 7 faz (decyzje → red → migracja → repozytorium → route'y → zamknięcie drzwi → sprzątanie), z czego fazy 1, 2, 3 i 5 idą test-first na istniejących runnerach `test:db` i Vitest, według 21 przypadków testowych.
