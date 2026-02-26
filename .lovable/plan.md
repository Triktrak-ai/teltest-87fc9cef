
# Polaczenie frontendu z baza danych -- pelna implementacja

## Podsumowanie

Utworzenie tabel w bazie, edge function do przyjmowania danych z serwera C#, hookow React z subskrypcja Realtime, oraz aktualizacja wszystkich komponentow frontendowych aby wyswietlaly dane z bazy zamiast mockow.

---

## 1. Migracja bazy danych

### Tabela `sessions`

| Kolumna | Typ | Default | Opis |
|---------|-----|---------|------|
| id | uuid PK | gen_random_uuid() | ID sesji |
| imei | text NOT NULL | | IMEI urzadzenia |
| vehicle_plate | text | null | Rejestracja pojazdu |
| status | text NOT NULL | 'connecting' | Status sesji |
| generation | text | 'Unknown' | Gen1/Gen2v1/Gen2v2 |
| progress | integer | 0 | 0-100 |
| files_downloaded | integer | 0 | Liczba pobranych |
| total_files | integer | 0 | Laczna liczba |
| current_file | text | null | Aktualnie pobierany plik |
| error_code | text | null | Kod bledu |
| error_message | text | null | Opis bledu |
| bytes_downloaded | bigint | 0 | Bajty pobrane |
| apdu_exchanges | integer | 0 | Licznik APDU |
| crc_errors | integer | 0 | Licznik CRC |
| started_at | timestamptz | now() | Poczatek |
| last_activity | timestamptz | now() | Ostatnia aktywnosc |
| completed_at | timestamptz | null | Zakonczenie |
| created_at | timestamptz | now() | Utworzenie rekordu |

### Tabela `session_events`

| Kolumna | Typ | Default | Opis |
|---------|-----|---------|------|
| id | uuid PK | gen_random_uuid() | |
| session_id | uuid FK | | Powiazanie z sesja |
| imei | text NOT NULL | | IMEI |
| type | text NOT NULL | 'info' | info/success/warning/error |
| message | text NOT NULL | | Tresc |
| context | text | null | Kontekst (np. nazwa metody) |
| created_at | timestamptz | now() | |

Obie tabele:
- RLS wlaczone z polityka SELECT dla anon (publiczny dashboard -- bez autentykacji)
- INSERT/UPDATE tylko przez service_role (edge function)
- Realtime wlaczone

---

## 2. Edge Function: `report-session`

**Plik:** `supabase/functions/report-session/index.ts`

Endpoint HTTP POST przyjmujacy JSON z serwera C#. Autoryzacja przez klucz API w naglowku `x-api-key` (porownanie z secretem `REPORT_API_KEY`).

Logika:
- Upsert do tabeli `sessions` (na podstawie `session_id`)
- Insert do tabeli `session_events` (jesli pole `event` jest obecne)
- Walidacja danych wejsciowych
- Odpowiedz 200 OK lub 4xx/5xx z opisem bledu

Format wejscia:
```text
POST /report-session
x-api-key: <secret>
{
  "session_id": "guid",
  "imei": "352093089012345",
  "status": "downloading",
  "generation": "Gen2v2",
  "progress": 65,
  "files_downloaded": 4,
  "total_files": 6,
  "current_file": "VU_Activities",
  "error_code": null,
  "error_message": null,
  "bytes_downloaded": 131072,
  "apdu_exchanges": 14,
  "crc_errors": 0,
  "event": {
    "type": "success",
    "message": "File 4/6 downloaded",
    "context": "HandleFileData"
  }
}
```

---

## 3. Nowy hook: `src/hooks/useSessions.ts`

Eksportuje:
- `useSessions()` -- useQuery na tabele `sessions` (ORDER BY last_activity DESC) + Realtime subscription na INSERT/UPDATE/DELETE
- `useSessionEvents()` -- useQuery na tabele `session_events` (ORDER BY created_at DESC, LIMIT 100) + Realtime subscription na INSERT
- `useSessionStats()` -- obliczone statystyki z danych sesji:
  - Aktywne sesje (status != completed && != error)
  - Ukonczone dzis (status == completed, completed_at dzisiaj)
  - Bledy dzis (status == error, last_activity dzisiaj)
  - Unikalne IMEI online (distinct imei z aktywnych)

---

## 4. Aktualizacja komponentow

### `SessionsTable.tsx`
- Import `useSessions()` zamiast mockSessions
- Dodanie kolumn: `current_file`, `bytes_downloaded`, `apdu_exchanges`, `crc_errors`
- Skeleton loading state
- Wyswietlanie pustego stanu gdy brak sesji
- Wskaznik "live" (pulsujaca kropka) przy aktywnych sesjach

### `StatsCards.tsx`
- Import `useSessionStats()` zamiast stalych wartosci
- Skeleton loading na kartach
- Dodatkowe karty: Bajty pobrane (laczne), APDU exchanges, CRC errors

### `EventTimeline.tsx`
- Import `useSessionEvents()` zamiast mockEvents
- Wyswietlanie context obok message
- Skeleton loading
- Auto-scroll do najnowszych zdarzen
- Wskaznik "live" na gorze

### `Index.tsx`
- Dodanie wskaznika ostatniego odswiezenia danych
- Przycisk recznego odswiezenia

---

## 5. Klasa C# `WebReporter`

**Plik:** `csharp/TachoDddServer/Reporting/WebReporter.cs`

Prosty HttpClient wysylajacy POST do edge function. Integracja z `DddSession.cs`:
- `TransitionTo()` wywoluje `_webReporter.ReportStatusAsync()`
- `HandleFileData` (EOF) wywoluje `_webReporter.ReportFileCompletedAsync()`
- Bledy wywoluja `_webReporter.ReportErrorAsync()`

Konfiguracja w `appsettings.json`:
```text
"WebReport": {
  "Enabled": true,
  "Url": "https://exyjnmtxacpydoeaqcti.supabase.co/functions/v1/report-session",
  "ApiKey": "<secret>"
}
```

Fire-and-forget (nie blokuje sesji DDD przy bledach sieciowych).

---

## 6. Kolejnosc implementacji

1. Migracja bazy (tabele + RLS + Realtime)
2. Edge function `report-session`
3. Hook `useSessions` + `useSessionEvents` + `useSessionStats`
4. Aktualizacja SessionsTable, StatsCards, EventTimeline, Index
5. Klasa C# WebReporter + integracja z DddSession
6. Dodanie secretu REPORT_API_KEY
