---
title: "Supabase jako przeciekająca zależność — plan warstwy antykorupcyjnej (ACL)"
created: 2026-10-13
type: refactor-plan
---

# Supabase jako przeciekająca zależność — plan warstwy antykorupcyjnej (ACL)

> To plan, a nie implementacja. Kod produkcyjny pozostaje bez zmian. Każde `plik:linia` sprawdziłem w repo 2026-10-13 (commit `838d2b5`). Wersje bibliotek odczytałem z `node_modules`: `@supabase/supabase-js` 2.116.0 (`auth-js` i `postgrest-js` w tej samej wersji) oraz `@supabase/ssr` 0.12.7.
> Skróty migracji jak w `01-domain-distillation.md`: **M1** = `supabase/migrations/20260922120000_roles_and_domain_schema.sql`, **M2** = `…20260923120000_service_entry_loop.sql`, **M3** = `…20260928130000_share_links.sql`, **M4** = `…20260929120000_service_entry_edits.sql`. **P02** = `context/domain/02-invariant-aggregate-refactor.md`.

## 0. Kontekst (krok 0)

- **Dokumenty bazowe:** `context/foundation/prd.md`, `tech-stack.md`, `infrastructure.md`, `README.md` oraz wcześniejsze prace domenowe `01-domain-distillation.md` i P02.
- **Stack:** Astro 7 SSR + React (wyspy) na Cloudflare Workers (`astro.config.mjs:7`, `:16`), Supabase jako Postgres + Auth + PostgREST (`tech-stack.md:26-28`, `README.md:13`, `README.md:76`).
- **Zależności zewnętrzne** (`package.json`), pogrupowane według tego, czy mogą przeciekać:
  - **dostęp do danych i tożsamość:** `@supabase/supabase-js`, `@supabase/ssr`;
  - **runtime i framework:** `astro`, `@astrojs/cloudflare`, `@astrojs/react`, `react`;
  - **UI:** `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss`;
  - **dev:** `supabase` (CLI), `wrangler`, `vitest`, `@playwright/test` i inne.
- **Warstwy kodu.** Repo nie ma jawnej warstwy domeny ani infrastruktury:
  - **Middleware:** `src/middleware.ts` ustala sesję i profil.
  - **API (zapis):** `src/pages/api/**` to route'y POST→redirect.
  - **Strony SSR (odczyt):** `src/pages/**/*.astro` same wykonują zapytania.
  - **„Lib” (półdomena):** `src/lib/` zawiera `types.ts`, `service-history.ts`, `share-link.ts`, `validation.ts`, `session-state.ts`, `supabase.ts`.
  - **UI:** komponenty Astro renderowane po stronie serwera (`src/components/*.astro`) i wyspy React (`src/components/**/*.tsx`).
- **Deklaracje o wymienialności.** Szukałem fraz `swap|replace|vendor|lock-in|portab|adapter|abstract|isolat|decoupl|wymien` w `context/foundation/*.md`, `README.md` i `context/domain/*.md`. **Żaden dokument nie deklaruje wprost, że Supabase ma być wymienialny.** Dokumenty zapowiadają jednak zmiany, które uderzają w kontrakt tej biblioteki, a kod nie jest na nie przygotowany. Szczegóły w §3.4.

## 1. Identyfikacja przeciekających zależności (krok 1)

### L1. Supabase (`@supabase/supabase-js`, `@supabase/ssr` oraz kontrakt PostgREST/GoTrue, czyli kształt wierszy, kody błędów i semantyka embedów)

**Pliki, które dziś „znają” Supabase** (import, typ, wywołanie SDK, kod błędu albo kształt odpowiedzi PostgREST):

| Warstwa | Plik:linia | Co zna |
| --- | --- | --- |
| Fabryka klienta | `src/lib/supabase.ts:1`, `:5-20` | `createServerClient`, `parseCookieHeader`, sygnaturę zwracającą `SupabaseClient \| null` |
| Typy globalne (kontrakt `App.Locals`) | `src/env.d.ts:6` | `import("@supabase/supabase-js").User` w `Locals.user` |
| Klasyfikacja sesji | `src/lib/session-state.ts:1-2`, `:5-9`, `:12`, `:16-23`, `:25-36` | `isAuthApiError`, `isAuthSessionMissingError`, typy `AuthError`, `PostgrestError` i `User` w unii stanów, kod `PGRST116` |
| Middleware | `src/middleware.ts:6`, `:11`, `:26`, `:41` | `createClient`, `auth.getUser()`, `.from("profiles").select("role").eq().single()` |
| API auth | `src/pages/api/auth/signin.ts:2`, `:9-13`, `:16` · `signup.ts:2`, `:9-13`, `:16` · `signout.ts:2`, `:5-7` | `auth.signInWithPassword`, `auth.signUp`, `auth.signOut`, surowy `error.message` |
| API zapis | `src/pages/api/clients/index.ts:2`, `:5`, `:13-16`, `:20`, `:31-37`, `:40-41`, `:45-46` | `rpc("create_client_with_vehicle")` z nazwami parametrów `p_*`, SQLSTATE `23505`, rzutowanie nietypowanego wyniku RPC |
| | `src/pages/api/clients/[id]/entries.ts:2`, `:14-17`, `:21`, `:27`, `:38-48`, `:51` | lookup profilu, `.from("vehicles")`, `insert` z kolumnami snake_case, surowy `error.message` |
| | `src/pages/api/clients/[id]/entries/[entryId].ts:2`, `:16-19`, `:23`, `:29-34`, `:46-58`, `:61`, `:64-65` | embed `vehicles!inner(client_id)`, `update().select()`, semantykę „RLS blokuje = 0 wierszy bez błędu” |
| | `src/pages/api/share-link/index.ts:2`, `:10-13`, `:17`, `:19` · `revoke.ts:2`, `:10-13`, `:16`, `:18` | `rpc("create_share_link")`, `rpc("revoke_share_link")`, surowy `error.message` |
| Strony SSR | `src/pages/dashboard.astro:4`, `:11-14`, `:18-28`, `:32`, `:36-40` | embed `vehicles(… service_entries(*))`, normalizację „tablica albo obiekt”, `.from("share_links")` |
| | `src/pages/dashboard/mechanic.astro:5`, `:10-13`, `:18-26`, `:31-34` | to samo dla listy klientów |
| | `src/pages/dashboard/mechanic/clients/[id].astro:5`, `:13-16`, `:21-30`, `:39` | to samo dla jednego klienta |
| | `src/pages/dashboard/mechanic/clients/[id]/entries/[entryId]/edit.astro:4`, `:12-23`, `:31`, `:37-47` | embed `!inner`, wynik typu `any` (`:15`), mapowanie wiersza na pola formularza |
| | `src/pages/share/[token].astro:5`, `:16`, `:19`, `:22-23` | `rpc("get_shared_vehicle_history", { p_token })`, rzutowanie `jsonb` |
| Typy „domenowe” | `src/lib/types.ts:3-4`, `:6-50` | Wiersze tabel w snake_case: „as returned by supabase-js selects” (`:3`) |
| Logika półdomenowa | `src/lib/service-history.ts:1`, `:26-29`, `:50-58` · `src/lib/share-link.ts:1`, `:72-73`, `:76-77` | Operują na wierszach (`service_date`, `created_at`, `next_due_*`, `expires_at`) i na formacie tokenu z `create_share_link()` |
| UI (Astro, SSR) | `src/components/ServiceHistory.astro:3`, `:27`, `:42`, `:45`, `:49-50` · `ClientDashboardView.astro:7`, `:11`, `:15`, `:75` · `ShareLinkCard.astro:6`, `:9`, `:56` · `SharedHistoryView.astro:4`, `:27`, `:39` · `Topbar.astro:2`, `:8` · `mechanic.astro:82-94` | Kolumny snake_case i `User.email` z obiektu biblioteki |
| UI (wyspy React, bundel klienta) | `src/pages/auth/signin.astro:12`, `signup.astro:12`, `dashboard/mechanic.astro:107`, `clients/[id].astro:108-109`, `edit.astro:77-78` | Surowy tekst błędu Supabase z `?error=` trafia do propsa `serverError` i do payloadu hydracji |
| Konfiguracja | `src/lib/config-status.ts:1`, `:13-15` | Nazwę dostawcy i zmienne `SUPABASE_*` |
| Testy | `src/lib/session-state.test.ts:1-8`, `:14` · `tests/db/clients.ts:1`, `:5-9` | Klasy błędów SDK. `tests/db` celowo testuje RLS bezpośrednio przez SDK, patrz §6 |

