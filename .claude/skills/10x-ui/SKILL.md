---
name: 10x-ui
description: >
  Audit and improve a view that already exists. Starts from UI you can open
  and screenshot, and runs the change as a normal 10x change with a
  design-system contract: turn the view into a list of concrete charges
  (missing tokens, missing shared component, accidental architecture), fix
  the contract before the pixels, cover named states, and gate the result
  with a screenshot. Use when the user wants a theme, a restyle, "make it
  prettier", shadcn/Tailwind work, design tokens, dark mode, a visible-focus
  pass, or cleanup of UI an agent built feature by feature. Not a generator
  for a view that does not exist yet — build it through the ordinary chain
  first. Not a component catalog. Not parallel multi-agent Innovate work.
  Not a Playwright course.
---
# 10x-ui — kontrakt systemu projektowego dla pojedynczej zmiany wizualnej

UI to zwykła zmiana 10x. Nie otwieraj czatu vibes w wątku CRUD i nie zaczynaj
od promptu mówiącego tylko „zrób to ładniej”.

**Ta umiejętność iteruje po UI, które już istnieje.** Zakłada widok, który możesz otworzyć i
zrzucić na screenie: markup się renderuje, dane przepływają, ekran wykonuje swoje zadanie i po prostu nie jest
wystarczająco dobry. Wytworzenie tego pierwszego widoku to zwykła praca nad funkcją w ramach Core Skills Chain; ta
umiejętność przejmuje pracę w momencie, gdy jest on na ekranie i chcesz go przeaudytować oraz poprawić.

Jeśli istnieje `context/foundation/lessons.md`, przeczytaj go raz pod kątem powtarzających się błędów UI w tym repozytorium.

## Kiedy pominąć

- Agenci równolegli, `/goal`, izolowane checkouty dla przepustowości — to późniejsza lekcja (Innovate / m2l6).
- Inicjalizowanie drugiego systemu projektowego (`shadcn init` i odpowiedniki) w repozytorium, które już dostarcza tokeny i komponenty w repozytorium. Rozszerz pierwszy.
- Widok, który jeszcze nie istnieje. Najpierw zbuduj go zwykłym łańcuchem, potem wróć i go przeaudytuj.
- Plik narzędzia projektowego jako jedyne źródło prawdy: ta umiejętność pracuje na uruchomionej aplikacji.

## Router

1. `/10x-new <change-id>` — folder dla tej zmiany wizualnej. W `change.md` nazwij **jeden** widok i jedno nazwane źródło motywu lub tokenów.
2. `/10x-research <change-id>` — dwa kierunki. **Audit**: zlokalizuj w *tym* repozytorium **źródło wartości** (plik tokenów, obiekt motywu, zmienne — jakkolwiek ten stack je nazywa) oraz **katalog współdzielonych komponentów**, a następnie znajdź widoki, które faktycznie je odczytują. Jeśli nie istnieje żadne z nich, jest to pierwsza faza planu, a nie blokada. **Reference**: nazwany motyw lub słownictwo DS, z którego można zaczerpnąć. Nie moodboard. Wynikiem jest poniższa lista zarzutów.
3. `/10x-plan` — fazy: środowisko/biblioteka → wartości w tym źródle → **jeden** widok → stany.
4. `/10x-implement` faza po fazie. Po fazie wizualnej: screenshot (desktop; jedna szerokość mobilna).
5. Bramka wizualna: kitchen sink lub `toHaveScreenshot` dla **tego jednego widoku**. Nie aktualizuj bezmyślnie baseline'ów.
6. `/10x-impl-review` — ustalenia UI domyślnie nie są „kosmetyczne do pominięcia”. Następnie wykonaj poniższą pętlę przeglądu.

## Audyt: trzy kategorie zarzutów

To technika, od której zależy reszta tej umiejętności. Przed jakimkolwiek CSS przejdź przez widok i zapisz
3–5 zarzutów. Każdy zarzut otrzymuje **plik i linię** oraz **jedno zdanie o wpływie na użytkownika**.
Lista zarzutów jest wejściem do planu; „zrób to ładniej” nim nie jest.

