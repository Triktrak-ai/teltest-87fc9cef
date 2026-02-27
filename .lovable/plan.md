
# Wykrywanie nieaktualnych sesji i poprawa statystyk

## Problem

Statystyki "Aktywne sesje" i "IMEI online" nie uwzgledniaja czasu ostatniej aktywnosci. Sesja w stanie "connecting" lub "downloading", ktora nie otrzymala aktualizacji od np. 5 minut, jest nadal liczona jako aktywna. To prowadzi do falszywych wskazan na dashboardzie.

## Rozwiazanie

Wprowadzenie progu nieaktywnosci (np. 5 minut). Sesje bez aktualizacji `last_activity` dluzej niz prog sa traktowane jako "stale" (nieaktualne) i:
- Nie sa liczone w "Aktywne sesje" ani "IMEI online"
- Sa wizualnie oznaczone w tabeli sesji (przygaszony wiersz, badge "Nieaktywna")

## Zmiany

### 1. `src/hooks/useSessions.ts` -- filtrowanie stalych sesji w statystykach

Dodanie funkcji pomocniczej `isStaleSession(session, thresholdMinutes = 5)`:

```text
isStaleSession(s):
  if status == "completed" || status == "error" -> false (juz zamkniete)
  return (now - last_activity) > threshold
```

Zmiana w `useSessionStats()`:
- "Aktywne sesje" = sesje nie-completed, nie-error, nie-stale
- "IMEI online" = unikalne IMEI z aktywnych (nie-stale) sesji

Eksport funkcji `isStaleSession` do uzytku w tabeli.

### 2. `src/components/SessionsTable.tsx` -- wizualne oznaczenie stalych sesji

- Wiersze stalych sesji: przygaszony tekst (`opacity-50`)
- Obok badge statusu: dodatkowy badge "Nieaktywna" w kolorze szarym
- Tooltip lub tekst z informacja "Brak aktywnosci od X minut"

### 3. `src/components/StatsCards.tsx` -- zmiana opisu "IMEI online"

Zmiana etykiety z "IMEI online" na "IMEI aktywne" dla jasnosci, ze chodzi o urzadzenia z aktywna (nie-stale) sesja.

## Pliki do zmiany

| Plik | Zmiana |
|------|--------|
| `src/hooks/useSessions.ts` | Dodanie `isStaleSession()`, aktualizacja statystyk |
| `src/components/SessionsTable.tsx` | Wizualne oznaczenie stalych sesji |
| `src/components/StatsCards.tsx` | Zmiana etykiety "IMEI online" na "IMEI aktywne" |
