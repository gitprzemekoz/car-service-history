---
type: observability-audit
date: 2026-10-03 08:16
mode: audit
commit: 260f52d
branch: main
dirty_tree: true
areas: [dashboard-entries]
area_source: arguments
runtime_proof: not-run
error_tracker: none (Cloudflare Workers Logs only)
previous_report: null
findings: { critical: 6, high: 7, medium: 6, low: 3 }
---

# Audyt obserwowalności — mechanik/klient widzi wpisy w dashboardzie (2026-10-03)

## 1. TL;DR

- **Błędy Supabase są zwracane jako wartości, a kod czyta tylko `data`.** „Nie udało się” i „nie ma” wyglądają identycznie. Awaria Auth wygląda jak wylogowanie, awaria bazy jak „brak wpisów”, „Client not found” albo widok niewłaściwej roli.
- **Obsłużone błędy kończą się zwykłą odpowiedzią i nie zostawiają żadnego logu.** Na dashboardzie to 200 z kartą błędu, przy szczegółach klienta 404, a w API 302 z `?error=<surowy komunikat>`. W `src/` nie ma ani jednego `console.*`.
- **Jedyny kanał logów to tekst ze stosem, który Astro wypisuje dla nieobsłużonych wyjątków.** Nie ma w nim ścieżki, użytkownika, encji, wersji wydania ani `cause`. Wywołanie Workera i tak kończy się wynikiem „ok”.
- **Ciche tryby awaryjne w danych i konfiguracji.** Wiersze odfiltrowane przez RLS albo zgubione przez dryf schematu renderują się jako „No service entries yet” ze statusem 200. To ta sama klasa błędu co incydent f763bdb, tylko tym razem bez wyjątku.
- **Najważniejsza konsekwencja:** jeśli w trakcie zapisu wpisu zawiedzie lookup roli, wpis **nie zostaje zapisany**, mechanik trafia na swój dashboard bez komunikatu, a w logach nie ma nic (D5).
- **Kontekst:** w projekcie nie ma trackera błędów ani alertów, a logów produkcyjnych nikt nie przegląda (potwierdzone przez użytkownika). Nawet błędy, które trafiają do Workers Logs, są dziś w praktyce niewidoczne dla ludzi.

## 2. Model przechwytywania

- **Runtime:** Astro 7.3.2 SSR (`output: "server"`, `astro.config.mjs`) jako jeden Cloudflare Worker przez `@astrojs/cloudflare` 14.3.1 (`wrangler.jsonc:3`). Nie ma zadań w tle, crona, kolejek ani `waitUntil`.
- **Tracker błędów:** brak. W `package.json` i `src/` nie ma żadnego SDK ani `captureException`.
- **Granica przechwytywania:** `try/catch` w Astro (`node_modules/astro/dist/core/routing/handler.js:101-108`). Łapie każdy wyjątek z middleware, strony lub endpointu i woła `logger.error(null, err.stack …)` → `console.error` (`core/logger/impls/console.js:11`). Potem renderuje `src/pages/500.astro` (strona celowo nie używa `error`, `500.astro:4-7`) i zwraca 500. Do Workers Logs trafia więc linia tekstu, a nie obiekt wyjątku.
- **Middleware** (`src/middleware.ts`) działa przy każdym żądaniu:
  - `auth.getUser()` (l.17-19) i lookup profilu (l.24) ignorują `error`.
  - Nieudany lookup zamyka dostęp przekierowaniem (l.40-41).
  - `bufferHtmlResponse` (l.45, `src/lib/buffer-html.ts:13`) zamienia wyjątek rzucony w trakcie strumienia w zalogowane 500 zamiast pustego 200 (poprawka po incydencie f763bdb).
- **Supabase nigdy nie rzuca wyjątków:**
  - auth-js zwraca `{user:null, error}`, także przy błędach sieci (`GoTrueClient.js:2719-2726`).
  - postgrest zwraca `{error, status: 0}` przy błędach fetch (`postgrest-js/dist/index.mjs:416-450`).
- **Brak sekretów:** `createClient` zwraca `null` (`src/lib/supabase.ts:6-8`) i aplikacja działa jak dla niezalogowanego użytkownika. Jedynym sygnałem jest banner (`Layout.astro:22`).
- **Logowanie w aplikacji:** zero wywołań `console.*`.
- **Klient (przeglądarka):** brak `window.onerror` / `unhandledrejection` i ErrorBoundary. Islandy to formularze z natywnym POST.
- **Tożsamość wdrożenia:** brak wersji/wydania w kodzie, brak bloków `env` w `wrangler.jsonc`. Preview i produkcji nie da się rozróżnić.

