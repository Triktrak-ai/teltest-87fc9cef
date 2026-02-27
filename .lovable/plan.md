

# Wykrywanie niezgodnosci generacji karta/tachograf

## Problem

Gdy karta Gen2 laczy sie z tachografem Gen1, autentykacja konczy sie bledem `0x02:0x02` ("card not recognized") bez zadnej informacji o przyczynie. Uzytkownik musi recznie analizowac logi ATR i APDU, zeby zrozumiec co sie stalo.

## Rozwiazanie

Dodanie automatycznego wykrywania generacji karty z ATR, generacji tachografu z pierwszego APDU SELECT, i wyswietlania czytelnego komunikatu o niezgodnosci na dashboardzie.

## Zmiany

### 1. Migracja bazy danych

Dodanie kolumny `card_generation` do tabeli `sessions`:

```sql
ALTER TABLE sessions ADD COLUMN card_generation text DEFAULT 'Unknown';
```

### 2. `csharp/TachoDddServer/Session/DddSession.cs`

**a) Nowe pole i metoda detekcji karty:**

Dodanie pola `_cardGeneration` (string, domyslnie "Unknown") obok istniejacego `_vuGeneration`.

Nowa metoda `DetectCardGeneration(byte[] atr)`:
- Parsowanie ATR zgodnie z ISO 7816-3
- Bajt T0 (indeks 1) -- liczba historical bytes w gornych 4 bitach, interface bytes w dolnych
- Jesli TD1 wskazuje T=1 (bit 0 = 1) -- karta Gen2
- Jesli T=0 -- karta Gen1
- Dla przykladu z logow: ATR `3B FE 96 00 00 80 31 FE 43...` -- TD1 = `FE`, bit 0 = 0... ale `80 31` w historical bytes wskazuje T=1 via TCK. Prostsze podejscie: sprawdzenie czy ATR zawiera bajt `31` po `80` w historical bytes (T=1 indicator w compact TLV).

**b) Wykrywanie generacji VU z pierwszego APDU SELECT:**

W `HandleApduLoop`, przy pierwszym APDU (`_diagnostics.ApduExchanges == 0`), parsowanie komendy SELECT:
- `00 A4 02 0C 02 00 02` -- SELECT DF `0002` = Gen1 tachograf
- `00 A4 02 0C 02 00 07` lub inne -- Gen2 tachograf

Zapisywanie tej informacji w nowym polu `_detectedVuGenFromApdu`.

**c) Rozszerzenie HandleError o diagnostyke niezgodnosci:**

W bloku obslugi bledow autentykacji (linia 328-346), po wykryciu bledu `0x02:0x02` w stanie `ApduLoop`:
- Sprawdzenie czy `_cardGeneration` != "Unknown" i czy wykryta generacja VU z APDU jest inna niz generacja karty
- Jesli niezgodnosc: logowanie czytelnego komunikatu np. "Generation mismatch: Card is Gen2 but VU requires Gen1 -- incompatible"
- Raportowanie do dashboardu z typem "warning" i kontekstem "GenerationMismatch"

**d) W `StartAuthenticationAsync`:**

Po pobraniu ATR (linia 523), wywolanie `DetectCardGeneration(atr)` i ustawienie `_cardGeneration`. Przekazanie do WebReportera.

### 3. `csharp/TachoDddServer/Reporting/WebReporter.cs`

- Nowe pole `_cardGeneration` (string)
- Nowa metoda `SetCardGeneration(string gen)`
- Dodanie `card_generation` do payloadu w `ReportStatus()` i `ReportError()`

### 4. `supabase/functions/report-session/index.ts`

Dodanie obslugi pola `card_generation` w sekcji opcjonalnych pol (obok `generation`):

```typescript
if (body.card_generation !== undefined)
  sessionData.card_generation = body.card_generation;
```

### 5. `src/hooks/useSessions.ts`

Dodanie `card_generation: string` do interfejsu `Session`.

### 6. `src/components/SessionsTable.tsx`

- Zmiana naglowka "Generacja" na dwie kolumny: "Tachograf" i "Karta"
- Wyswietlanie `s.generation` jako generacja tachografu (VU)
- Wyswietlanie `s.card_generation` jako generacja karty firmowej
- Kolorowe badge: Gen1 = szary, Gen2 = niebieski, Unknown = domyslny
- Gdy `s.error_message` zawiera "Generation mismatch" lub `s.error_code` = "0x02:0x02" i karta != tachograf: czerwony alert z ikonka ostrzezenia i komunikatem "Niezgodnosc generacji"

### 7. `csharp/TachoDddServer/Protocol/DddErrorCodes.cs`

Dodanie nowej metody `IsGenerationMismatch(byte errorClass, byte errorCode)` zwracajacej `true` dla `0x02:0x02`, uzywana do warunkowej diagnostyki.

## Przebieg w runtime

```text
1. ATR z karty -> DetectCardGeneration() -> "Gen2"
2. VU wysyla SELECT 00 A4 02 0C 02 00 02 -> wykryty Gen1 VU
3. Karta odpowiada 6A 82 (file not found)
4. VU zwraca error 0x02:0x02
5. HandleError() -> sprawdzenie: karta=Gen2, VU=Gen1
6. Log: "GENERATION MISMATCH: Card Gen2 cannot authenticate with Gen1 VU"
7. Dashboard: kolumna Karta="Gen2", Tachograf="Gen1", badge "Niezgodnosc generacji"
```

## Pliki do zmiany

| Plik | Zmiana |
|------|--------|
| Migracja SQL | kolumna `card_generation` |
| `DddSession.cs` | detekcja generacji karty i VU, diagnostyka mismatch |
| `WebReporter.cs` | pole i payload `card_generation` |
| `report-session/index.ts` | obsluga `card_generation` |
| `useSessions.ts` | rozszerzenie interfejsu |
| `SessionsTable.tsx` | dwie kolumny generacji + alert mismatch |
| `DddErrorCodes.cs` | helper `IsGenerationMismatch` |

