

# Fix: Race condition w aktualizacji statusu sesji

## Problem
Sesja `903ea45b` ma status `downloading` mimo ustawionego `completed_at`. Dwa raporty dotarły do edge function w odstepie ~100ms. Raport "downloading" nadpisal status, bo w momencie SELECT-a raport "completed" nie byl jeszcze scommitowany.

## Rozwiazanie
Dodac do edge function `report-session` dodatkowe zabezpieczenie:

1. **Sprawdzanie `completed_at`** — jesli sesja ma juz ustawione `completed_at`, traktuj ja jako finalowa niezaleznie od pola `status` (na wypadek race condition)
2. **Sprawdzanie w bazie** — rozszerzyc SELECT o pole `completed_at` i uwzglednic je w logice ochrony statusu

## Zmiany w pliku

### `supabase/functions/report-session/index.ts`

W sekcji race condition protection, zmiana z:

```typescript
const { data: existingSession } = await supabase
  .from("sessions")
  .select("status")
  .eq("id", body.session_id)
  .maybeSingle();

const currentStatus = existingSession?.status;
```

Na:

```typescript
const { data: existingSession } = await supabase
  .from("sessions")
  .select("status, completed_at")
  .eq("id", body.session_id)
  .maybeSingle();

const currentStatus = existingSession?.status;
const hasCompletedAt = !!existingSession?.completed_at;
```

Oraz rozszerzenie warunku ochrony:

```typescript
// Protect if status is final OR if completed_at is already set (race condition guard)
if ((currentIsFinal || hasCompletedAt) && !newIsFinal) {
  console.log(`STATUS PROTECTION: keeping '${currentStatus}' (completed_at=${hasCompletedAt}), ignoring '${newStatus}'`);
  protectedStatus = true;
}
```

### Naprawa istniejacych danych

Jednorazowy UPDATE aby naprawic sesje `903ea45b`:

```sql
UPDATE sessions 
SET status = 'partial' 
WHERE id = '903ea45b-897a-4aee-bc4b-c101ec00aef9' 
  AND status = 'downloading' 
  AND completed_at IS NOT NULL;
```

Status `partial` (nie `completed`) poniewaz pobrano 6/7 plikow — DriverCard2 zakonczyl sie empty_slot. Jednak logika upgrade partial->completed (5+ plikow VU + same empty_slot) powinna tez zostac zastosowana, wiec finalny status to `completed`.

```sql
UPDATE sessions 
SET status = 'completed' 
WHERE id = '903ea45b-897a-4aee-bc4b-c101ec00aef9' 
  AND completed_at IS NOT NULL;
```

### Dodatkowe zabezpieczenie: skanowanie i naprawa starych sesji

Query diagnostyczne aby znalezc inne sesje z tym samym bugiem:

```sql
SELECT id, imei, status, completed_at, files_downloaded, total_files 
FROM sessions 
WHERE completed_at IS NOT NULL 
  AND status NOT IN ('completed', 'partial', 'error', 'skipped');
```

Jesli znajdzie wiecej takich sesji — naprawic je hurtowo.

## Podsumowanie

| Akcja | Plik/Miejsce |
|-------|-------------|
| Fix race condition guard | `supabase/functions/report-session/index.ts` |
| Naprawa sesji 903ea45b | UPDATE w bazie |
| Skan diagnostyczny | Query na inne dotknięte sesje |

Zmiana jest minimalna (3 linie w edge function) i eliminuje cala klase race condition bugow.
