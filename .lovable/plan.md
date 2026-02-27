
# Modul czytnika plikow DDD

## Opis

Nowa strona/zakladka w aplikacji umozliwiajaca wczytanie pliku .DDD z dysku (drag-and-drop lub przycisk) i wyswietlenie jego zawartosci w czytelnej formie tabelarycznej.

## Co bedzie parsowane

Pliki DDD (Vehicle Unit) skladaja sie z sekcji o znanej strukturze binarnej (rozporzadzenie UE 3821/85, Annex 1B). Parser obsluzy:

- **Overview** - numer VU, numer rejestracyjny, kraj, data kalibracji
- **Activities** - dzienne zapisy czynnosci kierowcy (jazda, odpoczynek, praca, dyspozycyjnosc) z datami i czasami
- **Events & Faults** - zdarzenia i usterki tachografu z kodami i datami
- **Technical Data** - dane kalibracji, czujnikow, plomb
- **Detailed Speed** - rekordy predkosci (opcjonalnie, jako wykres)

Kazda sekcja DDD zaczyna sie od identyfikatora (tag + length), co pozwala na sekwencyjne parsowanie ArrayBuffer w TypeScript.

## Zakres zmian

### 1. Parser binarny DDD (`src/lib/ddd-parser.ts`)
- Klasa `DddParser` przyjmujaca `ArrayBuffer`
- Metody do odczytu sekcji: `parseOverview()`, `parseActivities()`, `parseEventsAndFaults()`, `parseTechnicalData()`
- Pomocnicze funkcje: odczyt dat (sekundy od 01.01.1970 UTC, 4 bajty), odczyt stringow (kodowanie ISO 8859), odczyt VRN, numeru karty itp.
- Typy TypeScript dla kazdej sekcji danych

### 2. Strona czytnika (`src/pages/DddReader.tsx`)
- Strefa drag-and-drop / przycisk wyboru pliku
- Po wczytaniu: zakladki (Tabs) z sekcjami: Przegląd, Czynności, Zdarzenia, Dane techniczne, Predkosc
- Kazda zakladka wyswietla dane w tabelach/kartach
- Sekcja Czynnosci: timeline/tabela z kolorami wg typu czynnosci
- Sekcja Predkosc: prosty wykres liniowy (recharts)

### 3. Routing (`src/App.tsx`)
- Nowa trasa `/ddd-reader`

### 4. Nawigacja (`src/pages/Index.tsx`)
- Przycisk/link do czytnika DDD w headerze

## Szczegoly techniczne

### Struktura binarna pliku VU DDD
Plik sklada sie z bloków TLV (Tag-Length-Value). Glowne tagi:
- `0x76 01` - MemberStateCertificate
- `0x76 02` - VuCertificate  
- `0x76 05` - VuOverview
- `0x76 06` - VuActivities
- `0x76 07` - VuEventsAndFaults
- `0x76 08` - VuDetailedSpeed
- `0x76 09` - VuTechnicalData

Data jest przechowywana jako 4-bajtowy unsigned int (sekundy od epoch Unix). Stringi sa w kodowaniu ISO 8859-1, 8859-7 lub 8859-15 (zalezy od flagi codepage).

### Parser - podejscie
```text
ArrayBuffer --> DataView --> sekwencyjny odczyt TLV blokow
  |-> dla kazdego tagu: rozpoznanie sekcji
  |-> parsowanie podrekordow wg specyfikacji
  |-> zwrocenie typowanego obiektu JS
```

Parser bedzie obslugiwac zarowno pliki Gen1 jak i Gen2 (roznica w dlugosci tagow i niektorych polach).

### UI - uklad
```text
+------------------------------------------+
| TachoDDD Monitor    [Czytnik DDD]  [...]  |
+------------------------------------------+
| Przeciagnij plik .DDD lub kliknij [Wybierz] |
+------------------------------------------+
| [Przegląd] [Czynności] [Zdarzenia] [Tech] |
|                                          |
|  VRN: WA 1234X                           |
|  VU S/N: 12345678                        |
|  Kraj: PL                                |
|  Ostatnia kalibracja: 2025-01-15         |
|  ...                                     |
+------------------------------------------+
```

## Ograniczenia
- Plik jest parsowany wylacznie w przegladarce (bez backendu) - nie wymaga uploadu na serwer
- Obsluga Gen1 w pierwszej iteracji; Gen2 moze wymagac dodatkowej pracy z dluższymi tagami
- Podpisy cyfrowe i certyfikaty nie beda weryfikowane - tylko wyswietlane jako metadane
- Szczegolowa predkosc moze generowac duze tablice - bedzie renderowana z wirtualizacja lub ograniczeniem
