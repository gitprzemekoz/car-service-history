<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Moduł 1, Lekcja 2

Wybierz starter i stos dla PRD, który napisałeś w Lekcji 1, z **łańcuchem stosu**:

```
(/10x-init  →  /10x-shape  →  /10x-prd)  →  /10x-tech-stack-selector  →  (bootstrapper)
```

Łańcuch PRD pochodzi z Lekcji 1 (został ponownie uwzględniony w tej lekcji, aby można było poprawić PRD w trakcie pracy). `/10x-tech-stack-selector` jest głównym tematem lekcji; `/10x-bootstrapper` to następne ogniwo, omawiane w Lekcji 3.

### Router zadań — Od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Wybór stosu (temat lekcji)** | |
| `/10x-tech-stack-selector` | Masz PRD w `context/foundation/prd.md` i musisz wybrać starter. Rozpoczyna od wyraźnego wyboru (przyjmij zalecaną domyślną opcję dla swojej komórki `(product_type, language_family)` albo zaprojektuj własną), przechodzi przez zestaw pytań uzupełniających, gdy projektujesz własną opcję, stosuje cztery przyjazne agentom bramki jakości, analizuje rejestr starterów uwzględniający język i zapisuje `context/foundation/tech-stack.md`. Opcjonalny argument `[path-to-prd]` pozwala wskazać niestandardową lokalizację PRD (np. `/10x-tech-stack-selector @context/foundation/prd-v2.md`); bez niego umiejętność domyślnie używa `context/foundation/prd.md`. Użyj PO `/10x-prd`, PRZED `/10x-bootstrapper`. |
| **W razie potrzeby uruchom ponownie etap wcześniejszy** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` | Dołączone, aby można było poprawić PRD w trakcie pracy. Jeśli `/10x-tech-stack-selector` ujawni lukę (np. Wymaganie Funkcjonalne wymuszające funkcję, której nie zawiera rekomendowany starter), uruchom ponownie `/10x-prd`, aby zmienić PRD przed wyborem stosu. |

### Jak łańcuch przekazuje dalej

- `/10x-tech-stack-selector` odczytuje frontmatter `context/foundation/prd.md` (`product_type`, `target_scale`, `timeline_budget`) jako priory. Jeśli PRD nie istnieje, odmawia, podając jednolinijkowe przekierowanie do `/10x-shape` — bez wbudowanego awaryjnego mini-PRD.
- Umiejętność zapisuje `context/foundation/tech-stack.md` z frontmatter zawierającym 4 klucze (`starter_id`, `package_manager`, `project_name`, `hints`) oraz jedn akapit w treści `## Why this stack`. Przekazanie jest celowo minimalne — bootstrapper nie analizuje uzasadnienia, a jedynie pola.
- `/10x-bootstrapper` (Lekcja 3) odczytuje `tech-stack.md` i rejestr, aby utworzyć szkielet projektu.

### Co rejestruje tech-stack-selector (a czego NIE rejestruje)

- **Rejestrowane**: wybór startera (w formacie rejestru), rodzina języków, menedżer pakietów (otwarty ciąg znaków dla danego ekosystemu — `pnpm`, `uv`, `bundle`, `cargo` itd.), wielkość zespołu, cel wdrożenia (wybierany z `deployment_defaults` wybranego startera), dostawca CI/CD + przepływ, pewność bootstrappera (`verified | first-class | best-effort`), obrana ścieżka (standard | custom), odpowiedzi z autoweryfikacji (ścieżka niestandardowa), nadpisanie jakości (ustawiane, gdy użytkownik kontynuuje ze starterem, który nie przeszedł ≥1 przyjaznej agentom bramki), flagi funkcji (auth/payments/realtime/AI/background-jobs).
- **NIE rejestrowane (celowo)**: strategiczny plan testów, strategiczny plan wdrożenia, strategiczne decyzje implementacyjne. Są one dalszym etapem po wyborze stosu — kwestią przyszłej technicznej roadmapy, jeszcze nieplanowaną. Tech-stack-selector odpowiada za wybory testowania/wdrażania/CI w kształcie frameworka, ponieważ są one nierozerwalne z wyborem stosu; odroczona zostaje *warstwa strategiczna* („stosujemy TDD na powierzchni X”, „środowisko podglądowe dla każdego PR”).

### Wybór początkowy (kluczowy)

Pierwsze pytanie jest wyraźnym wyborem — nigdy niejawnym. Umiejętność od razu wskazuje zalecany starter dla Twojej komórki `(product_type, language_family)` i prosi o wyraźne potwierdzenie:

- **Ścieżka standardowa** — zaakceptuj zalecaną opcję domyślną. Umiejętność pomija audyt funkcji, profil zespołu, preferencje technologiczne i pytania o wariant frameworka; zadaje jedynie pytania dotyczące wdrożenia, CI/CD i nazwy projektu. Przekazanie rejestruje `path_taken: standard` w `hints`.
- **Ścieżka niestandardowa** — zaprojektuj własną opcję. Umiejętność przechodzi przez pełny zestaw pytań uzupełniających (audyt funkcji, profil zespołu, preferencje technologiczne, wdrożenie, CI/CD, wariant frameworka), zagłębia się w pytanie o runner testów tylko wtedy, gdy wybrany starter pozostawia to niejednoznaczne, i kończy 5-punktową autoweryfikacją gotowości (z lekcji przygotowawczej 4.1) przed zatwierdzeniem. Przekazanie rejestruje `path_taken: custom` i wypełnia `self_check_answers`.

Mapa zalecanych domyślnych opcji dla każdej komórki obsługuje wiele języków: web/JS i saas/JS oba → 10x-astro-starter (starter oznaczony marką 10x ma pierwszeństwo, gdy konkuruje w komórce JS); api/JS → hono; api/Python → fastapi; web/Python → django; web/Ruby → rails; api/Go → go; api/Rust → axum; mobile/Dart → flutter; desktop/Rust → tauri; itd. Komórki bez zweryfikowanej opcji domyślnej mają wartość `<none>` i wymuszają ścieżkę niestandardową.

### Bramki jakości (kryteria przyjazne agentom)

Każda karta startera zawiera cztery wartości logiczne, według których LLM filtruje:

1. **Typowany** — jawne typy/schematy, na podstawie których agent może wnioskować bez uruchamiania programu.
2. **Oparty na konwencjach** — silne założenia dotyczące układu, routingu i konfiguracji.
3. **Popularny w danych treningowych** — oceniany *dla każdej rodziny języków*, a nie globalnie (Django jest popularne w danych treningowych Pythona; Spring w Javie; itd.).
4. **Dobrze udokumentowany** — aktualna, przypięta do wersji dokumentacja, do której można linkować.

Kandydaci, którzy nie przejdą którejkolwiek bramki, są wykluczani ze zbioru rekomendacji bez dodatkowego zapytania. Jeśli wyraźnie wskażesz jako preferencję starter, który nie przeszedł bramki, umiejętność zakwestionuje ten wybór — przedstawiając najsilniejszą alternatywę o wyższych kryteriach ORAZ ścieżkę kompensacyjną (instrukcje CLAUDE.md uzupełniające braki) — i poprosi o potwierdzenie lub zmianę kierunku. Potwierdzenie wyboru o znanych trudnościach rejestruje nadpisanie w przekazaniu, aby bootstrapper mógł się dostosować.

### Pewność bootstrappera

Każda rekomendacja przedstawia `bootstrapper_confidence` dosłownie — nigdy nie jest ono po cichu pomijane:

- **`verified`** — bootstrapper został uruchomiony end-to-end na tym stosie; tworzenie szkieletu będzie płynne.
- **`first-class`** — zarejestrowany z prawidłowym CLI, powinien działać, ale nie został przetestowany w boju; oczekuj w większości płynnego tworzenia szkieletu z okazjonalnymi krokami ręcznymi.
- **`best-effort`** — ograniczone wsparcie; prawdopodobne kroki ręczne; oczekuj trudności (a generowanie CLAUDE.md przez bootstrapper kompensuje je dodatkowym kontekstem specyficznym dla ekosystemu).

To uprzedzenie przed uruchomieniem `/10x-bootstrapper`, abyś wiedział, czego się spodziewać.

### Ścieżki foundation używane przez tę lekcję

- `context/foundation/prd.md` — wejście (z Lekcji 1)
- `context/foundation/tech-stack.md` — wyjście (przekazanie łańcucha)
- `context/foundation/lessons.md` — powtarzające się reguły i pułapki
- `docs/reference/contract-surfaces.md` — rejestr kluczowych nazw

### Uniwersalny język

Dostarczona umiejętność nie zawiera odniesień do 10xDevs / kohort / certyfikacji. Rejestr zalecanych opcji domyślnych obsługuje wiele języków (JS, Python, Ruby, Java, Go, Rust, PHP, .NET, Dart), a kohortowy `10x-astro-starter` jest jedną kartą w komórce JS+web — nie „tą” zalecaną ścieżką dla wszystkich.

Umiejętności nie mogą zapisywać w `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozstrzygnięta ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`."

<!-- END @przeprogramowani/10x-cli -->
