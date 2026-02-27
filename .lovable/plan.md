

# Naprawa detekcji generacji VU (TREP mapping bug)

## Problem

Serwer C# blednie mapuje bajt TREP z odpowiedzi InterfaceVersion:

- `TREP=0x01` jest przypisywany do `Gen1`, podczas gdy powinien byc `Gen2v1`
- Tachografy Gen1 w ogole nie obsluguja zapytania InterfaceVersion i zwracaja Error (co juz poprawnie wyzwala fallback do Gen1 w linii 666)
- W efekcie monitor pokazuje "Gen1" lub "Unknown" dla tachografow ktore w rzeczywistosci sa Gen2v1 lub Gen2v2

Pliki DDD dla IMEI 358480081630115 zostaly poprawnie wykryte przez parser frontendu jako Gen2v2 na podstawie struktury binarnej, ale serwer zarapotowal bledna generacje do bazy danych.

## Naprawa

### Plik: `csharp/TachoDddServer/Session/DddSession.cs`

Jedna zmiana w linii 651:

```text
Przed:  _vuGeneration = VuGeneration.Gen1;
Po:     _vuGeneration = VuGeneration.Gen2v1;
```

Pelna logika po naprawie:

```text
TREP=0x02          → Gen2v2   (bez zmian)
TREP=0x01          → Gen2v1   (POPRAWKA)
TREP=inne          → Gen1     (bez zmian)
Error na zapytanie → Gen1     (bez zmian, linia 666)
```

### Wplyw

- Monitor bedzie poprawnie wyswietlal "Gen2v1" w kolumnie generacji
- Status "auth_gen2v1" bedzie poprawnie raportowany (jesli serwer wysyla go na podstawie `_vuGeneration`)
- Istniejace rekordy w bazie danych nie zostana zaktualizowane -- poprawka dotyczy tylko nowych sesji

