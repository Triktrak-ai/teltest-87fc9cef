# TachoDDD Server — Core Protocol Implementation

Czysta implementacja protokołu Teltonika DDD do zdalnego pobierania danych z tachografu cyfrowego poprzez kartę firmową (company card).

## Architektura

```
┌──────────────┐         TCP/Codec12         ┌──────────────────┐
│  Teltonika   │ ◄──────────────────────────► │  TachoDddServer  │
│  FMB640/etc  │        (port 12050)          │    (VPS/Cloud)   │
└──────────────┘                              └────────┬─────────┘
       │                                               │
       │ OBD-II / K-line                     WebSocket (port 5201)
       │                                               │
┌──────────────┐                              ┌────────▼─────────┐
│  Tachograf   │                              │ CardBridgeService │
│  (VU w aucie)│                              │  (laptop/PC z    │
└──────────────┘                              │   czytnikiem)    │
                                              └──────────────────┘
                                                       │
                                                  PC/SC (winscard.dll)
                                                       │
                                              ┌────────▼─────────┐
                                              │   Czytnik kart   │
                                              │ + Karta firmowa  │
                                              └──────────────────┘
```

## Jak to działa

1. **Urządzenie Teltonika** (FMB640) w pojeździe łączy się z serwerem TCP na VPS.
2. **Serwer** odbiera IMEI, sprawdza status urządzenia, następnie tuneluje komendy APDU między tachografem a kartą firmową.
3. **CardBridgeService** działa na laptopie/PC z czytnikiem PC/SC i kartą firmową — udostępnia operacje karty przez WebSocket.
4. Po uwierzytelnieniu kartą firmową, serwer pobiera pliki DDD (Overview, Activities, Events, Speed, Technical, Driver Cards).

## Protokół

- **Codec 12** — ramki transportowe Teltonika z CRC-16/IBM
- **DDD Protocol** — pakiety wewnątrz Codec 12: Status, APDU, FileRequest, FileData, etc.
- **APDU tunneling** — komendy ISO 7816-4 tunelowane między VU a kartą firmową

## Detekcja generacji

System automatycznie wykrywa generację tachografu i karty:

- **ATR** — analiza Answer-To-Reset karty (T=0 → Gen1, T=1 → Gen2)
- **EF_ICC Probe** — odczyt pliku EF_ICC (DF 0007, EF 0002) → bajt `cardGeneration` na offsecie 25
- **APDU SELECT** — DF 0002 = Gen1 VU, DF 0007 = Gen2 VU
- **TREP** — kod w odpowiedzi InterfaceVersion (0x01 = Gen2v1, 0x02 = Gen2v2)
- **Overview scan** — post-download weryfikacja tagów sekcji (0x76 0x01-0x0F / 0x21-0x2F / 0x31-0x3F)

## Generation Locking

Jeśli generacja karty jest niższa niż wykryta generacja VU, system **nie podnosi** kodów TRTP — zostaje przy Gen1, co zapobiega błędom autentykacji w scenariuszach mieszanych (np. karta Gen2v1 w VU Gen2v2).

## Wymagania

- .NET 8.0
- Czytnik kart PC/SC (np. ACR38, Omnikey)
- Karta firmowa (company card) — Gen1, Gen2v1 lub Gen2v2
- Urządzenie Teltonika z obsługą DDD (FMB640, FMB130, etc.)
- Windows (winscard.dll dla CardBridgeService)

## Uruchomienie

### CardBridgeService (laptop z czytnikiem)
```bash
cd CardBridgeService
dotnet run
# Nasłuchuje na porcie 5201
```

### TachoDddServer (VPS)
```bash
dotnet run
# Nasłuchuje na porcie TCP z appsettings.json
```

### Konfiguracja (appsettings.json)
```json
{
  "TcpPort": 12050,
  "CardBridgeUrl": "ws://TWOJ-LAPTOP-IP:5201",
  "OutputDir": "./ddd-files"
}
```

## Struktura plików

```
Protocol/
  Codec12Frame.cs      — record ramki Codec 12
  Codec12Parser.cs     — parser z CRC-16/IBM
  DddPacket.cs         — Build/Parse pakietów DDD
  DddPacketType.cs     — enum typów pakietów
  DddErrorCodes.cs     — kody błędów DDD

Session/
  DddSession.cs        — główna logika sesji (maszyna stanów, APDU loop, pobieranie)
  SessionState.cs      — enum stanów sesji
  VuGeneration.cs      — enum generacji VU
  DddFileType.cs       — enum typów plików

CardBridge/
  CardBridgeClient.cs  — klient WebSocket do komunikacji z czytnikiem

Storage/
  DddFileWriter.cs     — zapis plików DDD na dysk

CardBridgeService/
  Program.cs           — serwis lokalny PC/SC (winscard.dll)
```