**Razem:** 27 plików w `src/`: 26 produkcyjnych (w tym 5 komponentów UI, które znają kształt wiersza) i 1 test. Obejmują wszystkie pięć warstw.

### L2. Astro runtime w „lib” (`astro`, `astro:env`)

- `src/lib/supabase.ts:2-3` (`AstroCookies`, `astro:env/server`) i `src/lib/config-status.ts:1`.
- Dotyka 2 plików, a framework jest stałym wyborem (`tech-stack.md:26`). Po refaktorze zostaje wyłącznie w adapterze L1.

### L3. Cloudflare (`@astrojs/cloudflare`, `wrangler`)

- Występuje tylko w `astro.config.mjs:7`, `:16` i `wrangler.jsonc`. Kod aplikacji nie importuje niczego z Cloudflare. **Nie przecieka.**

### L4. Biblioteki UI (`radix`, `cva`, `lucide`, `clsx`, `tailwind-merge`)

- Występują tylko w `src/components/**` i `src/lib/utils.ts`. Nie przechodzą do API, middleware ani logiki. **Nie przeciekają**, bo to warstwa, do której należą.

## 2. Klasyfikacja i wybór #1 (krok 2)

| Zależność | (a) Warstwy / pliki | (b) Ryzyko i koszt wymiany dziś | (c) Intencja w dokumentach vs kod | Ocena |
| --- | --- | --- | --- | --- |
| **L1 Supabase** | **5/5 warstw**, 26 plików produkcyjnych w `src/` | **Wysoki.** Zmiana sposobu dostępu (np. Hyperdrive i sterownik Postgres zamiast PostgREST) albo nawet tylko metody auth (`getUser` → `getClaims`) dotyka middleware, 8 route'ów, 5 stron, `types.ts` i wszystkich komponentów historii. Kształt wiersza snake_case jest kontraktem UI. | Brak wprost deklarowanej wymienialności. Dokumenty zapowiadają jednak zmiany kontraktu (Hyperdrive: `infrastructure.md:50`, `:81`; koszt CPU wywołań do Supabase: `infrastructure.md:49`, `:79`; FR-008 jako cron wołający „Supabase function”: `tech-stack.md:29-31`), a P02 już projektuje repozytorium przyjmujące `SupabaseClient` (P02:184-195). Kod nie ma miejsca, w którym takie zmiany dałoby się zrobić lokalnie. | **#1** |
| L2 Astro w lib | 1 warstwa, 2 pliki | Niski: framework jest wybrany na stałe | Brak | rozwiązuje się przy okazji L1 |
| L3 Cloudflare | 0 warstw kodu | Niski: tylko konfiguracja | `infrastructure.md` rozważa alternatywy (Railway, `:25`, `:42`), ale kod jest już odizolowany | brak przecieku |
| L4 UI | 1 warstwa (właściwa) | Niski | Brak | brak przecieku |

**Wybór #1: L1 Supabase.** Wybrałem go z trzech powodów:

1. **Zasięg.** To jedyna zależność obecna we wszystkich warstwach, od globalnego typu `App.Locals` (`env.d.ts:6`) po markup komponentów (`ServiceHistory.astro:27`).
2. **Duplikacja.** Ta sama wiedza o kontrakcie PostgREST jest skopiowana w 3–8 miejscach (§3.1).
3. **Kontrakt wire.** Surowe komunikaty SDK są dziś częścią kontraktu URL (`?error=`) i propsów wysp React. Zmiana biblioteki albo nawet jej wersji zmienia więc to, co widzi użytkownik.

Oś (c) nie jest tu rozjazdem „dokument deklaruje wymienialność”. Jest rozjazdem „dokumenty zapowiadają zmianę kontraktu Supabase, a kod nie ma miejsca, w którym da się ją zrobić” (§3.4).

## 3. Diagnoza (krok 3)

### 3.1 Duplikacja wiedzy o bibliotece

