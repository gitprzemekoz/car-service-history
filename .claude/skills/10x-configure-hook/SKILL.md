---
name: 10x-configure-hook
description: >
  Turn the quality gates from context/foundation/test-plan.md into working
  agent hooks and prove them before handing off. Detects the harness from the
  repo (Claude Code, Cursor, Codex, GitHub Copilot), audits existing hook
  config, maps each gate to a moment (per edit, end of turn, commit, push,
  CI), generates config and scripts in that harness's signal protocol, and
  runs every script against a deliberately broken file. Trigger phrases:
  "configure hooks", "set up agent hooks", "lint after every edit", "hook
  fires but the agent ignores it", "skonfiguruj hooki", "hook po edycji",
  "agent nie widzi błędów z hooka". Use AFTER /10x-test-plan (M3L1). Does
  not write git pre-commit/pre-push config — it only recommends it.
---
# 10x Configure Hook — bramki jakości jako haki agenta, sprawdzone

Ta umiejętność zamienia bramki, na które projekt już się zdecydował, w haki, które agent faktycznie odbiera. Hak jest użyteczny tylko wtedy, gdy jego komunikat dociera do agenta kanałem, który harness odczytuje dla tego zdarzenia. Większość zepsutych haków działa poprawnie i wypisuje na kanał, którego nikt nie nasłuchuje — dlatego ta umiejętność nigdy nie przekazuje haka, którego nie uruchomiła.

Pracuj w tej kolejności. Każdy krok ma wynik, który wykorzystuje następny krok; raport końcowy (Krok 8) je zbiera.

## Kluczowe zasady

1. **Przeprowadzaj wywiad z repozytorium, nie z użytkownikiem.** Wszystko widoczne na dysku — harness, toolchain, istniejące haki, plan testów — jest odczytywane, nie jest przedmiotem pytań. Pytaj tylko o to, na co repozytorium nie potrafi odpowiedzieć.
2. **Kanał sygnału zależy od harnessu i zdarzenia.** Nigdy nie zakładaj, że kody wyjścia, stderr, stdout lub pole JSON oznaczają to samo w dwóch harnessach. Fakty znajdują się w `references/<harness>.md`; korzystaj z nich, a gdy możesz przeglądać dokumentację i jest z nimi sprzeczna, preferuj bieżącą dokumentację.
3. **Na każdą edycję oznacza edytowany plik.** Hak per-edit odczytuje ścieżkę edytowanego pliku z payloadu i sprawdza tylko ten plik. Kontrole całego projektu przenieś na koniec tury lub później.
4. **Najpierw udowodnij, potem przekaż.** Każdy wygenerowany skrypt jest uruchamiany z przykładowym payloadem na celowo zepsutym pliku oraz na poprawnym, zanim raport zostanie napisany.
5. **Scalaj, nigdy nie nadpisuj.** Istniejąca konfiguracja haków jest audytowana i scalana; diff jest pokazywany przed zapisem.

---

## Krok 1 — Warunki wstępne: przeczytaj plan testów

Poszukaj `context/foundation/test-plan.md`. Znajdź jego sekcję bramek jakości **po tytule** (`"Quality Gates"` lub bliskim wariancie) — nigdy po numerze sekcji; numeracja zmienia się między wersjami schematu.

Z tabeli bramek zapisz jeden wiersz na bramkę: nazwę bramki, gdzie działa (`"local"`, `"local (agent loop)"`, `"CI on PR"`…), wymagalność (`"required"`, `"required after §3 Phase N"`, `"recommended after…"`, `"optional"`) oraz co wykrywa. Wiersze dotyczące pętli agenta — `"post-edit hook"`, `"lint + typecheck"`, `"unit + integration"` — są głównym wejściem.

Zapisz również **jawne odroczenia**: każdą bramkę lub wiersz oznaczony jako `"deferred"`, `"not v1"`, `"later"`, `"out of scope"` lub podobnie, wraz z cytowanym sformułowaniem i uzasadnieniem podanym przez plan. Odroczenia są decyzjami, a nie lukami.

Jeśli plik nie istnieje lub nie ma sekcji bramek jakości: wyprowadź kandydatów na bramki z własnych skryptów repozytorium (Krok 3) i podaj w raporcie `"No test plan found — gates derived from the toolchain"`. Zasugeruj `/10x-test-plan`, aby podjąć rzeczywistą decyzję o bramkach, ale nie zatrzymuj się.

## Krok 2 — Wykryj harness(y)

Każdy plik referencyjny otwiera sekcja **Detection signals**. Przeczytaj te sekcje dla każdego pliku w `references/` i dopasuj je do repozytorium. Typowe sygnały:

- Claude Code: katalog `.claude/` (`settings.json`, `settings.local.json`, `skills/`), `CLAUDE.md`.
- Cursor: `.cursor/` (`hooks.json`, `rules/`, `skills/`), `.cursor/rules/10x-course.mdc`.
- Codex: `.codex/` (`hooks.json`, `config.toml`), `.agents/skills/`, `AGENTS.md`.
- GitHub Copilot: `.github/hooks/`, `.github/skills/`, `.github/copilot-instructions.md`.
- Manifest 10x-cli: `.claude/`, `.cursor/`, `.github/` lub `.agents/.10x-cli-manifest.json` — jego pole `"tool"` wskazuje harness, dla którego zainstalowano artefakty kursu.

Katalogi konfiguracji specyficzne dla harnessu i manifest są silnymi sygnałami. `AGENTS.md` oraz `.agents/skills/` są słabymi: wiele harnessów odczytuje `AGENTS.md`, a 10x-cli zapisuje też `.agents/skills/` w repozytoriach Claude Code.

**Rozstrzygnięcie remisu:** katalog, z którego załadowano tę umiejętność, określa harness, który konfigurujesz. Wypisz każdy inny znaleziony harness wraz ze ścieżką dowodu; zapytaj raz — oferując wykryte opcje — tylko jeśli potrzebny jest także inny harness lub ma już konfigurację haków.

## Krok 3 — Wykryj toolchain

Czytaj manifest i konfigurację, nie polegaj na pamięci. Dla każdej bramki zapisz dokładne polecenie używane przez to repozytorium:

- **Lint / format** — linter projektu oraz informacja, czy akceptuje ścieżkę pojedynczego pliku (ESLint, Biome, Ruff, golangci-lint, RuboCop…). Preferuj lokalny binarny plik (`npx`, `pnpm exec`, `uv run`, …), którego repozytorium już używa. Wyprowadź sprawdzane rozszerzenia plików z konfiguracji lintowania, nie z przykładów (np. dodaj `.astro`, gdy skonfigurowano `eslint-plugin-astro`, podobnie `.vue` / `.svelte`).
- **Typecheck** — polecenie dla całego projektu (`tsc --noEmit`, `astro check`, `mypy`, `cargo check`, …) oraz przybliżony czas jego wykonania. Frameworki z generowanymi typami najpierw wymagają kroku synchronizacji (`tsc` kończy się błędem dla modułów `astro:*`, dopóki `astro sync` nie wygeneruje `.astro/`; `astro check` synchronizuje sam, ale jest wolniejszy). Wygenerowane katalogi zwykle są ignorowane przez git, więc synchronizacja, która naprawia bazowy stan, należy do skryptu końca tury, a nie do jednorazowego polecenia.
- **Baseline** — uruchom każdą kontrolę końca tury raz na niezmodyfikowanym drzewie. Jeśli jest już czerwona (brak wygenerowanych typów, zagnieżdżony pakiet z niezainstalowanymi zależnościami wciągnięty przez główne `**/*` include, …): napraw warunek wstępny (wygeneruj typy), ogranicz zakres polecenia (projektowy tsconfig, filtr ścieżki, diagnostyka ograniczona do zmienionych plików) albo zgłoś to jako blokadę. Nigdy nie przekazuj haka Stop, który blokuje na czystym drzewie.
- **Tests** — runner oraz informacja, czy ma tryb testów powiązanych (`vitest related <file> --run`, `jest --findRelatedTests <file> --passWithNoTests`, `pytest` ze ścieżką, …). Zwróć uwagę, co runner robi, gdy żaden test nie pasuje (exit 0 czy nie). Zmierz raz cały zestaw testów jednostkowych: jeśli kończy się w około 30 s lub mniej, skrypt końca tury uruchamia wszystkie testy (wtedy wykrywa także czerwony test w module, który agent jedynie zaimportował); w przeciwnym razie uruchamia testy powiązane ze zmienionymi plikami.
- **Git-hook manager** — Husky, lint-staged, Lefthook, pre-commit lub brak. Istniejące haki git nie są nigdy modyfikowane przez tę umiejętność.
- **Wymagania wstępne skryptów** — `jq` dla skryptów bash albo Node/Python, jeśli skrypt inny niż bash jest bezpieczniejszy (Windows bez Git Bash).

## Krok 4 — Przypisz bramki do momentów; przeprowadź audyt istniejących elementów

**Momenty**, najpierw najtańszy sygnał:

