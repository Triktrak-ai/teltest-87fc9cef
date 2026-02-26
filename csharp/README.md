# TachoDDD - Serwer pobierania danych z tachografu

System do zdalnego pobierania plików DDD z tachografów cyfrowych przez urządzenia Teltonika FMB640, z wykorzystaniem protokołu Codec 12 i tunelowania APDU.

## Architektura

```
FMB640 ──TCP:5200──► [VPS: TachoDddServer] ──WebSocket──► [ngrok] ──► [Twój PC: CardBridgeService] ──PC/SC──► Czytnik kart + karta firmowa
```

### Komponenty

| Komponent | Lokalizacja | Rola |
|-----------|-------------|------|
| **TachoDddServer** | VPS (Linux/Windows) | Serwer TCP, protokół DDD, maszyna stanów |
| **CardBridgeService** | Lokalny PC (Windows) | Most WebSocket ↔ PC/SC do czytnika kart |
| **ngrok** | Lokalny PC | Tunel WS do CardBridge (bez port forwarding) |

## Maszyna stanów sesji DDD

```
WaitingForImei
    │ IMEI (15B ASCII) → ACK (0x01)
    ▼
WaitingForStatus
    │ STATUS → parse resume/features/ignition/sequenceNumber
    │ Resume State (bity 0-4):
    │   bit 0/1 → start od ATR (pełna autentykacja)
    │   bit 2   → resume od Download List (pomija auth)
    │   bit 3   → resume od File Request (pomija auth + download list)
    │   bit 4   → resume od ostatniego transferu
    ▼
RequestingDriverInfo (opcjonalnie, jeśli features bit 1)
    │ DriverInfo request → response
    ▼
ApduLoop
    │ GET_ATR z CardBridge → ATR do urządzenia
    │ VUReadyAPDU/APDU ←→ karta (pętla)
    │ AuthOK
    ▼
CheckingInterfaceVersion
    │ FileRequest(TRTP=0x00) → FileData*/FileDataEOF → wykrycie generacji
    │ lub Error → fallback Gen1
    ▼
WaitingForDownloadListAck
    │ DownloadList (kody Gen1: 0x01-0x06) → ACK
    │ Obsługa APDU (0x12) jeśli VU wymaga interakcji z kartą
    ▼
DownloadingFile (pętla po plikach)
    │ FileRequest (TRTP wg generacji) → FileData (chunki + ACK) → FileDataEOF → zapis .ddd
    │ Dynamiczny SID/TREP z pierwszego pakietu (ostrzeżenie gdy SID=0x7F)
    │ powtórz dla każdego pliku
    ▼
Complete
    │ Łączenie plików VU → jeden .ddd (Overview+Activities+Events+Speed+Technical)
    │ Terminate (0xE0) → sesja zamknięta
```

## Zgodność z dokumentacją Teltonika DDD Protocol

### Download List — format payloadu (Tabele 14-16)

Download List używa **zawsze** kodów Gen1 (0x01-0x06), niezależnie od generacji VU. Format każdego wpisu: `[fileType(1B)][dataLength(1B)][fileTypeData(NB)]`.

Kody TRTP specyficzne dla generacji (Gen2v1: 0x21-0x25, Gen2v2: 0x31-0x35) są używane **wyłącznie** w pakietach `FileRequest (0x30)`.

### Weryfikacja CRC + RepeatRequest

Serwer weryfikuje CRC-16 każdej odebranej ramki Codec 12. W przypadku niezgodności CRC wysyła `RepeatRequest (0x00)` do urządzenia (max 3 próby).

### Dynamiczny SID/TREP

Pierwszy pakiet danych pliku zawiera bajty SID i TREP, które są odczytywane dynamicznie (nie hardkodowane). SID=0x7F oznacza negatywną odpowiedź.

### Keep Alive

Interwał: 80 sekund (zgodnie ze specyfikacją sekcja 5.17).

### Łączenie plików VU

Po pobraniu wszystkich plików, pliki VU (Overview, Activities, Events, Speed, Technical) są łączone w jeden plik `.ddd` w kolejności zgodnej ze specyfikacją. Karty kierowców zapisywane osobno. Pliki indywidualne również zachowane.

## Generacje tachografów i kody TRTP

| Plik | Gen1 | Gen2v1 | Gen2v2 |
|------|------|--------|--------|
| Overview | 0x01 | 0x21 | 0x31 |
| Activities | 0x02 | 0x22 | 0x32 |
| Events & Faults | 0x03 | 0x23 | 0x33 |
| Detailed Speed | 0x04 | 0x24 | 0x24* |
| Technical Data | 0x05 | 0x25 | 0x35 |
| Driver Card (slot) | 0x06 | 0x06 | 0x06 |

> \* Gen2v2 nie ma kodu 0x34, używa 0x24 (fallback do Gen2v1)

### Detekcja generacji

Serwer wysyła `FileRequest(TRTP=0x00)` (Interface Version). Na podstawie bajtu **TREP** w odpowiedzi:
- `TREP = 0x01` → Gen1 (lub Gen2v1)
- `TREP = 0x02` → Gen2v2
- Błąd (brak odpowiedzi) → Gen1

### Kompatybilność kart firmowych

| Karta | Gen1 | Gen2v1 | Gen2v2 |
|-------|------|--------|--------|
| Gen1 | ✅ | ✅ | ✅ |
| Gen2v1 | ❌ | ✅ | ✅ |
| Gen2v2 | ❌ | ❌ | ✅ |

## Protokół Codec 12

```
[4B zera][4B dataLen][1B codecId=0x0C][1B NOD][1B type][4B cmdLen][cmdData][1B NOD][4B CRC16]
```