| Category | What it looks like | Evidence to record | Typical fix |
| --- | --- | --- | --- |
| **Brakujące tokeny** | jednorazowy hex/rgb w widoku, trzy odcienie tego samego „primary”, odstępy wymyślane osobno dla każdego pliku | plik:linia literału oraz token, który powinien go obejmować | przenieś wartość do źródła tokenów tego repozytorium i odwołuj się do niej według roli (np. `bg-primary` / `text-muted-foreground` w wariancie Tailwind) |
| **Brakujący współdzielony komponent** | drugi `Button` zbudowany z `div`+klas, karta kopiująca kartę DS, kopiowane pole formularza | plik:linia duplikatu oraz komponent, który jest przez niego zacieniany | zaimportuj rzeczywisty komponent albo dodaj go ścieżką właściwą dla stacka (np. `npx shadcn add <name>`) |
| **Przypadkowa architektura** | ekran lub przepływ odzwierciedla kolejność dodawania funkcji: nieuwierzytelniona trasa zwracająca surowy JSON, modal będący stroną, karta „settings” zawierająca cztery niepowiązane rzeczy | ścieżka trasy/komponentu oraz to, co widzi użytkownik, gdy trafia tam tą drogą | napraw punkt wejścia (guard, redirect, layout), nie kolor |

Trzecią kategorię najtrudniej zobaczyć na screenie i najłatwiej pominąć. Zapytaj wprost:
*co się dzieje, jeśli ktoś trafi do tego widoku wylogowany, bez danych lub bezpośrednio z linku?*

Zapisz listę w folderze zmiany. Zarzuty, których plan nie adresuje, pozostają widoczne jako
odroczone, a nie usunięte.

## Kontrakt systemu projektowego

Kontrakt składa się z dwóch połówek i żadna nie wskazuje narzędzia:

1. **Tokeny semantyczne** — jedno źródło wartości, z nazwami opisującymi **rolę** (`primary`, `surface`, `muted`, `destructive`), nigdy kolor (`purple-600`).
2. **Importowalne komponenty, które znajdują się w repozytorium** — czytelne dla agenta, a nie zależność typu black box, którą może jedynie zgadywać.

Bez obu agent odtwarza prymitywy w każdym widoku. Z obiema ma miejsce, do którego może zajrzeć.

Sposób realizacji obu połówek zależy od stacka. Znajdź swój, a następnie przeczytaj go przed zaproponowaniem wartości:

| Stack | Gdzie znajdują się wartości | Gdzie znajdują się komponenty |
| --- | --- | --- |
| **Tailwind v4 + shadcn/ui** (wariant kursu) | `:root` / `.dark` w CSS, publikowane przez `@theme` / `@theme inline` | kopiowane do repozytorium, zwykle `src/components/ui` |
| **CSS Modules / zwykłe zmienne CSS** | plik zmiennych (`:root`, często `theme.css` / `variables.css`) | katalog współdzielonych komponentów, importowany ścieżką |
| **CSS-in-JS z motywem** (styled-components, vanilla-extract, Panda) | obiekt motywu lub plik tokenów `.css.ts` | stylowane prymitywy eksportowane z jednego modułu |
| **Biblioteka komponentów z motywem** (MUI, Chakra, Mantine) | obiekt motywu/konfiguracji biblioteki, rozszerzany w twoim kodzie | komponenty biblioteki, lokalnie opakowane tam, gdzie je dostosowujesz |
| **Jeszcze nic** | — | — |

Szczegół Tailwind, tylko dla tego wariantu: `:root` / `.dark` przechowują **wartości**, `@theme inline`
je **publikuje** jako `--color-*` i dopiero wtedy istnieje `bg-primary`. Surowe kolory zapisane bezpośrednio
w `@theme inline` są klasycznym błędem dark mode — wartości `.dark` są obecne, ale przełącznik nic nie
robi. Inne stacki mają własną wersję tego rozdzielenia; znajdź ją przed edycją.

