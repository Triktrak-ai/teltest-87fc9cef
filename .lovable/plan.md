

# Pobieranie plików DDD z VPS + ładowanie do czytnika

## Kontekst
Pliki DDD są zapisywane na VPS w `C:\TachoDDD\Downloads\{IMEI}\` z nazwami typu `{imei}_overview_{timestamp}.ddd`. Nie istnieje jeszcze endpoint API do ich listowania/pobierania. Czytnik DDD (`DddReader.tsx`) przyjmuje pliki przez `processFiles(File[])`.

## Plan

### 1. Nowy kontroler C# — `DddFilesController`
**Plik:** `csharp/TachoWebApi/Controllers/DddFilesController.cs`

Endpoint listujący pliki DDD dla danej sesji na podstawie IMEI i timestampu sesji:
- `GET /api/ddd-files/{imei}?after={started_at}&before={completed_at}` — zwraca listę plików (nazwy) z katalogu `{OutputDir}/{imei}/` pasujących do okna czasowego sesji
- `GET /api/ddd-files/{imei}/{fileName}` — pobiera konkretny plik binarny

Konfiguracja: nowy klucz `FileStorage:DddFilesDir` w `appsettings.json` (domyślnie `C:\TachoDDD\Downloads`). Autoryzacja: `[Authorize]` (zalogowani użytkownicy).

### 2. Nowa kolumna "Akcje" w tabeli sesji
**Plik:** `src/components/SessionsTable.tsx`

Dodać kolumnę na końcu tabeli z dwoma ikonkami (widoczna tylko dla sesji `completed` lub `partial` z `files_downloaded > 0`):

- **Download** (`Download` icon) — pobiera pliki DDD z VPS jako ZIP lub pojedyncze pliki. Wywołuje `GET /api/ddd-files/{imei}?after=...&before=...` aby pobrać listę, potem pobiera każdy plik.
- **Otwórz w czytniku** (`BookOpen` icon) — pobiera pliki z VPS i przekierowuje do `/ddd-reader` z danymi załadowanymi automatycznie.

### 3. Mechanizm przekazywania plików do czytnika DDD
**Plik:** `src/pages/DddReader.tsx`

Dodać obsługę parametru `?sessionImei={imei}&after={ts}&before={ts}` w URL. Gdy parametry obecne — automatycznie pobrać listę plików z API, pobrać binarne pliki i wywołać `processFiles()`.

### 4. Dodanie endpointu do `api-client.ts`
**Plik:** `src/lib/api-client.ts`

```typescript
export async function apiListDddFiles(imei: string, after: string, before: string) 
export async function apiDownloadDddFile(imei: string, fileName: string): Promise<ArrayBuffer>
```

### Podsumowanie zmian

| Plik | Zmiana |
|---|---|
| `csharp/TachoWebApi/Controllers/DddFilesController.cs` | Nowy kontroler — lista plików + pobieranie |
| `csharp/TachoWebApi/appsettings.json` | Dodać `DddFilesDir` |
| `src/lib/api-client.ts` | Dwie nowe funkcje API |
| `src/components/SessionsTable.tsx` | Kolumna "Akcje" z ikonkami download + czytnik |
| `src/pages/DddReader.tsx` | Auto-ładowanie z parametrów URL |

