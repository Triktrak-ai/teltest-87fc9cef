namespace TachoDddServer.Session;

public enum SessionState
{
    WaitingForImei,
    WaitingForStatus,
    RequestingDriverInfo,
    SendingATR,
    ApduLoop,
    CheckingInterfaceVersion,
    SendingDownloadList,
    WaitingForDownloadListAck,
    RequestingFile,
    DownloadingFile,
    Complete,
    Error
}
