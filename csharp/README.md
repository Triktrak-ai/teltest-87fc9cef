# TachoDDD - Serwer pobierania danych z tachografu

System do zdalnego pobierania plików DDD z tachografów cyfrowych przez urządzenia Teltonika FMB640, z wykorzystaniem protokołu Codec 12 i tunelowania APDU.

## Architektura

```
FMB640 ──TCP:5200──► [VPS: TachoDddServer] ──WebSocket──► [ngrok] ──► [Twój PC: CardBridgeService] ──PC/SC──► Czytnik kart + karta firmowa
                          │
                          ▼ (HTTP/REST)
                     [Lovable Cloud]
                     ├── Edge Functions (report-session, check-download, reset-download-schedule, upload-session-log)
                     ├── Database (sessions, session_events, download_schedule)
                     ├── Storage (session-logs bucket)
                     └── Dashboard (React frontend)
```

### Komponenty

| Komponent | Lokalizacja | Rola |
|-----------|-------------|------|
| **TachoDddServer** | VPS (Linux/Windows) | Serwer TCP, protokół DDD, maszyna stanów |
| **CardBridgeService** | Lokalny PC (Windows) | Most WebSocket ↔ PC/SC do czytnika kart |
| **ngrok** | Lokalny PC | Tunel WS do CardBridge (bez port forwarding) |
| **WebReporter** | W ramach TachoDddServer | Raportowanie statusu sesji do dashboardu |
| **Dashboard** | Lovable Cloud (React) | Monitorowanie sesji, harmonogram pobierania, logi |

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

1. Edytuj `appsettings.json` (patrz sekcja "Konfiguracja serwera" poniżej)
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

## Logowanie i diagnostyka

### Poziomy logowania

System loguje na trzech równoległych kanałach:

| Kanał | Plik | Zawartość |
|-------|------|-----------|
| **ILogger (konsola)** | stdout | Kluczowe zdarzenia, błędy, ostrzeżenia |
| **TrafficLogger** | `traffic_*.log` | Surowy hex dump + zdekodowane pakiety + przejścia stanów + błędy |
| **SessionDiagnostics** | `session_*.txt` + `session_*.json` | Pełny raport sesji z metrykami |

### TrafficLogger — format logu

Gdy `LogTraffic: true`, plik traffic zawiera:

```
[2026-02-26 07:45:30.123] RX 45B: 00 00 00 00 00 1D 0C 01 05 ... (+13B)
[2026-02-26 07:45:30.123] RX DDD [Status] 12B — resume=0x43 seqNum=0 features=0x02
[2026-02-26 07:45:30.130] STATE WaitingForStatus -> ApduLoop [Starting authentication (ATR)]
[2026-02-26 07:45:30.456] TX DDD [ATR] 19B — frame=36B
[2026-02-26 07:45:31.200] ERROR [ApduLoop] WebSocketException: Connection closed
```

Metody TrafficLogger:
- `Log(direction, data, length)` — surowy hex dump (max 64B, reszta skrócona)
- `LogDecoded(direction, packetType, dataLen, comment)` — zdekodowany pakiet z kontekstem
- `LogDecodedWithHex(direction, packetType, data, maxBytes, comment)` — zdekodowany + hex preview
- `LogStateChange(from, to, reason)` — przejście stanu
- `LogError(context, message/exception)` — błąd z kontekstem i stack trace
- `LogWarning(message)` — ostrzeżenie
- `LogSummary(summary)` — raport sesji na końcu pliku

### SessionDiagnostics — raport sesji

Po zakończeniu każdej sesji generowany jest raport tekstowy i JSON:

