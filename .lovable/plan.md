
# Wyczyszczenie danych dashboardu

## Co zostanie usuniete

- **76 sesji** z tabeli `sessions`
- **332 zdarzen** z tabeli `session_events`

## Sposob

Jedna migracja SQL ktora usunie wszystkie rekordy z obu tabel (TRUNCATE CASCADE):

```sql
TRUNCATE TABLE session_events;
TRUNCATE TABLE sessions;
```

Kolejnosc jest wazna -- najpierw `session_events` (ma foreign key do `sessions`), potem `sessions`.

Po wykonaniu dashboard bedzie pokazywal zerowe statystyki i pusta tabele sesji, gotowy do zbierania nowych danych od serwera C#.

## Pliki do zmiany

Brak zmian w kodzie -- tylko migracja bazodanowa.