**Założenia (poza repozytorium, nie są ustaleniami):**
- Zbieranie Workers Logs jest włączone, bo `observability.enabled: true` w `wrangler.jsonc:12`; to widać w repo. Sampling i retencja: niepotwierdzone.
- Reguły alertów i Logpush w Cloudflare: **potwierdzone jako nieobecne** (użytkownik: „nic nie sprawdzam”).
- Logi Auth/PostgREST w panelu Supabase: niepotwierdzone.
- Sposób wdrożenia (CI nie ma kroku deploy) i metadane wersji w panelu Cloudflare: niepotwierdzone.

## 3. Co trafia do logów (statycznie, bez dowodu z uruchomienia)

| Postać awarii | Odpowiedź | Workers Logs | Tracker | Werdykt |
|---|---|---|---|---|
| Wyjątek na stronie / w frontmatter | 500 (500.astro) | 1 linia `console.error` ze stosem, bez kontekstu | — | słabo |
| Wyjątek w trakcie strumienia SSR (klasa f763bdb) | 500 dzięki `bufferHtmlResponse` | jak wyżej | — | słabo |
| Awaria Supabase Auth w middleware | 302 → `/auth/signin` | nic | — | **niewidoczne** |
| Błąd lookupu profilu w middleware | 302 → `/dashboard`, widok klienta | nic | — | **niewidoczne** |
| Błąd zapytania historii (dashboard klienta / lista klientów) | **200** z kartą błędu | nic | — | **niewidoczne** |
| Błąd zapytania na stronie klienta / edycji wpisu | 404 „not found” | nic | — | **niewidoczne** |
| RLS / dryf schematu filtruje wiersze | 200 „No service entries yet” | nic | — | **niewidoczne** |
| Błąd insert/update wpisu | 302 `?error=<surowy komunikat>` | nic | — | **niewidoczne** |
| Błąd lookupu roli w API | 302 → `/dashboard`, **dane utracone** | nic | — | **niewidoczne** |
| Błąd JS w przeglądarce | — | nic | — | **niewidoczne** |

## 4. Systemowe przyczyny źródłowe

1. **„Błąd” i „brak danych” są obsługiwane tak samo.** Supabase zwraca błędy jako wartości (auth-js `GoTrueClient.js:2719-2726`, postgrest `index.mjs:416-450`), a kod destrukturyzuje tylko `data`:
   - `middleware.ts:19,24`
   - `api/clients/[id]/entries.ts:21,27`
   - `api/clients/index.ts:20`
   - `api/clients/[id]/entries/[entryId].ts:23,29`
   - `dashboard/mechanic/clients/[id].astro:24-36`
   - `edit.astro:16-29`
   - `dashboard.astro:36-40`

   Rozsądna lokalna decyzja („null → zamknij dostęp / 404 / pusty stan”) jest tu bezpieczna, ale ślepa. Wyjaśnia D1, D2, D5, D7, D8, D10.
2. **Błąd jest tłumaczony na odpowiedź dla użytkownika zamiast na 5xx z logiem:**
   - `dashboard.astro:30` (`loadError` → 200)
   - `dashboard/mechanic.astro:29`
   - `entries.ts:51`, `[entryId].ts:61`, `index.ts:39` (302 `?error=`)
   - `share/[token].astro:23-27` (404)

   Żaden handler nie zwraca 5xx, więc monitoring oparty na statusach nic nie zobaczy. Wyjaśnia D3, D4, D9, P1–P3.
3. **Jedynym kanałem logów jest linia ze stosem z Astro, bez kontekstu.** Linia pochodzi z `astro/dist/core/routing/handler.js:102`. W `src/` jest zero `console.*`, a `500.astro:4-7` odrzuca `error`. Brakuje ścieżki, id użytkownika i encji, wydania oraz `cause`. Wyjaśnia D13, P6.
4. **Ciche tryby awaryjne w danych i konfiguracji:**
   - Embedy filtrowane przez RLS znikają bez błędu (`dashboard.astro:25`, `[id].astro:27`).
   - `handle_new_user` domyślnie nadaje rolę `mechanic` (`supabase/migrations/20260923120000_service_entry_loop.sql:44-49`).
   - Brak sekretów → klient `null` (`supabase.ts:6-8`).

   Wyjaśnia D6, D12, P4.

