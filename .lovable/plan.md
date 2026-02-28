

# Naprawa macierzy kompatybilnosci — rozdzielenie na karte kierowcy i firmowa

## Problem

Obecna macierz ma 5 blednych komorek dla karty przedsiebiorstwa i nie rozroznia miedzy karta kierowcy a karta firmowa. Dostarczone dane pokazuja rozne reguly dla kazdego typu karty.

## Zmiany

### Plik: `src/components/CompatibilityMatrix.tsx`

Zamiana jednej macierzy na dwie (z zakladkami lub sekcjami):

**Macierz karty firmowej (Company Card):**

| Karta \ VU | Gen1 | Gen2v1 | Gen2v2 |
|---|---|---|---|
| G1 | OK: otwiera zamek | OK: otwiera zamek | WARN: moze nie autoryzowac nowych sekcji |
| G2v1 | OK: wstecznie kompatybilna | OK: otwiera zamek | WARN: moze nie wspierac nowych certyfikatow |
| G2v2 | OK: wstecznie kompatybilna | OK: wstecznie kompatybilna | OK: pelny odczyt Smart 2 |

**Macierz karty kierowcy (Driver Card):**

| Karta \ VU | Gen1 | Gen2v1 | Gen2v2 |
|---|---|---|---|
| G1 | OK: standard | WARN: brak zapisu GPS na karcie | WARN: brak zapisu GPS i granic |
| G2v1 | WARN: bledy przy odczycie .ddd | OK: standard | WARN: brak zapisu granic/ladunku |
| G2v2 | WARN: ryzyko bledow odczytu | WARN: ryzyko bledow odczytu | OK: standard |

### Implementacja

Komponent zostanie przerobiony na uzycie zakladek (Tabs z shadcn) z dwoma widokami:
- Zakladka "Karta firmowa" (domyslna, bo to glowny kontekst DDD)
- Zakladka "Karta kierowcy"

Kazda zakladka renderuje osobna tabele z wlasnymi tooltipami opisujacymi konkretne ograniczenia (np. "Brak zapisu GPS na karcie", "Moze nie autoryzowac poboru nowych sekcji danych").

### Dodatkowe uwagi pod macierza

Pod kazda tabela pojawia sie sekcja z uwagami:
- Karta firmowa: "Nowe karty sa wstecznie kompatybilne. Do pelnej funkcjonalnosci w Gen2v2 zalecana jest karta G2v2."
- Karta kierowcy: "Starsze karty w nowych tachografach — dane GPS/granice pobierane z tachografu przy inspekcji."

## Zmiany w plikach

| Plik | Zmiana |
|---|---|
| `src/components/CompatibilityMatrix.tsx` | Dwie macierze z zakladkami, poprawione wartosci i tooltips |

