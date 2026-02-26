namespace TachoDddServer.Session;

public enum SessionState
{
    WaitingForStatus,
    SendingATR,
    WaitingForATR,
    ApduLoop,
    Downloading,
    Complete,
    Error
}
