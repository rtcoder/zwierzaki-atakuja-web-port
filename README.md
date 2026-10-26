# Zwierzaki Atakują — port do przeglądarki

Grywalny port rozwojowy w czystym **HTML, CSS i JavaScript**, z Canvas 2D.
Nie wymaga Javy, emulatora, frameworka, bundlera ani usług zewnętrznych w czasie gry.

## Zawartość

- 50 układów plansz odzyskanych z fabryk poziomów w oryginalnym MIDlecie 1.5.
- 105 odświeżonych grafik w pakiecie runtime 4×: rysunki AI, poprawione fonty i wierna nakładka ust z oryginału.
- Niezmienione oryginały z manifestem i hashami w `assets-original/`.
- Pięć typów zwierzaków, ich strzały i zdolności, konstrukcje z materiałami,
  niedźwiadki, punktacja, bonusy i starcia z armatą.
- Sterowanie myszą, wskaźnikiem dotykowym i klawiaturą, widok całej planszy,
  śledzenie lotu, przesuwanie i przybliżanie kamery.
- Pauza, ponawianie planszy, wybór wszystkich etapów i lokalny zapis rekordów.

## Uruchomienie

Serwuj katalog `dist` przez dowolny serwer HTTP. Przykład lokalny:

```sh
python3 -m http.server 8080 --directory dist
```

Otwórz `http://localhost:8080`. Moduły ES wymagają HTTP; otwieranie `index.html`
bezpośrednio przez `file://` nie jest obsługiwane.

```sh
npm test
npm run check
node tools/smoke-campaign.mjs
```

Projekt nie ma zależności npm do instalacji. Testy korzystają z wbudowanego
runnera Node. W zarządzanym środowisku Sites podgląd obsługuje `sites-preview`.

## GitHub Pages

Gra: https://rtcoder.github.io/zwierzaki-atakuja-web-port/

Workflow `.github/workflows/pages.yml` publikuje katalog `dist` po każdym pushu
do `main`. Najpierw muszą przejść `npm test` i `npm run check`. Publikację można
też uruchomić ręcznie w zakładce Actions, wybierając gałąź `main`.

W ustawieniach repozytorium **Pages → Build and deployment → Source** musi być
wybrane **GitHub Actions**. Workflow używa wbudowanego `GITHUB_TOKEN` i OIDC;
nie wymaga dodatkowych sekretów ani gałęzi `gh-pages`.

## Odświeżone grafiki

Gra używa nowego zestawu przygotowanego w `assets-ai/images/`. Większość grafik
odtworzono przez AI, a fonty zbudowano deterministycznie z prawidłowych glifów.
`tutorMouth0` jest wiernym upscale oryginału. Pełne wersje robocze, surowe wyniki,
kopie przed poprawkami i raporty pozostają w `assets-ai/`.

`dist/assets/` zawiera zoptymalizowane bezstratne PNG: oryginalny rozmiar logiczny
pomnożony przez 4. Rozmiary kolizji i punkty obrotu są niezmienione. Generator
normalizuje marginesy sprite’ów do oryginalnych granic, zachowuje układ poprawionych
atlasów i osobno skaluje glify oraz klatki, aby nie mieszać sąsiednich elementów.

Oryginały w `assets-original/` zachowują dokładne bajty i sumy SHA-256. Pages
publikuje wyłącznie `dist`, bez archiwów i roboczych obrazów AI. Ponowne zbudowanie
pakietu z już przygotowanych grafik wymaga lokalnie Pythona i Pillow:

```sh
python3 -m venv .venv-assets
.venv-assets/bin/pip install -r tools/requirements-assets.txt
.venv-assets/bin/python tools/build-ai-assets.py
npm run check
```

Przeglądarka i workflow używają gotowych PNG; nie uruchamiają generowania AI ani
nie wymagają fontów systemowych. `check` sprawdza hashe oryginałów, wybranych
kandydatów i runtime oraz fizyczne i logiczne wymiary. Szczegóły: `docs/ASSETS.md`.

## Sterowanie

| Działanie | Sterowanie |
| --- | --- |
| Kąt | Suwak lub strzałki góra/dół |
| Moc | Suwak lub strzałki lewo/prawo |
| Strzał | „Atakuj!”, spacja albo odciągnięcie zwierzaka na wyrzutni |
| Zdolność w locie | Przycisk, E lub spacja |
| Od nowa | R |
| Pauza | P lub Escape |
| Zmiana widoku | V lub przyciski nad planszą |
| Przesuwanie / przybliżanie | Przeciąganie tła / kółko myszy |

