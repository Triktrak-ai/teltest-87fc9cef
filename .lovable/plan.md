

## Problem

Na podstawie odpowiedzi eksperta zidentyfikowano **5 błędów** w parserze Activities (`src/lib/ddd-parser.ts`), które powodują utratę prawidłowych rekordów:

### Błąd 1: `0x0000` odrzucany jako padding
Wartość `0x0000` to legalny wpis startowy (slot 0, single, karta włożona, break, minuta 0). Parser błędnie go pomija w **3 miejscach** (linie 2420, 2675, 3215).

### Błąd 2: Podział dni przez `minutes < prevMinutes` (linia 2490)
Wpisy slotów 0 i 1 są przemieszane chronologicznie. Jeśli slot 0 ma minutę 800, a następny wpis to slot 1 z minutą 5, parser tworzy fałszywą granicę dnia. Ekspert potwierdza: parser powinien polegać na `DateOfDayDownloaded`, nie na spadku minut.

### Błąd 3: Limit `noOfRecords > 50000` (linia 2380)
VU może przesłać do 93,440 zmian czynności. Limit 50,000 powoduje przerwanie parsowania RecordArray.

### Błąd 4: Filtr daty 90 dni (linia 2111)
VU przechowuje 365 dni. Okno 90 dni odrzuca do 275 dni prawidłowych danych.

### Błąd 5: `filterDistanceArtifacts` — fałszywe odrzucenia
Identyczny dystans dzienny w kolejnych dniach jest normalny w transporcie (stałe trasy). Usuwanie serii 3+ identycznych dystansów kasuje prawidłowe dane.

### Błąd 6: `dur <= 0` odrzuca cały dzień (linie 2004, 2519)
Wpisy o zerowym czasie trwania są legalne (wiele zmian statusu w tej samej minucie). Parser odrzuca cały dzień zamiast je tolerować.

---

## Plan naprawy

### 1. Nie odrzucać `0x0000`
Usunąć `word === 0x0000` z warunków skip w 3 miejscach. Zachować filtr `0xFFFF`.

### 2. Naprawić podział dni w `parseVuActivitiesRecordArrays`
Zamiast logiki `minutes < prevMinutes`, użyć struktury RecordArray: po każdym bloku `0x01` (ActivityChangeInfo) przypada jeden dzień z `DateOfDayDownloaded` (typ `0x06`). Zmienić parsing na iteracyjny po grupach RecordArray (data → odometer → activity) zamiast flat split.

```text
Obecna logika:
  1. Zbierz WSZYSTKIE daty, odometry, activity words
  2. Podziel activity words po spadku minut → dayGroups
  3. Dopasuj dayGroups[i] do dates[i]

Nowa logika:
  1. Iteruj sekwencyjnie po RecordArrays
  2. Gdy napotkasz typ 0x06 (data) → rozpocznij nowy dzień
  3. Typ 0x05 (odometer) → przypisz do bieżącego dnia
  4. Typ 0x01 (activity) → przypisz wpisy do bieżącego dnia
  5. Emituj rekord po kompletnym zestawie
```

### 3. Podnieść limit `noOfRecords`
Zmienić `50000` na `100000`.

### 4. Rozszerzyć okno daty z 90 na 400 dni
VU przechowuje 365 dni — okno 400 dni daje margines bezpieczeństwa.

### 5. Zmienić `filterDistanceArtifacts`
Usunąć logikę usuwania serii 3+ identycznych dystansów. Zachować tylko filtr specyficzny dla wartości 768 (artefakt TRTP), ale podnieść próg do ≥5 wystąpień i wymagać dodatkowego warunku (np. brak wpisów czynności lub entries.length ≤ 2).

### 6. Tolerować `dur <= 0`
Zmienić walidację: zamiast odrzucać cały dzień przy `dur <= 0`, po prostu pominąć ten konkretny wpis (nie tworzyć entry o zerowej długości). Nie przerywać parsowania dnia.

