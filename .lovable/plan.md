

# Plan: Export oczyszczonego TachoDddServer do docs/

## Cel
Stworzyc w `docs/` zestaw plikow C# zawierajacych "samo mieso" — logike protokolu DDD, autentykacji karta firmowa, detekcji generacji i pobierania plikow. Bez raportowania do dashboardu (WebReporter), logowania diagnostycznego (TrafficLogger, SessionDiagnostics) i aktualizacji frontendu.

## Pliki do stworzenia

### `docs/TachoDddServer-core/README.md`
Krotkie wprowadzenie: co to jest, jak dziala, architektura (VPS TCP server + CardBridge WebSocket na laptopie), wymagania (czytnik PC/SC, karta firmowa, urzadzenie Teltonika z FMB640).

### `docs/TachoDddServer-core/Protocol/Codec12Frame.cs`
Bez zmian — record z jednym wierszem.

### `docs/TachoDddServer-core/Protocol/Codec12Parser.cs`
Bez zmian — parser ramek Codec 12 z CRC-16/IBM. Czysta logika.

### `docs/TachoDddServer-core/Protocol/DddPacket.cs`
Bez zmian — Build/Parse pakietow DDD.

### `docs/TachoDddServer-core/Protocol/DddPacketType.cs`
Bez zmian — enum typow pakietow.

### `docs/TachoDddServer-core/Protocol/DddErrorCodes.cs`
Bez zmian — opis kodow bledow DDD.

### `docs/TachoDddServer-core/Session/SessionState.cs`
Bez zmian — enum stanow sesji.

### `docs/TachoDddServer-core/Session/VuGeneration.cs`
Bez zmian — enum generacji VU.

### `docs/TachoDddServer-core/Session/DddFileType.cs`
Bez zmian — enum typow plikow.

### `docs/TachoDddServer-core/Session/DddSession.cs`
**Oczyszczona wersja** — najwazniejszy plik. Zmiany:
- Usuniete pola: `_webReporter`, `_trafficLogger`, `_diagnostics`, `_logDir`
- Konstruktor: tylko `TcpClient`, `CardBridgeClient`, `string outputDir`, `ILogger`
- Usuniete wszystkie wywolania: `_webReporter?.ReportStatus(...)`, `_webReporter?.SetImei(...)`, `_webReporter?.SetGeneration(...)`, `_webReporter?.SetCardGeneration(...)`, `_webReporter?.ReportError(...)`, `_webReporter?.CheckDownloadScheduleAsync()`
- Usuniete wszystkie wywolania: `_trafficLogger?.Log(...)`, `_trafficLogger?.LogDecoded(...)`, `_trafficLogger?.LogDecodedWithHex(...)`, `_trafficLogger?.LogWarning(...)`, `_trafficLogger?.LogError(...)`, `_trafficLogger?.LogSummary(...)`, `_trafficLogger?.LogStateChange(...)`
- Usuniete wszystkie wywolania: `_diagnostics.Log*(...)`, `_diagnostics.BytesReceived`, `_diagnostics.BytesSent`, `_diagnostics.ApduExchanges`, `_diagnostics.CrcErrors`, `_diagnostics.StartFileTimer(...)`, `_diagnostics.StopFileTimer(...)`, `_diagnostics.CardProbe`, `_diagnostics.FileDownloads`, `_diagnostics.Imei`, `_diagnostics.Generation`, `_diagnostics.CardGeneration`, `_diagnostics.DetectedVuGenFromApdu`, `_diagnostics.Finish()`, `_diagnostics.GenerateSummary()`, `_diagnostics.SaveToFile(...)`, `_diagnostics.SessionId`
- Usuniety blok "Download gate" (sprawdzanie czy juz pobrano dzis) — to logika biznesowa dashboardu
- Usuniety blok `finally` z generowaniem raportow i uploadem logow
- Zachowana CALA logika: maszyna stanow, APDU loop, EF_ICC probe, detekcja generacji (ATR, APDU SELECT, TREP, post-download Overview scan), generation locking, TRTP fallback, two-phase driver card retry, resume, CRC retry, keep alive, file merging

### `docs/TachoDddServer-core/CardBridge/CardBridgeClient.cs`
Bez zmian — klient WebSocket do komunikacji z czytnikiem kart. Czysta logika.

### `docs/TachoDddServer-core/Storage/DddFileWriter.cs`
Bez zmian — Save/Append plikow.

### `docs/TachoDddServer-core/CardBridgeService/Program.cs`
Bez zmian — serwis lokalny PC/SC z winscard.dll. Czysta logika.

### `docs/TachoDddServer-core/CardBridgeService/CardBridgeService.csproj`
Bez zmian.

### `docs/TachoDddServer-core/TachoDddServer.csproj`
Oczyszczony — bez referencji do pakietow raportowania (jesli sa).

### `docs/TachoDddServer-core/Program.cs`
Uproszczony — minimalny serwer TCP bez WebReporter, bez TrafficLogDir, bez uploadu logow. Tylko: nasłuchuj TCP, przyjmij IMEI, uruchom sesje.

## Podsumowanie plikow

| Plik | Akcja |
|------|-------|
| README.md | Nowy — dokumentacja |
| Protocol/* (4 pliki) | Kopia 1:1 |
| Session/SessionState.cs | Kopia 1:1 |
| Session/VuGeneration.cs | Kopia 1:1 |
| Session/DddFileType.cs | Kopia 1:1 |
| Session/DddSession.cs | Oczyszczony z ~1745 do ~1100 linii |
| CardBridge/CardBridgeClient.cs | Kopia 1:1 |
| Storage/DddFileWriter.cs | Kopia 1:1 |
| CardBridgeService/Program.cs | Kopia 1:1 |
| CardBridgeService/*.csproj | Kopia 1:1 |
| TachoDddServer.csproj | Oczyszczony |
| Program.cs | Uproszczony |

Lacznie: ~15 plikow. Kolega dostanie dzialajacy, czytelny kod "samo mieso" gotowy do skopiowania i uruchomienia.

