

# Opisowy status błędu w badge'u sesji

## Problem
Obecnie kolumna Status zawsze wyświetla generyczny "Błąd" dla wszystkich sesji z `status === "error"`. Szczegóły są dostępne dopiero po najechaniu (tooltip). Użytkownik chce widzieć typ błędu od razu w badge'u.

## Podejście
Zmienić label badge'a dla sesji error na podstawie istniejącej logiki klasyfikacji (`classifyUnknownGeneration` + `getErrorTooltip`):

| Warunek | Nowy label w badge | Ikona |
|---|---|---|
| VU offline (0 APDU, unknown gen) | `VU offline` | WifiOff |
| Lockout (≤3 APDU lub cert rejected) | `Lockout` | Lock |
| Auth błąd (≥20 APDU) | `Auth błąd` | ShieldAlert |
| Przerwane pobieranie (files > 0) | `Przerwane X/Y` | AlertTriangle |
| Inne błędy | `Błąd` | — |

## Zmiany w `src/components/SessionsTable.tsx`

1. **Nowa funkcja `getErrorBadgeInfo(s: Session)`** — zwraca `{ label, icon?, className }` na podstawie klasyfikacji błędu
2. **Zmiana renderowania badge'a** w sekcji `effectiveStatus === "error"` — zamiast stałego `sc.label` ("Błąd"), użyć label z nowej funkcji
3. Tooltip pozostaje bez zmian (szczegółowy opis)

Logika jest już zaimplementowana w `classifyUnknownGeneration` i `getErrorTooltip` — wystarczy ją wykorzystać do zmiany labela badge'a.

