namespace TachoDddServer.Protocol;

public enum DddPacketType : byte
{
    Status = 0x01,
    SendATR = 0x10,
    ATRResponse = 0x10,
    SendAPDU = 0x11,
    APDUResponse = 0x12,
    AuthOK = 0x13,
    FileData = 0x14,
    Error = 0xFF
}
