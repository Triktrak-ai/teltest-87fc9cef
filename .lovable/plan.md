

# Logowanie ruchu na portach serwera

## Cel
Dodanie mechanizmu zapisu surowego ruchu sieciowego do plików logów na obu portach:
- **Port 5200** (TachoDddServer -- ruch TCP z FMB640)
- **Port 5201** (CardBridge -- ruch WebSocket z VPS)

## Co zostanie dodane

### 1. TachoDddServer -- logger ruchu TCP (port 5200)

Nowa klasa `TrafficLogger` w folderze `csharp/TachoDddServer/Logging/`:
- Zapis do pliku `traffic_[data]_[IMEI/IP].log`
- Logowanie kierunku (RX/TX), timestampa, rozmiaru i hex-dumpu każdej ramki
- Folder logów konfigurowalny w `appsettings.json` (np. `"TrafficLogDir": "C:\\TachoDDD\\Logs"`)

Modyfikacja `DddSession.cs`:
- Po każdym `stream.ReadAsync` -- log RX z hex-dumpem odebranych bajtów
- Po każdym `stream.WriteAsync` -- log TX z hex-dumpem wysyłanych bajtów

### 2. CardBridgeService -- logger ruchu WebSocket (port 5201)

Modyfikacja `Program.cs`:
- Zapis logów do pliku `cardbridge_[data].log`
- Logowanie każdej odebranej komendy JSON (RX) i każdej odpowiedzi (TX)
- Hex-dump danych APDU w obu kierunkach

### 3. Format logów

Przykładowy wpis:
```text
[2026-02-26 07:45:30.123] RX 45B: 00 00 00 00 00 1D 0C 01 05 00 00 00 17 ...
[2026-02-26 07:45:30.456] TX 32B: 00 00 00 00 00 12 0C 01 06 00 00 00 0C ...
```

### 4. Konfiguracja

Nowe pole w `appsettings.json`:
```json
{
  "TrafficLogDir": "C:\\TachoDDD\\Logs",
  "LogTraffic": true
}
```

## Pliki do zmiany/dodania

| Plik | Akcja |
|------|-------|
| `csharp/TachoDddServer/Logging/TrafficLogger.cs` | Nowy -- klasa logowania ruchu |
| `csharp/TachoDddServer/Session/DddSession.cs` | Zmiana -- dodanie logowania RX/TX |
| `csharp/TachoDddServer/appsettings.json` | Zmiana -- nowe pola konfiguracji |
| `csharp/CardBridgeService/Program.cs` | Zmiana -- logowanie ruchu WS |