## Pochodzenie i zgodność

Źródłem jest `ZwierzakiAtakuja`, wersja 1.5, wariant Nokia 6300, CLDC 1.1 /
MIDP 2.0. Oryginał: CT Creative Team / PTGame.eu. Analiza statyczna korzystała
z CFR 0.152 i sprawdzeń kodu bajtowego w miejscach niejednoznacznych.

SHA-256 analizowanego JAR:

```
e4e8d6daaefa0d690822b3188b7c974c8a93142c826953caf9b2010607c08b0c
```

Zachowano dane poziomów, kolejność amunicji, skalę świata, grawitację, krok
symulacji, wzór strzału, progi obrażeń, punktację i kluczowe równania solvera.
To nie jest jeszcze port potwierdzony porównaniem klatka po klatce z uruchomioną
grą Java. Testy sprawdzają reguły, geometrię i grywalność portu, a nie taką parytetową
weryfikację.

### Świadome różnice i granice wersji 0.1

- Kontakty wielokątów są odtworzone przez SAT i przycinanie krawędzi. Ich
  kolejność może się różnić od oryginalnych klas kolizji.
- Float32 jest stosowany przy zapisie stanu, nie przy każdej operacji JVM.
  Nie odtworzono osobno alternatywnej gałęzi integracji półkrokowej.
- Łączenie i rozpad konstrukcji zachowują spójne sekcje; nie gwarantują
  identycznego grafu pęknięć ani oryginalnej animacji każdego odłamka.
- Sterowanie, kamera, przewidywany tor i interfejs są przystosowane do WWW.
  Początkowe celowanie to 27° i 95% mocy, dla wygodnego pierwszego strzału.
  Suwaki i klawiatura regulują kąt co 0,1° i moc co 0,1%; przeciąganie na wyrzutni
  zachowuje wartości ciągłe zamiast oryginalnych skoków 4,5° i 5%.
- Krok 0,05 sekundy jest wykonywany co 50 ms rzeczywistego czasu. Oryginalny
  wątek miał osobny rytm odświeżania; prędkość zegara portu to jawna decyzja.
- Oceny medali są prezentowane jako 1–3 gwiazdki. Bonus niewykorzystanej
  kolejki dodaje się automatycznie; nie ma dawnego pytania o dalsze niszczenie.
- Wybór plansz umożliwia zwiedzanie wszystkich 50 etapów. Postęp i rekordy
  są zapisywane osobno. Brak usług SMS, kupowania dodatków i starego rankingu.
- Telefoniczne samouczki i warianty premium nie są częścią tej wersji.
  Standardowe zdolności pięciu zwierzaków są obecne.
- Układ mobilny obsługuje Pointer Events, ale test w oknie o rozmiarze telefonu
  nie zastępuje testów na fizycznym Androidzie i iPhonie.

## Pliki

- `dist/js/physics.js` — ciała sztywne, kontakty, solver, podział konstrukcji.
- `dist/js/levels.js` — odzyskane dane plansz.
- `dist/js/mechanics.js`, `rules.js` — strzały, zdolności, obrażenia i punktacja.
- `dist/js/game.js` — stan i przebieg rozgrywki.
- `dist/js/renderer.js`, `main.js` — Canvas, DOM i sterowanie.
- `dist/js/storage.js` — wersjonowany zapis w localStorage.
- `tools/extract-assets.py`, `extract-levels.py` — odtwarzalne ekstraktory.
- `tools/build-ai-assets.py` — pakowanie nowych grafik do runtime; `tools/enhance-assets.py` zachowuje wcześniejszy proces filtrowanego upscale.
- `docs/ASSETS.md`, `RULES.md`, `physics.md`, `level-extraction.md` — dowody
  źródłowe, poprawki dekompilacji i szczegóły zgodności.

Oryginalne nazwy i obrazy zachowują swoich właścicieli praw. Repozytorium nie
nadaje im nowej licencji. Dane i kod telefonu analizowano statycznie; jego usługi
sieciowe nie są uruchamiane przez aplikację WWW.
