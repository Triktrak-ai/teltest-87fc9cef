# TachoDDD — Pełna dokumentacja UML

## Spis treści
1. [Diagram klas — TachoDddServer](#1-diagram-klas--tachodddserver)
2. [Diagram klas — CardBridgeService](#2-diagram-klas--cardbridgeservice)
3. [Enumeracje i typy wartościowe](#3-enumeracje-i-typy-wartościowe)
4. [Maszyna stanów sesji DDD](#4-pełna-maszyna-stanów-sesji-ddd)
5. [Sekwencja — Pełna sesja DDD](#5-sekwencja--pełna-sesja-ddd)
6. [Diagram komponentów — Edge Functions](#6-diagram-komponentów--edge-functions)
7. [Diagram pakietów — Codec 12](#7-diagram-pakietów--codec-12)
8. [Model danych (ERD)](#8-model-danych-erd--pełny)
9. [Architektura komponentów](#9-architektura-komponentów)

---

## 1. Diagram klas — TachoDddServer

```mermaid
classDiagram
    class DddSession {
        -TcpClient _client
        -CardBridgeClient _bridge
        -string _outputDir
        -ILogger _logger
        -TrafficLogger _trafficLogger
        -SessionDiagnostics _diagnostics
        -WebReporter _webReporter
        -SessionState _state
        -string _imei
        -VuGeneration _vuGeneration
        -string _cardGeneration
        -string _detectedVuGenFromApdu
        -byte _features
        -byte _resumeState
        -uint _lastSequenceNumber
        -int _successfulDownloads
        -List~DddFileType~ _filesToDownload
        -int _currentFileIndex
        -DddFileType _currentFileType
        -List~byte~ _fileBuffer
        -Dictionary~DddFileType,byte[]~ _downloadedFiles
        -int _crcRetryCount
        -bool _retryingWithGen1
        -int _authRetryCount
        -bool _driverCardRetried
        -Dictionary~DddFileType,DateTime~ _fileRequestTimestamps
        +DddSession(TcpClient, CardBridgeClient, string, ILogger, string, bool, WebReporter)
        +RunAsync() Task
        -TransitionTo(SessionState, string) void
        -HandleImeiPacket(NetworkStream, List~byte~) Task
        -ProcessFrameAsync(NetworkStream, Codec12Frame) Task
        -HandleStatusPacket(NetworkStream, DddPacketType, byte[]) Task
        -StartAuthenticationAsync(NetworkStream) Task
        -ProbeCardGenerationAsync() Task~string~
        -TryResetCardState() Task
        -HandleApduLoop(NetworkStream, DddPacketType, byte[]) Task
        -HandleInterfaceVersionResponse(NetworkStream, DddPacketType, byte[]) Task
        -StartDownloadListAsync(NetworkStream) Task
        -BuildFileList() void
        -BuildDownloadListPayload() byte[]
        -GetTrtp(DddFileType, VuGeneration) byte
        -HandleDownloadListAck(NetworkStream, DddPacketType, byte[]) Task
        -RequestNextFileAsync(NetworkStream) Task
        -RequestFileAsync(NetworkStream, DddFileType, VuGeneration) Task
        -HandleFileData(NetworkStream, DddPacketType, byte[]) Task
        -SaveCurrentFile() void
        -MergeVuFiles() void
        -HandleError(byte[]) void
        -DetectCardGeneration(byte[]) string$
        -DetectVuGenerationFromApdu(byte[]) string$
        -VerifyGenerationFromOverview(byte[]) void
        -ScanForGenerationTags(byte[]) VuGeneration
        -SendTerminateAsync(NetworkStream, string) Task
        -SendDddPacketAsync(NetworkStream, DddPacketType, byte[]) Task
        -SendRawAsync(NetworkStream, byte[]) Task
    }

    class CardBridgeClient {
        -string _url
        -ILogger _logger
        -ClientWebSocket _ws
        -TimeSpan CommandTimeout$
        +CardBridgeClient(string, ILogger)
        +ConnectAsync() Task
        +GetAtrAsync() Task~byte[]~
        +TransmitApduAsync(byte[]) Task~byte[]~
        +ReconnectAsync() Task
        -SendCommandAsync(string, byte[]) Task~byte[]~
        +Dispose() void
    }

    class WebReporter {
        -HttpClient _http
        -string _url
        -string _apiKey
        -bool _enabled
        -ILogger _logger
        -string _sessionId
        -string _imei
        -VuGeneration _generation
        -string _cardGeneration
        -List~Task~ _inFlight
        +WebReporter(string, string, string, bool, ILogger)
        +SetImei(string) void
        +SetGeneration(VuGeneration) void
        +SetCardGeneration(string) void
        +ReportStatus(string, int, int, int, string, long, int, int, string, string, string) void
        +ReportError(string, string, int, int) void
        +FlushAsync() Task
        +CheckDownloadScheduleAsync() Task~bool~
        +UploadLogsAsync(string, string, string) Task
        +SessionId string
        +Dispose() void
    }

    class TrafficLogger {
        -StreamWriter _writer
        -object _lock
        +TrafficLogger(string, string)
        +Log(string, byte[], int) void
        +LogDecoded(string, string, int, string) void
        +LogDecodedWithHex(string, string, byte[], int, string) void
        +LogStateChange(SessionState, SessionState, string) void
        +LogError(string, string) void
        +LogError(string, Exception) void
        +LogWarning(string) void
        +LogSummary(string) void
        +Dispose() void
    }

    class SessionDiagnostics {
        +string SessionId
        +string Endpoint
        +string Imei
        +DateTime StartTime
        +DateTime EndTime
        +VuGeneration Generation
        +string CardGeneration
        +string DetectedVuGenFromApdu
        +CardProbeResult CardProbe
        +long BytesSent
        +long BytesReceived
        +int ApduExchanges
        +int CrcErrors
        +int PacketsSent
        +int PacketsReceived
        -List~StateTransitionEntry~ _stateTransitions
        -List~PacketLogEntry~ _packetLog
        -List~ErrorEntry~ _errors
        -List~WarningEntry~ _warnings
        -List~FileDownloadEntry~ _fileDownloads
        +LogStateTransition(SessionState, SessionState, string) void
        +LogPacket(string, byte, int, string) void
        +LogError(string, Exception) void
        +LogError(string, string) void
        +LogWarning(string) void
        +StartFileTimer(DddFileType) void
        +StopFileTimer(DddFileType, int, bool, string) void
        +Finish() void
        +GenerateSummary() string
        +SaveToFile(string) void
    }

    class Codec12Parser {
        +Parse(byte[], int) Codec12Frame$
        +ParseWithCrc(byte[], int) Codec12ParseResult$
        +Build(byte[]) byte[]$
        -Crc16(byte[], int, int) ushort$
    }

    class DddPacket {
        +Build(DddPacketType, byte[]) byte[]$
        +Parse(byte[]) (DddPacketType,byte[])$
    }

    class DddErrorCodes {
        +Describe(byte, byte) string$
        +Format(byte, byte) string$
        +IsGenerationMismatch(byte, byte) bool$
    }

    class DddFileWriter {
        +Save(string, byte[]) void$
        +Append(string, byte[]) void$
    }

    class Codec12Frame {
        +byte Type
        +byte[] Data
    }

    class Codec12ParseResult {
        +Codec12Frame Frame
        +bool CrcError
        +int ConsumedBytes
    }

    class CardProbeResult {
        +string SelectMfSw
        +string SelectDfSw
        +string SelectEfIccSw
        +string ReadBinarySw
        +int ReadBinaryLen
        +string EfIccHex
        +byte GenByte
        +string Result
        +string Error
    }

    DddSession --> CardBridgeClient : APDU tunnel
    DddSession --> WebReporter : HTTP reporting
    DddSession --> TrafficLogger : hex logging
    DddSession --> SessionDiagnostics : diagnostics
    DddSession --> Codec12Parser : parse/build frames
    DddSession --> DddPacket : parse/build DDD
    DddSession --> DddErrorCodes : error lookup
    DddSession --> DddFileWriter : save files
    DddSession --> Codec12Frame : frame data
    SessionDiagnostics --> CardProbeResult : EF_ICC probe
    Codec12Parser --> Codec12Frame : produces
    Codec12Parser --> Codec12ParseResult : produces
    SessionDiagnostics *-- CardProbeResult
```

---

## 2. Diagram klas — CardBridgeService

```mermaid
classDiagram
    class CardBridgeService {
        +HttpListener listener
        +HandleSessionAsync(WebSocket) Task$
        -ToHex(byte[]) string$
    }

    class SCARD_IO_REQUEST {
        +uint dwProtocol
        +uint cbPciLength
    }

    class WinscardPInvoke {
        +SCardEstablishContext()$
        +SCardReleaseContext()$
        +SCardListReadersW()$
        +SCardConnectW()$
        +SCardDisconnect()$
        +SCardStatusA()$
        +SCardTransmit()$
    }

    CardBridgeService --> WinscardPInvoke : P/Invoke
    CardBridgeService --> SCARD_IO_REQUEST : transmit struct
```

> **Uwaga:** CardBridgeService to serwer WebSocket na porcie 5201. Obsługuje komendy: `GET_ATR`, `TRANSMIT`, `RECONNECT` w formacie JSON przez WebSocket.

---

## 3. Enumeracje i typy wartościowe

```mermaid
classDiagram
    class SessionState {
        <<enumeration>>
        WaitingForImei
        WaitingForStatus
        RequestingDriverInfo
        ApduLoop
        CheckingInterfaceVersion
        WaitingForDownloadListAck
        DownloadingFile
        ResumingDownload
        Complete
        Error
    }

    class VuGeneration {
        <<enumeration>>
        Unknown
        Gen1
        Gen2v1
        Gen2v2
    }

    class DddFileType {
        <<enumeration>>
        InterfaceVersion = 0x00
        Overview = 0x01
        Activities = 0x02
        EventsAndFaults = 0x03
        DetailedSpeed = 0x04
        TechnicalData = 0x05
        DriverCard1 = 0x06
        DriverCard2 = 0x07
    }

    class DddPacketType {
        <<enumeration>>
        RepeatRequest = 0x00
        Status = 0x01
        ATR = 0x10
        VUReadyAPDU = 0x11
        APDU = 0x12
        AuthOK = 0x13
        DownloadList = 0x20
        FileRequest = 0x30
        FileData = 0x31
        FileDataEOF = 0x32
        WaitRequest = 0x91
        DriverInfo = 0x46
        SystemIO = 0x47
        KeepAlive = 0xEF
        Terminate = 0xE0
        Error = 0xF0
    }

    class StateTransitionEntry {
        +DateTime Timestamp
        +SessionState From
        +SessionState To
        +string Reason
    }

    class PacketLogEntry {
        +DateTime Timestamp
        +string Direction
        +byte Type
        +int Size
        +string Details
    }

    class FileDownloadEntry {
        +DddFileType FileType
        +int SizeBytes
        +TimeSpan Duration
        +bool Success
        +string Error
    }

    class ErrorEntry {
        +DateTime Timestamp
        +string Context
        +string Message
        +string StackTrace
    }

    class WarningEntry {
        +DateTime Timestamp
        +string Message
    }
```

---

## 4. Pełna maszyna stanów sesji DDD

```mermaid
stateDiagram-v2
    [*] --> WaitingForImei

    WaitingForImei --> WaitingForStatus : IMEI received + ACK
    WaitingForImei --> Complete : Download gate - skipped

    WaitingForStatus --> Error : Ignition OFF
    WaitingForStatus --> RequestingDriverInfo : Features bit 0x02 set
    WaitingForStatus --> ApduLoop : No DriverInfo, start auth
    WaitingForStatus --> WaitingForDownloadListAck : Resume bit 0x04
    WaitingForStatus --> DownloadingFile : Resume bit 0x08
    WaitingForStatus --> DownloadingFile : Resume bit 0x10

    RequestingDriverInfo --> ApduLoop : DriverInfo received, send ATR

    state ApduLoop {
        [*] --> WaitAPDU
        WaitAPDU --> TransmitToCard : VUReadyAPDU / APDU
        TransmitToCard --> WaitAPDU : Card response sent
    }
    ApduLoop --> CheckingInterfaceVersion : AuthOK received
    ApduLoop --> Error : Auth failed 3x
    ApduLoop --> WaitingForStatus : Error + card reset retry

    state CheckingInterfaceVersion {
        [*] --> RequestIntVer
        RequestIntVer --> ParseTREP : FileDataEOF
    }
    CheckingInterfaceVersion --> WaitingForDownloadListAck : Gen detected
    CheckingInterfaceVersion --> WaitingForDownloadListAck : Error = Gen1 default

    WaitingForDownloadListAck --> DownloadingFile : ACK received
    WaitingForDownloadListAck --> WaitingForDownloadListAck : APDU unlock exchange

    state DownloadingFile {
        [*] --> RequestFile
        RequestFile --> ReceiveChunks : FileData
        ReceiveChunks --> ReceiveChunks : More chunks
        ReceiveChunks --> SaveFile : FileDataEOF
        SaveFile --> RequestFile : Next file
        RequestFile --> Gen1Fallback : Error 0x02:0x06 VU file
        Gen1Fallback --> ReceiveChunks : Retry with Gen1 TRTP
        RequestFile --> EmptySlotSkip : Error 0x02:0x06 DriverCard less than 2s
        RequestFile --> CardResetRetry : Error 0x02:0x06 DriverCard gte 2s
        CardResetRetry --> RequestFile : One retry
    }
    DownloadingFile --> Complete : All files done
    DownloadingFile --> Complete : Partial - some files missing
    DownloadingFile --> Error : No files downloaded

    Complete --> [*]
    Error --> [*]
```

---

## 5. Sekwencja — Pełna sesja DDD

```mermaid
sequenceDiagram
    participant FM as FMB640
    participant TCP as TCP Listener
    participant DS as DddSession
    participant C12 as Codec12Parser
    participant CB as CardBridge
    participant Card as Smart Card
    participant FW as DddFileWriter
    participant WR as WebReporter
    participant TL as TrafficLogger
    participant SD as SessionDiagnostics
    participant EF as Edge Functions
    participant DB as Database

    FM->>TCP: TCP connect
    TCP->>DS: New session (TcpClient)
    DS->>CB: ConnectAsync()
    CB->>Card: SCardEstablishContext + SCardConnect

    Note over FM,DS: Phase 0 - IMEI
    FM->>DS: [len][15-byte IMEI]
    DS->>TL: Log RX
    DS->>WR: SetImei()
    DS->>WR: CheckDownloadScheduleAsync()
    WR->>EF: GET /check-download?imei=X
    EF->>DB: SELECT download_schedule
    DB-->>EF: last_success_at
    EF-->>WR: should_download: true/false
    DS->>FM: 0x01 (IMEI ACK)

    Note over FM,DS: Phase 1 - Status
    DS->>FM: Status request (Codec12)
    FM->>DS: Status response
    DS->>C12: ParseWithCrc()
    C12-->>DS: Codec12Frame

    Note over FM,DS: Phase 2 - Driver Info (optional)
    DS->>FM: DriverInfo request (0x46)
    FM-->>DS: DriverInfo response

    Note over FM,DS: Phase 3 - Authentication (APDU tunnel)
    DS->>CB: GetAtrAsync()
    CB->>Card: SCardStatusA (get ATR)
    Card-->>CB: ATR bytes
    CB-->>DS: ATR
    DS->>DS: DetectCardGeneration(ATR)
    opt Card is Gen2
        DS->>CB: SELECT MF
        CB->>Card: APDU
        DS->>CB: SELECT DF 0007
        CB->>Card: APDU
        DS->>CB: SELECT EF_ICC
        CB->>Card: APDU
        DS->>CB: READ BINARY
        CB->>Card: APDU
        Card-->>CB: EF_ICC data
        DS->>DS: ParseCardGeneration (Gen2v1/Gen2v2)
        DS->>CB: SELECT MF (reset)
    end
    DS->>FM: ATR (0x10)
    loop APDU exchange (until AuthOK or 3x fail)
        FM->>DS: VUReadyAPDU/APDU (from VU)
        DS->>DS: DetectVuGenFromApdu (first exchange)
        DS->>CB: TransmitApduAsync()
        CB->>Card: SCardTransmit
        Card-->>CB: Response
        CB-->>DS: Card response
        DS->>FM: APDU response (0x12)
        DS->>SD: ApduExchanges++
    end
    FM->>DS: AuthOK (0x13)

    Note over FM,DS: Phase 4 - Interface Version
    DS->>FM: FileRequest InterfaceVersion
    FM->>DS: FileData + FileDataEOF
    DS->>DS: Detect VuGeneration from TREP

    Note over FM,DS: Phase 5 - Download List
    DS->>FM: DownloadList (7 files, Gen1 codes)
    opt VU requires APDU unlock
        FM->>DS: APDU
        DS->>CB: TransmitApduAsync()
        DS->>FM: APDU response
    end
    FM->>DS: DownloadList ACK

    Note over FM,DS: Phase 6a - VU Files (1-5) with Gen1 fallback
    loop Overview, Activities, Events, Speed, Technical
        DS->>FM: FileRequest (native TRTP)
        alt Success
            loop Chunks
                FM->>DS: FileData
                DS->>FM: FileData ACK
            end
            FM->>DS: FileDataEOF
            DS->>FW: Save file
            DS->>SD: StopFileTimer(success)
            DS->>WR: ReportStatus(downloading)
        else Error 0x02:0x06
            DS->>DS: Retry with Gen1 TRTP
            DS->>FM: FileRequest (Gen1 TRTP)
        end
        opt Overview downloaded
            DS->>DS: VerifyGenerationFromOverview()
        end
    end

    Note over FM,DS: Phase 6b - Driver Cards (6-7) native TRTP only
    loop DriverCard1, DriverCard2
        DS->>FM: FileRequest (native TRTP always)
        alt Success
            FM->>DS: FileData chunks + EOF
            DS->>FW: Save driver card
        else Error 0x02:0x06 less than 2s
            DS->>SD: Log empty_slot
            DS->>WR: Report DriverCard_empty_slot
        else Error 0x02:0x06 gte 2s
            DS->>SD: Log access_denied
            DS->>CB: TryResetCardState
            DS->>FM: FileRequest retry (once)
            DS->>WR: Report DriverCard_access_denied
        end
    end

    Note over FM,DS: Phase 7 - Finalize
    DS->>DS: MergeVuFiles()
    DS->>FW: Save merged VU .ddd
    DS->>FM: Terminate (0xE0)
    DS->>WR: ReportStatus(completed/partial)
    WR->>EF: POST /report-session
    EF->>DB: UPSERT sessions + events + schedule
    DS->>SD: Finish() + GenerateSummary()
    DS->>SD: SaveToFile()
    DS->>WR: UploadLogsAsync()
    WR->>EF: POST /upload-session-log
    EF->>DB: Upload to session-logs bucket
    EF->>DB: UPDATE sessions SET log_uploaded=true
```

---

## 6. Diagram komponentów — Edge Functions

```mermaid
graph LR
    subgraph "C# Server"
        WR[WebReporter]
    end

    subgraph "Edge Functions"
        RS[report-session]
        CD[check-download]
        UL[upload-session-log]
        TB[toggle-download-block]
        RDS[reset-download-schedule]
    end

    subgraph "Database"
        S[(sessions)]
        SE[(session_events)]
        DS[(download_schedule)]
        AS[(app_settings)]
    end

    subgraph "Storage"
        SL[(session-logs bucket)]
    end

    subgraph "Dashboard"
        UI[Web Dashboard]
    end

    WR -->|POST + x-api-key| RS
    WR -->|GET + x-api-key| CD
    WR -->|POST multipart| UL

    RS -->|UPSERT| S
    RS -->|INSERT| SE
    RS -->|UPSERT| DS

    CD -->|SELECT| DS
    CD -->|SELECT| AS

    UL -->|Upload| SL
    UL -->|UPDATE log_uploaded| S

    TB -->|UPSERT| AS

    RDS -->|UPDATE| DS

    UI -->|Realtime subscribe| S
    UI -->|Realtime subscribe| SE
    UI -->|SELECT| DS
    UI -->|invoke| TB
    UI -->|invoke| RDS
    UI -->|Download| SL
```

---

## 7. Diagram pakietów — Codec 12

```mermaid
graph TB
    subgraph "Codec 12 Frame Structure"
        direction TB
        P1["Preamble: 00 00 00 00 (4B)"]
        P2["Data Length (4B, big-endian)"]
        P3["Codec ID: 0x0C (1B)"]
        P4["Quantity (1B)"]
        P5["Command Type (1B)"]
        P6["Command Size (4B)"]
        P7["Command Data (N bytes)"]
        P8["Quantity (1B)"]
        P9["CRC-16/IBM (4B)"]
    end

    subgraph "DDD Packet (inside Command Data)"
        direction TB
        D1["Payload Type (1B) = DddPacketType"]
        D2["Payload Data (M bytes)"]
    end

    subgraph "CRC-16/IBM Algorithm"
        direction TB
        C1["Polynomial: 0xA001 reflected"]
        C2["Init: 0x0000"]
        C3["Scope: data section only"]
        C4["Verify: BE or LE match"]
    end

    P7 --> D1
    P9 --> C1
```

---

## 8. Model danych (ERD) — pełny

```mermaid
erDiagram
    sessions {
        uuid id PK
        string imei
        string status "connecting|auth_gen1|auth_gen2v1|auth_gen2v2|downloading|completed|partial|error|skipped"
        string generation "Unknown|Gen1|Gen2v1|Gen2v2"
        string card_generation "Unknown|Gen1|Gen2|Gen2v1|Gen2v2"
        int files_downloaded
        int total_files
        int bytes_downloaded
        int apdu_exchanges
        int crc_errors
        string current_file
        int progress "0-100"
        string error_code
        string error_message
        boolean log_uploaded
        string vehicle_plate
        timestamp started_at
        timestamp completed_at
        timestamp last_activity
        timestamp created_at
    }

    session_events {
        uuid id PK
        uuid session_id FK
        string imei
        string type "info|warning|error"
        string message
        string context "TransitionTo|DddProtocol|DriverCard_empty_slot|DriverCard_access_denied|GenerationMismatch|etc"
        timestamp created_at
    }

    download_schedule {
        uuid id PK
        string imei UK
        string status "ok|partial|error|skipped"
        int attempts_today
        timestamp last_attempt_at
        timestamp last_success_at
        string last_error
        timestamp created_at
        timestamp updated_at
    }

    app_settings {
        string key PK "download_block_disabled"
        string value "true|false"
        timestamp updated_at
    }

    sessions ||--o{ session_events : "has many"
```

---

## 9. Architektura komponentów

```mermaid
graph TB
    subgraph Device["Teltonika FMB640"]
        VU[VU Tachograph]
    end

    subgraph Server["TachoDddServer - C# / .NET"]
        TCP[TCP Listener :5200]
        Codec[Codec12Parser]
        Session[DddSession]
        FileWriter[DddFileWriter]
        Traffic[TrafficLogger]
        Diag[SessionDiagnostics]
        Reporter[WebReporter]
    end

    subgraph Bridge["CardBridgeService"]
        WS[WebSocket :5201]
        PCSC[PC/SC winscard.dll]
    end

    subgraph Cloud["Lovable Cloud"]
        DB[(sessions / events)]
        EF1[report-session]
        EF2[check-download]
        EF3[upload-session-log]
        Storage[(session-logs bucket)]
        Dashboard[Web Dashboard]
    end

    VU -->|Codec 12 TCP| TCP
    TCP --> Codec
    Codec --> Session
    Session -->|APDU tunnel| WS
    WS --> PCSC
    Session --> FileWriter
    Session --> Traffic
    Session --> Diag
    Session --> Reporter
    Reporter -->|HTTP POST| EF1
    Reporter -->|HTTP POST| EF3
    EF1 --> DB
    EF3 --> Storage
    EF2 --> DB
    Dashboard --> DB
    Dashboard --> Storage
```

---

## Mapowanie TRTP

| DddFileType | Gen1 | Gen2v1 | Gen2v2 | Uwagi |
|---|---|---|---|---|
| InterfaceVersion | 0x00 | 0x00 | 0x00 | Zawsze bazowy |
| Overview | 0x01 | 0x21 | 0x31 | +0x20 / +0x30 |
| Activities | 0x02 | 0x22 | 0x32 | +0x20 / +0x30 |
| EventsAndFaults | 0x03 | 0x23 | 0x33 | +0x20 / +0x30 |
| DetailedSpeed | 0x04 | 0x24 | 0x34 | +0x20 / +0x30 |
| TechnicalData | 0x05 | 0x25 | 0x35 | +0x20 / +0x30 |
| DriverCard1 | 0x06 | 0x06 | 0x06 | Zawsze bazowy (natywny) |
| DriverCard2 | 0x06 | 0x06 | 0x06 | Zawsze bazowy (slot=0x02) |

> **Download List** zawsze używa kodów Gen1 (0x01-0x06). Kody specyficzne dla generacji są stosowane wyłącznie w **FileRequest (0x30)**.

---

## Kody błędów DDD

| Klasa | Kod | Opis |
|---|---|---|
| 0x01 | 0x01-0x06 | Błędy VU (busy, internal, not ready, timeout, empty slot, read error) |
| 0x02 | 0x01-0x0B | Błędy autentykacji (unknown, not recognized, blocked, expired, wrong PIN, data inaccessible, certificate rejected) |
| 0x03 | 0x01-0x05 | Błędy plików (not available, access denied, corrupted, not supported, aborted) |
| 0x04 | 0x01-0x03 | Błędy komunikacji (data link lost, timeout, CRC failure) |
| 0x05 | 0x01-0x03 | Błędy protokołu (unexpected packet, invalid sequence, too large) |
| 0xFF | 0x01/0xFF | Błędy ogólne (general, unknown fatal) |

---

*Wygenerowano: 2026-02-28*
