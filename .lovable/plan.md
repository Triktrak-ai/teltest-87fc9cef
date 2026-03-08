

## Plan: Dostosowanie parsera DDD do odpowiedzi specjalisty

### Streszczenie rozbieżności

Specjalista wyjaśnił 10 kwestii. Porównanie z obecnym kodem (`src/lib/ddd-parser.ts`) wykazuje następujące rozbieżności wymagające poprawek:

### 1. ActivityChangeInfo — brakujący bit 14 (drivingStatus)

**Problem:** Parser pomija bit 14 (`drivingStatus`: 0=SINGLE, 1=CREW). Obecny kod:
```typescript
const slot = (word >> 15) & 0x01;        // bit 15 ✓
// bit 14 — POMINIĘTY
const cardInserted = ((word >> 13) & 0x01) === 0;  // bit 13 ✓
const activity = (word >> 11) & 0x03;    // bits 12-11 ✓
const minutes = word & 0x07FF;           // bits 10-0 ✓
```

**Poprawka:**
- Dodać pole `drivingStatus: 'single' | 'crew'` do `ActivityChangeEntry` i `RawActivityWord`
- Parsować bit 14: `const drivingStatus = (word >> 14) & 0x01`
- Wyświetlać w UI (ikona załogi przy wpisach z `crew`)

### 2. VuCardIWRecord — rozmiar 131B (nie 129B)

**Problem:** Komentarze w kodzie odnoszą się do 129B (Gen1). Parser RecordArray poprawnie odczytuje `recordSize` z nagłówka (typ 0x0D), więc dynamicznie obsługuje dowolny rozmiar. Ale Gen1 fallback (`parseVuActivitiesGen1Style`) ma zakodowane 129B.

**Poprawka:** W `parseVuActivitiesGen1Style` użyć 131B dla Gen2 lub odczytywać rozmiar dynamicznie.

### 3. Kolejność RecordArrays — brakujące typy

**Problem:** Parser obsługuje typy 0x06, 0x05, 0x0D, 0x01. Specjalista podał pełną kolejność 10 typów. Brakuje:
- `0x1C` — VuPlaceDailyWorkPeriodRecordArray (12B rekordy w v2)
- `0x16` — VuGNSSADRecordArray
- `0x09` — VuSpecificConditionRecordArray
- `0x22` — VuBorderCrossingRecordArray
- `0x23` — VuLoadUnloadRecordArray
- `0x08` — SignatureRecordArray

**Poprawka:** Dodać logowanie rozpoznanych typów i komentarze. Parsowanie 0x1C, 0x22, 0x23 to osobne zadanie (nowe zakładki w UI).

### 4. TRTP prefix — wyjaśnienie

**Problem:** Specjalista potwierdza: 3 bajty to `[TREP][sub-msg-counter-hi][sub-msg-counter-lo]`. Wartość `32 00 01` oznacza TREP=0x32 (activities Gen2v2), submsg=1. Natomiast w kodzie szukamy `04 00 01` — to wygląda na inny wzorzec (prawdopodobnie dane wewnątrz TLV po strippingu tagu `76 32`). Obecna logika działa poprawnie, ale komentarze powinny odzwierciedlać wyjaśnienie specjalisty.

**Poprawka:** Zaktualizować komentarze w `stripTrtpPrefix`, dodać logikę rozpoznawania TREP byte.

### 5. Sygnatura (typ 0x08) — ignorowanie

**Status:** Parser już pomija nieznane typy w `default: break`. Dodać jawny komentarz przy 0x08.

### 6. Zdarzenia i usterki (TREP 33h) — nowe recordTypes

**Problem:** Parser zdarzeń prawdopodobnie nie rozpoznaje typów 0x18, 0x15, 0x1A, 0x1B, 0x1E.

**Poprawka:** Sprawdzić i dodać obsługę tych RecordArray types w parserze zdarzeń.

### 7. dailyPresenceCounter — niedostępny w VU download

**Status:** Specjalista potwierdza: VU TREP 32h **nie zawiera** dailyPresenceCounter. Obecne `dailyPresenceCounter: 0` jest poprawne.

---

### Zmiany w plikach

**`src/lib/ddd-parser.ts`:**
1. Dodać `drivingStatus` do `ActivityChangeEntry` i `RawActivityWord`
2. Parsować bit 14 we wszystkich miejscach dekodowania ActivityChangeInfo (3 miejsca)
3. Zaktualizować komentarze TRTP i kolejność RecordArrays
4. Dodać logowanie dla nowych typów RA (0x1C, 0x09, 0x22, 0x23, 0x08)
5. Poprawić rozmiar VuCardIWRecord w Gen1 fallback (129→131 dla Gen2)

**`src/components/ActivityTimeline.tsx`:**
1. Wyświetlić wskaźnik `crew` przy wpisach z `drivingStatus === 'crew'`

