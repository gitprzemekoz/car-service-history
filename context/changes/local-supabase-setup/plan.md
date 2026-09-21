# Proces: lokalna baza danych Supabase (do zatwierdzenia)

> Status: do zatwierdzenia — ten dokument opisuje kroki, ale ich nie wykonuje. Po akceptacji wykonujemy je ręcznie / na żądanie.

## Kontekst

Projekt (`10x-astro-starter`) ma Supabase wybrane w `context/foundation/tech-stack.md` jako backend (Postgres + auth + storage) i jest już częściowo skonfigurowany:

- `supabase/config.toml` istnieje (wygenerowany przez `supabase init`, `project_id = "10x-astro-starter"`, Postgres 17, API na porcie 54321, DB na 54322, Studio na 54323).
- `package.json` ma zależności `@supabase/supabase-js`, `@supabase/ssr` oraz CLI `supabase` jako devDependency.
- `.env.example` ma placeholdery `SUPABASE_URL=###` i `SUPABASE_KEY=###`.
- `README.md` zawiera pełną sekcję „Supabase Configuration” z tym samym procesem — ten dokument go nie zmienia, tylko spisuje jako proces do zatwierdzenia przed wykonaniem w tym środowisku.

Brakuje: realnie uzupełnionego `.env`/`.dev.vars` oraz uruchomionego lokalnego stacku Docker — nic z tego nie zostało jeszcze wykonane w tym środowisku.

## Wymagania wstępne

- Zainstalowany i uruchomiony [Docker](https://www.docker.com/) (Desktop lub silnik), ~7 GB wolnego RAM.
- Node.js v22.14.0 i `npm install` już wykonane.

## Kroki

1. **Utwórz plik `.env`** (jeśli jeszcze nie istnieje):
   ```bash
   cp .env.example .env
   ```

2. **Zainicjalizuj lokalny projekt Supabase** — pomijalne, `supabase/config.toml` już jest w repo:
   ```bash
   npx supabase init
   ```

3. **Uruchom lokalny stack** (pierwsze uruchomienie pobiera obrazy Docker):
   ```bash
   npx supabase start
   ```
   Uruchomi: API (`54321`), DB (`54322`), Studio (`54323`), Inbucket/testowy SMTP (`54324`).

4. **Skopiuj dane logowania wypisane przez CLI** do `.env` oraz `.dev.vars` (utwórz `.dev.vars` przez `cp .env.example .dev.vars`, jeśli nie istnieje):
   ```
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_KEY=<anon key z wyjścia CLI>
   ```

5. **Potwierdzanie e-mail** — w `supabase/config.toml` `auth.email.enable_confirmations` jest już ustawione na `false`, więc dla środowiska lokalnego ten krok jest zbędny. Dotyczy tylko projektu chmurowego (tam trzeba ręcznie wyłączyć w dashboardzie: `Authentication → Email → Confirm email`).

6. **Weryfikacja**:
   ```bash
   npm run dev
   ```
   - Otwórz Supabase Studio pod `http://localhost:54323` i sprawdź, że tabela `auth.users` jest widoczna.
   - Przejdź przez flow `/auth/signup` → `/auth/signin` → `/dashboard`, żeby potwierdzić że auth działa end-to-end.

7. **Zatrzymanie stacku** po zakończeniu pracy:
   ```bash
   npx supabase stop
   ```

## Uwagi

- Projekt nie wymaga żadnych migracji ani własnych tabel — korzysta wyłącznie z wbudowanej tabeli `auth.users` Supabase Auth.
- Ten proces nie modyfikuje `README.md` ani innych plików repozytorium — jest to wyłącznie dokument do przeglądu przed wykonaniem kroków.
