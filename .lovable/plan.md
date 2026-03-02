
# Kategoryzacja sesji "Unknown" na dashboardzie

## Problem
Kolumna "Tachograf" wyswietla "Unknown" dla wielu sesji, ktore tak naprawde maja rozne, rozpoznawalne przyczyny. Uzytkownik widzi monotonna liste "Unknown" bez zadnej informacji o tym co sie stalo.

## Analiza danych
Z bazy wynika 5 jasnych kategorii sesji z "Unknown":

| Kategoria | Ilosc | Wzorzec | Znaczenie |
|---|---|---|---|
| Lockout (cert rejected) | 37 | APDU 0-3, error | Tachograf odrzucil certyfikat (blokada bezpieczenstwa) |
| Brak odpowiedzi VU | 13 | APDU 0, error, oba Unknown | VU nie odpowiedzialo (stacyjka wylaczona / offline) |
| Auth zaawansowany blad | 8 | APDU 20+, error | Autentykacja przeszla daleko ale ostatecznie odrzucona |
| Wykrywanie | 10 | connecting, APDU 0 | Sesja w trakcie - generacja jeszcze nieznana |
| Pominieto | 6 | skipped | Sesja pominieta przez harmonogram |

## Rozwiazanie

### 1. Nowa funkcja `classifyUnknownGeneration()` w `SessionsTable.tsx`

Zamiast wyswietlac surowe "Unknown", dodac funkcje ktora na podstawie `status`, `apdu_exchanges`, `error_message` i kontekstu z `session_events` zwraca:

```text
- "Lockout"       → ikona Lock, kolor destructive, tooltip "Tachograf odrzucil certyfikat"
- "VU offline"    → ikona WifiOff, kolor muted, tooltip "Brak odpowiedzi VU (stacyjka wylaczona?)"  
- "Auth blad"     → ikona ShieldX, kolor warning, tooltip "Autentykacja przerwana po N wymianach APDU"
- "Wykrywanie..." → ikona Loader, kolor info, animacja pulse
- "Unknown"       → fallback dla niepasujacych przypadkow
```

### 2. Zmiana wyswietlania w kolumnie "Tachograf"

Zamiast Badge "Unknown" wyswietlic nowy Badge z odpowiednia ikona, kolorem i tooltipem. Zastosowac to tylko gdy `generation === "Unknown"` — znane generacje (Gen1, Gen2, Gen2v2) pozostaja bez zmian.

### 3. Zmiana wyswietlania w kolumnie "Status" dla bledow

Dla sesji z `status === "error"` i rozpoznanym wzorcem, wzbogacic tooltip Badge "Blad" o szczegoly:
- "Blokada bezpieczenstwa tachografu (lockout)" 
- "VU nie odpowiada — mozliwe wylaczenie stacyjki"
- "Certyfikat odrzucony po pelnej autentykacji"

### Zmiany w plikach

**`src/components/SessionsTable.tsx`** — jedyny plik:
- Dodac funkcje `classifyUnknownGeneration(session)` zwracajaca `{ label, icon, color, tooltip }`
- Zmodyfikowac renderowanie kolumny "Tachograf" (linia 169-188) aby uzywac klasyfikacji zamiast surowego "Unknown"
- Dodac tooltips do kolumny "Status" dla rozpoznanych wzorcow bledow
- Import dodatkowych ikon: `Lock`, `WifiOff`, `ShieldX`, `Loader`
