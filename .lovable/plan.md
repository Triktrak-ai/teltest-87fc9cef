

# Implementacja wszystkich poprawek zgodnosci z dokumentacja Teltonika DDD Protocol

## Podsumowanie

Implementacja 8 poprawek (w tym opcjonalnych) zidentyfikowanych przy porownaniu kodu z oficjalnym dokumentem PDF protokolu Teltonika DDD.

---

## 1. KRYTYCZNY: Naprawic format Download List payload

**Plik:** `DddSession.cs` -- metoda `BuildDownloadListPayload()`

Obecny kod wysyla surowe bajty TRTP. Wg specyfikacji (Tabela 14-16, str. 19-20) format to:
```text
[fileType(1B)][dataLength(1B)][fileTypeData(NB)]
```

Nowa implementacja:
- `0x00, 0x00` -- Interface Version (dataLen=0) -- opcjonalne, mozna pominac
- `0x01, 0x00` -- Overview (dataLen=0)
- `0x02, 0x0A, 0x02, [4B start], 0x03, [4B end]` -- Activities (dataLen=10)
- `0x03, 0x00` -- Events (dataLen=0)
- `0x04, 0x00` -- Speed (dataLen=0)
- `0x05, 0x00` -- Technical (dataLen=0)
- `0x06, 0x01, 0x01` -- Driver slot 1 (dataLen=1)
- `0x06, 0x01, 0x02` -- Driver slot 2 (dataLen=1)

**WAZNE:** Download List ZAWSZE uzywa kodow Gen1 (0x01-0x06), niezaleznie od generacji. Kody Gen2 (0x21, 0x31) sa uzywane TYLKO w FileRequest (0x30).

---

## 2. KRYTYCZNY: Download List -- kody TRTP tylko Gen1

**Plik:** `DddSession.cs` -- metoda `BuildDownloadListPayload()`

Usunac wywolanie `GetTrtp()` z `BuildDownloadListPayload()`. Zamiast tego uzywac stalych kodow 0x01-0x06. Metoda `GetTrtp()` pozostaje, ale jest uzywana TYLKO w `RequestFileAsync()`.

---

## 3. Dynamiczny SID/TREP w HandleFileData

**Plik:** `DddSession.cs`

Dodac pola klasy:
```csharp
private byte _lastSid = 0;
private byte _lastTrep = 0;
```

W `HandleFileData`: zamiast `data[2] == 0x76`, zawsze czytac SID/TREP z pierwszych 2 bajtow danych (po fileType + seqNum) gdy `_currentSequenceNumber == 0`. Logowac SID i TREP, ostrzegac gdy SID == 0x7F (negatywna odpowiedz).

W `HandleInterfaceVersionResponse`: parsowac TREP z `_fileBuffer` po zlaczeniu chunkow (SID na pozycji 0, TREP na pozycji 1).

W `RequestNextFileAsync`: resetowac `_lastSid` i `_lastTrep`.

---

## 4. Keep Alive 80 sekund

**Plik:** `DddSession.cs` linia 34

Zmienic:
```csharp
TimeSpan.FromSeconds(70) -> TimeSpan.FromSeconds(80)
```

---

## 5. Weryfikacja CRC + RepeatRequest

**Plik:** `Codec12Parser.cs`

Zmodyfikowac `Parse()` aby weryfikowal CRC odebranej ramki i zwracal informacje o bledzie CRC (np. nowy typ `Codec12ParseResult` z flagami `Success`, `CrcError`).

**Plik:** `DddSession.cs`

W petli parsowania ramek: jesli CRC sie nie zgadza, wyslac pakiet RepeatRequest (0x00) zamiast przetwarzac ramke. Dodac licznik powtorzen (max 3), po przekroczeniu -- logowac blad i kontynuowac.

### Szczegoly techniczne

Nowa struktura:
```csharp
public record Codec12ParseResult(Codec12Frame? Frame, bool CrcError, int ConsumedBytes);
```

Nowa metoda w `Codec12Parser`:
```csharp
public static Codec12ParseResult ParseWithCrc(byte[] buffer, int length)
```

---

## 6. Obsluga APDU w stanie WaitingForDownloadListAck

**Plik:** `DddSession.cs` -- metoda `HandleDownloadListAck()`

Wg specyfikacji (str. 20): jesli VU odpowiada na Download List pakietem APDU (0x12), serwer musi przekazac go do karty i odeslac odpowiedz. Dotyczy rowniez pakietow 0x20 z danymi APDU (starsze firmware FM64 00.03.73-00.03.79).

