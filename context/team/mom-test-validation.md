# Mom Test Validation Plan

## Input Idea

PR-y w zespole czekają na review nawet kilka dni. Rozważane rozwiązanie z `context/team/opportunity-map.md`: najpierw ustawienia GitHuba, a jeśli nie pomogą, lokalny raport czekających PR-ów (wiek, rozmiar, brak reviewera, liczba czekających review na osobę), tylko do odczytu.

Zespół: 2–4 osoby. Już ustawione: szablon PR i przypomnienia GitHub→Slack. Nieustawione: `CODEOWNERS` z automatycznym przypisaniem reviewerów.

## Hypotheses

- **User/role**: autorzy PR-ów (czekają) i reviewerzy (są obciążeni); w zespole 2–4 osób to te same osoby.
- **Friction**: PR czeka kilka dni na pierwsze review. Podejrzewane przyczyny: brak przypisanego reviewera, PR za duży lub niejasny, przeciążenie reviewerów.
- **Current workaround**: (przypuszczenie) ogłoszenie PR na kanale zespołu, przypomnienia ze Slacka, ręczne przypominanie się.
- **Risky assumptions**:
  - długie czekanie zdarza się często, a nie tylko w kilku zapamiętanych przypadkach;
  - czekanie ma realny koszt (konflikty przy merge'u, przełączanie kontekstu, przesunięte wydanie), a nie jest tylko niewygodą;
  - przyczyną jest brak widoczności, a nie świadomie ustalone priorytety;
  - przypomnienia na Slacku są ignorowane z powodu, który narzędzie może zmienić.
- **Evidence already present**: tylko obserwacja jednej osoby („często”, „nawet kilka dni”). Brak liczb i konkretnych przypadków. Przyczyny zostały wybrane z gotowych opcji, więc to hipotezy, nie ustalenia. Fakt: przypomnienia na Slacku i szablon PR są włączone, a problem wciąż występuje.

## Critique

- **„Często” to wrażenie.** Kilka dokuczliwych przypadków łatwo urasta do normy. Wywiad musi dotyczyć konkretnych, niedawnych PR-ów, a nie odczuć.
- **Czekanie nie zawsze jest problemem.** Jeśli autor w tym czasie robi coś innego i nic się nie blokuje, taka cena jest akceptowalna. Pytaj o skutki czekania, nie o samo czekanie.
- **Przypomnienia już są i nie działają.** Kolejny sygnał (raport) może skończyć się tak samo. Kluczowe pytanie: co ludzie robią, gdy dostają przypomnienie.
- **Mały zespół, rozmyta odpowiedzialność.** Przy 2–4 osobach „nikt nie jest przypisany” zwykle znaczy, że każdy myśli, że zrobi to ktoś inny. To rozwiązuje umowa (kto, w jakim czasie) albo `CODEOWNERS` z automatycznym przypisaniem, a nie narzędzie.
- **Przeciążenie to sprawa priorytetów.** Jeśli review świadomie przegrywa z własnymi zadaniami, decyzja należy do zespołu lub lidera; raport tego nie zmieni.
- **Co pokazałoby, że nie warto budować:** ostatnie przypadki długiego czekania to pojedyncze, duże PR-y albo okresy urlopów; ludzie wiedzą o PR, ale świadomie go odkładają.
- **Co byłoby mocnym dowodem:** większość zespołu, bez naprowadzania, opisuje ten sam niedawny przypadek z nazwanym skutkiem i ze wskazaniem, że nie wiedzieli, iż PR czeka właśnie na nich.

## Interview Guide

Rozmowa 20–30 minut z każdą osobą w zespole, osobno. Nie wspominaj o raporcie ani o żadnym narzędziu.

**1. Rozgrzewka**

1. Ile PR-ów otworzyłeś, a ile przejrzałeś w ostatnich dwóch tygodniach?
   - Pogłębienie: jak wygląda u ciebie typowy dzień, jeśli chodzi o review?

**2. Niedawna historia**

2. Opowiedz o ostatnim swoim PR, który czekał dłużej, niż chciałeś. Co się działo od otwarcia do pierwszego review?
   - Pogłębienie: kiedy to było? Ile to trwało? Skąd wiedziałeś, że czeka?
3. Opowiedz o ostatnim cudzym PR, który przejrzałeś później, niż mógłbyś. Co cię wtedy zatrzymało?
   - Pogłębienie: wiedziałeś, że ten PR czeka właśnie na ciebie?

**3. Obecne obejście**

4. Co zrobiłeś, żeby przyspieszyć review tamtego PR?
   - Pogłębienie: komu przypomniałeś i jak (Slack, wiadomość prywatna, na spotkaniu)?
5. Co zrobiłeś, gdy ostatnio dostałeś przypomnienie o PR na Slacku?
   - Pogłębienie: kiedy ostatnio przypomnienie faktycznie sprawiło, że zrobiłeś review?

**4. Koszt problemu**

6. Co się stało z twoją pracą, gdy ten PR czekał? Co robiłeś w tym czasie?
   - Pogłębienie: musiałeś rozwiązywać konflikty, wracać do kontekstu, przesuwać coś w planie?
7. Kiedy ostatnio czekanie na review opóźniło coś, na co czekał ktoś poza zespołem?

**5. Istniejące alternatywy**

8. Jak ustalacie, kto robi review danego PR? Kiedy ostatnio coś się w tym zmieniło i co się stało?
9. Co jeszcze próbowaliście, żeby PR-y nie wisiały, i co z tego zostało?

**6. Sygnał decyzyjny**

10. Kiedy ostatnio duży lub niejasny PR sprawił, że odłożyłeś review? Co by musiało się zmienić w samym PR, żebyś wziął go od razu?
11. Gdybyś miał wskazać jeden ostatni PR, którego czekanie najbardziej cię kosztowało, który by to był?

**7. Zakończenie**

12. Czy mogę wrócić z pytaniem za 2–3 tygodnie? Czy możemy razem przejrzeć listę ostatnich PR-ów i ich czasy?

## Survey

W zespole 2–4 osób wywiady wystarczą. Ankieta jest opcjonalna: można ją wysłać po 2–3 tygodniach, żeby porównać sytuację przed zmianą i po niej.

1. **(Filtr)** Ile PR-ów otworzyłeś albo przejrzałeś w ostatnich 2 tygodniach? — 0 / 1–3 / 4–10 / więcej niż 10
2. Ile z twoich PR-ów w ostatnich 2 tygodniach czekało na pierwsze review dłużej niż 1 dzień roboczy? — 0 / 1 / 2–3 / 4 lub więcej
3. Najdłuższe czekanie twojego PR na pierwsze review w ostatnich 2 tygodniach? — poniżej 4 h / do 1 dnia / 1–2 dni / ponad 2 dni
4. Co się działo, gdy twój PR czekał? (wielokrotny wybór) — nic, robiłem inne zadanie / rozwiązywałem konflikty / przełączałem się z powrotem do kontekstu / coś się opóźniło / przypominałem się ręcznie
5. Ile razy w ostatnich 2 tygodniach ręcznie przypominałeś komuś o swoim PR? — 0 / 1 / 2–3 / 4 lub więcej
6. Gdy ostatnio odłożyłeś review cudzego PR, co było powodem? (wielokrotny wybór) — nie wiedziałem, że czeka na mnie / byłem zajęty / PR był duży lub niejasny / czekałem, aż ktoś inny weźmie / inne
7. **(Otwarte)** Opisz ostatni PR, którego czekanie najbardziej utrudniło ci pracę. Co się stało?

## Decision Criteria

- **Proceed** (`/10x-shape`), jeśli: co najmniej 2 osoby w zespole, bez naprowadzania, opisują długie czekanie z ostatnich 2 tygodni z nazwanym skutkiem (konflikt, przesunięcie, ręczne przypominanie się) **oraz** problem utrzymuje się po 2–3 tygodniach z `CODEOWNERS` i automatycznym przypisaniem.
- **Narrow scope**, jeśli: długo czekają głównie duże lub niejasne PR-y. Zamiast raportu: limit rozmiaru PR (etykieta albo sprawdzanie w CI) i dopracowany szablon PR.
- **Do not build yet**, jeśli: nikt nie przypomina sobie niedawnego przypadku ze skutkiem; czekanie wynika z urlopów lub świadomie ustalonych priorytetów; reviewerzy wiedzieli, że PR czeka, i odłożyli go celowo. Wtedy właściwym ruchem jest umowa w zespole, nie narzędzie.
- **Try existing tool/process first**, jeśli: reviewerzy mówią, że nie wiedzieli, że PR czeka właśnie na nich. Najpierw włącz `CODEOWNERS` z automatycznym przypisaniem reviewerów i ustal w zespole czas na pierwszą reakcję (np. 1 dzień roboczy), a po 2–3 tygodniach wróć do tych kryteriów.
