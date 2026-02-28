using System.Diagnostics;
using System.Text;
using System.Text.Json;
using TachoDddServer.Session;

namespace TachoDddServer.Logging;

public class SessionDiagnostics
{
    public string SessionId { get; }
    public string Endpoint { get; }
    public string Imei { get; set; } = "";
    public DateTime StartTime { get; } = DateTime.UtcNow;
    public DateTime? EndTime { get; private set; }
    public VuGeneration Generation { get; set; } = VuGeneration.Unknown;
    public string CardGeneration { get; set; } = "Unknown";
    public string DetectedVuGenFromApdu { get; set; } = "Unknown";

    // Card probe diagnostics
    public CardProbeResult? CardProbe { get; set; }

    // Counters
    public long BytesSent { get; set; }
    public long BytesReceived { get; set; }
    public int ApduExchanges { get; set; }
    public int CrcErrors { get; set; }
    public int PacketsSent { get; set; }
    public int PacketsReceived { get; set; }

    // State transitions
    private readonly List<StateTransitionEntry> _stateTransitions = new();
    public IReadOnlyList<StateTransitionEntry> StateTransitions => _stateTransitions;

    // Packets
    private readonly List<PacketLogEntry> _packetLog = new();
    public IReadOnlyList<PacketLogEntry> PacketLog => _packetLog;

    // Errors
    private readonly List<ErrorEntry> _errors = new();
    public IReadOnlyList<ErrorEntry> Errors => _errors;

    // Warnings
    private readonly List<WarningEntry> _warnings = new();
    public IReadOnlyList<WarningEntry> Warnings => _warnings;

    // File downloads
    private readonly List<FileDownloadEntry> _fileDownloads = new();
    public IReadOnlyList<FileDownloadEntry> FileDownloads => _fileDownloads;

    // Active file stopwatch
    private readonly Stopwatch _fileStopwatch = new();
    private DddFileType? _currentFileBeingTimed;

    private readonly object _lock = new();

    public SessionDiagnostics(string endpoint, string? sessionId = null)
    {
        SessionId = sessionId ?? Guid.NewGuid().ToString();
        Endpoint = endpoint;
    }

    public void LogStateTransition(SessionState from, SessionState to, string reason)
    {
        lock (_lock)
        {
            _stateTransitions.Add(new StateTransitionEntry(DateTime.UtcNow, from, to, reason));
        }
    }

    public void LogPacket(string direction, byte type, int size, string details)
    {
        lock (_lock)
        {
            if (direction == "TX") PacketsSent++;
            else PacketsReceived++;
            _packetLog.Add(new PacketLogEntry(DateTime.UtcNow, direction, type, size, details));
        }
    }

    public void LogError(string context, Exception ex)
    {
        lock (_lock)
        {
            _errors.Add(new ErrorEntry(DateTime.UtcNow, context, ex.Message, ex.StackTrace));
        }
    }

    public void LogError(string context, string message)
    {
        lock (_lock)
        {
            _errors.Add(new ErrorEntry(DateTime.UtcNow, context, message, null));
        }
    }

    public void LogWarning(string message)
    {
        lock (_lock)
        {
            _warnings.Add(new WarningEntry(DateTime.UtcNow, message));
        }
    }

    public void StartFileTimer(DddFileType fileType)
    {
        _currentFileBeingTimed = fileType;
        _fileStopwatch.Restart();
    }

    public void StopFileTimer(DddFileType fileType, int sizeBytes, bool success, string? error = null)
    {
        _fileStopwatch.Stop();
        var duration = _fileStopwatch.Elapsed;
        lock (_lock)
        {
            _fileDownloads.Add(new FileDownloadEntry(fileType, sizeBytes, duration, success, error));
        }
        _currentFileBeingTimed = null;
    }

    public void Finish()
    {
        EndTime = DateTime.UtcNow;
    }

