

# Glebokie logowanie diagnostyczne i obsluga bledow

## Obecny stan — ZAIMPLEMENTOWANO ✅

Caly plan zostal zaimplementowany. Oto co zostalo dodane:

### Nowe pliki
1. **`Logging/SessionDiagnostics.cs`** — centralna klasa diagnostyczna zbierajaca: przejscia stanow, pakiety TX/RX, bledy, ostrzezenia, statystyki plikow (rozmiar, czas, predkosc), liczniki APDU/CRC/bajtow. Generuje czytelny raport tekstowy i JSON na koniec sesji.
2. **`Protocol/DddErrorCodes.cs`** — slownik mapujacy kody bledow DDD na czytelne opisy (np. `[0x02:0x0A] Authentication failed — certificate rejected`).

### Zmodyfikowane pliki
3. **`Logging/TrafficLogger.cs`** — rozszerzony o: `LogDecoded()`, `LogDecodedWithHex()`, `LogStateChange()`, `LogError()`, `LogWarning()`, `LogSummary()`.
4. **`CardBridge/CardBridgeClient.cs`** — timeout 30s na kazde operacje, logowanie komend/odpowiedzi z czasem (ms), sprawdzanie `_ws.State`, pelny JSON na Debug.
5. **`Session/DddSession.cs`** — `TransitionTo()` zamiast `_state = X`, try/catch w kazdej metodzie async, Stopwatch na kazdym pliku, podsumowanie sesji w finally, DddErrorCodes w HandleError.
6. **`Program.cs`** — logowanie konfiguracji przy starcie, czas polaczenia/rozlaczenia z duration.

### Co loguje kazda sesja
- Kazde przejscie stanu z powodem
- Kazdy pakiet TX/RX z typem, rozmiarem, hex preview
- Kazdy blad z kontekstem i stack trace
- Kazdy plik: rozmiar, czas, predkosc KB/s
- Podsumowanie sesji (tekst + JSON)