| Moment | Należy tutaj | Dociera do agenta |
| --- | --- | --- |
| Na każdą edycję | Lint/format edytowanego pliku; powiązane testy, gdy kończą się w kilka sekund | Tak |
| Koniec tury | Lint + testy dla każdego pliku zmienionego w tej turze; typecheck całego projektu | Tak |
| Pre-commit | Lint + testy na plikach w stagingu (wychwytuje edycje wykonane bez agenta) | Nie |
| Pre-push | Cięższe zestawy testów, lokalne e2e | Nie |
| CI | Integracja, współdzielony stan, infrastruktura, której nie masz lokalnie | Nie |

Heurystyka szybkości: **im wolniejsza kontrola, tym rzadszy moment.** Kilka sekund mieści się na każdą edycję; dziesiątki sekund lub zakres całego projektu należą do końca tury; minuty należą do commita, push lub CI.

Moment per-edit widzi wyłącznie narzędzia edycji harnessu. Agenci przepisują także pliki poleceniami powłoki (`cat > file <<EOF`, `sed -i`), których żaden hak per-edit nie otrzymuje. Koniec tury jest więc siatką bezpieczeństwa dla całej tury, nie tylko momentem typecheck: ponownie sprawdza każdy zmieniony plik z `git diff`.

**Odroczenia.** Gdy plan testów jawnie odracza bramkę, która stałaby się hakiem (na przykład `"post-edit hook — deferred, not v1"`), zacytuj użytkownikowi odroczenie i jego uzasadnienie, a następnie zapytaj **raz**: skonfigurować mimo to, czy uszanować odroczenie? Zapisz odpowiedź jako `override` lub `skip` w raporcie. Nie pytaj ponownie dla każdego haka.

**Przeprowadź audyt istniejącej konfiguracji haków przed zaproponowaniem czegokolwiek.** Przeczytaj pliki konfiguracji haków harnessu (ścieżki w referencji) i każdy skrypt w jego katalogu haków, w tym skrypty, do których nie odwołuje się konfiguracja (np. osierocony `.claude/hooks/run-related-tests.mjs`, który wypisuje tylko do stdout). Dla każdego istniejącego haka nazwij konkretne wady, na przykład:

- lint całego projektu lub `--fix .` przy każdej edycji (wolne, modyfikuje pliki, których agent nie edytował, zgłasza stare błędy jako szum);
- polecenie, którego niepowodzenie kończy się kodem traktowanym przez harness jako nieblokujący albo wypisuje na kanał, który nigdy nie dociera do agenta (np. exit 1 + stdout, gdy harness przekazuje tylko stderr przy exit 2);
- timeouty wyglądające jak milisekundy (`10000`, `30000`), podczas gdy harness oczekuje sekund;
- typecheck całego projektu przy każdej edycji zamiast na końcu tury;
- hak końca tury bez zabezpieczenia przed ponowieniem (może zapętlić się aż do limitu harnessu);
- ta sama kontrola zarejestrowana dwa razy (Cursor i Copilot mogą importować `.claude/settings*.json` — zobacz ich referencje).

Przedstaw razem mapę momentów i ustalenia audytu jako propozycję. Poczekaj na zgodę użytkownika przed zapisaniem plików.

## Krok 5 — Wczytaj referencję harnessu

Przeczytaj `references/<harness>.md` dla każdego harnessu, który skonfigurujesz:

- `references/anthropic.md` — Claude Code
- `references/cursor.md`
- `references/codex.md`
- `references/copilot.md`
- `references/other-harnesses.md` — Devin Desktop, Gemini CLI, OpenCode, Kiro, Junie: wyłącznie linki i uwagi o możliwościach. Dla nich wyjaśnij ograniczenie i wskaż dokumentację zamiast generować konfigurację, której nie potrafisz udowodnić.

Każda referencja zaczyna się od `Verified on:` oraz kanonicznych URL-i dokumentacji. Jeśli możesz przeglądać, otwórz podlinkowaną dokumentację i ponownie sprawdź pole payloadu edytowanego pliku, kanał docierający do agenta oraz jednostkę timeoutu. W razie konfliktu postępuj zgodnie z bieżącą dokumentacją i zapisz rozbieżność w raporcie (`"reference says X, doc now says Y"`).

## Krok 6 — Wygeneruj konfigurację i skrypty

Postępuj według minimalnych przykładów z referencji; dostosuj polecenia do toolchainu z Kroku 3.

