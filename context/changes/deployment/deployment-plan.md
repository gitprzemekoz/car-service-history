# Pierwsze wdrożenie: car-service-history → Cloudflare Workers

## Context

`context/foundation/infrastructure.md` rekomenduje Cloudflare Workers jako platformę MVP (5/5 w kryteriach agent-friendly, darmowy tier pokrywa spodziewany ruch). Projekt jest już zbootstrapowany pod Workers: `astro.config.mjs` ma `adapter: cloudflare()` i `output: "server"`, a `wrangler.jsonc` ma poprawny `main` (nie `pages_build_output_dir`) i `nodejs_compat`. Mimo to **żaden deploy jeszcze się nie odbył** — nie ma workflow CI/CD, repo GitHub nie jest podpięte do Cloudflare, a `wrangler.jsonc`/`tech-stack.md` mają przestarzałe/niespójne metadane (nazwa Workera z szablonu, `deployment_target: cloudflare-pages`).

Użytkownik chce **automatycznego deployu po każdym pushu do `main`** realizowanego natywnym mechanizmem Cloudflare (Workers Builds — Git integration), **bez GitHub Actions**. Repo (`gitprzemekoz/car-service-history`, branch `main`) nie jest jeszcze podpięte do Cloudflare — to krok wykonywany ręcznie przez użytkownika w dashboardzie (OAuth GitHub App), którego nie da się zeskryptować z CLI.

Zakres tego pierwszego wdrożenia: manualne/dashboardowe podpięcie repo + weryfikacja pierwszego deploya. Cron Trigger dla FR-008 i pełna automatyzacja przez GitHub Actions są świadomie poza zakresem (ustalone z użytkownikiem).

## Warunki wstępne

Zanim wykona się kroki z „Planu działania”, poniższe musi być gotowe. To jednorazowa konfiguracja narzędzi i kont — nieoddzielna od reszty planu, ale wykonywana raz, zwykle ręcznie przez użytkownika.

### A. Wrangler CLI / konto Cloudflare

