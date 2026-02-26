namespace TachoDddServer.Session;

public enum SessionState
{
    WaitingForImei,
    WaitingForStatus,
    RequestingDriverInfo,
    ApduLoop,
    CheckingInterfaceVersion,
    WaitingForDownloadListAck,
    DownloadingFile,
    Complete,
    Error
}