## 5. Ustalenia

### Obszar: dashboard-entries (mechanik/klient widzi wpisy)

| # | Lokalizacja | Kategoria | Ważność | Co dzieje się na produkcji | Kierunek poprawki |
|---|---|---|---|---|---|
| D1 | src/middleware.ts:17-20 | missing-throw | critical | Awaria, timeout lub 5xx Supabase Auth → `user=null`. Każde wejście na dashboard to 302 na `/auth/signin`, a użytkownicy myślą, że zostali wylogowani. Osoba reagująca widzi normalne 302 i żadnego logu. | Odczytać `error`. `AuthSessionMissingError` traktować jako anonimowego użytkownika, resztę logować i zwracać 503. |
| D2 | src/middleware.ts:24-25, 40-41 | missing-throw | critical | Błąd lookupu profilu → `profile=null`. Mechanik trafia na `/dashboard`, gdzie zapytanie `clients` nie zwraca wiersza, i widzi 200 „No vehicle is linked…” (dashboard.astro:21-28). Nic nie jest logowane. | Rozróżnić `error` od braku wiersza. Przy błędzie logować i zwracać 503, a brak profilu dla zalogowanego logować jako błąd integralności. |
| D3 | src/pages/dashboard.astro:21-30 | flattened-response | critical | Błąd zapytania historii klienta → `loadError=true`. Strona „couldn't be loaded” zwraca **200**, a kod, komunikat i użytkownik są odrzucane. | Logować `error` z id użytkownika i trasą, ustawić `Astro.response.status = 503`. |
| D4 | src/pages/dashboard/mechanic.astro:21-29 | flattened-response | critical | To samo dla listy klientów mechanika: 200 z kartą błędu i brak logu. Przy `supabase === null` strona pokazuje „No clients yet”. | Jak D3. |
| D5 | src/pages/api/clients/[id]/entries.ts:21-23; api/clients/index.ts:20-22; [entryId].ts:23-25 | missing-throw | critical | Błąd lookupu roli przy POST → 302 na `/dashboard` → middleware → `/dashboard/mechanic`. **Wpis lub klient nie zostaje zapisany**, formularz przepada, komunikatu brak, logu brak. Wygląda to jak udany zapis, który „się nie pojawia”. **Zweryfikowane ręcznie.** | Rozróżnić błąd od „nie mechanik”. Przy błędzie logować i wracać na formularz z ogólnym komunikatem albo zwrócić 503. |
| D6 | dashboard.astro:25; dashboard/mechanic/clients/[id].astro:27 (RLS: 20260922120000_roles_and_domain_schema.sql:97-164) | missing-throw | critical | Regresja polityki RLS lub błąd migracji (klasa f763bdb) → embed bez wierszy → „No service entries yet” z 200 dla wszystkich użytkowników. Nie ma żadnego sygnału. | Smoke/canary po wdrożeniu: zapytanie o znanego, zaseedowanego klienta z oczekiwaną liczbą wpisów (rozszerzyć `scripts/smoke.mjs`). |
| D7 | dashboard/mechanic/clients/[id].astro:24-36 | flattened-response | high | Każdy błąd zapytania → **404** „Client not found”. Awaria wygląda jak złe id, a w metrykach Workera ląduje jako 4xx. | Sprawdzać `error`, logować, renderować 503. 404 zostawić tylko dla `data=null, error=null`. |
| D8 | edit.astro:16-29; entries.ts:27-30; [entryId].ts:29-37 | missing-throw | high | Błąd lookupu pojazdu lub wpisu (w tym PGRST116 z `maybeSingle`) → 404 albo 302 `?error=Client not found` / „Entry not found”. Zapis nie następuje, a prawdziwa przyczyna ginie. | Rozgałęzić na `error`, logować z id klienta i wpisu. |
| D9 | entries.ts:50-51; [entryId].ts:60-61; index.ts:39-42 | flattened-response | high | Błąd insert/update (także `raise exception` z triggera, 20260929120000:51) → 302 z surowym `error.message` w URL. `code`, `details`, użytkownik i encja są tracone, nic nie jest logowane. | Logować `{code, message, details, clientId, entryId, userId}`, użytkownikowi pokazywać stały, ogólny komunikat. |
| D13 | src/pages/500.astro:4-7 + middleware.ts:45 | logged-not-captured | high | Wyjątek w trakcie renderowania → 500 i jedna linia `console.error` ze stosem, bez trasy, użytkownika, encji i wydania. Nikt jej nie czyta ani nie dostaje alertu. | `try/catch` w middleware wokół `next()` + `bufferHtmlResponse`: strukturalny log (path, userId, params, release, cause), potem ponowne rzucenie. |
| D10 | src/pages/dashboard.astro:36-40 | swallowed | medium | Błąd zapytania o share link jest ignorowany. Istniejący link wyświetla się jako „Create share link”, co grozi duplikatami, a nic nie jest logowane. | Sprawdzać `error`, logować, pokazać stan degradacji na karcie. |
| D11 | [entryId].ts:64-67 | missing-context | medium | Update zablokowany przez RLS (0 wierszy, brak błędu) → „Entry not found”, choć pre-check w l.29 przeszedł, więc to rozjazd polityk. Komentarz uzasadnia zachowanie, ale luka zostaje niewidoczna. | Logować ostrzeżenie z id wpisu i użytkownika. |
| D12 | supabase/migrations/20260923120000_service_entry_loop.sql:44-49 | swallowed | medium | Klient, którego email nie pasuje do oczekującego rekordu (literówka, alias, rejestracja przed dodaniem przez mechanika), dostaje rolę **mechanic** i widzi pusty „No clients yet”. Nie da się tego odróżnić od prawdziwego mechanika. **Zweryfikowane ręcznie.** | Zapisać decyzję (log lub wiersz audytu przy braku dopasowania) albo oznaczać takie konta do przeglądu. |
| D14 | wszystkie przekierowania `?error=` (entries.ts:16,34,51; [entryId].ts:41,61,66) | noise | low | Błędy walidacji (oczekiwane) i błędy bazy (nieoczekiwane) dzielą jeden kanał. Przyszłe logowanie przy redirectach byłoby zaszumione. | Przed dodaniem logowania sklasyfikować: walidacja = info, baza = error. |
| D15 | src/components/mechanic/*.tsx | coverage-gap | low | Błąd hydracji lub renderu islandy zostawia niedziałający formularz bez żadnego sygnału. | Globalny `window.onerror` / `unhandledrejection` przy wprowadzaniu trackera. |

### Platforma / infrastruktura kodu

| # | Lokalizacja | Kategoria | Ważność | Co dzieje się na produkcji | Kierunek poprawki |
|---|---|---|---|---|---|
| P1 | src/pages/share/[token].astro:21-27 | flattened-response | high | Błąd RPC → 404, nie do odróżnienia od złego lub wygasłego tokenu. Komentarz uzasadnia zamknięcie dostępu, ale luka monitoringu zostaje. **Zweryfikowane ręcznie.** | Zachować 404 dla użytkownika, ale przy `result.error` logować (albo rzucać → 500). |
| P2 | api/share-link/index.ts:18-19; revoke.ts:17-18 | flattened-response | high | Błąd tworzenia lub unieważnienia linku → 302 z surowym komunikatem i brak logu. Nieudane unieważnienie zostawia link aktywny bez śladu. | Logować z id użytkownika i nazwą RPC. |
| P3 | api/auth/signin.ts:15-16; signup.ts:15-16 | flattened-response | high | Awaria Auth wygląda jak „złe hasło” (302 `?error=`). | Logować błędy inne niż 4xx `AuthApiError`. |
| P4 | src/lib/supabase.ts:6-8 | config | medium | Brak sekretów po wdrożeniu → wszyscy anonimowi. Jedynym sygnałem jest banner, nic nie jest logowane. | Poza DEV: rzucać wyjątek albo logować głośno przy pierwszym żądaniu. |
| P5 | api/auth/signout.ts:7 | swallowed | medium | Wynik `signOut` jest ignorowany, więc sesja po stronie serwera może przetrwać bez śladu. | Sprawdzać i logować `error`. |
| P6 | brak wersji w kodzie / wrangler.jsonc | missing-context | medium | Błędu nie da się powiązać z wdrożeniem ani migracją, a f763bdb był problemem kolejności wdrożenia. | Binding metadanych wersji Cloudflare albo zmienna `RELEASE`, dołączana do każdego logu. |
| P7 | astro default-handler.js:87,90 | swallowed | low | Gdy renderowanie 500.astro się wysypie → puste 500. Ponowne przejście middleware może też zamienić 500 w 302. | Trzymać 500.astro bez zależności, logować w middleware przed stroną błędu. |

## 6. Zalecana kolejność poprawek

1. **Wspólny helper logowania błędów** (np. `src/lib/report-error.ts`): `console.error(JSON.stringify({ level, msg, path, method, userId, entity, code, details, release, stack, cause }))`. Jeden punkt, z którego skorzystają wszystkie dalsze kroki, a później podmienialny na tracker. *Prywatność:* tylko id użytkownika, bez emaila i bez treści formularzy.
2. **Middleware:** rozróżnić błąd od braku danych dla `getUser` i profilu, a przy błędzie log + 503. Do tego `try/catch` wokół `next()` ze strukturalnym logiem i ponownym rzuceniem. Zamyka D1, D2, D13. Ograniczenie: 503 nie może omijać zamknięcia dostępu do `/dashboard/mechanic`.
3. **Strony dashboardu:** przy `error` log + `Astro.response.status = 503`. Na stronie klienta i edycji 404 tylko dla `error=null`. Zamyka D3, D4, D7, D8 (strony), D10.
4. **API routes:** lookupy roli i pojazdu rozgałęziać na `error`, mutacje logować z `code` i id, użytkownikowi pokazywać ogólny komunikat, a walidację oddzielić od błędów bazy. Zamyka D5, D8, D9, D14, P2, P3, P5.
5. **Tożsamość wydania** w helperze (Cloudflare version metadata binding). Zamyka P6.
6. **Canary po wdrożeniu** w `scripts/smoke.mjs`: znany klient ma N wpisów. Zamyka D6 i łapie klasę f763bdb bez wyjątków.
7. **Poza kodem (decyzja, nie ustalenie):** gdy logi będą miały strukturę, dodać tracker (np. `@sentry/cloudflare` przez ten sam helper) albo alert na `level:error` w Workers Logs. Bez tego kroki 1–6 dają diagnozowalność, ale nie wykrywanie.
8. D11, D12, P1, P4, P7, D15: lokalne poprawki po krokach 1–4.

## 8. Metoda i ograniczenia

- **Agenci:** dwóch audytorów tylko do odczytu, uruchomionych równolegle: przepływ dashboard-entries oraz infrastruktura kodu (middleware, strona błędu, Supabase, auth, share-link, klient). Model przechwytywania zbudowano ręcznie przed ich startem.
- **Wyrywkowo zweryfikowane ręcznie:**
  - D5: `entries.ts:21-23` przekierowuje przed zapisem.
  - D3/D4: strony dashboardu nie ustawiają statusu, a 404 ustawiają tylko `[id].astro:35` i `edit.astro:28`.
  - D12: trigger `handle_new_user` w gałęzi `else` wstawia `'mechanic'`.
  - Logowanie Astro: `handler.js:101-102` loguje `err.stack` jako tekst, `console.js:11` → `console.error`.
  - P1: komentarz i kod w `share/[token].astro:21-27`.

  Wszystko się potwierdziło. Nic nie zostało odrzucone.
- **Odrzucone jako warunek wstępny:** „brak trackera błędów w projekcie” i „brak alertów” przeniesiono do Założeń / kroku 7, nie są przyczyną źródłową.
- **Przegląd całego repo (src, bez testów):** `console.*` = 0, pusty catch = 1 (`CopyButton.tsx:28`, uzasadniony widocznym fallbackiem), `.catch(()=>…)` = 0, `throw` = 0, błędy z `cause` = 0, wywołania Supabase bez sprawdzenia `error` = 6+.
- **Dowód z uruchomienia:** nie wykonano (`runtime_proof: not-run`). Wymaga lokalnego Supabase (Docker), izolowanego worktree i `scripts/fake-ingest.mjs`. Wszystkie werdykty w sekcji 3 są **wyłącznie statyczne**.
- **Nieweryfikowalne z repo:** jak Workers Logs renderuje linie `console.error` z Astro (kody ANSI, sampling), logi po stronie Supabase.
