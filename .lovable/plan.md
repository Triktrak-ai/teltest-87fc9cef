

## Problem: Serwer wysyla CRC w zlym porzadku bajtow

### Diagnoza

Z traffic logu widac dokladnie:
- Urzadzenie wysyla KeepAlive z CRC: `3D 59` (big-endian: high byte first)  
- Serwer wysyla KeepAlive z CRC: `59 3D` (little-endian: low byte first)

Ostatnia poprawka zmieniła `Build()` na little-endian, ale urządzenie oczekuje big-endian. Dlatego urzadzenie ignoruje ramki od serwera (ATR, KeepAlive) i nie przechodzi do wymiany APDU.

### Zmiana

**Plik: `csharp/TachoDddServer/Protocol/Codec12Parser.cs`** (linie 88-90)

Zmiana kolejnosci bajtow CRC w `Build()` z powrotem na big-endian:

```text
Bylo (LE - bledne):
  frame[crcPos + 2] = (byte)(crc);        // low byte
  frame[crcPos + 3] = (byte)(crc >> 8);   // high byte

Bedzie (BE - poprawne):
  frame[crcPos + 2] = (byte)(crc >> 8);   // high byte
  frame[crcPos + 3] = (byte)(crc);        // low byte
```

Parsowanie przychodzacych ramek (akceptujace oba formaty BE/LE) pozostaje bez zmian — to dziala poprawnie.

### Spodziewany rezultat

Po tej zmianie urzadzenie powinno zaakceptowac ramke ATR i odpowiedziec pakietem VUReadyAPDU (0x11), co pozwoli przejsc do pelnej wymiany APDU i pobierania plikow DDD.