```
╔══════════════════════════════════════════════════════════╗
║              SESSION DIAGNOSTIC SUMMARY                 ║
╚══════════════════════════════════════════════════════════╝
  SessionId:   a1b2c3d4e5f6
  IMEI:        352093089012345
  Endpoint:    192.168.1.100:54321
  Generation:  Gen2v2
  Start:       2026-02-26 07:45:30.123 UTC
  End:         2026-02-26 07:48:04.567 UTC
  Duration:    2m 34s

── State Flow ──────────────────────────────────────────────
  [   0.000s] WaitingForImei -> WaitingForStatus [IMEI accepted]
  [   0.234s] WaitingForStatus -> ApduLoop [Starting authentication (ATR)]
  [  12.456s] ApduLoop -> CheckingInterfaceVersion [Auth OK]
  [  13.100s] CheckingInterfaceVersion -> WaitingForDownloadListAck [Sending download list]
  [  14.200s] WaitingForDownloadListAck -> DownloadingFile [Requesting file 1/5: Overview]
  ...
  [ 154.567s] DownloadingFile -> Complete [All files downloaded]

── File Downloads ──────────────────────────────────────────
  ✓ Overview                  12345B     1.2s  (9.9 KB/s)
  ✓ Activities               234567B    45.3s  (5.1 KB/s)
  ✓ EventsAndFaults           45678B     8.7s  (5.1 KB/s)
  ✗ DetailedSpeed                  0B     0.5s  (0.0 KB/s)  ERR: [0x03:0x01] File not available
  ✓ TechnicalData              8901B     2.1s  (4.1 KB/s)
  Total: 4/5 successful

── Counters ────────────────────────────────────────────────
  Packets TX:       127
  Packets RX:       134
  Bytes TX:         4,567
  Bytes RX:         301,234
  APDU exchanges:   14
  CRC errors:       0

── Warnings ────────────────────────────────────────────────
  [  14.500s] Negative response (SID=0x7F) for DetailedSpeed

  Total errors:   1
  Total warnings: 1
```

Raport JSON (`session_*.json`) zawiera te same dane w formacie do dalszej analizy.

### Kody błędów DDD (DddErrorCodes)

Klasa `DddErrorCodes` mapuje surowe kody błędów protokołu na czytelne opisy:

| Klasa | Kod | Opis |
|-------|-----|------|
| 0x01 | 0x01 | VU busy |
| 0x01 | 0x02 | VU internal error |
| 0x02 | 0x0A | Authentication failed — certificate rejected |
| 0x02 | 0x04 | Authentication failed — card expired |
| 0x03 | 0x01 | File not available |
| 0x04 | 0x02 | Communication error — timeout |

### CardBridgeClient — timeout i logowanie

Każde wywołanie WebSocket (`SendAsync`/`ReceiveAsync`) ma timeout 30 sekund. Logowane są:
- Stan WebSocket przed każdym wywołaniem
- Komenda + rozmiar danych (level: Debug)
- Czas odpowiedzi w ms (level: Information)
- Pełny JSON request/response (level: Debug)
- Szczegóły błędów WebSocket (level: Error)

### Obsługa błędów (try/catch)

Każda metoda async w `DddSession` jest owinięta w `try/catch`:
- `HandleImeiPacket`, `HandleStatusPacket`, `HandleApduLoop`
- `HandleInterfaceVersionResponse`, `HandleDownloadListAck`
- `HandleFileData`, `RequestNextFileAsync`, `StartAuthenticationAsync`

Każdy catch:
1. Loguje błąd do ILogger, TrafficLogger i SessionDiagnostics
2. Przechodzi do stanu `Error` przez `TransitionTo()`
3. Sesja kończy się z pełnym raportem diagnostycznym

### Przejścia stanów (TransitionTo)

Wszystkie zmiany stanu przechodzą przez `TransitionTo(newState, reason)`:
```csharp
TransitionTo(SessionState.ApduLoop, "Starting authentication (ATR)");
// → ILogger: "STATE WaitingForStatus -> ApduLoop [Starting authentication (ATR)]"
// → TrafficLogger: "[timestamp] STATE WaitingForStatus -> ApduLoop [Starting authentication (ATR)]"
// → SessionDiagnostics: zapis do listy przejść z timestampem
```

## Struktura plików

```
csharp/
├── CardBridgeService/
│   ├── Program.cs              # WebSocket ↔ PC/SC bridge
│   └── CardBridgeService.csproj
├── TachoDddServer/
│   ├── Program.cs              # Punkt wejścia, TCP listener, logowanie konfiguracji
│   ├── appsettings.json        # Konfiguracja
│   ├── Protocol/
│   │   ├── Codec12Parser.cs    # Parsowanie/budowanie ramek Codec 12 + CRC weryfikacja
│   │   ├── Codec12Frame.cs     # Record ramki
│   │   ├── DddPacket.cs        # Parsowanie/budowanie pakietów DDD
│   │   ├── DddPacketType.cs    # Enum typów pakietów
│   │   └── DddErrorCodes.cs    # Mapowanie kodów błędów → czytelne opisy
│   ├── Session/
│   │   ├── DddSession.cs       # Główna logika sesji (maszyna stanów + diagnostyka + merging)
│   │   ├── SessionState.cs     # Enum stanów sesji
│   │   ├── DddFileType.cs      # Enum typów plików DDD
│   │   └── VuGeneration.cs     # Enum generacji tachografu
│   ├── CardBridge/
│   │   └── CardBridgeClient.cs # Klient WebSocket do CardBridge (timeout 30s + logowanie)
│   ├── Logging/
│   │   ├── TrafficLogger.cs    # Logger ruchu (hex dump + decoded packets + state changes)
│   │   └── SessionDiagnostics.cs # Centralna diagnostyka sesji (raport TXT + JSON)
│   ├── Reporting/
│   │   └── WebReporter.cs      # HTTP client do raportowania statusu, upload logów, download gate
│   └── Storage/
│       └── DddFileWriter.cs    # Zapis plików DDD na dysk
└── README.md                   # Ten plik
```