- **Skrypt per-edit** — odczytuje payload ze stdin, wyodrębnia ścieżkę edytowanego pliku za pomocą pól wskazanych przez referencję, kończy się sukcesem, gdy ścieżki brakuje lub typ pliku nie jest sprawdzany, i uruchamia kontrolę **wyłącznie na tym pliku**. W razie niepowodzenia wysyła krótki nagłówek oraz wynik narzędzia kanałem, który dociera do agenta.
- **Skrypt końca tury** — przegląda turę: zbiera zmienione i nowe pliki (`git diff --name-only HEAD` plus nieśledzone), kończy się wcześnie, gdy ich nie ma, uruchamia kontrole per-edit dla wszystkich (lint na objętych plikach; powiązane testy albo cały zestaw testów jednostkowych, gdy Krok 3 stwierdził, że jest szybki), następnie typecheck całego projektu i raportuje wszystkie niepowodzenia w jednym komunikacie. Uwzględnia flagę ponawiania harnessu (`stop_hook_active` w Claude Code lub odpowiednik wskazany przez referencję), aby agent dostał **jedną** szansę na naprawę, a następnie mógł zakończyć. To, czego nie potrafi naprawić, zostawia bramce commita. Utrzymaj łączny czas poniżej timeoutu (domyślnie 120 s); jeśli przegląd jest wolniejszy, najpierw ogranicz testy tylko do powiązanych.
- **Zwykłe wyjście** — wynik haka jest czytany przez model, nie terminal: `tsc --pretty false`, `grep --color=never`, `NO_COLOR=1 FORCE_COLOR=0` dla wszystkiego innego. Skrypty dziedziczą środowisko powłoki użytkownika (np. `GREP_OPTIONS=--color=always` psuje filtr grep), więc ustaw te wartości jawnie.
- **Payloady są niezaufanymi strukturami wejściowymi.** Akceptuj każdą udokumentowaną strukturę: toleruj brakujące pola, pusty stdin i alternatywne nazwy pól; nigdy nie kończ haka błędem, ponieważ brakuje pola. Brakująca ścieżka oznacza „nic do sprawdzenia”, nie błąd.
- **Timeouty** w jednostce oczekiwanej przez harness (zwykle sekundy): około 30 dla lintu per-edit, 60 dla powiązanych testów, 120 dla typecheck — następnie dostrój.
- **Ścieżki** — odwołuj się do skryptów przez zmienną katalogu projektu harnessu lub ścieżki względne względem projektu, jak pokazuje referencja; ustaw wykonywalność skryptów (`chmod +x`).
- **Windows** — odnotuj powłokę używaną przez harness (Git Bash, PowerShell, pole poleceń per-OS). Jeśli bash lub `jq` są niedostępne, wygeneruj zamiast tego skrypt Node.
- **Istniejąca konfiguracja** — scal ją, zachowaj niepowiązane haki, zastąp wyłącznie wadliwe wpisy nazwane w Kroku 4 i pokaż diff przed zapisem. Skrypt pozostawiony przez zastąpiony lub osierocony hak pozostaje na dysku: wymień go w raporcie i zalecaj usunięcie; nigdy nie usuwaj go po cichu.
- **Podwójna rejestracja** — haki `.claude/settings*.json` są także uruchamiane przez Cursor (import domyślnie włączony), przez Copilot CLI i przez VS Code, gdy `chat.useClaudeHooks` jest włączone. Jeśli jedno z nich jest używane, a `.claude/settings*.json` już zawiera haki, nie rejestruj ponownie tej samej kontroli w jego natywnej konfiguracji bez uwzględnienia importu (zobacz `references/cursor.md`, `references/copilot.md`).

## Krok 7 — Udowodnij przed przekazaniem

Dla każdego wygenerowanego skryptu przekaż do niego przez potok przykładowy payload (kształt z referencji) i sprawdź kod wyjścia oraz wynik:

1. **Zepsuty plik** — wprowadź celowy, oczywisty błąd w rzeczywistym pliku źródłowym objętym kontrolą (nieużywana zmienna, zły typ). Oczekuj blokującego lub zwrotnego sygnału udokumentowanego przez referencję oraz czytelnego komunikatu wskazującego plik i problem. Dla skryptów uruchamiających testy błąd musi być behawioralny (nieudana asercja): błędy wyłącznie typów nie powodują błędu Vitest, który usuwa typy.
2. **Poprawny plik** — cofnij błąd. Oczekuj sukcesu i braku blokującego wyniku. Dla skryptów końca tury wymaga to zielonego baseline z Kroku 3.
3. **Pomijany typ** — plik, którego kontrola nie obejmuje (np. `README.md`). Oczekuj sukcesu.
4. **Nieistniejący plik** — payload wskazujący ścieżkę, która nie istnieje. Oczekuj sukcesu.
5. **Pusty payload** — `{}` oraz niemożliwy do sparsowania lub pozbawiony ścieżki payload (np. `not json`, wywołanie narzędzia bez ścieżki). Oczekuj sukcesu.
6. **Koniec tury z ustawioną flagą ponowienia** — oczekuj sukcesu nawet wtedy, gdy błąd nadal występuje.
7. **Edycja, która ominęła hak per-edit** — zapisz błąd lint w objętym pliku bezpośrednio na dysku (jak zrobiłoby to polecenie powłoki), nie wysyłaj payloadu per-edit, uruchom skrypt końca tury. Oczekuj, że zablokuje i wskaże ten plik. Gdy nie ma żadnych zmienionych plików, oczekuj sukcesu bez uruchamiania jakiejkolwiek kontroli.
8. **Kształty specyficzne dla harnessu** — dodatkowe przypadki wymienione przez referencję (np. Codex: payload niebędący patchem, patch wielu plików, `cwd` w podkatalogu).

