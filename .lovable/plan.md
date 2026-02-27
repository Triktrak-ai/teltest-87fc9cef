

# Rozroznienie Gen2v1 vs Gen2v2 na podstawie EF_ICC

## Obecny stan

Detekcja karty opiera sie wylacznie na ATR (protokol T=0 vs T=1), co pozwala rozroznic Gen1 od Gen2, ale nie rozroznia Gen2v1 od Gen2v2. Obie wersje uzywaja T=1.

## Podejscie

Po pobraniu ATR i wykryciu "Gen2", aktywnie odpytujemy karte przez CardBridge o zawartosc pliku EF_ICC, ktory zawiera pole `cardGeneration`:
- wartosc 1 = Gen2v1
- wartosc 2 = Gen2v2

Nastepnie resetujemy stan karty (SELECT MF), aby nie zaklocic pozniejszej autentykacji VU.

## Sekwencja APDU do odczytu EF_ICC

```text
1. SELECT MF:        00 A4 00 0C 02 3F 00
2. SELECT DF 0007:   00 A4 02 0C 02 00 07
3. SELECT EF_ICC:    00 A4 02 0C 02 00 02
4. READ BINARY:      00 B0 00 00 00   (odczyt pierwszych bajtow)
5. SELECT MF:        00 A4 00 0C 02 3F 00   (reset stanu karty)
```

Jesli SELECT DF 0007 zwroci blad (np. `6A 82` - file not found), karta jest Gen1 (potwierdzenie z ATR).

## Zmiany w plikach

### 1. `csharp/TachoDddServer/Session/DddSession.cs`

**a) Nowa metoda `ProbeCardGenerationAsync()`:**

- Wysyla sekwencje APDU przez `_bridge.TransmitApduAsync()`
- Sprawdza SW (ostatnie 2 bajty odpowiedzi): `90 00` = sukces
- Jesli SELECT DF 0007 sie nie powiedzie -- zwraca "Gen1"
- Jesli READ BINARY EF_ICC sie powiedzie -- parsuje bajt `cardGeneration` z odpowiedzi
- Na koniec wysyla SELECT MF zeby zresetowac stan karty
- Otoczona try/catch -- w razie bledu zwraca "Gen2" (fallback jak dotychczas)

**b) Modyfikacja `StartAuthenticationAsync()`:**

Po wykryciu "Gen2" z ATR, wywolanie `ProbeCardGenerationAsync()` ktore zwroci "Gen2v1" lub "Gen2v2". Podmiana wartosci `_cardGeneration` i ponowne wywolanie `_webReporter?.SetCardGeneration()`.

**c) Modyfikacja `DetectCardGeneration()`:**

Bez zmian -- nadal zwraca "Gen1" lub "Gen2" z ATR. Probe robi dokladniejsza detekcje.

### 2. `src/components/SessionsTable.tsx`

**Aktualizacja `isGenerationMismatch()`:**

Zmiana logiki na macierz kompatybilnosci:
- Gen1 karta + dowolny tachograf = OK
- Gen2v1 karta + Gen1 tachograf = NIEZGODNOSC (ale moze dzialac)
- Gen2v1 karta + Gen2 tachograf = OK
- Gen2v2 karta + Gen1 tachograf = NIEZGODNOSC
- Gen2v2 karta + Gen2 tachograf = OK (przy zalozeniu ze Gen2 obejmuje v1 i v2)

**Aktualizacja `genBadgeClass()`:**

Dodanie stylu dla "Gen2v1" (niebieski) i "Gen2v2" (fioletowy/accent) aby wizualnie je rozroznic.

### 3. `src/hooks/useSessions.ts`

Bez zmian -- pole `card_generation` juz jest typu `string`, wiec "Gen2v1"/"Gen2v2" beda obslugiwane automatycznie.

### 4. Baza danych / Edge Function

Bez zmian -- kolumna `card_generation` jest typu `text`, wiec nowe wartosci beda zapisywane bez migracji.

## Parsowanie EF_ICC

Struktura EF_ICC dla Gen2 (Appendix 2, Regulation 2016/799):
- Bajty 0-3: `cardIccIdentification` header
- W obrebie danych: `cardGeneration` (1 bajt) -- wartosc `0x01` = Gen2v1, `0x02` = Gen2v2

Dokladna pozycja bajtu zostanie ustalona empirycznie z odpowiedzi READ BINARY (zalogowana w diagnostyce). Fallback: jesli parsowanie sie nie powiedzie, zostawiamy "Gen2".

## Przebieg w runtime

```text
1. ATR z karty -> DetectCardGeneration() -> "Gen2"
2. ProbeCardGenerationAsync():
   a. SELECT MF -> 90 00
   b. SELECT DF 0007 -> 90 00 (karta obsluguje Gen2)
   c. SELECT EF_ICC -> 90 00
   d. READ BINARY -> dane z cardGeneration=0x01 -> "Gen2v1"
   e. SELECT MF -> 90 00 (reset)
3. _cardGeneration = "Gen2v1"
4. VU wysyla SELECT 00 A4 02 0C 02 00 02 -> Gen1 tachograf
5. Dashboard: Karta="Gen2v1", Tachograf="Gen1"
```

## Pliki do zmiany

| Plik | Zmiana |
|------|--------|
| `DddSession.cs` | Nowa metoda `ProbeCardGenerationAsync()`, wywolanie w `StartAuthenticationAsync()` |
| `SessionsTable.tsx` | Macierz kompatybilnosci w `isGenerationMismatch()`, nowe kolory badge |

