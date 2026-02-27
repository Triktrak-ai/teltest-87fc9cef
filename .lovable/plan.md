

# Obsluga plikow karty kierowcy (Driver Card)

## Zakres

Dodanie pelnej obslugi plikow karty kierowcy po trzech stronach:
1. **Backend C#** -- pobieranie danych karty kierowcy z tachografu
2. **Parser TypeScript** -- parsowanie plikow karty kierowcy (.ddd)
3. **Frontend/Monitor** -- wyswietlanie danych karty kierowcy w czytniku DDD i informacji w monitorze

---

## 1. Backend C# -- pobieranie karty kierowcy

Serwer juz czesciowo obsluguje karty kierowcy:
- `DddFileType.DriverCard1` i `DriverCard2` sa zdefiniowane w enumie
- `BuildDownloadListPayload()` juz zawiera wpisy `0x06 0x01 0x01` i `0x06 0x01 0x02` (slot 1 i 2)
- `RequestFileAsync()` prawidlowo wysyla TRTP=0x06 z data=slot
- `SaveCurrentFile()` zapisuje jako `_driver1_` / `_driver2_`

**Brakuje** natomiast:
- Pliki karty kierowcy NIE sa dodawane do `BuildFileList()` -- tylko 5 plikow VU jest pobieranych
- Brak raportowania pobierania karty kierowcy do monitora

### Zmiany w `DddSession.cs`:

**a) Dodanie kart kierowcy do `BuildFileList()`**

```text
BuildFileList():
  Overview, Activities, EventsAndFaults, DetailedSpeed, TechnicalData
  + DriverCard1   // slot 1
  + DriverCard2   // slot 2
```

Pliki kart kierowcy beda pobierane po plikach VU. Jezeli slot jest pusty, tachograf zwroci blad ktory jest juz obslugiwany (HandleFileData, case Error -- przechodzi do nastepnego pliku).

**b) Aktualizacja `MergeVuFiles()` -- NIE dodawac kart kierowcy do scalonego pliku VU**

Karty kierowcy to oddzielne pliki, nie powinny byc czescia `_vu_*.ddd`. Obecna logika juz poprawnie pomija je (iteruje tylko po vuFileTypes), wiec nie wymaga zmian.

**c) Raportowanie statusu `current_file`**

`TransitionTo` juz ustawia `_currentFileType.ToString()` -- dzieki temu monitor bedzie widzial "DriverCard1" / "DriverCard2" w kolumnie aktualnego pliku. `total_files` wzrosnie z 5 na 7.

---

## 2. Parser TypeScript -- parsowanie karty kierowcy

Karta kierowcy ma inna strukture niz pliki VU. Glowne sekcje karty kierowcy (wg Annex IC / Appendix 2):

| Tag    | Sekcja                        | Zawartosc                                              |
|--------|-------------------------------|--------------------------------------------------------|
| 0x0002 | Card Identification           | Numer karty, kraj, daty waznosci                       |
| 0x0005 | Card Driver Activity           | Czynnosci kierowcy (ten sam format co VU Activities)   |
| 0x0006 | Vehicles Used                 | Lista pojazdow uzywanych przez kierowcego              |
| 0x0520 | Card Events                   | Zdarzenia na karcie                                    |
| 0x0503 | Card Faults                   | Usterki na karcie                                      |
| 0x0508 | Card Places                   | Miejsca rozpoczecia/zakonczenia dnia pracy             |
| Inne   | Certyfikaty, kontrole         | Dane kontrolne                                         |

### Zmiany w `src/lib/ddd-parser.ts`:

**a) Nowe interfejsy**

```text
DriverCardIdentification:
  cardNumber: string (16 zn.)
  cardIssuingMemberState: string
  driverName: { surname, firstName }
  cardIssueDate: Date
  cardExpiryDate: Date
  cardValidityBegin: Date

VehicleUsedRecord:
  vehicleRegistrationNumber: string
  vehicleRegistrationNation: string
  firstUse: Date
  lastUse: Date
  odometerBegin: number
  odometerEnd: number

CardPlaceRecord:
  entryTime: Date
  dailyWorkPeriodCountry: string
  dailyWorkPeriodRegion: string
  vehicleOdometerValue: number
```

