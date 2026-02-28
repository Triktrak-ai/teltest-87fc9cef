

# Naprawa detekcji generacji karty + logi sesji do pobrania z dashboardu

## Problem 1: Karta wyswietla "Gen2" zamiast "Gen2v1"/"Gen2v2"

### Przyczyna

Dwa bledy w kodzie C#:

1. **Za malo bajtow w READ BINARY** -- obecny kod czyta 25 bajtow (0x19), ale bajt `cardGeneration` znajduje sie na **offsecie 25** w strukturze `cardIccIdentification` (po: clockStop 1B + cardExtendedSerialNumber 8B + cardApprovalNumber 8B + cardPersonaliserID 1B + embedderIcAssemblerId 5B + icIdentifier 2B = 25B). Czyli potrzeba minimum 26 bajtow.

2. **Przedwczesny raport** -- `SetCardGeneration("Gen2")` jest wywolywany **przed** probe EF_ICC (linia 554 w DddSession.cs), wiec dashboard od razu dostaje "Gen2" i nawet jesli probe zadziala, aktualizacja moze nie dotrzec.

3. **Heurystyczne skanowanie** -- `ParseCardGenerationFromEfIcc` skanuje bajt po bajcie szukajac 0x01 lub 0x02, co daje false positives (np. clockStop=0x01 to nie generacja).

### Naprawa

- Zwiekszyc READ BINARY do 32 bajtow (0x20)
- Uzyc stalego offsetu 25 dla bajtu `cardGeneration`
- Opoznic `SetCardGeneration` do **po** zakonczeniu probe
- Dodac logowanie APDU probe do TrafficLogger

## Problem 2: Logi sesji do pobrania z dashboardu

### Architektura

```text
C# Session ends -> Upload logs via edge function -> Storage bucket "session-logs"
                                                  -> Save URL in sessions table

Dashboard (Harmonogram pobierania) -> ikona pobierania -> download log files
```

### Kroki

1. **Storage bucket** `session-logs` -- publiczny (read-only), pliki w formacie `{session_id}/traffic.log`, `{session_id}/session.txt`, `{session_id}/session.json`

2. **Nowa kolumna** `log_uploaded` (boolean) w tabeli `sessions` -- flaga czy logi sa dostepne

3. **Nowa Edge Function** `upload-session-log` -- przyjmuje multipart/form-data z plikami logów, zapisuje do storage bucket, ustawia `log_uploaded = true` w sesji

4. **C# WebReporter** -- nowa metoda `UploadLogsAsync(trafficLogPath, sessionTxtPath, sessionJsonPath)` wywolywana w `finally` bloku `Program.cs` po `FlushAsync()`

5. **Frontend** -- ikona pobierania w tabeli "Harmonogram pobierania" przy kazdym IMEI, linkujaca do najnowszej sesji z logami. Po kliknieciu pobiera archiwum logow (traffic.log + session.txt).

## Pliki do zmiany

| Plik | Zmiana |
|------|--------|
| `csharp/TachoDddServer/Session/DddSession.cs` | Fix READ BINARY (0x20), staly offset 25, opoznienie SetCardGeneration, logowanie probe do TrafficLogger |
| `csharp/TachoDddServer/Reporting/WebReporter.cs` | Nowa metoda `UploadLogsAsync()` -- HTTP POST multipart do edge function |
| `csharp/TachoDddServer/Program.cs` | Wywolanie `UploadLogsAsync()` w finally po FlushAsync |
| Migracja SQL | Bucket `session-logs`, kolumna `log_uploaded` w `sessions`, RLS dla storage |
| `supabase/functions/upload-session-log/index.ts` | **Nowy** -- odbiera pliki, zapisuje do storage |
| `supabase/config.toml` | Dodanie `[functions.upload-session-log]` |
| `src/hooks/useDownloadSchedule.ts` | Rozszerzenie query o dane z sesji (log_uploaded) |
| `src/components/DownloadScheduleTable.tsx` | Ikona pobierania logow przy kazdym wierszu IMEI |

## Szczegoly techniczne

### Fix ParseCardGenerationFromEfIcc

Obecna logika (bledna):
```text
offset 0 -> check if 0x01 or 0x02 (to jest clockStop!)
offset 1-9 -> scan for 0x01/0x02 (to sa serial number bytes!)
```

Poprawna logika:
```text
READ BINARY 32 bytes (0x20)
offset 25 -> cardGeneration byte (0x01 = Gen2v1, 0x02 = Gen2v2)
```

### Upload logow z C#

Po zakonczeniu sesji (w `finally` w Program.cs), WebReporter wysyla pliki logow do edge function `upload-session-log` jako multipart/form-data. Edge function zapisuje je do bucketu `session-logs/{session_id}/`.

### Ikona w DownloadScheduleTable

Przy kazdym wierszu IMEI pojawi sie ikona `Download` (lucide). Po kliknieciu:
- Szuka najnowszej sesji dla tego IMEI z `log_uploaded = true`
- Otwiera link do pliku traffic.log w nowej karcie (bezposredni URL do storage)

