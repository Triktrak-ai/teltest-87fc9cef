

# Resetowanie stanu karty przed ponowna proba autentykacji

## Problem

Po bledzie autentykacji karta pozostaje w kontekscie DF aplikacji (SMRDT/TACHO). Kolejna proba natychmiast failuje z `6A 82` (file not found) bo VU probuje `SELECT EF_ICC` ktory nie jest dostepny w tym kontekscie. Efekt: 2 z 3 prob sa zmarnowane.

## Analiza traffic logu

```text
Proba 1: Pelna autentykacja -> secure messaging 0C B0 -> 6A 88 -> "certificate rejected"
          Karta zostaje w kontekscie DF SMRDT/TACHO
Proba 2: VU wysyla SELECT EF_ICC -> 6A 82 (nie istnieje w biezacym DF) -> natychmiastowy fail
Proba 3: To samo co proba 2
```

## Rozwiazanie

Dodac wywolanie `TryResetCardState()` (SELECT MF) **przed** wyslaniem ATR w kolejnej probie, zeby zresetowac karte do kontekstu Master File.

## Zmiana w pliku

**`csharp/TachoDddServer/Session/DddSession.cs`** — w bloku retry (linie 346-351)

Przed wyslaniem STATUS i przejsciem do `WaitingForStatus`, wywolac `TryResetCardState()`:

```text
// Po sprawdzeniu limitu retry, ale przed wyslaniem STATUS:
if (stateBeforeError == SessionState.ApduLoop)
{
    // Reset card state before retry
    await TryResetCardState();
}

await SendDddPacketAsync(stream, DddPacketType.Status);
TransitionTo(SessionState.WaitingForStatus, "Error received, requesting STATUS");
```

## Dodatkowa obserwacja

Blad `6A 88` (Referenced data not found) podczas secure messaging w pierwszej probie wskazuje na potencjalna niezgodnosc generacyjna — tachograf moze nie obslugiwac certyfikatow Gen2. To jest problem po stronie VU/tachografu, nie po stronie naszego kodu. Ale prawidlowy reset karty zapewni ze kazda proba ma szanse na pelna autentykacje zamiast natychmiastowego failu.

## Oczekiwany efekt

- Kazda z 3 prob bedzie miala pelna sekwencje autentykacji (nie tylko retry 1)
- Jesli problem jest przejsciowy (np. timing), proba 2 lub 3 moze sie udac
- Jesli to niezgodnosc generacyjna, sesja i tak zakonczy sie po 3 probach, ale z pelna diagnostyka z kazdej proby

