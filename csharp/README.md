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
    │ STATUS → parse resume/features/ignition
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
    │ DownloadList (kody TRTP) → ACK
    ▼
DownloadingFile (pętla po plikach)
    │ FileRequest → FileData (chunki + ACK) → FileDataEOF → zapis .ddd
    │ powtórz dla każdego pliku
    ▼
Complete
    │ Terminate (0xE0) → sesja zamknięta
```

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
| 0-5 | Stan wewnętrzny sesji |

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
│   │   ├── Codec12Parser.cs    # Parsowanie/budowanie ramek Codec 12
│   │   ├── Codec12Frame.cs     # Record ramki
│   │   ├── DddPacket.cs        # Parsowanie/budowanie pakietów DDD
│   │   └── DddPacketType.cs    # Enum typów pakietów
│   ├── Session/
│   │   ├── DddSession.cs       # Główna logika sesji (maszyna stanów)
│   │   ├── SessionState.cs     # Enum stanów sesji
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