Cofnij każdy celowo wprowadzony błąd i potwierdź, że `git status` pokazuje wyłącznie pliki, które zamierzałeś utworzyć lub zmienić. Jeśli przypadek nie powiedzie się, napraw skrypt i uruchom ponownie wszystkie przypadki. Nigdy nie zgłaszaj działającego haka wyłącznie na podstawie konfiguracji.

## Krok 8 — Raport

Wypisz zwięzły raport:

- **Wejścia** — ścieżka planu testów (lub `"No test plan found — gates derived from the toolchain"`), harness(y) wraz ze ścieżkami dowodów, polecenia toolchainu, baseline końca tury (zielony, naprawiony, ograniczony zakresem lub blokada).
- **Odroczenia** — każde cytowane odroczenie oraz odpowiedź użytkownika (`override` / `skip`).
- **Audyt** — wady znalezione w istniejącej konfiguracji haków i to, co je zastąpiło; skrypty pozostawione (osierocone lub zastąpione) z zaleceniem usunięcia.
- **Skonfigurowane** — dla każdego harnessu: plik(i) konfiguracji, skrypty, zdarzenia, timeouty; scalony diff.
- **Dowód** — jedna linia na przypadek z Kroku 7 z zaobserwowanym kodem wyjścia / wynikiem.
- **Nadal wymagane od użytkownika** — kroki zaufania lub zatwierdzenia (np. przegląd Codex `/hooks`, zaufanie do workspace Cursor, ponowne uruchomienie sesji) oraz sposób potwierdzenia, że hak jest załadowany (menu haków harnessu lub log debugowania).
- **Dryf referencji** — każda rozbieżność między referencją a bieżącą dokumentacją.
- **Poza zasięgiem** — czego te haki nie potrafią udowodnić: zachowania działającej aplikacji (komponent kliencki, który nigdy nie hydratuje się, routing, polityki bazy danych, efekty uboczne). Lint, typy i testy jednostkowe mogą wszystkie przejść, gdy funkcja jest zepsuta. Wymień powierzchnie ryzyka repozytorium i wskaż weryfikację E2E lub w przeglądarce; nie konfiguruj tego tutaj.
- **Zalecane bramki git (niezapisane)** — co należy do pre-commit i pre-push dla tego repozytorium, wraz z istniejącym git-hook managerem, jeśli taki jest. Nie twórz ani nie edytuj konfiguracji git-hook.
- **Następny krok** — poproś agenta o edycję pliku z błędem lint, następnie z błędem typu, i obserwuj, jak naprawia oba w tej samej sesji. Następnie poproś go o przepisanie pliku przez polecenie powłoki z błędem lint i obserwuj, jak hak końca tury odsyła go z powrotem.

## Czego ta umiejętność NIE robi

- Nie zmienia bramek ani strategii ryzyka — od tego jest `/10x-test-plan`.
- Nie pisze testów, scenariuszy E2E ani pipeline’ów CI.
- Nie instaluje ani nie rekonfiguruje git-hook managerów (Husky, Lefthook, pre-commit).
- Nie generuje konfiguracji dla harnessów, których nie potrafi udowodnić (zobacz `references/other-harnesses.md`).

## Interaktywne pytania — niezależne od hosta

Gdy ta umiejętność mówi „zapytaj użytkownika”, użyj dowolnego narzędzia pytań udostępnianego przez hosta; jeśli żadne nie istnieje, zapytaj zwykłym tekstem z oznaczonymi opcjami. Pytaj najwyżej o: harness (tylko gdy jest niejednoznaczny), czy nadpisać odroczenie (raz) oraz zgodę po przedstawieniu propozycji.

## Ton

Zwięzły, rozkazujący, konkretny. Nazywaj pliki, polecenia i kody wyjścia. Bez języka marketingowego.