| # | Wiedza | Kopie (plik:linia) | Skutek |
| --- | --- | --- | --- |
| D1 | „Klient może być `null`, bo brak konfiguracji” | API: `signin.ts:9-12`, `signup.ts:9-12`, `signout.ts:5-8`, `clients/index.ts:13-16`, `entries.ts:14-17`, `[entryId].ts:16-19`, `share-link/index.ts:10-13`, `revoke.ts:10-13`. Strony: `dashboard.astro:18`, `:22`; `mechanic.astro:18`, `:21`; `clients/[id].astro:21`, `:24`; `edit.astro:12`, `:16`; `share/[token].astro:16`, `:19` | 13 kopii tego samego rozgałęzienia. Komunikat „Supabase is not configured” wycieka do URL w 7 route'ach |
| D2 | Lookup roli z `profiles` | `middleware.ts:41` (z klasyfikacją błędu) oraz `clients/index.ts:20`, `entries.ts:21`, `[entryId].ts:23` (bez obsługi `error`) | Tylko 1 z 4 kopii odróżnia awarię od braku profilu. Pozostałe 3 zamieniają awarię bazy w redirect na `/dashboard` |
| D3 | „PostgREST może zwrócić osadzony pojazd jako tablicę albo obiekt” | typ: `dashboard.astro:11-14`, `mechanic.astro:10-13`, `clients/[id].astro:13-16`; normalizacja: `dashboard.astro:32`, `mechanic.astro:31-34`, `clients/[id].astro:39` | 3 ręcznie zsynchronizowane kopie tej samej pułapki. Rozstrzygnięcie w §5.3 Q1 |
| D4 | Embed `!inner` i filtr po kolumnie embedu | `[entryId].ts:29-34`, `edit.astro:16-22` | Ta sama reguła dostępu („wpis należy do pojazdu tego klienta”) wyrażona dwa razy w składni PostgREST. `edit.astro:15` musi gasić inferencję `any` |
| D5 | Surowy błąd SDK jako komunikat dla użytkownika | `signin.ts:16`, `signup.ts:16`, `clients/index.ts:40-42`, `entries.ts:51`, `[entryId].ts:61`, `share-link/index.ts:19`, `revoke.ts:18` → wyspy (§1, wiersz „UI (wyspy React)”) i `dashboard.astro:41` → `ShareLinkCard` | Treść błędu Postgresa i GoTrue jest kontraktem UI. `middleware.ts:15` wprost przyznaje: „`?error=` can carry raw DB messages” |
| D6 | Kody błędów i semantyka PostgREST/PG poza adapterem | `session-state.ts:11-12` (`PGRST116`), `clients/index.ts:5` (`23505`), `[entryId].ts:64-65` („An update blocked by RLS returns no error and 0 rows”) | Wiedza o protokole siedzi w route'ach i w półdomenie |
| D7 | Nietypowany klient: rzutowanie wyników RPC | `clients/index.ts:45-46`, `share/[token].astro:22-23`, `dashboard.astro:31`, `clients/[id].astro:38`, `edit.astro:31` | Kontrakt RPC (`p_*`, kształt `jsonb`) jest „typowany” wyłącznie rzutowaniem w miejscu użycia |
| D8 | Wiersz bazy = model domeny = model widoku | `types.ts:3` → `service-history.ts:26-29`, `:50-58`; `share-link.ts:76-77`; `ServiceHistory.astro:27`, `:42`, `:45`, `:49-50`; `ClientDashboardView.astro:11`, `:75`; `SharedHistoryView.astro:27`, `:39`; `mechanic.astro:86`, `:90`; mapowanie odwrotne w `edit.astro:37-47` | Zmiana nazwy kolumny albo przejście na inny klient (np. sterownik zwracający `Date` zamiast ISO-stringa) psuje komponenty UI |
| D9 | Typ biblioteki w kontrakcie aplikacji | `env.d.ts:6` (`Locals.user: User`), `session-state.ts:5-9` (`AuthError`/`PostgrestError` w unii stanu), konsumpcja `Topbar.astro:2`, `:8`, `dashboard.astro:46` | Każdy plik Astro ma w typach `Supabase.User` (ok. 30 pól) i może go użyć, choć potrzebne są tylko `id`, `email` i rola |

### 3.2 Przecieki przez granice

**Biblioteka serwerowa w bundlu klienta?** Sprawdziłem: **dziś nie.**
- Wyspy importują wyłącznie `@/lib/validation` i `@/lib/utils` (`AddClientForm.tsx:6`, `ServiceEntryForm.tsx:6`, `FormField.tsx:3`), a `validation.ts:1` importuje tylko typy z `@/lib/types`.
- `grep -rl supabase dist/client` nic nie zwraca.

Przez granicę klient/serwer przechodzą jednak **dane** biblioteki:
1. **Tekst błędu.** `error.message` z PostgREST/GoTrue → query string → prop `serverError` → serializowany payload hydracji wyspy, np. `clients/[id].astro:108-109` (`serverError={error}` + `client:load`). Wymiana biblioteki zmienia to, co widzi użytkownik. Dodatkowo wewnętrzne komunikaty bazy (nazwy constraintów, treść `raise exception` z M2/M3/M4) są publiczne.
2. **Granica jest umowna.** `types.ts` jest współdzielony przez wyspy (pośrednio przez `validation.ts`) i przez kod mówiący do bazy. Nic nie powstrzymuje kolejnej wyspy przed `import { ... } from "@/lib/session-state"`, który wciągnąłby `@supabase/supabase-js` (wartości `isAuthApiError`, `session-state.ts:1`) do bundla. Granicę trzyma dziś wyłącznie dyscyplina, nie reguła lintera.

**Middleware ↔ API.** Middleware klasyfikuje stan auth i profilu (`middleware.ts:26-51`), ale dla `/api/*` profilu nie ładuje (`clients/index.ts:18-19`). Route'y robią więc własny, słabszy lookup (D2). Ta sama decyzja domenowa („czy to mechanik”) ma dwie implementacje w dwóch warstwach.

### 3.3 Kod sam przyznaje, gdzie jest szew

- `src/lib/service-unavailable.ts:1-2` — „must not depend on Supabase”. To świadoma izolacja, ale tylko lokalna.
- `src/lib/types.ts:3` — typy „as returned by supabase-js selects”, czyli model domenowy z definicji jest kształtem biblioteki.
- `01-domain-distillation.md:53` — `createClient()` z `src/lib/supabase.ts` to „trzecie, techniczne znaczenie” słowa *Client*, które koliduje z językiem domeny (klient warsztatu).

