namespace TachoDddServer.Session;

/// <summary>
/// File types available for download from VU.
/// TRTP values differ per generation.
/// </summary>
public enum DddFileType : byte
{
    InterfaceVersion = 0x00,
    Overview         = 0x01,
    Activities       = 0x02,
    EventsAndFaults  = 0x03,
    DetailedSpeed    = 0x04,
    TechnicalData    = 0x05,
    DriverCard1      = 0x06,  // slot 01
    DriverCard2      = 0x07,  // slot 02 (internal, mapped to 0x06 + data 0x02)
}
