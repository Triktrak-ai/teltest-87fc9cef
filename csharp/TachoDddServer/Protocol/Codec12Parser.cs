namespace TachoDddServer.Protocol;

/// <summary>
/// Result of parsing a Codec 12 frame with CRC verification.
/// </summary>
public record Codec12ParseResult(Codec12Frame? Frame, bool CrcError, int ConsumedBytes);

public static class Codec12Parser
{
    /// <summary>
    /// Parse without CRC check (legacy, kept for backward compat).
    /// </summary>
    public static Codec12Frame? Parse(byte[] buffer, int length)
    {
        var result = ParseWithCrc(buffer, length);
        return result.Frame;
    }

    /// <summary>
    /// Parse a Codec 12 frame with CRC verification.
    /// Returns Frame, CrcError flag, and number of consumed bytes.
    /// </summary>
    public static Codec12ParseResult ParseWithCrc(byte[] buffer, int length)
    {
        if (length < 17)
            return new Codec12ParseResult(null, false, 0);

        if (buffer[0] != 0 || buffer[1] != 0 || buffer[2] != 0 || buffer[3] != 0)
            return new Codec12ParseResult(null, false, 0);

        int dataLen = (buffer[4] << 24) | (buffer[5] << 16) | (buffer[6] << 8) | buffer[7];
        int totalLen = 8 + dataLen + 4;

        if (length < totalLen)
            return new Codec12ParseResult(null, false, 0);

        byte codecId = buffer[8];
        if (codecId != 0x0C)
            return new Codec12ParseResult(null, false, 0);

        // Verify CRC (device frames may encode CRC bytes as LE on wire)
        ushort receivedCrcBe = (ushort)((buffer[8 + dataLen + 2] << 8) | buffer[8 + dataLen + 3]);
        ushort receivedCrcLe = (ushort)((buffer[8 + dataLen + 3] << 8) | buffer[8 + dataLen + 2]);
        ushort calculatedCrc = Crc16(buffer, 8, dataLen);

        if (receivedCrcBe != calculatedCrc && receivedCrcLe != calculatedCrc)
            return new Codec12ParseResult(null, true, totalLen);

        // Parse payload
        byte qty1 = buffer[9];
        byte type = buffer[10];
        int cmdSize = (buffer[11] << 24) | (buffer[12] << 16) | (buffer[13] << 8) | buffer[14];

        byte[] cmdData = new byte[cmdSize];
        Array.Copy(buffer, 15, cmdData, 0, cmdSize);

        return new Codec12ParseResult(new Codec12Frame(type, cmdData), false, totalLen);
    }

    public static byte[] Build(byte[] commandData)
    {
        int cmdLen = commandData.Length;
        int dataLen = 1 + 1 + 1 + 4 + cmdLen + 1;

        var frame = new byte[4 + 4 + dataLen + 4];

        frame[4] = (byte)(dataLen >> 24);
        frame[5] = (byte)(dataLen >> 16);
        frame[6] = (byte)(dataLen >> 8);
        frame[7] = (byte)(dataLen);

        frame[8] = 0x0C;  // Codec ID
        frame[9] = 0x01;  // NOD
        frame[10] = 0x10; // CMD type: DDD packet
        frame[11] = (byte)(cmdLen >> 24);
        frame[12] = (byte)(cmdLen >> 16);
        frame[13] = (byte)(cmdLen >> 8);
        frame[14] = (byte)(cmdLen);

        Array.Copy(commandData, 0, frame, 15, cmdLen);

        frame[15 + cmdLen] = 0x01;

        ushort crc = Crc16(frame, 8, dataLen);
        int crcPos = 8 + dataLen;
        frame[crcPos] = 0;
        frame[crcPos + 1] = 0;
        // CRC bytes on wire: big-endian (high byte first)
        frame[crcPos + 2] = (byte)(crc >> 8);
        frame[crcPos + 3] = (byte)(crc);

        return frame;
    }

    /// <summary>
    /// CRC-16/IBM (reflected) as used by Teltonika Codec 12.
    /// Polynomial: 0xA001 (reflected form of 0x8005), Init: 0x0000.
    /// </summary>
    private static ushort Crc16(byte[] data, int offset, int length)
    {
        ushort crc = 0;
        for (int i = offset; i < offset + length; i++)
        {
            crc ^= data[i];
            for (int j = 0; j < 8; j++)
            {
                if ((crc & 0x0001) != 0)
                    crc = (ushort)((crc >> 1) ^ 0xA001);
                else
                    crc >>= 1;
            }
        }
        return crc;
    }
}
