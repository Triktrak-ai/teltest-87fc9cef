namespace TachoDddServer.Protocol;

public static class DddPacket
{
    public static byte[] Build(DddPacketType type, byte[] data)
    {
        var packet = new byte[3 + data.Length];
        packet[0] = (byte)type;
        packet[1] = (byte)(data.Length >> 8);
        packet[2] = (byte)(data.Length);
        Array.Copy(data, 0, packet, 3, data.Length);
        return packet;
    }

    public static (DddPacketType type, byte[] data)? Parse(byte[] payload)
    {
        if (payload.Length < 3) return null;

        var type = (DddPacketType)payload[0];
        int len = (payload[1] << 8) | payload[2];

        if (payload.Length < 3 + len) return null;

        var data = new byte[len];
        Array.Copy(payload, 3, data, 0, len);

        return (type, data);
    }
}