- **Repozytorium ma już system** — najpierw go przeczytaj: jego źródło wartości, współdzielone komponenty i wszelkie notatki projektowe, zanim cokolwiek zaproponujesz. Rozszerz go; nie twórz drugiej palety. Istniejący, gorszy system jest lepszy niż lepszy system, który przynosisz.
- **Repozytorium ma źródło wartości, którego nic nie odczytuje** — najczęstszy przypadek greenfield. Starter dostarcza plik tokenów, a ekrany ignorują go na rzecz klas literałowych. Pierwsza faza nie polega na wyborze motywu; polega na tym, by istniejące widoki odczytywały tokeny, które już tam są.
- **Repozytorium nie ma żadnego systemu** — zobacz poniżej *Proponowanie systemu*.
- **Tokeny z nazwanego motywu lub presetu** — zmapuj je na istniejące nazwy zmiennych, zachowaj małą liczbę (primary, surface, border, muted, destructive oraz radius i skala odstępów).

Niezależnie od źródła wartości, **umieść je w repozytorium**: surowe wartości w pliku wewnątrz
folderu zmiany oraz linię nazywającą źródło ich pochodzenia obok edytowanego bloku. Wartości, które
istnieją tylko w oknie czatu, są wartościami, które następna sesja ponownie wymyśli od zera.

Opcjonalnie: krótka notatka projektowa (`DESIGN.md` lub odpowiednik) dokumentująca tokeny i powody ich wyboru.
Obowiązkiem są tokeny w repozytorium; plik jest wygodą dla następnej zmiany.

Dodawanie komponentu: użyj ścieżki właściwej dla stacka — np. `npx shadcn add <name>` (lub shadcn MCP, jeśli
jest już skonfigurowany) w wariancie kursu. Nie wymagaj `mcp init`, aby ukończyć zmianę.

### Proponowanie systemu

„Używaj tego, co masz” nie oznacza „nigdy niczego nie dodawaj”. W pustym obszarze wprowadzenie kontraktu
**jest** zmianą. Zaproponuj go — pod trzema warunkami, wypowiedzianymi wprost w `change.md`:

1. **Oznaczone jako dodanie zależności do stacka**, a nie przemycone jako założenie. Decyzję podejmuje uczestnik.
2. **Ograniczone do potrzeb tej zmiany** — blok tokenów oraz 2–3 komponenty, których widok faktycznie używa. Nie cała biblioteka.
3. **Przegrywa z tym, co repozytorium już ma.** Jeśli istnieje jakikolwiek system, nawet gorszy, rozbuduj go.

## Stany, breakpointy, minimalny poziom a11y

- Nazwij stany, których dotykasz: **default, hover, focus, disabled, error, empty, loading**. `disabled` i `error` to miejsca, w których UI tworzone przez agenta zaczyna dryfować jako pierwsze, ponieważ nic na szczęśliwej ścieżce ich nie ćwiczy.
- Focus zwykle ma własny token, oddzielny od akcentu (`--ring` w shadcn) — zmiana akcentu go nie zmienia, a w wielu stackach nikt w ogóle go nie zdefiniował, więc przebija domyślny styl przeglądarki. Przeglądaj focus osobno, tak jak przeglądasz `disabled`.
- Desktop plus **jedna** szerokość mobilna. Nie macierz responsywności.
- Minimalny poziom a11y, nie kurs WCAG: focus musi być widoczny, każdy kontroler potrzebuje dostępnej nazwy, a kontrast przy zmianach tokenów musi działać w obu motywach, jeśli aplikacja ma dark mode.
- Dark mode: zmieniaj go na warstwie tokenów. Przejście dark mode, które edytuje klasy komponentów, jest zamaskowanym zarzutem brakujących tokenów.

## Bramka wizualna

Jeden widok, każdy nazwany stan widoczny jednocześnie. Najtańsza forma nie potrzebuje w ogóle runnera testów:
strona **kitchen-sink**, która renderuje widok we wszystkich siedmiu stanach obok siebie, ze screenshotem z
przeglądarki. Służy jednocześnie jako dowód przeglądu i działa w każdym stacku.

Jeśli repozytorium ma już narzędzie do testów screenshotów, podłącz do niego bramkę — np.
`await expect(page).toHaveScreenshot({ maxDiffPixels: 100 })` z Playwright, maskując niestabilne
obszary (daty, avatary, liczniki). Nie instaluj go tylko po to, by spełnić tę umiejętność.

