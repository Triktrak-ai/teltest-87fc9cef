# TachoDDD - Serwer pobierania danych z tachografu

## Architektura (Opcja A)

```
FMB640 ──TCP:5200──► [VPS OVH: TachoDddServer] ──WebSocket:5201──► [Twój PC: CardBridgeService] ──PC/SC──► Czytnik kart
```

## 1. CardBridgeService (Twój lokalny PC z czytnikiem)

```bash
cd csharp/CardBridgeService
dotnet run
```
> Uruchom jako Administrator! (HttpListener wymaga uprawnień)

## 2. TachoDddServer (VPS OVH)

1. Edytuj `appsettings.json` — zmień `CardBridgeUrl` na `ws://TWOJ_DOMOWY_IP:5201`
2. ```bash
   cd csharp/TachoDddServer
   dotnet run
   ```

## 3. Firewall
- **VPS:** Otwórz port `5200` (TCP)
- **Lokalny PC:** Otwórz port `5201` + port forward na routerze

## 4. Konfiguracja FMB640
```
SMS: TACHOADDRSET IP_VPS:5200
SMS: READTAC
```

## Wymagania
- .NET 8 SDK
- Windows (winscard.dll)
- Czytnik kart PC/SC + karta firmowa
