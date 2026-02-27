

# Naprawa nieskonczonej petli autentykacji + APDU SELECT MF

## Problem 1: Nieskonczona petla "Certificate rejected" (KRYTYCZNY)

Retry limit (MaxAuthRetries=3) **nigdy nie dziala**, bo:

1. Linia 330: `HandleError(data)` zmienia stan z `ApduLoop` na `Error` (przez `TransitionTo` w linii 1285)
2. Linia 333: sprawdzenie `if (_state == SessionState.ApduLoop)` jest **zawsze false** — stan jest juz `Error`
3. `_authRetryCount` nigdy nie jest inkrementowany
4. Linia 348-349: wysyla STATUS i przechodzi do `WaitingForStatus` — cykl zaczyna sie od nowa, bez limitu

Wynik: 38 powtorzen w 9 minut, az karta fizycznie przestaje odpowiadac (0x80100068).

### Naprawa

Zapisac stan **przed** wywolaniem `HandleError`, i uzyc zapisanego stanu do sprawdzenia retry:

```text
Linia 325-346 w DddSession.cs:

  var stateBeforeError = _state;   // <-- zapisz stan PRZED HandleError
  HandleError(data);

  if (stateBeforeError == SessionState.ApduLoop)  // <-- uzywaj zapisanego stanu
  {
      _authRetryCount++;
      ...
  }
```

## Problem 2: SELECT MF z P2=0C (6A86)

Komendy SELECT MF w `ProbeCardGenerationAsync()` (linia 587) i `TryResetCardState()` (linia 651) uzywaja `P2=0C`, co niektorym kartom nie odpowiada (SW=6A86).

### Naprawa

Zmienic P2 z `0x0C` na `0x00` we wszystkich komendach SELECT MF:

```text
Bylo:    00 A4 00 0C 02 3F 00
Bedzie:  00 A4 00 00 02 3F 00
```

Dotyczy dwoch miejsc:
- `ProbeCardGenerationAsync()` linia 587
- `TryResetCardState()` linia 651

## Pliki do zmiany

| Plik | Zmiana |
|------|--------|
| `DddSession.cs` linia 325-333 | Zapisac `_state` przed `HandleError`, uzyc w warunku retry |
| `DddSession.cs` linia 587 | SELECT MF: P2 z 0x0C na 0x00 |
| `DddSession.cs` linia 651 | SELECT MF: P2 z 0x0C na 0x00 |

## Efekt po naprawie

- Sesja z "Certificate rejected" zakonczy sie po 3 probach (ok. 40s) zamiast 38+ (9 min)
- Probe EF_ICC nie bedzie blokowac na SELECT MF z 6A86

