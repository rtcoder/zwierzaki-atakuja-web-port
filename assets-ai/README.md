# Assety AI — zestaw po naprawach

Dostępne jest **105/105 obrazów**: 101 grafik pochodzących z AI (część po poprawkach),
3 deterministycznie odtworzone atlasy fontów oraz 1 wierny upscale oryginału.
Zatwierdzony zestaw jest podpięty do gry w `dist/assets/` jako wersje runtime 4×.
Pełne obrazy robocze pozostają w tym osobnym katalogu.

## Naprawione

- **FONT, fS, fontNum**: odtworzone z prawidłowych glifów lokalnych fontów Arial Black i Comic Sans MS. Wszystkie 52 / 112 / 10 znaków, w tym polskie diakrytyki, kropka i q/g, sprawdzone. Prostokąty, odstępy i kolejność z oryginalnego manifestu zachowane przy skali 8×. Krój jest zbliżony stylistycznie, ale nie identyczny z oryginalnym fontem. Cyfra 1 w `fontNum` została poszerzona o około 14%, bez zmiany odstępu i pozostałych znaków.
- **explosion, fire, sparkles, mark**: 20 klatek rozdzielonych i rozmieszczonych w równych komórkach według manifestu (6 / 6 / 5 / 3). Zachowano kolejność i oryginalne punkty odniesienia; każdą klatkę obejrzano osobno.
- **grass, pbarEmpty, pbarFull, launcherBaseTop, launcher_2, softButton, tree_3b, lg**: poprawione proporcje płótna i marginesy. Paski postępu zachowują okrągły stoper, rozciągnięty jest wyłącznie prosty pasek. `softButton` odzyskał półprzezroczyste ciemne wnętrze.
- **buttonStripe**: identyczne wartości w każdym pikselu danego wiersza, dzięki czemu poziome powtarzanie jest bez szwu.
- **lg**: błędna gwiazdka zastąpiona prawidłowym ®; naprawiono mały narożnik ramki litery l, na który nachodził błędny znak.
- **char_skunk3**: poprawiony AI zwarty tułów, następnie oczyszczona alfa i proporcjonalne dopasowanie do granic oryginalnej sylwetki na płótnie 16×.
- **tutorMouth0**: uzupełniony wcześniejszym wiernym upscale 4× z oryginału. To nie jest nowy obraz AI. Historyczny błąd moderacji generatora pozostaje w raporcie.

Poprawiono lub dodano 18 plików. Wcześniejsza naprawa napisu menu i kanału alfa
`tree_1b` pozostaje zachowana.

## Podgląd i dowody kontroli

- `gallery.html`: oryginał obok aktualnej wersji, metoda i uwagi dla każdego pliku.
- `repair-preview.html`: tekst i animowane efekty wycinane według oryginalnego manifestu.
- `repair-preview.png`: zrzut działającego podglądu.
- `qa-fonts/`: wszystkie 174 glify i przykładowy polski tekst złożony z gotowych atlasów.
- `repair-qa/`: podglądy geometrii i poszczególnych klatek.
- `qa-characters/char_skunk3-geometry-comparison.png`: porównanie sylwetki skunksa.
- `verification.json`: historyczna kontrola etapu napraw, przed integracją.
- `runtime-report.json`: bieżąca paczka gry, źródła, operacje, sumy SHA-256 i rozmiary.
- `runtime-blinks/`: sześć nakładek mrugania pochodzących z nowych baz, manifest i porównania open/blink.
- `runtime-qa/`: złożona wyrzutnia, paski zwierząt, cele i kontrola kafelkowania.
- `../docs/VERIFICATION.md`: testy integracji i zrzuty gry.

Sprawdzono odczyt wszystkich 105 PNG, zgodność wymiarów z raportami,
oryginalne sumy kontrolne 105 źródeł, kompletność glifów, granice 20 klatek
i brak szwu `buttonStripe`. W przeglądarce 7/7 atlasów ładuje się i renderuje
z oryginalnych prostokątów. Skrypty fontów i geometrii dają identyczne SHA-256
przy ponownym uruchomieniu. W etapie napraw 329 chronionych plików oryginałów,
ówczesnego runtime i surowych wyników AI pozostało bez zmian. Późniejsza integracja
zastąpiła pliki runtime; oryginały i surowe wyniki nadal są zachowane.

## Zachowane wersje i pochodzenie

- `images/`: aktualny komplet kandydatów.
- `raw/`: niezmienione, historyczne surowe wyniki pierwszej generacji AI.
- `repair-raw/`: nowy surowy wynik AI skunksa przed czyszczeniem i zmianą geometrii.
- `before-repair/`: obrazy i dokumentacja sprzed tej serii poprawek; backupy fontów w podfolderach images/raw.
- `rejected/`: wcześniejsze odrzucone warianty.
- `reports/`: historyczne analizy i prompty, uzupełnione raportami `zz-*-repairs.json` oraz `zz-mouth-fallback.json`. Nowe raporty mają pierwszeństwo w galerii; stare błędy fontów są historią, nie bieżącym stanem.
- `inventory.json`: aktualne wymiary, SHA-256, alfa, granice treści i pochodzenie.

Przezroczyste wyniki oceniano po prawidłowym złożeniu na tle. Ukryte RGB przy alfa 0
nie jest traktowane jako widoczny artefakt.

## Pozostałe ograniczenia

Ogon skunksa pozostaje większy niż w oryginale. Nakładka `tutorMouth0` zachowuje
ograniczenia niskiej rozdzielczości źródła. AI zmieniło też drobne proporcje i rysunek
części innych grafik — szczegóły są opisane indywidualnie.

Wersje runtime zachowują logiczne wymiary, kolizje i prostokąty atlasów.
Wyrzutnię sprawdzono po złożeniu pod kątem 0° i −45°. Nakładki mrugania misiów
są pochodnymi nowych baz, z dopasowanymi pozycjami oczu i kolorem otaczającego futra.
Tutor nie jest animowany przez obecny renderer; jego osobne nakładki pozostają
w paczce, ale nie stanowią zweryfikowanej nowej animacji twarzy.

## Odtwarzanie poprawek

W katalogu repozytorium, z Pillow z `tools/requirements-assets.txt`:

```sh
python3 assets-ai/repair-fonts.py
python3 assets-ai/repair-geometry.py
python3 assets-ai/repair-skunk.py
python3 assets-ai/build-gallery.py
python3 tools/build-ai-assets.py
python3 -m http.server 8082 --bind 127.0.0.1
```

Fonty wymagają lokalnych plików TTF wskazanych w skryptach i raportach; pliki TTF nie
zostały skopiowane do repozytorium. `repair-fonts.py` przyjmuje `--main-font` i
`--small-font`; podmiana kroju zmieni wygląd i wymaga nowego QA.

Podgląd: `http://127.0.0.1:8082/assets-ai/repair-preview.html`.
Galeria: `http://127.0.0.1:8082/assets-ai/gallery.html`.