## Web Dashboard & Edge Functions

### Edge Functions

| Funkcja | Endpoint | Autoryzacja | Rola |
|---------|----------|-------------|------|
| `report-session` | POST | `x-api-key` (REPORT_API_KEY) | Raportowanie statusu sesji z C# serwera |
| `check-download` | GET | `x-api-key` | Sprawdzenie czy IMEI powinien dziś pobierać (download gate) |
| `reset-download-schedule` | POST | `x-api-key` lub `apikey`/`Bearer` (publishable key) | Reset harmonogramu — z dashboardu lub C# |
| `upload-session-log` | POST (multipart) | `x-api-key` | Upload logów sesji (traffic.log, session.txt, session.json) |

### Autoryzacja edge functions (Lovable Cloud)

**UWAGA:** W Lovable Cloud zmienna `SUPABASE_ANON_KEY` w runtime edge functions ma format `sb_publishable_...` (nie JWT). Publishable key wysyłany z dashboardu to JWT (`eyJhbG...`). Dlatego porównanie `Bearer token === SUPABASE_ANON_KEY` **nie działa**.

Rozwiązanie zastosowane w `reset-download-schedule`:
- Dla C# serwera: walidacja nagłówka `x-api-key` vs secret `REPORT_API_KEY`
- Dla dashboardu: walidacja przez próbne zapytanie do bazy z przesłanym tokenem (jeśli token pozwala na SELECT — jest prawidłowy)

### Download Gate

Mechanizm ograniczający pobieranie do 1 raz dziennie (UTC) na IMEI:
1. C# serwer odpytuje `check-download?imei=XXX` przed rozpoczęciem transferu
2. Jeśli status = `ok` (już pobrano dziś) → serwer wysyła ACK, raportuje `skipped`, kończy sesję
3. Po udanym pobraniu → `report-session` ustawia status na `ok` w `download_schedule`
4. Dashboard pozwala ręcznie resetować harmonogram (reset-download-schedule)

### Upload logów sesji

Po zakończeniu sesji `WebReporter.UploadLogsAsync()` wysyła pliki logów do bucketu `session-logs`:
- `traffic.log` — surowy hex dump komunikacji
- `session.txt` — raport diagnostyczny (czytelny)
- `session.json` — raport w formacie JSON

Pliki dostępne pod: `session-logs/{session_id}/traffic.log` etc.
Na dashboardzie ikona pobierania pojawia się gdy `sessions.log_uploaded = true`.

### Tabele bazy danych

| Tabela | Rola |
|--------|------|
| `sessions` | Sesje DDD — status, generacja, pliki, błędy, metryki |
| `session_events` | Timeline zdarzeń sesji (przejścia stanów, błędy, ostrzeżenia) |
| `download_schedule` | Harmonogram pobierania — status per IMEI, last_success_at, attempts_today |

## Konfiguracja serwera (appsettings.json)

```json
{
  "TcpPort": 5200,
  "CardBridgeUrl": "wss://xxxx.ngrok-free.app",
  "OutputDir": "/opt/tachoddd/downloads",
  "TrafficLogDir": "/opt/tachoddd/logs",
  "LogTraffic": true,
  "ReportUrl": "https://exyjnmtxacpydoeaqcti.supabase.co/functions/v1/report-session",
  "ReportApiKey": "<REPORT_API_KEY>",
  "ReportEnabled": true
}
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
- `SUPABASE_ANON_KEY` w Lovable Cloud != publishable key (inny format) — edge functions muszą to uwzględniać
