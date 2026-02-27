

# Naprawa parsowania czynnosci (Activities) w DDD Reader

## Problem

Parser `parseActivities()` nie waliduje danych, co powoduje:

1. **Daty typu "13.08.1970"** — `readTimestamp()` akceptuje dowolna wartosc != 0 i != 0xFFFFFFFF. Bajty smieci (np. z cyklicznego bufora VU) sa interpretowane jako daty z lat 70-tych/90-tych.

2. **Godziny typu "68:15"** — pole `minutes` (`word & 0x0FFF`) z danych smieci daje wartosci do 4095 (= 68h 15m). Poprawny zakres to 0-1439 (00:00-23:59).

3. **Brak detekcji konca danych** — bufor czynnosci VU jest cykliczny. Po prawdziwych rekordach jest padding (0xFF) lub stare nadpisane dane. Parser czyta je jako kolejne rekordy.

## Rozwiazanie

### Zmiana 1: Walidacja timestamp w `parseActivities()` (linia 1374)

Uzyc istniejacego `isValidTimestamp()` zamiast prostego `readTimestamp()`:

```text
// Zamiast:
const date = r.readTimestamp();
if (!date) { r.skip(8); continue; }

// Bedzie:
const tsValue = r.readUint32();
if (tsValue === 0 || tsValue === 0xFFFFFFFF || !isValidTimestamp(tsValue)) {
  // Skip rest of this "record" — ale nie wiemy ile, wiec break
  break;
}
const date = new Date(tsValue * 1000);
```

Break zamiast continue, bo jezeli trafilismy na nieprawidlowy timestamp, to jestesmy juz w smieci i dalsze czytanie nie ma sensu.

### Zmiana 2: Walidacja `activityChangeCount` (linia 1378)

Dodac gorny limit na liczbe wpisow czynnosci:

```text
const activityChangeCount = r.remaining >= 2 ? r.readUint16() : 0;
if (activityChangeCount > 1440) break; // max 1 zmiana na minute w ciagu doby
```

### Zmiana 3: Walidacja `minutes` w petli czynnosci (linia 1386)

Odrzucac wpisy z minutami poza zakresem 0-1439:

```text
const minutes = word & 0x0FFF;
if (minutes >= 1440) continue; // pomijaj smieci
```

### Zmiana 4: Walidacja `dayDistance` (linia 1377)

Odrzucac rekordy z nierealistycznym dystansem:

```text
const dayDistance = r.readUint16();
if (dayDistance > 9999) break; // max ~10000 km/dzien to juz smieci
```

## Plik do zmiany

| Plik | Zmiana |
|------|--------|
| `src/lib/ddd-parser.ts` linie 1372-1416 | Walidacja timestamp, activityChangeCount, minutes, dayDistance |

## Oczekiwany efekt

- Daty z lat 1970/1999 nie beda sie pojawiac — parser przerwie parsowanie przy pierwszym nieprawidlowym timestamp
- Godziny typu "68:15" znikna — wpisy z minutami >= 1440 beda pomijane
- Rekordy ze smieciowego cyklicznego bufora nie beda wyswietlane