    public string GenerateSummary()
    {
        var duration = (EndTime ?? DateTime.UtcNow) - StartTime;
        var sb = new StringBuilder();

        sb.AppendLine("╔══════════════════════════════════════════════════════════╗");
        sb.AppendLine("║              SESSION DIAGNOSTIC SUMMARY                 ║");
        sb.AppendLine("╚══════════════════════════════════════════════════════════╝");
        sb.AppendLine($"  SessionId:   {SessionId}");
        sb.AppendLine($"  IMEI:        {(string.IsNullOrEmpty(Imei) ? "(not received)" : Imei)}");
        sb.AppendLine($"  Endpoint:    {Endpoint}");
        sb.AppendLine($"  Generation:  {Generation}");
        sb.AppendLine($"  Card Gen:    {CardGeneration}");
        sb.AppendLine($"  VU Gen APDU: {DetectedVuGenFromApdu}");
        sb.AppendLine($"  Start:       {StartTime:yyyy-MM-dd HH:mm:ss.fff} UTC");
        sb.AppendLine($"  End:         {EndTime?.ToString("yyyy-MM-dd HH:mm:ss.fff") ?? "(still running)"} UTC");
        sb.AppendLine($"  Duration:    {FormatDuration(duration)}");
        sb.AppendLine();

        // Card probe
        if (CardProbe != null)
        {
            sb.AppendLine("── Card Probe (EF_ICC) ─────────────────────────────────────");
            sb.AppendLine($"  SELECT MF:       SW={CardProbe.SelectMfSw}");
            sb.AppendLine($"  SELECT DF 0007:  SW={CardProbe.SelectDfSw}");
            sb.AppendLine($"  SELECT EF_ICC:   SW={CardProbe.SelectEfIccSw}");
            sb.AppendLine($"  READ BINARY:     SW={CardProbe.ReadBinarySw} ({CardProbe.ReadBinaryLen}B)");
            if (CardProbe.EfIccHex != null)
                sb.AppendLine($"  EF_ICC data:     {CardProbe.EfIccHex}");
            sb.AppendLine($"  Gen byte @25:    0x{CardProbe.GenByte:X2} → {CardProbe.Result}");
            if (CardProbe.Error != null)
                sb.AppendLine($"  Probe error:     {CardProbe.Error}");
            sb.AppendLine();
        }

        // State flow
        sb.AppendLine("── State Flow ──────────────────────────────────────────────");
        foreach (var st in _stateTransitions)
        {
            var offset = (st.Timestamp - StartTime).TotalSeconds;
            sb.AppendLine($"  [{offset,8:F3}s] {st.From} -> {st.To} [{st.Reason}]");
        }
        sb.AppendLine();

        // File downloads
        sb.AppendLine("── File Downloads ──────────────────────────────────────────");
        int successCount = 0;
        foreach (var fd in _fileDownloads)
        {
            string status = fd.Success ? "✓" : "✗";
            double kbps = fd.Duration.TotalSeconds > 0 ? (fd.SizeBytes / 1024.0) / fd.Duration.TotalSeconds : 0;
            sb.AppendLine($"  {status} {fd.FileType,-20} {fd.SizeBytes,8}B  {fd.Duration.TotalSeconds,6:F1}s  ({kbps:F1} KB/s){(fd.Error != null ? $"  ERR: {fd.Error}" : "")}");
            if (fd.Success) successCount++;
        }
        sb.AppendLine($"  Total: {successCount}/{_fileDownloads.Count} successful");
        sb.AppendLine();

        // Counters
        sb.AppendLine("── Counters ────────────────────────────────────────────────");
        sb.AppendLine($"  Packets TX:       {PacketsSent}");
        sb.AppendLine($"  Packets RX:       {PacketsReceived}");
        sb.AppendLine($"  Bytes TX:         {BytesSent:N0}");
        sb.AppendLine($"  Bytes RX:         {BytesReceived:N0}");
        sb.AppendLine($"  APDU exchanges:   {ApduExchanges}");
        sb.AppendLine($"  CRC errors:       {CrcErrors}");
        sb.AppendLine();

        // Errors
        if (_errors.Count > 0)
        {
            sb.AppendLine("── Errors ──────────────────────────────────────────────────");
            foreach (var err in _errors)
            {
                var offset = (err.Timestamp - StartTime).TotalSeconds;
                sb.AppendLine($"  [{offset,8:F3}s] [{err.Context}] {err.Message}");
                if (err.StackTrace != null)
                {
                    // First 3 lines of stack trace
                    var lines = err.StackTrace.Split('\n').Take(3);
                    foreach (var line in lines)
                        sb.AppendLine($"             {line.TrimEnd()}");
                }
            }
            sb.AppendLine();
        }

        // Warnings
        if (_warnings.Count > 0)
        {
            sb.AppendLine("── Warnings ────────────────────────────────────────────────");
            foreach (var w in _warnings)
            {
                var offset = (w.Timestamp - StartTime).TotalSeconds;
                sb.AppendLine($"  [{offset,8:F3}s] {w.Message}");
            }
            sb.AppendLine();
        }

        sb.AppendLine($"  Total errors:   {_errors.Count}");
        sb.AppendLine($"  Total warnings: {_warnings.Count}");

        return sb.ToString();
    }

