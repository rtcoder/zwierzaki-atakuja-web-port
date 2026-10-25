# Assety odtworzone przez AI

Przeanalizowano osobno wszystkie **105 oryginalnych obrazów**. Trzech subagentów
wygenerowało **104 nowe PNG** przez wbudowane `image_gen.imagegen`, a następnie
sprawdziło wyniki. To osobny zestaw kandydatów; gra nadal używa wcześniejszych assetów.

## Pliki

- `images/`: wybrane obrazy AI, w natywnej rozdzielczości generatora, po wskazanych poprawkach alfa.
- `raw/`: surowy wybrany wynik AI dla każdego ze 104 obrazów; dla poprawianych plików zachowana wersja sprzed czyszczenia alfa. Są też wcześniejsze warianty menu.
- `rejected/`: zachowane odrzucone warianty.
- `reports/`: analiza artefaktów, dokładne prompty, źródła, wymiary i QA każdego pliku. `interface-extra.json` zawiera 8 zadań przekazanych agentowi scenerii.
- `gallery.html`: porównanie oryginał ↔ AI i uwagi dla każdego obrazu.
- `inventory.json`: wymiary, SHA-256, zakres alfa, granice treści i różnice proporcji.
- `verification.json`: wyniki końcowej kontroli kompletności i integralności.

## Pozostałe problemy

- **tutorMouth0**: brak wyniku. Generator zwrócił HTTP 400 `moderation_blocked`; błąd zapisano w `reports/characters.json`. Nie podstawiono oryginału jako nowej grafiki.
- **FONT**: przedostatnie `Ź` nadal ma kropkę zamiast kreski po celowanej poprawce. Wynik odrzucony jako font do użycia.
- **fS**: mimo korekty brakuje kropki między `-` i `/`, małe `q` wygląda jak `g`, końcowe `Ż` ma kreskę zamiast kropki. Wynik odrzucony jako font do użycia.
- **char_skunk3**: tułów pozostaje zbyt płaski względem oryginału.
- Bardzo szerokie/wąskie obrazy mają inne proporcje płótna lub dodatkowe przezroczyste marginesy, zwłaszcza trawa, paski postępu, części wyrzutni i atlasy.
- Atlasy wymagają ponownego wyznaczenia prostokątów klatek/glifów. `sparkles` ma nierówne odstępy klatek; `buttonStripe` nie gwarantuje idealnego kafelkowania. Nakładki twarzy i elementy wyrzutni wymagają sprawdzenia wzajemnego dopasowania.

Cyfry `0123456789` sprawdzono osobno. Efekty mają poprawne liczby klatek:
`explosion` 6, `fire` 6, `sparkles` 5, `mark` 3. Napis menu „Zwierzaki atakują”
poprawiono i sprawdzono. Indywidualne różnice proporcji i detali są opisane w raportach.

## Alfa i weryfikacja

Przezroczyste grafiki oceniano po złożeniu na rzeczywistym tle: podgląd surowego
PNG może pokazywać niewidoczne RGB pikseli o alfa 0. Nie traktowano tego jako
rzeczywistych odprysków. Za zgodą użytkownika wykonano minimalne czyszczenie alfa
`cloud1`, `cloud2` oraz naprawiono przypadkowo przezroczysty pas wewnątrz `tree_1b`.
Kanały RGB i rozmiary tych plików pozostały niezmienione; szczegóły w `reports/alpha-cleanup.json`.
`cleanup-alpha.py` stosować wyłącznie do ręcznie ocenionych przypadków, nie hurtowo do atlasów.

Końcowa kontrola: 104 PNG poprawnie się dekodują, wymiary zgadzają się z raportami,
typ przezroczystości odpowiada źródłom; 105 oryginałów jest bajtowo identycznych
z wersją w HEAD. Nie wykonano integracji ani testu tych kandydatów w grze.

Galeria działa bez budowania. Z katalogu repozytorium:

```sh
python3 assets-ai/build-gallery.py
python3 -m http.server 8082 --bind 127.0.0.1
```

Otwórz `http://127.0.0.1:8082/assets-ai/gallery.html`.
Skrypty używają Pillow (wersja przypięta w `tools/requirements-assets.txt`).
