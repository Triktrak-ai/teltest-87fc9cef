namespace TachoDddServer.Protocol;

/// <summary>
/// Payload types for Teltonika DDD protocol (Codec 12).
/// Direction comments: FM = device, SRV = server.
/// </summary>
public enum DddPacketType : byte
{
    // --- Bidirectional ---
    Status          = 0x01,   // FM->SRV (status report) / SRV->FM (status request)
    APDU            = 0x12,   // FM->SRV (APDU from VU) / SRV->FM (APDU to VU)
    DownloadList    = 0x20,   // SRV->FM (download list request) / FM->SRV (download list ACK)
    FileData        = 0x31,   // FM->SRV (file data chunk) / SRV->FM (file data ACK)
    DriverInfo      = 0x46,   // SRV->FM (request) / FM->SRV (response)
    SystemIO        = 0x47,   // SRV->FM (request) / FM->SRV (response)

    // --- FM -> Server only ---
    RepeatRequest   = 0x00,   // FM asks server to repeat last packet
    ATR             = 0x10,   // SRV->FM (send ATR to device)
    VUReadyAPDU     = 0x11,   // FM->SRV (VU ready + first APDU)
    AuthOK          = 0x13,   // FM->SRV (authentication succeeded)
    KeepAlive       = 0xEF,   // FM->SRV (keep connection alive)
    Error           = 0xF0,   // FM->SRV (error report)

    // --- Server -> FM only ---
    FileRequest     = 0x30,   // SRV->FM (request specific file)
    FileDataEOF     = 0x32,   // FM->SRV (last chunk + end of file)
    WaitRequest     = 0x91,   // SRV->FM (ask device to wait N minutes)
    Terminate       = 0xE0,   // SRV->FM (terminate session)
}