### 3.4 Intencja w dokumentach vs kod

| Dokument (plik:linia) | Co zapowiada | Dlaczego kod tego nie dotrzymuje |
| --- | --- | --- |
| `infrastructure.md:50`, `:81` | Hyperdrive, gdyby rozjazd regionów edge i Supabase dawał opóźnienia | Hyperdrive to pula połączeń protokołu Postgres, czyli inny klient niż PostgREST (`supabase-js`). Przejście na niego dziś oznacza przepisanie 5 stron, 8 route'ów, middleware i `types.ts`, bo kształt wiersza i składnia `.from().select("…embed…")` są w każdym z nich (D3, D4, D8) |
| `infrastructure.md:49`, `:79` | Limit 10 ms CPU na wywołanie przy SSR pytającym Supabase | `middleware.ts:26` woła `auth.getUser()` (zapytanie sieciowe do GoTrue) przy **każdym** żądaniu. Tańsza ścieżka `getClaims()` (§5.3 Q2) wymaga zmiany w middleware i w typie `Locals.user` (`env.d.ts:6`), bo zwraca claims, a nie `User` |
| `tech-stack.md:29-31` | FR-008: Cloudflare Cron wołający „Supabase function” | Logika „następnego serwisu” (`service-history.ts:50-58`) operuje na wierszach supabase-js. Handler `scheduled()` musiałby powielić zapytania i kształt wiersza po raz kolejny |
| P02:184-195 | `serviceEntryRepository(supabase: SupabaseClient)` i `toServiceEntryError(e: PostgrestError)` | P02 przewiduje repozytorium, ale tylko dla zapisu wpisu, a jego sygnatura dalej eksponuje typ biblioteki. Ten plan wchłania je jako jeden adapter za portem (§4.4) |

## 4. Projekt ACL (krok 4)

### 4.1 Decyzja o kształcie

- **Domena** (`src/domain/`): czyste value objects, porty i błędy, **bez żadnego importu z `@supabase/*` ani z `astro`**.
- **Adapter** (`src/adapters/supabase/`): **jedyne** miejsce wiedzy o kształcie zależności, czyli wiersze snake_case, embedy PostgREST, nazwy RPC i parametrów `p_*`, SQLSTATE/PGRST, klasy błędów GoTrue, cookies `@supabase/ssr` i `astro:env`.
- **Mapowanie z/do persystencji** stoi w adapterze, obok VO, a nie w samym VO. Odrzuciłem `ServiceRecord.fromRow(row)` w klasie domenowej z dwóch powodów:
  - VO musiałby znać nazwy kolumn, więc grep z §6 nie dałby czystego wyniku;
  - P02 przenosi część reguł do bazy, więc model wiersza i model domeny będą się dalej rozjeżdżać.

  „Jedyne miejsce wiedzy” = katalog `src/adapters/supabase/`. VO ma wyłącznie konstruktor z walidacją kształtu domenowego i operacje domenowe.

### 4.2 Value objects (domena)

```ts
// src/domain/identity.ts — zastępuje Supabase.User w App.Locals
export type Role = "mechanic" | "client";
export interface Identity { readonly userId: string; readonly email: string; }
export type SessionState =
  | { kind: "signed-in"; identity: Identity; role: Role | null }   // role null = profil brakujący
  | { kind: "anonymous" }
  | { kind: "unavailable" };                                        // przyczyna tylko w logu adaptera

// src/domain/service-record.ts — jeden wpis, camelCase, typy domenowe
export interface NextServicePoint { readonly date: CalendarDate | null; readonly mileageKm: number | null; }
export class ServiceRecord {
  private constructor(
    readonly id: string,
    readonly serviceType: string,
    readonly serviceDate: CalendarDate,      // "YYYY-MM-DD" opakowane: bez strefy czasowej
    readonly mileageKm: number,
    readonly cost: Money | null,             // null tylko do czasu VALIDATE z P02 (faza 6)
    readonly notes: string | null,
    readonly nextDue: NextServicePoint,
    readonly recordedAt: Instant,
    readonly editedAt: Instant | null,
  ) {}
  static create(props: ServiceRecordProps): ServiceRecord;   // sprawdza mileageKm >= 0 itd.
  isEdited(): boolean;                                       // editedAt !== null
  static newestFirst(a: ServiceRecord, b: ServiceRecord): number; // serviceDate desc, recordedAt desc
}

// src/domain/vehicle-history.ts — agregat odczytu, który dostaje UI
export class VehicleHistory {
  constructor(readonly vehicle: VehicleSummary, records: readonly ServiceRecord[]);
  get records(): readonly ServiceRecord[];          // już posortowane newestFirst
  nextService(): NextServicePoint | null;           // reguła I4: tylko najnowszy wpis (dziś service-history.ts:50-58)
  redacted(): SharedHistory;                        // bez kosztu i notatek (FR-005); dla /share/[token]
}
export interface VehicleSummary { readonly id: string; readonly make: string; readonly model: string; readonly registrationNumber: string; }

// src/domain/share-link.ts — dziś share-link.ts:76-89 na wierszu
export class ShareLink {
  constructor(readonly token: ShareToken, readonly expiresAt: Instant);
  isActive(now: Instant): boolean;
  url(origin: string): string;
}
export class ShareToken { static parse(raw: string): ShareToken | null; }  // regex z share-link.ts:73

// src/domain/errors.ts — taksonomia niezależna od dostawcy
export type DomainFailure =
  | { kind: "unavailable" }                                    // sieć / 5xx / timeout
  | { kind: "not-found" }                                      // brak wiersza ALBO odcięty przez RLS
  | { kind: "conflict"; reason: "client-email-taken" | "entry-changed" }
  | { kind: "rejected"; reason: ServiceEntryErrorCode }        // kody SE… z P02 §4.2
  | { kind: "auth"; reason: "invalid-credentials" | "email-not-confirmed" | "weak-password" };
export class DomainError extends Error { constructor(readonly failure: DomainFailure); }
export function messageFor(f: DomainFailure): string;          // jedyne źródło tekstu dla ?error=
```

### 4.3 Wąskie porty (interfejsy domenowe)

Porty są wąskie, po jednym na przypadek użycia. To nie jest ogólne `Database`. Każdy port ma tylko metody, które dziś wywołuje istniejący kod.