**b) Rozszerzenie `DddFileData`**

```text
DddFileData:
  + driverCard: DriverCardData | null

DriverCardData:
  identification: DriverCardIdentification | null
  activities: ActivityRecord[]          // ten sam format
  vehiclesUsed: VehicleUsedRecord[]
  events: EventRecord[]
  faults: FaultRecord[]
  places: CardPlaceRecord[]
```

**c) Detekcja typu pliku**

Rozszerzenie `detectFileType()` o wzorce `_driver1_` i `_driver2_` zwracajace nowy typ `'driver_card'`.

Dodatkowo, jesli plik nie pasuje do zadnego wzorca nazwy, parser sprawdzi nagłówek binarny -- pliki kart kierowcy zaczynają się od tagów w zakresie `0x00xx` zamiast `0x76xx`.

**d) Parser karty kierowcy**

Dedykowana funkcja `parseDriverCardFile()`:
- Skanuje TLV z 2-bajtowymi tagami (np. `0x00 0x02`) + 2-bajtowa dlugosc
- Odczytuje CardIdentification (numer karty, imie/nazwisko, daty)
- Odczytuje ActivityData (uzywa istniejacego formatu ActivityRecord)
- Odczytuje VehiclesUsed (lista rekordow VRN + daty uzycia)
- Odczytuje Events i Faults (format zblizony do VU, ale prostszy)

**e) Aktualizacja `mergeDddData()`**

Nowe pole `driverCard` mergowane tak, ze incoming nadpisuje istniejace (jezeli nie-null).

---

## 3. Frontend -- czytnik DDD

### Zmiany w `src/pages/DddReader.tsx`:

**a) Nowa zakladka "Karta kierowcy"**

Wyswietlana tylko gdy `data.driverCard` nie jest null. Zawartosc:
- **Identyfikacja**: numer karty, imie i nazwisko kierowcy, kraj wydania, data waznosci
- **Pojazdy uzywane**: tabela z VRN, krajem, datami uzycia, przebiegiem
- **Miejsca**: tabela z datami, krajami, regionami

**b) Aktualizacja naglowka strony**

Zmiana opisu z "Analiza plikow Vehicle Unit" na "Analiza plikow DDD (VU / Karta kierowcy)".

**c) Aktualizacja opisu drop zone**

Dodanie informacji o mozliwosci wczytywania plikow karty kierowcy:
```text
"Można wczytać pliki VU (overview, activities, events, speed, technical)
lub pliki karty kierowcy (driver1, driver2)"
```

### Zmiany w `src/components/SessionsTable.tsx` (monitor):

**d) Wyswietlanie informacji o kartach kierowcy w tabeli sesji**

Gdy `total_files` wynosi 7 (zamiast 5), monitor bedzie naturalnie wyswietlal poprawny postep. Gdy `current_file` to "DriverCard1" lub "DriverCard2", wyswietli sie to w kolumnie aktualnego pliku.

---

## Pliki do zmiany

| Plik | Zakres zmian |
|------|-------------|
| `csharp/TachoDddServer/Session/DddSession.cs` | Dodanie DriverCard1/2 do BuildFileList() |
| `src/lib/ddd-parser.ts` | Nowe interfejsy, parser karty kierowcy, rozszerzenie DddFileData i merge |
| `src/pages/DddReader.tsx` | Nowa zakladka "Karta kierowcy", zaktualizowane opisy |

## Ograniczenia i uwagi

- Parsowanie karty kierowcy jest oparte na specyfikacji EU 165/2014 Annex IC, ale rzeczywiste pliki moga miec drobne roznice miedzy generacjami (Gen1 vs Gen2) -- parser bedzie tolerancyjny
- Jezeli slot karty kierowcy w tachografie jest pusty, serwer otrzyma blad i przejdzie do nastepnego pliku -- to juz dziala poprawnie
- Dane karty kierowcy nie sa scalane z danymi VU w jeden obiekt -- sa osobnym polem `driverCard` w `DddFileData`

