

# Naprawa parsera DDD -- poprawna ekstrakcja sekcji TLV

## Problem

Scalony plik VU (`_vu_*.ddd`) z serwera C# to surowa konkatenacja pobranych plikow (Overview, Activities, Events, Speed, Technical). Kazdy z tych plikow zawiera bloki TLV z tagami `0x76 XX` (certyfikaty + dane sekcji). Parser znajduje tylko 2 sekcje zamiast oczekiwanych 10+, bo:

1. **Bledne odczytanie dlugosci** jednej sekcji powoduje utrate synchronizacji -- parser przeskakuje w zle miejsce i juz nigdy nie trafia na poprawny tag
2. **Brak odpornosci na bledy** -- parser nie probuje odzyskac synchronizacji po napotkaniu nieprawidlowego bloku
3. **Brak logowania diagnostycznego** -- nie widac co parser faktycznie odczytuje z pliku

## Rozwiazanie

### 1. Ulepszenie `extractSections()` w `src/lib/ddd-parser.ts`

- **Skanowanie z odzyskiwaniem synchronizacji**: zamiast przeskakiwac po 1 bajcie przy bledzie, szukac nastepnego `0x76` i walidowac czy nastepny bajt jest poprawnym tagiem sekcji (0x01-0x09)
- **Walidacja dlugosci**: sprawdzac czy deklarowana dlugosc sekcji jest rozsadna (np. < 500KB) zanim ja zaakceptujemy
- **Logowanie do konsoli**: dodac `console.log` z informacja o kazdej znalezionej sekcji (tag, offset, dlugosc) -- to pozwoli debugowac kolejne problemy

### 2. Poprawienie parsowania poszczegolnych sekcji

Obecne parsery zakladaja bardzo konkretny uklad bajtow, ktory moze nie odpowiadac rzeczywistej strukturze danych z tachografu. Glowne poprawki:

- **parseOverview**: dane Overview z tachografu zaczynaja sie od pod-rekordow TLV (np. `VuIdentification`, `VuDownloadablePeriod`), NIE od surowych pol. Parser musi rozpoznac te pod-rekordy i odczytac pola z odpowiednich offsetow
- **parseActivities**: analogicznie -- sekcja Activities zawiera pod-rekordy z wlasnymi naglowkami
- **parseEventsAndFaults**: j.w.
- **parseTechnicalData**: j.w.

### 3. Dodanie trybu diagnostycznego w UI (`src/pages/DddReader.tsx`)

- Wyswietlanie listy WSZYSTKICH znalezionych sekcji surowych (tag hex, offset, rozmiar) w zakladce "Diagnostyka"
- Hex dump pierwszych 64 bajtow kazdej sekcji -- pozwoli wizualnie zweryfikowac co parser odczytal
- Wyswietlanie calkowitego rozmiaru pliku i ile bajtow zostalo sparsowanych vs pominieto

## Szczegoly techniczne

### Poprawiona logika `extractSections()`

```text
pos = 0
while pos < buffer.length - 4:
  byte = buffer[pos]
  if byte == 0x76:
    tagLow = buffer[pos+1]
    if tagLow >= 0x01 AND tagLow <= 0x09:
      length = readUint16(pos+2)
      if length > 0 AND length <= 500000 AND pos+4+length <= buffer.length:
        // Valid section found
        sections.push({tag: tagLow, offset: pos, length, data})
        pos += 4 + length
        continue
  pos += 1  // scan forward byte by byte
```

### Nowa zakladka "Diagnostyka" w DddReader

Wyswietla:
- Rozmiar pliku
- Liczba znalezionych sekcji TLV
- Tabela: tag (hex), offset, dlugosc, hex dump (pierwsze 32B)
- Ostrzezenia parsera (bledne sekcje, pominiety dane)

### Pliki do zmiany

1. `src/lib/ddd-parser.ts` -- poprawienie extractSections, dodanie logowania, uodpornienie parserow sekcji
2. `src/pages/DddReader.tsx` -- dodanie zakladki diagnostycznej z informacjami o surowych sekcjach