```ts
// src/domain/ports.ts
export interface SessionPort {
  current(): Promise<SessionState>;                       // middleware.ts:26-51
  signIn(email: string, password: string): Promise<void>; // throws DomainError{auth}
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface HistoryReader {
  forSignedInClient(userId: string): Promise<{ history: VehicleHistory | null; shareLink: ShareLink | null }>; // dashboard.astro
  workshopClients(): Promise<WorkshopClientSummary[]>;                        // mechanic.astro
  workshopClient(clientId: string): Promise<{ client: WorkshopClientSummary; history: VehicleHistory | null } | null>; // clients/[id].astro
  entryOfClient(clientId: string, entryId: string): Promise<ServiceRecord | null>; // edit.astro + [entryId].ts:29-34
  shared(token: ShareToken): Promise<SharedHistory | null>;                    // share/[token].astro
}

export interface WorkshopWriter {
  addClientWithVehicle(input: NewClientInput): Promise<{ clientId: string }>;  // clients/index.ts
  recordEntry(clientId: string, input: ServiceEntryInput): Promise<void>;      // = P02 repo.record
  correctEntry(clientId: string, entryId: string, input: ServiceEntryInput): Promise<void>; // = P02 repo.correct
}

export interface ShareLinkPort {
  issue(): Promise<void>;    // rpc create_share_link
  revoke(): Promise<void>;   // rpc revoke_share_link
}

// Złożenie dostępne w Locals — strony i route'y nie widzą niczego innego
export interface Backend {
  session: SessionPort;
  history: HistoryReader;
  workshop: WorkshopWriter;
  shareLinks: ShareLinkPort;
}
```

Zasada portów: **błędy zawsze jako `DomainError`, brak wyniku jako `null`, nigdy `{ data, error }`.** Dzięki temu znika klasa błędów „awaria połknięta jako not-found”, wskazana w P02 §3.2 i tu w D2.

### 4.4 Adapter (jedyny importer `@supabase/*`)

```
src/adapters/supabase/
  client.ts      createServerClient + cookies (dziś src/lib/supabase.ts) + astro:env
  backend.ts     openSupabaseBackend(headers, cookies): Backend | null   ← jedyna fabryka
  session.ts     SessionPort: getUser/getClaims (decyzja Q2), classifyAuth/classifyProfile (dziś session-state.ts)
  rows.ts        typy wierszy snake_case (dziś types.ts:6-50) + wygenerowane Database types (Q6)
  mappers.ts     row → VO, input → row/params; oneOrNone() dla embedów (Q1)
  errors.ts      PostgrestError | AuthError → DomainError (PGRST116, 23505, SE…, 0 rows → not-found)
  history-reader.ts, workshop-writer.ts, share-links.ts
  *.test.ts      testy mapowania i klasyfikacji błędów (przeniesiony session-state.test.ts)
```

Pseudokod kluczowych fragmentów:

```ts
// backend.ts
export function openSupabaseBackend(headers: Headers, cookies: AstroCookies): Backend | null {
  const sb = createSupabaseServerClient(headers, cookies);   // null gdy brak SUPABASE_URL/KEY
  if (!sb) return null;                                      // D1 obsłużone RAZ, w middleware
  return { session: sessionPort(sb), history: historyReader(sb), workshop: workshopWriter(sb), shareLinks: shareLinks(sb) };
}

// mappers.ts
function oneOrNone<T>(embed: T | T[] | null): T | null {    // jedyna kopia D3
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}
export function toServiceRecord(row: ServiceEntryRow): ServiceRecord {
  return ServiceRecord.create({
    id: row.id, serviceType: row.service_type, serviceDate: CalendarDate.parse(row.service_date),
    mileageKm: row.mileage, cost: row.cost === null ? null : Money.pln(row.cost), notes: row.notes,
    nextDue: { date: row.next_due_date && CalendarDate.parse(row.next_due_date), mileageKm: row.next_due_mileage },
    recordedAt: Instant.parse(row.created_at), editedAt: row.updated_at && Instant.parse(row.updated_at),
  });
}
export function toEntryParams(input: ServiceEntryInput) { /* camelCase → p_* dla rpc z P02 */ }

// errors.ts
export function toDomainError(e: PostgrestError | AuthError): DomainError {
  if (isAuthError(e))         return mapAuth(e);                               // GoTrue error codes
  if (e.code === "PGRST116")  return new DomainError({ kind: "not-found" });
  if (e.code === "23505")     return new DomainError({ kind: "conflict", reason: "client-email-taken" });
  if (e.code?.startsWith("SE")) return new DomainError({ kind: "rejected", reason: e.code as ServiceEntryErrorCode });
  return new DomainError({ kind: "unavailable" });                             // + logError z oryginałem
}

// workshop-writer.ts
async correctEntry(clientId, entryId, input) {
  const { data, error } = await sb.rpc("correct_service_entry", toEntryParams(...));  // po P02; przed P02: update().select("id")
  if (error) throw toDomainError(error);
  if (data === null || (Array.isArray(data) && data.length === 0)) throw new DomainError({ kind: "not-found" }); // Q3
}
```

Middleware po refaktorze ustawia `locals.backend: Backend | null` i `locals.session: SessionState`. Wtedy `env.d.ts` zna tylko `Identity` i `Backend` z `src/domain/`.

## 5. Dowód izolacji i before/after (krok 5)

### 5.1 Co dotyka wymiana biblioteki

Scenariusz: przejście z `supabase-js`/PostgREST na sterownik Postgres przez Hyperdrive (`infrastructure.md:81`), albo z GoTrue na innego dostawcę auth.

