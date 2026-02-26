

# Glebokie logowanie diagnostyczne i obsluga bledow

## Obecny stan

Aktualne logowanie ma istotne braki, ktore utrudniaja debugowanie:

1. **TrafficLogger** -- loguje TYLKO surowy hex dump (np. `RX 128B: 00 00 00 00 ...`). Bez dekodowania typow pakietow, stanow, kontekstu.
2. **Brak centralnej diagnostyki** -- logi sa rozproszone po ILogger, nie ma podsumowania sesji ani zbiorczego raportu.
3. **Brak try/catch** -- wiele metod async nie lapie wyjatkow, co moze spowodowac cichy crash sesji.
4. **Brak timeoutow** -- CardBridge moze zawisnac na zawsze bez timeout.
5. **Brak pomiarow czasu** -- nie wiadomo ile trwal download kazdego pliku.
6. **Przejscia stanow** -- `_state = X` bez logowania skad/dokad/dlaczego.

## Plan zmian

### 1. Nowy plik: `Logging/SessionDiagnostics.cs`

Centralna klasa zbierajaca wszystko o sesji:
- SessionId (GUID), IMEI, StartTime/EndTime
- Lista przejsc stanow (timestamp, from, to, reason)
- Lista bledow (timestamp, context, message, stackTrace)
- Lista ostrzezen
- Statystyki plikow (typ, rozmiar, czas, sukces/porazka)
- Liczniki: APDU exchanges, CRC errors, bytes TX/RX
- `GenerateSummary()` -- czytelny raport tekstowy
- `SaveToJson(path)` -- zapis raportu JSON do pliku

### 2. Nowy plik: `Protocol/DddErrorCodes.cs`

Slownik mapujacy kody bledow na czytelne opisy:
- `(0x02, 0x0A)` -> "Authentication failure - certificate rejected"
- `(0x01, 0x01)` -> "VU busy"
- `(0x03, 0x01)` -> "File not available"
- itd.

### 3. Edycja: `Logging/TrafficLogger.cs`

Rozszerzenie o:
- `LogDecoded(direction, packetTypeName, dataLen, comment)` -- loguje zdekodowany pakiet obok hex
- `LogStateChange(from, to, reason)` -- loguje przejscia stanow do pliku traffic
- `LogError(context, message)` -- loguje bledy do pliku traffic
- `LogSummary(summary)` -- zapisuje podsumowanie sesji na koniec pliku

### 4. Edycja: `DddSession.cs` -- glowne zmiany

**4a. Pole `_diagnostics` (SessionDiagnostics)**
- Inicjalizacja w konstruktorze z GUID i endpoint

**4b. Metoda `TransitionTo(newState, reason)`**
- Zamiast `_state = X` wszedzie
- Loguje do ILogger, TrafficLogger i SessionDiagnostics
- Format: `STATE WaitingForStatus -> ApduLoop [Authentication started]`

**4c. Try/catch w kazdej metodzie async**
- HandleApduLoop, HandleFileData, HandleStatusPacket, HandleDownloadListAck, HandleInterfaceVersionResponse, StartAuthenticationAsync, RequestFileAsync, RequestNextFileAsync
- Kazdy catch loguje kontekst + exception do diagnostyki i przechodzi do stanu Error

**4d. Timeout na CardBridge (30s)**
- Kazde `_bridge.GetAtrAsync()` i `_bridge.TransmitApduAsync()` owinac w CancellationTokenSource(30s)
- Osobny catch na OperationCanceledException i WebSocketException

**4e. Logowanie kazdego pakietu TX/RX**
- W `SendDddPacketAsync`: logowac typ pakietu, rozmiar, hex pierwszych 32B
- W `ProcessFrameAsync`: logowac pelne info o odebranym pakiecie + aktualny stan
- Zliczac bytes TX/RX w diagnostyce

**4f. Stopwatch na kazdym pliku**
- Start w `RequestNextFileAsync`, stop w `HandleFileData` (EOF)
- Log: `File Overview: 45.2KB in 3.4s (13.3 KB/s)`

**4g. Podsumowanie sesji w finally RunAsync()**
```text
=== SESSION SUMMARY ===
SessionId: a1b2c3d4-...
IMEI: 352093089012345
Duration: 2m 34s
Generation: Gen2v2
States: WaitingForImei -> WaitingForStatus -> ApduLoop -> ... -> Complete
Files: 5/5 downloaded (Overview: 12KB, Activities: 234KB, ...)
APDU exchanges: 14
CRC errors: 0
Bytes: TX=1234, RX=45678
Errors: 0
Warnings: 1
```
Zapis do pliku JSON w katalogu logow.

**4h. HandleError z DddErrorCodes**
- Zamiast surowych kodow, logowac czytelne opisy bledow

### 5. Edycja: `CardBridge/CardBridgeClient.cs`

- Timeout 30s na SendAsync/ReceiveAsync
- Logowanie kazdego polecenia i odpowiedzi (komenda, rozmiar, czas odpowiedzi ms)
- Sprawdzanie `_ws.State` przed kazdym wywolaniem
- Pelny JSON request/response na poziomie Debug

### 6. Edycja: `Program.cs`

- Logowanie konfiguracji przy starcie (port, outputDir, logTraffic, cardBridgeUrl)
- Logowanie czasu polaczenia i rozlaczenia kazdego klienta z czasem trwania sesji

## Kolejnosc implementacji

1. `SessionDiagnostics.cs` (nowy)
2. `DddErrorCodes.cs` (nowy)
3. `TrafficLogger.cs` (rozszerzenie)
4. `CardBridgeClient.cs` (timeout + logowanie)
5. `DddSession.cs` (TransitionTo, try/catch, diagnostyka, timery)
6. `Program.cs` (logowanie konfiguracji)

