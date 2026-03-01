

# Plan: Ograniczenie widoczności kart statystyk dla zwykłych użytkowników

## Cel
Zwykli użytkownicy widzą tylko 3 karty: **Aktywne sesje**, **Ukończone dziś**, **Błędy dziś**.
Administratorzy widzą wszystkie 8 kart.

## Zmiany

### Plik: `src/components/StatsCards.tsx`

1. Dodać prop `isAdmin` (pobierany z `useAuth()` wewnątrz komponentu lub przekazany z rodzica).
2. Zawinąć 5 ukrytych kart (`Pominięte dziś`, `IMEI aktywne`, `Pobrano łącznie`, `APDU łącznie`, `Błędy CRC`) w warunek `{isAdmin && (...)}`.
3. Dostosować grid — dla zwykłego użytkownika `grid-cols-3` zamiast `grid-cols-8`, aby 3 karty ładnie się rozmieściły.

Nie wymaga zmian w bazie danych ani RLS — to czysto wizualna zmiana frontendu.