1. Node.js w wersji zgodnej z `.nvmrc` (v22.14.0) i `npm ci` w repo — instaluje `wrangler ^4.131.1` i `supabase` CLI `^2.23.4` jako devDependencies (już w `package.json`, nic dodatkowego do zainstalowania globalnie).
2. Konto Cloudflare (darmowy plan wystarcza na start) — jeśli nie istnieje, założyć na [dash.cloudflare.com](https://dash.cloudflare.com).
3. Zalogować CLI: `npx wrangler login` (otwiera przeglądarkę, autoryzacja OAuth). Zweryfikować: `npx wrangler whoami`.
   - Logowanie CLI jest potrzebne do ustawienia sekretów (`wrangler secret put`, krok 4 planu) i do opcjonalnego ręcznego `wrangler deploy` jako sanity-check — **nie** jest wymagane do samego podpięcia repo przez Workers Builds (to działa z poziomu dashboardu, niezależnie od stanu logowania CLI na tej maszynie).
4. Jeśli `wrangler whoami` pokaże więcej niż jedno konto/organizację Cloudflare, zanotować właściwy `account_id` i rozważyć dodanie `"account_id"` do `wrangler.jsonc` — usuwa niejednoznaczność przy podpinaniu repo w kroku 3 planu.

**Status:** ✅ Zweryfikowano — CLI zalogowane jako `przemekoz@o2.pl` (OAuth token), jedno konto Cloudflare: `Przemekoz@o2.pl's Account` (`account_id: 8ac61d4ae3985c4bec5d219a3883885e`). Brak niejednoznaczności — dopisywanie `account_id` do `wrangler.jsonc` niepotrzebne.

### B. Projekt Supabase (produkcyjny)

Obecnie w repo istnieje tylko konfiguracja **lokalnego** stacku Supabase (`supabase/config.toml`, uruchamiany przez `npx supabase start` w Dockerze do dev/CI). Do produkcyjnego wdrożenia potrzebny jest osobny, hostowany projekt Supabase — jeszcze nieutworzony.

1. Założyć konto na [supabase.com](https://supabase.com/) (jeśli nie istnieje) i utworzyć nowy projekt produkcyjny w dashboardzie.
   - Region: wg rejestru ryzyk z `infrastructure.md` wybrać region możliwie blisko Cloudflare edge (mniejszy risk regionalnego mismatchu SSR↔DB); przy braku wyraźnie najbliższego regionu — dowolny, i ewentualnie rozważyć Hyperdrive później, nie teraz.
   - Ustawić silne hasło do bazy i zapisać bezpiecznie (aplikacja go nie używa bezpośrednio — korzysta tylko z `anon` key przez Supabase Auth — ale hasło jest potrzebne do bezpośredniego dostępu do DB/Studio).
2. Z **Project Settings → API** skopiować `Project URL` i klucz `anon public` — to wartości, które w kroku 4 planu trafią jako `SUPABASE_URL`/`SUPABASE_KEY` do Worker Secrets. Nie potrzeba `service_role` key (kod używa wyłącznie `anon`, patrz `src/lib/supabase.ts`).
3. **Schema/migracje**: nic do zrobienia — `supabase/migrations/` jest puste celowo, projekt korzysta wyłącznie z wbudowanej tabeli `auth.users` (patrz `README.md`, sekcja „Supabase Configuration”). `supabase db push`/`supabase link` nie są wymagane.
4. **Authentication → URL Configuration**: ustawić `Site URL` i `Redirect URLs` na docelowy adres produkcyjny (`https://car-service-history.<subdomain>.workers.dev`, znany dopiero po pierwszym deployu z kroku 5 planu — jeśli trzeba skonfigurować wcześniej, adres da się przewidzieć z nazwy Workera ustawionej w kroku 1). Bez tego linki potwierdzające e-mail po rejestracji będą wskazywać na `localhost`.
5. **Potwierdzanie e-mail w produkcji** — decyzja do podjęcia świadomie, nie automatyczna: domyślnie Supabase wymaga potwierdzenia e-mail przed logowaniem, a wbudowany serwer pocztowy Supabase ma ścisłe limity wysyłki (kilka maili/godzinę) — niewystarczające na realne rejestracje. Do wyboru: (a) skonfigurować własny SMTP w **Authentication → Settings → SMTP** przed pierwszym publicznym użyciem, albo (b) świadomie zaakceptować ograniczoną wysyłkę na czas MVP/demo. Instrukcja z README o wyłączaniu potwierdzania e-mail dotyczy wyłącznie lokalnego dev — **nie** wyłączać jej w produkcji bez jawnej decyzji użytkownika.

**Status:** ✅ Użytkownik potwierdził — produkcyjny projekt Supabase utworzony, `Project URL` i klucz publiczny (`publishable key` — aktualna nazwa Supabase dla klucza pełniącego rolę dotychczasowego `anon` key, używanego w `src/lib/supabase.ts` jako `SUPABASE_KEY`) pozyskane i gotowe do wpisania jako Worker Secrets w kroku 4 planu.

## Plan działania

### 1. Popraw niespójne metadane (przed pierwszym deployem)
- `wrangler.jsonc`: zmień `"name": "10x-astro-starter"` → `"name": "car-service-history"` (nazwa Workera = nazwa projektu; wpływa na URL `*.workers.dev`).
- `context/foundation/tech-stack.md`: zmień `deployment_target: cloudflare-pages` → `deployment_target: cloudflare-workers` w front matterze, żeby było spójne z faktycznym adapterem/`wrangler.jsonc`.

**Status:** ✅ Wykonano — obie zmiany wprowadzone.

### 2. Zanotuj (i opcjonalnie napraw) rozjazd branchy w `ci.yml`
`.github/workflows/ci.yml` triggeruje się na `branches: [master]`, ale bieżący branch repo to `main` — istniejący CI (lint/build/smoke) obecnie **nigdy się nie uruchamia** na pushach/PR-ach do `main`. To nie blokuje deployu przez Cloudflare Workers Builds (osobny mechanizm), ale warto to odnotować jako zastany defekt i zaproponować użytkownikowi szybką poprawkę (`master` → `main`) jako osobny, jednozdaniowy fix — nie wykonuj bez wyraźnej zgody, bo dotyczy pliku spoza zakresu deploya.

**Status:** ✅ Naprawiono — `branches: [master]` → `branches: [main]` w obu triggerach (`push`, `pull_request`) w `.github/workflows/ci.yml`.

### 3. Podłącz repo GitHub do Cloudflare Workers Builds (wymaga działania użytkownika w dashboardzie)
Nie da się tego zrobić z CLI/agenta — poprowadź użytkownika krok po kroku:
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository** (Git integration dla Workers, tzw. Workers Builds).
2. Autoryzuj Cloudflare GitHub App i wybierz repo `gitprzemekoz/car-service-history`.
3. Branch produkcyjny: `main`.
4. Build command: `npm run build`. Build output / deploy: Workers Builds wykryje `wrangler.jsonc` i użyje `npx wrangler deploy` automatycznie — nie trzeba osobnej komendy deploy.
5. Root directory: `/` (repo root).

### 4. Skonfiguruj sekrety produkcyjne
Zgodnie z aktualnym kodem (`src/lib/supabase.ts`, `.env.example`) aplikacja oczekuje `SUPABASE_URL` i `SUPABASE_KEY` (anon/publishable key) — **nie** `SUPABASE_SERVICE_ROLE_KEY`, mimo że `infrastructure.md` o nim wspomina (rozbieżność już odnotowana w tym planie, celowo pomijamy service role key w tym wdrożeniu).
- Ustaw jako Worker Secrets: `npx wrangler secret put SUPABASE_URL` i `npx wrangler secret put SUPABASE_KEY` (albo równoważnie w Dashboard → Worker → Settings → Variables and Secrets).
- To krok wymagający zatwierdzenia przez człowieka (produkcyjne sekrety) — wykonaj tylko po jawnej zgodzie użytkownika w kolejnej sesji, nie automatycznie.

**Status:** ✅ Wykonano w Dashboard → Settings → Variables and Secrets (jako `Secret`, `secret_text`) — potwierdzone przez `npx wrangler secret list`.

**Ważna pułapka po drodze:** pierwsza próba dodania sekretów (literówka `SUPABAE_URL`, potem poprawka) została zrobiona przez ekran „Edit code”/preview deployu — to tworzy zmienne **przypisane do tej jednej wersji**, nie trwałą konfigurację Workera. Kolejny automatyczny build z Git (Workers Builds, po zwykłym pushu np. zmiany w dokumentacji) nadpisał je nową wersją bez tych zmiennych, i strona znów pokazała „Supabase nie jest skonfigurowany”. Naprawione dopiero po dodaniu zmiennych przez **Settings → Variables and Secrets** (trwałe, przeżywa kolejne buildy) — tą drogą, nie przez edytor wersji, trzeba ustawiać sekrety produkcyjne w tym projekcie.

### 5. Pierwszy deploy i weryfikacja
- Push do `main` (lub „Retry deployment” w dashboardzie) uruchomi automatyczny build+deploy przez Workers Builds.
- Sprawdź: status builda w dashboardzie, `npx wrangler deployments list`, otwarcie wygenerowanego `*.workers.dev` URL, `npx wrangler tail` pod kątem błędów SSR/Supabase przy pierwszych requestach.
- Zwróć uwagę na ryzyko z `infrastructure.md`: limit 10ms CPU-time/invocation na darmowym planie może zostać przekroczony przez SSR + zapytania do Supabase — jeśli wystąpią błędy 5xx/timeouty, rekomendacja to upgrade do planu Standard ($5/mo), nie zmiana architektury.

**Status:** ✅ Zweryfikowano.
- Worker `car-service-history` zbudowany i wdrożony przez Workers Builds z commita `3901bfd` na `main` (deployment `13:35:07 UTC`, wersja `825cb706`).
- Ważny fakt operacyjny: Git integration w tym projekcie utworzył Worker pod subdomeną kontowego loginu `przemekoz` (konto Cloudflare zalogowane jako `przemekoz@o2.pl`), tj. **`https://car-service-history.przemekoz.workers.dev/`** — nie pod nazwą użytkownika systemu Windows widoczną gdzie indziej (`pkozinski`). To jest właściwy adres produkcyjny do zapamiętania/użycia w konfiguracji Supabase Auth URL (krok B.4 warunków wstępnych).
- Strona główna zwraca HTTP 200 i renderuje właściwy SSR HTML (nie placeholder „Hello World”, nie 404 jak przy błędnym imporcie jako Pages).
- Brak banera „Supabase nie jest skonfigurowany” na stronie głównej — `SUPABASE_URL`/`SUPABASE_KEY` widoczne w runtime.
- End-to-end test `/api/auth/signup` (z poprawnym `Origin` header, by przejść ochronę CSRF Astro) faktycznie dotarł do Supabase Auth API — odpowiedź `Email address is invalid` dla testowego adresu `@example.com` to realna walidacja Supabase, plus poprawne cookies auth z project ref `khuxupqlivgmikebcubq`. Potwierdza to pełną łączność SSR ↔ Supabase w produkcji.
- `Site URL`/`Redirect URLs` w Supabase Auth ustawione na `https://car-service-history.przemekoz.workers.dev` (warunek wstępny B.4) — potwierdzone.
- Finalny end-to-end test po ustawieniu trwałych sekretów: `/api/auth/signup` zwraca realną odpowiedź Supabase Auth (`email rate limit exceeded` — spodziewane po wcześniejszych testowych żądaniach), z tym samym project ref `khuxupqlivgmikebcubq` — połączenie SSR ↔ Supabase w pełni działa.

### 6. Zaktualizuj README
- Zaktualizuj sekcję „Deployment” w `README.md`, żeby odzwierciedlała mechanizm Cloudflare Workers Builds (auto-deploy na push do `main`) jako główną ścieżkę, z ręcznym `npx wrangler deploy` jako fallbackiem.

**Status:** ✅ Wykonano.

## Kluczowe pliki
- `wrangler.jsonc` — nazwa Workera, konfiguracja Workers.
- `context/foundation/tech-stack.md` — front matter `deployment_target`.
- `.github/workflows/ci.yml` — rozjazd branchy `master`/`main` (do odnotowania).
- `README.md` — sekcja Deployment.
- `src/lib/supabase.ts`, `.env.example` — źródło prawdy co do nazw sekretów (`SUPABASE_URL`, `SUPABASE_KEY`).

## Weryfikacja końcowa
1. `git log` / dashboard Cloudflare pokazuje udany build z commita na `main`.
2. Aplikacja odpowiada pod `*.workers.dev` (strona główna ładuje się, formularz logowania/rejestracji widoczny).
3. `npx wrangler tail` podczas próby logowania nie pokazuje błędów braku `SUPABASE_URL`/`SUPABASE_KEY` (sekrety faktycznie widoczne w runtime).
4. `npx wrangler deployments list` pokazuje deployment odpowiadający najnowszemu commitowi na `main`.