To bramka merge'a dla **tej zmiany**, nie kurs E2E. Nigdy nie aktualizuj baseline'u, aby CI było zielone,
bez uprzedniego wyjaśnienia różnicy wizualnej.

## Pętla przeglądu: od zarzutu do PR

Widok może być technicznie poprawny, a mimo to nieczytelny — nagłówek konkuruje z głównym przyciskiem,
każda informacja ma tę samą wagę, każda drobna rzecz znajduje się na własnej karcie. Oceniaj layout
**po tym**, jak widok zostanie zbudowany z tokenów i komponentów repozytorium; na ekranie sklejanym z jednorazowych
klas krytyka layoutu sprowadza się do listy kosmetycznych poprawek.

1. Uzyskaj krytykę: `/10x-impl-review` oraz opcjonalny przegląd layoutu (Impeccable, `frontend-design`), jeśli uczestnik ma je zainstalowane. Nie vendoryzuj tych narzędzi w repozytorium.
2. Przeprowadź triage każdego ustalenia według **wpływu na użytkownika**, tak samo jak przeprowadza się triage ustaleń code review: brakujący focus ring lub martwy tab zasługuje na równie konkretną decyzję jak błąd logiki.
3. Napraw albo zapisz ustalenie jako odroczone z uzasadnieniem. Milczenie nie jest triage'em.
4. Ponownie uruchom bramkę wizualną. Ustalenie, które zmieniło widok bez zmiany baseline'u, jest sygnałem ostrzegawczym.

Lista kontrolna merge'a: [`ui-quality-checklist`](references/ui-quality-checklist.md). Samo zielone CI nie jest bramką — test screenshotu
chętnie przechodzi na widoku, którego stan `disabled` nigdy nie został wyrenderowany.

## Twarde zasady

- Żaden prompt nie może brzmieć wyłącznie „zrób to ładniej / bardziej atrakcyjnie”.
- Kolory, typografia, radius, odstępy: token z systemu **tego repozytorium** (np. `bg-primary` w wariancie Tailwind), a nie jednorazowy hex w widoku.
- Użyj ponownie istniejącego komponentu lub dodaj go ścieżką właściwą dla stacka; nie wymyślaj drugiego `Button`.
- Jeden widok oraz globalne tokeny na zmianę. Nie rebranding całego MVP.
- Każdy zarzut zawiera plik, linię i wpływ na użytkownika, zanim trafi do planu.
- Model: cokolwiek faktycznie masz — zobacz poniżej *Routing modeli*. Zmianę prowadzi pętla, nie nazwa modelu.

## Routing modeli (najpierw faza, potem dostępność)

Do uruchomienia tej umiejętności nie jest wymagany żaden model. Praca wymaga dwóch możliwości: **vision** (odczyt
screenshotu) oraz **tool use** (edycja plików, uruchamianie aplikacji). Poza tym kieruj według **fazy**, a nie
dostawcy. Osąd jest kosztowny i występuje kilka razy; wykonanie jest tanie i występuje wielokrotnie.

| Phase | What it needs | Tier |
| --- | --- | --- |
| Audyt + plan — lista zarzutów, kontrakt tokenów | vision, długi kontekst, osąd | najsilniejszy model, jaki masz; błędna decyzja tutaj kosztuje tuzin edycji w złym kierunku |
| Realizacja zarzutów — render → porównanie → naprawa jednego zarzutu | tool use, szybkość, cena | tańszy działający tier; tę pętlę uruchamiasz wiele razy względem gotowej listy |
| Przegląd — layout, stany, a11y | osąd, vision, świeże spojrzenie | ponownie najsilniejszy, najlepiej nie ten, który napisał kod |

Eskaluj z working tier dopiero wtedy, gdy **ten sam zarzut przetrwa dwie rundy**. To
sygnał, że problemem jest osąd, a nie pisanie.