    public void SaveToFile(string directory)
    {
        try
        {
            Directory.CreateDirectory(directory);
            var timestamp = StartTime.ToString("yyyyMMdd_HHmmss");
            var baseName = $"session_{timestamp}_{SessionId}";

            // Save text summary
            var txtPath = Path.Combine(directory, $"{baseName}.txt");
            File.WriteAllText(txtPath, GenerateSummary());

            // Save JSON
            var jsonPath = Path.Combine(directory, $"{baseName}.json");
            var jsonData = new
            {
                sessionId = SessionId,
                imei = Imei,
                endpoint = Endpoint,
                generation = Generation.ToString(),
                cardGeneration = CardGeneration,
                detectedVuGenFromApdu = DetectedVuGenFromApdu,
                cardProbe = CardProbe != null ? new
                {
                    selectMfSw = CardProbe.SelectMfSw,
                    selectDfSw = CardProbe.SelectDfSw,
                    selectEfIccSw = CardProbe.SelectEfIccSw,
                    readBinarySw = CardProbe.ReadBinarySw,
                    readBinaryLen = CardProbe.ReadBinaryLen,
                    efIccHex = CardProbe.EfIccHex,
                    genByte = CardProbe.GenByte,
                    result = CardProbe.Result,
                    error = CardProbe.Error
                } : null,
                startTime = StartTime,
                endTime = EndTime,
                durationSeconds = ((EndTime ?? DateTime.UtcNow) - StartTime).TotalSeconds,
                counters = new
                {
                    packetsSent = PacketsSent,
                    packetsReceived = PacketsReceived,
                    bytesSent = BytesSent,
                    bytesReceived = BytesReceived,
                    apduExchanges = ApduExchanges,
                    crcErrors = CrcErrors,
                },
                stateTransitions = _stateTransitions.Select(s => new
                {
                    timestamp = s.Timestamp,
                    from = s.From.ToString(),
                    to = s.To.ToString(),
                    reason = s.Reason
                }),
                fileDownloads = _fileDownloads.Select(f => new
                {
                    fileType = f.FileType.ToString(),
                    sizeBytes = f.SizeBytes,
                    durationMs = f.Duration.TotalMilliseconds,
                    success = f.Success,
                    error = f.Error
                }),
                errors = _errors.Select(e => new
                {
                    timestamp = e.Timestamp,
                    context = e.Context,
                    message = e.Message,
                    stackTrace = e.StackTrace
                }),
                warnings = _warnings.Select(w => new
                {
                    timestamp = w.Timestamp,
                    message = w.Message
                })
            };
            File.WriteAllText(jsonPath, JsonSerializer.Serialize(jsonData, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Don't let diagnostics saving crash the session
        }
    }

    private static string FormatDuration(TimeSpan ts)
    {
        if (ts.TotalMinutes >= 1)
            return $"{(int)ts.TotalMinutes}m {ts.Seconds}s";
        return $"{ts.TotalSeconds:F1}s";
    }

    // ─── Entry types ─────────────────────────────────────────────────

    public record StateTransitionEntry(DateTime Timestamp, SessionState From, SessionState To, string Reason);
    public record PacketLogEntry(DateTime Timestamp, string Direction, byte Type, int Size, string Details);
    public record ErrorEntry(DateTime Timestamp, string Context, string Message, string? StackTrace);
    public record WarningEntry(DateTime Timestamp, string Message);
    public record FileDownloadEntry(DddFileType FileType, int SizeBytes, TimeSpan Duration, bool Success, string? Error);

    public class CardProbeResult
    {
        public string SelectMfSw { get; set; } = "-";
        public string SelectDfSw { get; set; } = "-";
        public string SelectEfIccSw { get; set; } = "-";
        public string ReadBinarySw { get; set; } = "-";
        public int ReadBinaryLen { get; set; }
        public string? EfIccHex { get; set; }
        public byte GenByte { get; set; }
        public string Result { get; set; } = "Unknown";
        public string? Error { get; set; }
    }
}
