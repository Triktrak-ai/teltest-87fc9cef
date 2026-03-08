

## Analiza: 9 sekcji w diagnostyce vs 7 dni w zakładce Czynności

### Przyczyna rozbieżności

To nie jest błąd — to dwie różne metryki:

1. **Diagnostyka (9 sekcji)** — `rawSections.length` liczy **wszystkie sekcje TLV ze wszystkich załadowanych plików** (activities + overview + inne). Sekcje z pliku overview/technical dodają się do wspólnej puli przez `mergeDddData`.

2. **Zakładka Czynności (7 dni)** — wynik parsowania po filtrach:
   - Plik activities ma **7 sekcji TLV** + **1 pre-TLV header** = 8 chunków
   - Z 8 chunków wyekstrahowano **8 dni**
   - **1 dzień odfiltrowany** przez filtr okna czasowego (90 dni od daty pobrania) lub walidację (suma minut > 24h)

### Proponowane rozwiązanie

Poprawić diagnostykę, żeby była bardziej przejrzysta:

1. **Rozdzielić licznik sekcji per plik** — w diagnostyce pokazywać ile sekcji TLV pochodzi z którego pliku (activities: 7, overview: 2, itp.)
2. **Dodać metrykę "dni sparsowanych vs odfiltrowanych"** w zakładce diagnostyki — np. "8 dni znalezionych, 1 odfiltrowany (poza oknem 90d), 7 wyświetlonych"
3. **Logować powód odrzucenia dnia** w `activityRejections` — aktualnie rejections dotyczą tylko starego forward-scannera, nie RecordArray parsera

### Zmiany w kodzie

**`src/lib/ddd-parser.ts`**:
- W `parseVuActivitiesRecordArrays`: dodać rejection entry gdy dzień nie przechodzi walidacji (slot totals > 1440, brak entries)
- W sekcji filtra downloadDate (linia ~742): dodać rejection entry dla dni poza oknem

**`src/pages/DddReader.tsx`**:
- W diagnostyce: pogrupować `rawSections` po źródle pliku (tag) i wyświetlić breakdown
- Dodać kartę "Dni czynności: X znalezionych / Y wyświetlonych" z listą odrzuconych