| Element | Dotknięty? | Dlaczego |
| --- | --- | --- |
| `src/adapters/supabase/**` | **tak**, zastąpiony np. przez `src/adapters/pg/**` implementujący te same porty | jedyne miejsce wiedzy o kliencie |
| `src/domain/**` (VO, porty, `messageFor`) | nie | brak importu biblioteki |
| `src/middleware.ts` | jedna linia: fabryka (`openSupabaseBackend` → `openPgBackend`) | zna tylko `Backend`/`SessionState` |
| `src/pages/api/**` (8 route'ów) | nie | wołają porty, łapią `DomainError`, redirect z `messageFor` |
| `src/pages/**/*.astro` (5 stron) | nie | dostają `VehicleHistory` / `WorkshopClientSummary` |
| `src/components/**` (UI, wyspy) | nie | renderują VO; `serverError` to zawsze tekst z `messageFor` |
| `env.d.ts` | nie | `Identity`, nie `User` |
| Tabele, RLS, RPC, triggery (M1–M4, P02) | nie | sterownik Postgres woła te same funkcje SQL; RLS wymaga ustawienia claims w transakcji, ale to też tylko adapter |
| `tests/db/**` | tak, świadomie | to testy kontraktu bazy przez PostgREST, patrz §6 |

Zastrzeżenie dla wariantu Hyperdrive: dziś RLS działa, bo PostgREST ustawia rolę i claims z JWT. Sterownik Postgres musiałby robić `set local role authenticated; set local request.jwt.claims = …` w każdej transakcji. To duża, ale **lokalna** praca w adapterze, a nie argument przeciwko ACL.

### 5.2 Before/after dla zduplikowanych miejsc

| Miejsce | Before | After |
| --- | --- | --- |
| D1: 13 kopii `if (!supabase)` | każdy route i strona sprawdza `null` i składa „Supabase is not configured” | middleware: `locals.backend === null` → dotychczasowy banner (`config-status.ts`) i redirect z `messageFor({kind:"unavailable"})`. Route'y dostają `Backend` gwarantowanie, przez helper `requireBackend(context)` |
| D2: lookup roli w 3 route'ach API | `.from("profiles")…single()` bez obsługi `error` | middleware ładuje `SessionState` (z rolą) także dla `/api/*`; route czyta `locals.session.role`. RLS dalej jest prawdziwą granicą |
| D3: normalizacja embedu ×3 | typ `X[] \| X \| null` i `Array.isArray` w każdej stronie | `mappers.oneOrNone` raz; strony nie znają embedów |
| D4: `!inner` ×2 | `[entryId].ts:29-34`, `edit.astro:16-22` | `history.entryOfClient(clientId, entryId)` używane w obu miejscach |
| D5: `error.message` ×7 | surowy tekst GoTrue/Postgresa w URL i propsach wysp | `catch (e) { redirect(…?error=${messageFor(e.failure)}) }`; oryginał tylko w `logError` w adapterze |
| D6: `PGRST116`, `23505`, „0 rows” | `session-state.ts:12`, `clients/index.ts:5`, `[entryId].ts:64-65` | `adapters/supabase/errors.ts` |
| D7: rzutowania wyników RPC | `as string`, `as SharedVehicleHistory`, `as ClientRow` | wygenerowane typy `Database` w `rows.ts` (Q6) i mapper do VO |
| D8: snake_case w UI | `entry.service_date`, `entry.next_due_mileage`, `vehicle.registration_number`, `active.expires_at` | `record.serviceDate`, `record.nextDue.mileageKm`, `vehicle.registrationNumber`, `link.expiresAt` |
| D9: `Locals.user: Supabase.User` | `Topbar.astro:8` `user.email` z obiektu biblioteki | `locals.session.identity.email` |

**UI dostaje gotowe dane domenowe.** Przykład dla `ClientDashboardView`:

```astro
---
// BEFORE (ClientDashboardView.astro:9-15, :28)
interface Props {
  email: string | undefined;                                              // z Supabase.User
  vehicle: Pick<Vehicle, "make" | "model" | "registration_number"> | null; // wiersz
  entries: ServiceEntry[];                                                 // wiersze
  shareLink: Pick<ShareLink, "token" | "expires_at"> | null;               // wiersz
  …
}
const next = nextService(entries);   // reguła domenowa wołana w komponencie na wierszach

// AFTER
interface Props {
  identity: Identity;
  history: VehicleHistory | null;    // posortowane, z nextService()
  shareLink: ShareLink | null;       // z isActive()/url()
  …
}
const next = history?.nextService() ?? null;
---
```

Strona `dashboard.astro` skraca się z 40 linii frontmattera (`:1-42`) do:

```ts
const { history, shareLink } = await Astro.locals.backend.history.forSignedInClient(Astro.locals.session.identity.userId);
```

Rozróżnienie `loadError` (`dashboard.astro:30`) wynika teraz z `DomainError{unavailable}`, które middleware i tak buforuje jako 500 (`middleware.ts:69-76`), albo z jawnego `try/catch`, jeśli widok ma pokazać stan błędu.

### 5.3 Otwarte pytania zależne od kontraktu biblioteki i ich rozstrzygnięcie

| # | Pytanie | Co mówi dokumentacja / kod | Decyzja | Gdzie zakodować |
| --- | --- | --- | --- | --- |
| Q1 | Czy osadzony `vehicles` przychodzi jako obiekt czy tablica? (D3, komentarze w `dashboard.astro:11`, `mechanic.astro:10`, `clients/[id].astro:13`) | Dokumentacja PostgREST (Resource Embedding → One-to-one) rozpoznaje relację 1:1 tylko wtedy, gdy klucz obcy jest kluczem głównym albo ma **unique constraint**. Wtedy embed jest obiektem, w przeciwnym razie tablicą. M2:13 tworzy **unique index** (`create unique index vehicles_client_id_key`), a nie constraint, więc PostgREST zwraca tablicę. Komentarz w kodzie jest zgodny z dokumentacją. | (1) Mapper w ACL akceptuje oba kształty (`oneOrNone`), więc zachowanie nie zależy od schematu. (2) Opcjonalna migracja `alter table vehicles add constraint vehicles_client_id_key unique using index vehicles_client_id_key;` utrwala 1:1 w schemacie (I6 z P02). Dzięki (1) migracja nie dotyka żadnej strony. | `src/adapters/supabase/mappers.ts`; migracja w `supabase/migrations/` |
| Q2 | `auth.getUser()` przy każdym żądaniu (`middleware.ts:26`) czy `getClaims()`? | Dokumentacja Supabase: `getUser` „always sends a request to the Auth server for each JWT”. `getClaims` weryfikuje JWT lokalnie przez (cache'owany) JWKS, ale **tylko przy asymetrycznym kluczu podpisu**. Przy kluczu symetrycznym „always sends a request to the Auth server”. Lokalnie `signing_keys_path` jest zakomentowane (`supabase/config.toml:162`). Komentarz `GoTrueClient.d.ts:1408-1413` w zainstalowanej wersji odradza `getSession()` do ustalania tożsamości. | Na teraz zostaje `getUser()`, bo bez kluczy asymetrycznych `getClaims` niczego nie oszczędza. Przejście na `getClaims` po włączeniu kluczy asymetrycznych to zmiana **jednej funkcji** `session.current()`. Claims zawierają `sub` i `email`, więc VO `Identity` się nie zmienia. To odpowiedź na ryzyko CPU z `infrastructure.md:79`, dziś niewykonalna bez dotykania typu `Locals.user`. | `src/adapters/supabase/session.ts` |
| Q3 | Jak odróżnić „zapis zablokowany przez RLS” od sukcesu? | PostgREST przy `UPDATE` odfiltrowanym przez RLS zwraca 0 wierszy bez błędu, co kod opisuje w `[entryId].ts:64`. Wymaga to `.select()` po `update`. | Adapter zawsze wymusza `select` i mapuje 0 wierszy na `DomainError{not-found}`. Po P02 (RPC `correct_service_entry`) RPC samo rzuca `SE…`, a reguła zostaje w adapterze. | `src/adapters/supabase/workshop-writer.ts`, `errors.ts` |
| Q4 | `.single()` przy braku wiersza | Kod `PGRST116` jest dziś stałą w półdomenie (`session-state.ts:11-12`). | Adapter używa `.maybeSingle()` (brak wiersza → `null`) i nie musi znać `PGRST116`. Mapowanie `PGRST116` zostaje jako zabezpieczenie w `errors.ts`. | `src/adapters/supabase/session.ts`, `errors.ts` |
| Q5 | Duplikat emaila klienta | M2:162 opisuje `unique_violation (23505)` na `clients_email_key`. | `23505` → `conflict:"client-email-taken"`, a tekst w `messageFor`. Route nie zna SQLSTATE. | `src/adapters/supabase/errors.ts` |
| Q6 | Nietypowany klient (`clients/index.ts:45`, `share/[token].astro:22`) | Supabase CLI generuje typy `Database` z lokalnego schematu (`supabase gen types typescript --local`). Przekazane do `createServerClient<Database>` typują `.from()` i `.rpc()`. | Generować do `src/adapters/supabase/database.types.ts`, importować tylko w adapterze. Rzutowania znikają z route'ów i stron. | `src/adapters/supabase/rows.ts` |

## 6. Weryfikacja i plan (krok 6)

### 6.1 Kryterium sukcesu

```bash
grep -rlE '@supabase/|createServerClient|PostgrestError|AuthError|PGRST|\.rpc\("|\.from\("' src
```

Ma zwrócić **wyłącznie** pliki w `src/adapters/supabase/`. Uzupełniająco:

```bash
grep -rlE 'service_date|next_due_|registration_number|expires_at|created_at|updated_at' src
```

Ma zwrócić tylko `src/adapters/supabase/` (wiersze i mappery).

Mechaniczne utrwalenie (zgodnie z zasadą „deterministyczne kontrole w hookach/lincie, nie w pliku zasad”, `CLAUDE.md`): reguła ESLint `no-restricted-imports` dla `@supabase/*` i `astro:env/server` z wyjątkiem `src/adapters/**` w `eslint.config.js` (bramka `ci` → lint).

**Poza zakresem kryterium, świadomie:**
- `tests/db/**` (`tests/db/clients.ts:1`): testuje kontrakt RLS bazy przez PostgREST jako klient zewnętrzny i musi omijać aplikację (`test-plan.md:55`: „Querying with the service-role key… mocking Supabase” to anty-wzorce).
- `supabase/**` (migracje, config).

| Plik | Zna Supabase dziś | Po refaktorze |
| --- | --- | --- |
| `src/lib/supabase.ts` | tak | **przeniesiony** → `src/adapters/supabase/client.ts` |
| `src/lib/session-state.ts` (+ `.test.ts`) | tak | **przeniesiony** → `src/adapters/supabase/session.ts` (+ test) |
| `src/lib/types.ts` | kształt wiersza | wiersze → `src/adapters/supabase/rows.ts`; `NewClientInput`/`ServiceEntryInput` → `src/domain/` |
| `src/lib/config-status.ts` | tak (`SUPABASE_*`) | `configured` liczone w adapterze i eksportowane jako `backendConfigured: boolean`; plik nie importuje `astro:env` |
| `src/env.d.ts` | tak (`User`) | nie (`Identity`, `Backend`, `SessionState`) |
| `src/middleware.ts` | tak | nie (fabryka `Backend` przez jeden import z adaptera) |
| `src/pages/api/auth/{signin,signup,signout}.ts` | tak | nie |
| `src/pages/api/clients/index.ts`, `[id]/entries.ts`, `[id]/entries/[entryId].ts` | tak | nie |
| `src/pages/api/share-link/{index,revoke}.ts` | tak | nie |
| `src/pages/dashboard.astro`, `dashboard/mechanic.astro`, `clients/[id].astro`, `edit.astro`, `share/[token].astro` | tak | nie |
| `src/lib/service-history.ts`, `src/lib/share-link.ts` | kształt wiersza | nie; logika → VO w `src/domain/`, formatery zostają w `src/lib/` i przyjmują `CalendarDate`/`Instant`/`Money` |
| `src/components/{ServiceHistory,ClientDashboardView,ShareLinkCard,SharedHistoryView,Topbar}.astro` | kształt wiersza / `User` | nie (VO) |
| Wyspy React (`serverError`) | tekst błędu SDK | nie (tekst z `messageFor`) |
| `src/adapters/supabase/**` | — | **jedyne** |

### 6.2 Fazy (konwencja repo: `/10x-new` → `/10x-plan` → `/10x-tdd` | `/10x-implement` → `/10x-impl-review`)

Proponowana zmiana: `context/changes/supabase-anti-corruption-layer/`. Koordynacja z P02: faza 3 P02 („Repozytorium + błędy TS”, P02 tabela §5.2) **ląduje w tym adapterze** jako `WorkshopWriter`. Można zacząć od tej zmiany (wtedy P02 dopisuje RPC do gotowego portu) albo od P02 (wtedy faza 4 tu przenosi jego repozytorium za port). Zalecam **najpierw fazy 1–3 tego planu**: są bezpieczne, bo nie ruszają schematu, i dają P02 gotowe miejsce na `toDomainError` dla kodów `SE…`.

| Faza | Zakres | Test-first? | Gotowe, gdy… |
| --- | --- | --- | --- |
| 0 | **Decyzje i otwarcie zmiany** (`/10x-new`): (a) nazwa katalogu domeny i adaptera; (b) czy migracja unique constraint z Q1 wchodzi w tę zmianę; (c) kolejność względem P02; (d) teksty `messageFor` (zastępują dzisiejsze surowe komunikaty widoczne w UI) | — | decyzje w `change.md` |
| 1 | **Domena:** `src/domain/` (VO `Identity`, `ServiceRecord`, `VehicleHistory`, `ShareLink`, `ShareToken`, `DomainError`, `messageFor`, porty). Logika z `service-history.ts:26-29`, `:50-58` i `share-link.ts:76-89` przeniesiona do VO, a dotychczasowe testy (`service-history.test.ts`, `share-link.test.ts`) przepięte na VO | **tak** (`/10x-tdd`, Vitest unit) | `npm test` zielony; `grep -r "@supabase\|astro" src/domain` pusty |
| 2 | **Adapter i sesja:** `src/adapters/supabase/{client,backend,session,errors,mappers,rows}.ts`, generowanie `database.types.ts`, przeniesienie `session-state(.test).ts`. Middleware ustawia `locals.backend` i `locals.session` (także dla `/api/*`); `env.d.ts` bez `User` | **tak** (unit: `oneOrNone` dla obu kształtów, `toDomainError` dla `PGRST116`/`23505`/5xx/GoTrue 4xx, „nieznany kod ≠ not-found”) | `npm test`, `astro check`, `npm run test:http` (`role-routing.test.ts`) zielone; ręcznie: zatrzymany Supabase → 503 na `/dashboard` jak dziś (`middleware.ts:29-32`) |
| 3 | **Odczyty:** `HistoryReader`; 5 stron SSR przechodzi na porty; komponenty UI przyjmują VO | częściowo (HTTP/E2E jako sieć bezpieczeństwa) | `npm run test:http` (`dashboard-render.test.ts`), `npm run test:e2e` zielone; `grep -E "service_date\|registration_number" src/components` pusty |
| 4 | **Zapisy i auth:** `WorkshopWriter`, `ShareLinkPort`, `SessionPort.signIn/Up/Out`; 8 route'ów bez `createClient`, z `try/catch DomainError` → `messageFor` | **tak** dla mapowania błędów; HTTP dla redirectów | `npm run test:http` zielony; żaden `?error=` nie zawiera tekstu z bazy (test HTTP: duplikat emaila daje komunikat z `messageFor`) |
| 5 | **Zamknięcie granicy:** reguła `no-restricted-imports` w `eslint.config.js`; usunięcie wierszy z `src/lib/types.ts`; grep z §6.1 jako krok CI albo hook | nie (refaktor przy zielonych testach) | oba grepy z §6.1 zwracają tylko `src/adapters/supabase/`; `npm run lint` failuje na próbnym imporcie `@supabase/supabase-js` w `src/pages/` |

Kolejność ma znaczenie:
- Faza 2 idzie przed 3 i 4, bo middleware musi już dostarczać `Backend`.
- Faza 5 idzie na końcu, bo reguła lintera wcześniej zablokowałaby przejściowy stan.
- Nowe nazwy load-bearing (`Backend`, porty, `DomainFailure.kind`, katalog `src/adapters/supabase/`) warto dopisać do rejestru kontraktów. `docs/reference/contract-surfaces.md` nie istnieje dziś w repo (sprawdzone), więc decyzja o jego utworzeniu należy do fazy 0.

## Podsumowanie

Najgorszym przeciekiem w repo jest Supabase (`@supabase/supabase-js` i `@supabase/ssr` razem z kontraktem PostgREST/GoTrue). Występuje we wszystkich pięciu warstwach i w 26 produkcyjnych plikach `src/`: od globalnego typu `App.Locals.user` (`env.d.ts:6`) po nazwy kolumn snake_case renderowane w komponentach (`ServiceHistory.astro:27`). Pozostałe zależności (Cloudflare, biblioteki UI, Astro w lib) są odizolowane albo znikną przy okazji. Diagnoza znalazła dziewięć kopii wiedzy o bibliotece, m.in.:
- 13 kopii sprawdzenia `null`-klienta;
- 3 kopie normalizacji embedu „tablica albo obiekt”;
- 3 słabsze kopie lookupu roli, które połykają awarię bazy;
- 7 miejsc, w których surowy `error.message` z bazy trafia do URL i do payloadu hydracji wysp React.

Samej biblioteki serwerowej w bundlu klienta dziś nie ma, ale granicę trzyma tylko dyscyplina. Żaden dokument nie deklaruje wprost wymienialności Supabase. Dokumenty zapowiadają jednak zmiany kontraktu (Hyperdrive, limit CPU przy `getUser`, cron dla FR-008, repozytorium z P02), których kod nie potrafi dziś przyjąć lokalnie. Proponowana ACL dzieli kod na dwie części:
- czysta domena `src/domain/`: VO `Identity`, `ServiceRecord`, `VehicleHistory`, `ShareLink`, taksonomia `DomainError` z `messageFor` i cztery wąskie porty złożone w `Backend`;
- jedyny adapter `src/adapters/supabase/`, który zna wiersze, embedy, RPC, kody `PGRST116`/`23505`/`SE…` i klasy błędów GoTrue.

Pytania o kontrakt biblioteki rozstrzygnąłem w adapterze:
- embed 1:1 według dokumentacji PostgREST: unique index ≠ unique constraint;
- `getUser` vs `getClaims` według dokumentacji Supabase: bez kluczy asymetrycznych brak zysku;
- semantyka „0 wierszy przy RLS”, `maybeSingle` i generowane typy.

Kryterium sukcesu: grep po `@supabase/`, `.from("`, `.rpc("` i nazwach kolumn zwraca wyłącznie `src/adapters/supabase/`, a utrwala to reguła `no-restricted-imports`. Plan ma sześć faz (decyzje → domena → adapter i sesja → odczyty → zapisy → zamknięcie granicy). Fazy 1, 2 i 4 idą test-first, a plan jest skoordynowany z P02 tak, żeby jego repozytorium wylądowało za portem `WorkshopWriter`.