Wewnątrz payloadu Codec 12, pakiet DDD:
```
[1B PayloadType][N bajtów danych]
```

### Typy pakietów DDD (PayloadType)

| Typ | Hex | Kierunek | Opis |
|-----|-----|----------|------|
| RepeatRequest | 0x00 | FM→SRV | Powtórz ostatni pakiet |
| Status | 0x01 | ↔ | Raport/zapytanie o status |
| ATR | 0x10 | SRV→FM | Wyślij ATR do urządzenia |
| VUReadyAPDU | 0x11 | FM→SRV | VU gotowy + pierwszy APDU |
| APDU | 0x12 | ↔ | Tunelowanie APDU |
| AuthOK | 0x13 | FM→SRV | Autentykacja OK |
| DownloadList | 0x20 | ↔ | Lista plików do pobrania |
| FileRequest | 0x30 | SRV→FM | Żądanie pliku |
| FileData | 0x31 | ↔ | Chunk danych + ACK |
| FileDataEOF | 0x32 | FM→SRV | Ostatni chunk |
| DriverInfo | 0x46 | ↔ | Informacje o kierowcy |
| SystemIO | 0x47 | ↔ | I/O systemu |
| WaitRequest | 0x91 | SRV→FM | Poczekaj N minut |
| KeepAlive | 0xEF | FM→SRV | Utrzymanie połączenia |
| Terminate | 0xE0 | SRV→FM | Zakończ sesję |
| Error | 0xF0 | FM→SRV | Raport błędu |

### Bajt STATUS (resume state)

| Bit | Znaczenie |
|-----|-----------|
| 6 | Zapłon ON/OFF |
| 4 | Resume od ostatniego transferu |
| 3 | Resume od file request |
| 2 | Resume od download list |
| 0-1 | Start od autentykacji (ATR) |

### Payload STATUS

```
"STATUS"(6B ASCII) + ResumeState(1B) + SequenceNumber(4B) + Features(1B) = 12B
```

## Uruchomienie

### 1. CardBridgeService (lokalny PC z czytnikiem)

```bash
cd csharp/CardBridgeService
dotnet run
```
> Uruchom jako **Administrator** (HttpListener wymaga uprawnień)
> Karta firmowa musi być włożona do czytnika przed uruchomieniem

### 2. Tunel ngrok

```bash
ngrok http 5201
```
Skopiuj adres `https://xxxx.ngrok-free.app` do konfiguracji serwera.

### 3. TachoDddServer (VPS)

1. Edytuj `appsettings.json`:
   ```json
   {
     "TcpPort": 5200,
     "CardBridgeUrl": "wss://xxxx.ngrok-free.app",
     "OutputDir": "/opt/tachoddd/downloads",
     "TrafficLogDir": "/opt/tachoddd/logs",
     "LogTraffic": true
   }
   ```
2. ```bash
   cd csharp/TachoDddServer
   dotnet run
   ```

### 4. Firewall VPS
- Otwórz port **5200** (TCP) dla połączeń z FMB640

### 5. Konfiguracja FMB640
```
SMS: TACHOADDRSET IP_VPS:5200
SMS: READTAC
```

## Logowanie ruchu

Gdy `LogTraffic: true`, surowy ruch jest zapisywany do plików:

- **TachoDddServer:** `traffic_[data]_[IP].log` w `TrafficLogDir`
- **CardBridgeService:** `cardbridge_[data].log` w folderze `Logs/`

Format:
```
[2026-02-26 07:45:30.123] RX 45B: 00 00 00 00 00 1D 0C 01 05 ...
[2026-02-26 07:45:30.456] TX 32B: 00 00 00 00 00 12 0C 01 06 ...
```

## Struktura plików

```
csharp/
├── CardBridgeService/
│   ├── Program.cs              # WebSocket ↔ PC/SC bridge
│   └── CardBridgeService.csproj
├── TachoDddServer/
│   ├── Program.cs              # Punkt wejścia, TCP listener
│   ├── appsettings.json        # Konfiguracja
│   ├── Protocol/
│   │   ├── Codec12Parser.cs    # Parsowanie/budowanie ramek Codec 12 + CRC weryfikacja
│   │   ├── Codec12Frame.cs     # Record ramki
│   │   ├── DddPacket.cs        # Parsowanie/budowanie pakietów DDD
│   │   └── DddPacketType.cs    # Enum typów pakietów
│   ├── Session/
│   │   ├── DddSession.cs       # Główna logika sesji (maszyna stanów + resume + merging)
│   │   ├── SessionState.cs     # Enum stanów sesji (+ ResumingDownload)
│   │   ├── DddFileType.cs      # Enum typów plików DDD
│   │   └── VuGeneration.cs     # Enum generacji tachografu
│   ├── CardBridge/
│   │   └── CardBridgeClient.cs # Klient WebSocket do CardBridge
│   ├── Logging/
│   │   └── TrafficLogger.cs    # Logger surowego ruchu
│   └── Storage/
│       └── DddFileWriter.cs    # Zapis plików DDD na dysk
└── README.md                   # Ten plik
```

## Wymagania

- **.NET 8 SDK**
- **Windows** (CardBridgeService — winscard.dll / PC/SC)
- **Czytnik kart PC/SC** + karta firmowa kompatybilna z tachografem
- **ngrok** (lub inny tunel) do połączenia VPS → lokalny PC

## Znane ograniczenia

- Pełne pobieranie DDD trwa 2-5 minut — zapłon musi być włączony przez cały czas
- CardBridge obsługuje jedną sesję na raz (jeden czytnik, jedna karta)
- Utrata połączenia (wyłączenie zapłonu, timeout ngrok) przerywa sesję
