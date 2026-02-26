namespace TachoDddServer.Protocol;

public static class Codec12Parser
{
    public static Codec12Frame? Parse(byte[] buffer, int length)
    {
        if (length < 17) return null;

        if (buffer[0] != 0 || buffer[1] != 0 || buffer[2] != 0 || buffer[3] != 0)
            return null;

        int dataLen = (buffer[4] << 24) | (buffer[5] << 16) | (buffer[6] << 8) | buffer[7];

        if (length < 8 + dataLen + 4) return null;

        byte codecId = buffer[8];
        if (codecId != 0x0C) return null;

        byte qty1 = buffer[9];
        byte type = buffer[10];
        int cmdSize = (buffer[11] << 24) | (buffer[12] << 16) | (buffer[13] << 8) | buffer[14];

        byte[] cmdData = new byte[cmdSize];
        Array.Copy(buffer, 15, cmdData, 0, cmdSize);

        return new Codec12Frame(type, cmdData);
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
        frame[crcPos + 2] = (byte)(crc >> 8);
        frame[crcPos + 3] = (byte)(crc);

        return frame;
    }

    private static ushort Crc16(byte[] data, int offset, int length)
    {
        ushort crc = 0;
        for (int i = offset; i < offset + length; i++)
        {
            crc ^= (ushort)(data[i] << 8);
            for (int j = 0; j < 8; j++)
            {
                if ((crc & 0x8000) != 0)
                    crc = (ushort)((crc << 1) ^ 0x8005);
                else
                    crc <<= 1;
            }
        }
        return crc;
    }
}