Nazwy starzeją się szybciej niż ta umiejętność. Według stanu na wrzesień 2026 top tier to Fable 5.1 lub Opus 5
(Anthropic), GPT-6 Astra (OpenAI), Gemini 3.1 Pro (Google); working tier to Sonnet 5,
model natywny dla IDE (Composer w Cursor) albo kodery o otwartych wagach (Kimi, GLM, Qwen Coder). Zastąp je
tym, co faktycznie oferuje twój plan — podział na fazy jest częścią, którą można przenieść.

Uwagi, które zachowują uczciwość tego podejścia:

- **Żaden model tutaj nie jest wymagany, w tym Fable 5.1.** Dostęp różni się zależnie od planu i regionu. Jeden
  model dla wszystkich trzech faz jest w porządku: podział nadal obowiązuje, zmienia się tylko rachunek.
- Tani model w ścisłej pętli jest lepszy niż drogi model otrzymujący jeden niejasny prompt. Zarzuty, tokeny
  i kitchen sink robią dla wyniku więcej niż wybór modelu.
- **Nie masz w ogóle modelu vision?** Zmiana nadal działa: wyrenderuj kitchen sink, wypisz stany w
  tekście i sam opisz różnicę. Bramka screenshotu pozostaje w CI.
- Nie cytuj rankingów areny, jakby rozstrzygały jakość UI — mierzą ładny widok napisany
  od zera, a nie porządkowanie modułu stworzonego przez kogoś innego.

## Błędy, których należy odmówić

| Smell | Do this instead |
| --- | --- |
| Domyślny fioletowo-niebieski gradient „AI landing” | Najpierw zmień `--primary` / tokeny motywu |
| Nowy prymityw `div`+CSS kopiujący komponent DS | Zaimportuj rzeczywisty komponent |
| Tab „Selected”, który jest tylko CSS i nie można go kliknąć | Podłącz stan |
| Nieuwierzytelnione wejście lub wejście w stan pusty, które wyrzuca surowy JSON / pustą ramkę | Napraw punkt wejścia; to zarzut architektoniczny, nie stylistyczny |
| Aktualizowanie baseline'u Playwright, aby CI było zielone | Wyjaśnij różnicę wizualną; aktualizuj tylko, jeśli zmiana jest zamierzona |
| Restylizacja całego MVP w jednej zmianie | Jeden widok + globalne tokeny |
| „Napraw design” jako zadanie jednego agenta w wątku CRUD | Nowy folder zmiany, audyt, plan, bramka |

## Playbooki

Krótkie ścieżki przez router dla typowych punktów wejścia. Wszystkie zachowują listę zarzutów.

- **Motyw lub restyle jednego widoku** — domyślna ścieżka powyżej, zacznij od tokenów.
- **Odziedziczony agent slop** (moduł budowany funkcja po funkcji, każda zaakceptowana, bo działała) — najpierw audyt i spodziewaj się wszystkich trzech kategorii; napraw tokeny i współdzielony komponent przed dotknięciem layoutu.
- **Pojedynczy komponent** — pomiń fazę tokenów tylko wtedy, gdy wartości komponentu już pochodzą z tokenów; w przeciwnym razie faza tokenów jest zmianą.
- **Dark mode** — warstwa tokenów, oba motywy w kitchen sink, sprawdzenie kontrastu w bramce.
- **Przejście focus/klawiatura** — niesie je faza stanów: widoczny focus, nazwy kontrolek, kolejność tabów w jednym widoku.
- **Świeży starter, którego ekrany ignorują własne tokeny** — nie zaczynaj od wyboru motywu. Faza 1 polega na tym, aby istniejące widoki odczytywały źródło wartości już dostarczane w repozytorium; dopiero wtedy warto wybierać nowe wartości.
- **Repozytorium bez żadnego systemu projektowego** — faza 1 to kontrakt (tokeny + komponenty, których potrzebujesz) przy trzech warunkach z *Proponowanie systemu*, faza 2 to widok. Oprzyj się dostarczaniu biblioteki, o którą nikt nie prosił.

## Opcjonalne dodatki (nievendoryzowane przez tę umiejętność)

Impeccable / `frontend-design`: uczestnik może je zainstalować; ta umiejętność nie dodaje ich do repozytorium.