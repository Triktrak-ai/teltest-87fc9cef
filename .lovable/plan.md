
# Mechanizm jednorazowego pobierania DDD (raz dziennie per IMEI) + Reset

## Opis

Pojazdy laczace sie wielokrotnie w ciagu dnia powoduja redundantne pobieranie. Mechanizm "download gate" oparty na tabeli w bazie danych:
- Pozwala na pobranie plikow **raz dziennie** per IMEI
- W przypadku bledu — ponawia az do sukcesu
- Sygnalizuje na dashboardzie status synchronizacji
- **Umozliwia reset kolejki** (per IMEI lub wszystkie) z poziomu dashboardu

## Trwalosc danych

Cala logika oparta na tabeli `download_schedule` w bazie danych (Lovable Cloud). Serwer C# **nie trzyma zadnego stanu w pamieci** — przy kazdym polaczeniu odpytuje baze. Po restarcie serwera wszystko dziala dalej bez utraty danych.

## Architektura

```text
Teltonika connects -> IMEI -> check-download (Edge Function) -> DB: download_schedule
                                  |
                          today OK? -> skip + terminate
                          else    -> proceed with download
                                  -> on success: status=ok, last_success_at=now
                                  -> on error: status=error (retry next connection)

Dashboard -> Reset button -> reset-download-schedule (Edge Function) -> DB: clear record(s)
```

## Zmiany

### 1. Nowa tabela `download_schedule`

Kolumny: `imei` (unique), `last_success_at`, `last_attempt_at`, `status` (ok/error/pending/skipped), `last_error`, `attempts_today`, timestamps.
RLS: public SELECT, no public write.
Realtime enabled.

### 2. Nowa Edge Function `check-download`

Przyjmuje `imei`, sprawdza czy `last_success_at` jest dzisiaj (UTC) i `status = 'ok'`.
- Tak -> `{ should_download: false }`
- Nie -> `{ should_download: true }`

Autoryzacja przez `x-api-key` (REPORT_API_KEY).

### 3. Nowa Edge Function `reset-download-schedule`

Endpoint POST, autoryzacja przez `x-api-key`.
- Body `{ imei: "123..." }` -> resetuje wpis dla danego IMEI (ustawia `status='pending'`, czysc `last_success_at`)
- Body `{ all: true }` -> resetuje wszystkie wpisy
- Zwraca `{ ok: true, reset_count: N }`

### 4. Rozszerzenie Edge Function `report-session`

Przy kazdym upsert sesji aktualizuje `download_schedule`:
- `status = "completed"` -> upsert z `last_success_at = now()`, `status = 'ok'`
- `status = "error"` -> upsert z `status = 'error'`, `last_error = error_message`
- `status = "skipped"` -> upsert z `status = 'skipped'`, `last_attempt_at = now()`, inkrementacja `attempts_today`

### 5. C# — DddSession.cs

Po otrzymaniu IMEI, wywolanie `WebReporter.CheckDownloadScheduleAsync()`. Jesli `should_download = false`:
- Log "IMEI already downloaded today — skipping"
- Report status "skipped" z eventem "DownloadSkipped"
- ACK IMEI + SendTerminate

### 6. C# — WebReporter.cs

Nowa metoda `CheckDownloadScheduleAsync()` — HTTP GET do `check-download?imei=XXX`. Przy bledzie/braku polaczenia zwraca `true` (pozwala na pobranie).

### 7. Dashboard — nowy komponent `DownloadScheduleTable`

Tabela z kolumnami: IMEI, Status (badge kolorowy), Ostatnie pobranie, Proby dzis, Blad.

**Przyciski resetowania:**
- Przycisk "Resetuj" przy kazdym wierszu IMEI (resetuje pojedynczy IMEI)
- Przycisk "Resetuj wszystkie" w naglowku tabeli (resetuje cala kolejke)
- Oba z potwierdzeniem (AlertDialog) przed wykonaniem
- Wywolanie edge function `reset-download-schedule`

### 8. Dashboard — hook `useDownloadSchedule`

Hook z query + realtime subscription na tabele `download_schedule`.
Funkcja `resetSchedule(imei?: string)` wywolujaca edge function.

### 9. Dashboard — integracja

- `DownloadScheduleTable` dodany do `Index.tsx` pod tabela sesji
- Nowa karta w `StatsCards`: "Pominietych dzis"
- `EventTimeline`: kontekst `DownloadSkipped` z ikona SkipForward i szarym tlem
- `SessionsTable`: obsluga statusu "skipped" (szary badge)

## Pliki do zmiany

| Plik | Zmiana |
|------|--------|
| Migracja SQL | Nowa tabela `download_schedule` |
| `supabase/functions/check-download/index.ts` | **Nowy** — sprawdzanie schedule |
| `supabase/functions/reset-download-schedule/index.ts` | **Nowy** — resetowanie schedule |
| `supabase/functions/report-session/index.ts` | Upsert `download_schedule` |
| `csharp/TachoDddServer/Session/DddSession.cs` | Check schedule po IMEI |
| `csharp/TachoDddServer/Reporting/WebReporter.cs` | `CheckDownloadScheduleAsync()` |
| `src/hooks/useDownloadSchedule.ts` | **Nowy** — hook z realtime + reset |
| `src/hooks/useSessions.ts` | Rozszerzenie stats o "skipped today" |
| `src/components/DownloadScheduleTable.tsx` | **Nowy** — tabela z przyciskami reset |
| `src/components/SessionsTable.tsx` | Status "skipped" |
| `src/components/StatsCards.tsx` | Karta "Pominietych dzis" |
| `src/components/EventTimeline.tsx` | Kontekst `DownloadSkipped` |
| `src/pages/Index.tsx` | Dodanie `DownloadScheduleTable` |