Dodac:
```csharp
if (type == DddPacketType.APDU || (type == DddPacketType.DownloadList && data.Length > 0 && /* check if APDU data */))
{
    byte[] cardResponse = await _bridge.TransmitApduAsync(data);
    await SendDddPacketAsync(stream, DddPacketType.APDU, cardResponse);
    // Zostajemy w stanie WaitingForDownloadListAck
}
```

---

## 7. Laczenie plikow VU w jeden DDD (opcjonalne)

**Plik:** `DddSession.cs`

Po pobraniu wszystkich plikow (przed `SendTerminateAsync`), dodac metode `MergeVuFiles()`:
- Laczy pliki VU w kolejnosci: Overview, Activities, Events, Speed, Technical do jednego `{IMEI}_vu_{timestamp}.ddd`
- Karty kierowcow (DriverCard1, DriverCard2) zapisywane osobno -- bez zmian
- Zachowuje tez osobne pliki jako backup

Potrzebna zmiana: zamiast czyscic `_fileBuffer` po kazdym pliku, zapisywac dane do slownika `Dictionary<DddFileType, byte[]> _downloadedFiles` i dopiero na koniec zapisywac/laczyc.

---

## 8. Resume State -- logika wznawiania sesji (opcjonalne)

**Plik:** `DddSession.cs` -- metoda `HandleStatusPacket()`

Wg specyfikacji (str. 15-16, Tabela 12):
- Bit 0/1: resume od autentykacji (ATR) -- obecne zachowanie
- Bit 2: resume od Download List -- pominac autentykacje
- Bit 3: resume od File Request -- pominac autentykacje i Download List
- Bit 4: resume od ostatniego transferu -- wyslac ACK/retry

Dodac logike:
```csharp
byte resumeBits = (byte)(_resumeState & 0x1F); // bity 0-4

if ((resumeBits & 0x10) != 0)      // bit 4 -- resume od transferu
    await ResumeFromLastTransfer(stream);
else if ((resumeBits & 0x08) != 0)  // bit 3 -- resume od file request
    await ResumeFromFileRequest(stream);
else if ((resumeBits & 0x04) != 0)  // bit 2 -- resume od download list
    await StartDownloadListAsync(stream);
else                                 // bit 0/1 -- od poczatku
    await StartAuthenticationAsync(stream);
```

Nowe metody:
- `ResumeFromFileRequest()` -- przeskakuje do `RequestNextFileAsync()` z zachowanym stanem
- `ResumeFromLastTransfer()` -- wysyla ACK z numerem sekwencji z pakietu STATUS

**Plik:** `SessionState.cs`

Dodac stan `ResumingDownload` (opcjonalnie, mozna tez uzyc istniejacych stanow).

---

## 9. Poprawka parsowania STATUS

**Plik:** `DddSession.cs` -- metoda `HandleStatusPacket()`

Obecne parsowanie offsetow moze byc bledne. Wg specyfikacji (str. 15):
```text
PayloadData = "STATUS"(6B) + ResumeState(1B) + SequenceNumber(4B) + Features(1B)
```
Total = 12 bajtow. Wiec:
- `data[0..5]` = "STATUS" (ASCII, ignorowac)
- `data[6]` = Resume State
- `data[7..10]` = Sequence Number (4B)
- `data[11]` = Features

Kod ma `_resumeState = data[6]` (OK) i `_features = data[11]` (OK, ale pod warunkiem `data.Length >= 12`).

Dodac parsowanie Sequence Number i zapisac do nowego pola `_lastSequenceNumber` -- potrzebne do Resume State.

---

## Podsumowanie plikow do edycji

| Plik | Zmiany |
|------|--------|
| `csharp/TachoDddServer/Session/DddSession.cs` | Poprawki 1-3, 5-9 |
| `csharp/TachoDddServer/Protocol/Codec12Parser.cs` | Poprawka 5 (CRC + ParseResult) |
| `csharp/TachoDddServer/Session/SessionState.cs` | Ewentualnie nowy stan |
| `csharp/README.md` | Aktualizacja dokumentacji |

## Kolejnosc implementacji

1. Codec12Parser -- CRC weryfikacja + nowy ParseResult
2. DddSession -- BuildDownloadListPayload (format + kody Gen1)
3. DddSession -- dynamiczny SID/TREP
4. DddSession -- Keep Alive 80s
5. DddSession -- APDU w WaitingForDownloadListAck
6. DddSession -- Resume State
7. DddSession -- laczenie plikow VU
8. README -- aktualizacja dokumentacji

