

# Plan: Naprawa race condition statusu + logika partial/completed + dashboard

## Problem

1. **Race condition**: Asynchroniczne raporty z serwera C# docieraja w losowej kolejnosci. Spozniony raport `downloading` moze nadpisac finalny `completed`.
2. **Logika partial vs completed**: Gdy wszystkie 5 plikow VU pobrano, ale karty sa `empty_slot`, status to `partial` — powinien byc `completed` (bo pobrano wszystko co bylo dostepne).
3. **Dashboard**: Brak informacji dlaczego sesja jest `partial` (brak kart vs faktyczny blad).

## Rozwiazanie

### 1. Ochrona statusow koncowych w edge function `report-session`

Przed upsert sesji, jesli sesja juz istnieje i ma status koncowy (`completed`, `partial`, `error`), nie pozwalamy na nadpisanie statusem posrednim (`connecting`, `downloading`, `auth_*`).

Logika:
```text
sesja istnieje w bazie?
  -> tak -> aktualny status to completed/partial/error?
    -> tak -> nowy status to tez koncowy? -> nadpisz
    -> tak -> nowy status to posredni? -> IGNORUJ zmiane statusu
  -> nie -> normalny upsert
```

Zmiana w: `supabase/functions/report-session/index.ts`

### 2. Logika partial vs completed po stronie C# (WebReporter)

To jest logika po stronie serwera C# — nie mozemy tego zmienic w Lovable. Ale mozemy dodac inteligencje do edge function:

W `report-session`, gdy status = `partial`, sprawdzamy: jesli `files_downloaded >= 5` (wszystkie VU) i w eventach sesji sa tylko `empty_slot` (nie `access_denied` ani inne bledy kart), to zmieniamy status na `completed`.

### 3. Dodanie kontekstu `partial` na dashboardzie

W `SessionsTable.tsx`, przy statusie `partial` dodajemy tooltip z informacja:
- Jesli error_message zawiera "empty_slot" -> "Pobrano wszystkie pliki VU. Brak wlozonej karty kierowcy."
- W przeciwnym razie -> wyswietlamy error_message

---

## Szczegoly techniczne

### Plik: `supabase/functions/report-session/index.ts`

1. Przed upsert — pobierz aktualny status sesji z bazy (`SELECT status FROM sessions WHERE id = ?`)
2. Jesli aktualny status jest koncowy (`completed`, `partial`, `error`) a nowy nie jest koncowy — usun `status` z `sessionData` (zachowaj inne aktualizacje jak `last_activity`)
3. Jesli status to `partial` i `files_downloaded >= 5` — sprawdz eventy sesji pod katem `empty_slot` i ewentualnie zmien na `completed`

### Plik: `csharp/TachoWebApi/Controllers/ReportSessionController.cs`

Analogiczna ochrona: przed aktualizacja statusu sprawdz czy obecny status nie jest juz koncowy.

### Plik: `src/components/SessionsTable.tsx`

Dodaj tooltip do badge `Czesciowe` z wyjasnieniem przyczyny (na podstawie `error_message` lub `files_downloaded`/`total_files`).

