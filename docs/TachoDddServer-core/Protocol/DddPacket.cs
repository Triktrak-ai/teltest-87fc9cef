namespace TachoDddServer.Protocol;

/// <summary>
/// DDD packet inside Codec 12 payload.
/// Format: PayloadType (1 byte) + PayloadData (N bytes).
/// PayloadLength is already handled by the Codec 12 wrapper.
/// </summary>
public static class DddPacket
{
    /// <summary>
    /// Build a DDD payload: [type][data...]
    /// </summary>
    public static byte[] Build(DddPacketType type, byte[]? data = null)
    {
        data ??= Array.Empty<byte>();
        var packet = new byte[1 + data.Length];
        packet[0] = (byte)type;
        Array.Copy(data, 0, packet, 1, data.Length);
        return packet;
    }

    /// <summary>
    /// Parse a Codec 12 command payload into (type, data).
    /// </summary>
    public static (DddPacketType type, byte[] data)? Parse(byte[] payload)
    {
        if (payload.Length < 1) return null;

        var type = (DddPacketType)payload[0];
        var data = new byte[payload.Length - 1];
        if (data.Length > 0)
            Array.Copy(payload, 1, data, 0, data.Length);

        return (type, data);
    }
}
