using System.Text;
using TachoDddServer.Session;

namespace TachoDddServer.Logging;

public class TrafficLogger : IDisposable
{
    private readonly StreamWriter _writer;
    private readonly object _lock = new();

    public TrafficLogger(string logDir, string sessionId)
    {
        Directory.CreateDirectory(logDir);
        var fileName = $"traffic_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{sessionId}.log";
        var path = Path.Combine(logDir, fileName);
        _writer = new StreamWriter(path, append: true) { AutoFlush = true };
        _writer.WriteLine($"=== Sesja rozpoczęta: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss.fff} UTC ===");
    }

    /// <summary>
    /// Log raw bytes (hex dump).
    /// </summary>
    public void Log(string direction, byte[] data, int length)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var hex = ToHexDump(data, Math.Min(length, 64)); // max 64 bytes in raw dump
        var suffix = length > 64 ? $" ... (+{length - 64}B)" : "";
        var line = $"[{timestamp}] {direction} {length}B: {hex}{suffix}";

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    /// <summary>
    /// Log a decoded DDD packet with type name, size and contextual comment.
    /// </summary>
    public void LogDecoded(string direction, string packetTypeName, int dataLen, string comment)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var line = $"[{timestamp}] {direction} DDD [{packetTypeName}] {dataLen}B — {comment}";

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    /// <summary>
    /// Log a decoded DDD packet with hex preview of first N bytes.
    /// </summary>
    public void LogDecodedWithHex(string direction, string packetTypeName, byte[] data, int maxHexBytes, string comment)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var hex = ToHexDump(data, Math.Min(data.Length, maxHexBytes));
        var suffix = data.Length > maxHexBytes ? $" ... (+{data.Length - maxHexBytes}B)" : "";
        var line = $"[{timestamp}] {direction} DDD [{packetTypeName}] {data.Length}B — {comment} | {hex}{suffix}";

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    /// <summary>
    /// Log a state transition.
    /// </summary>
    public void LogStateChange(SessionState from, SessionState to, string reason)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var line = $"[{timestamp}] STATE {from} -> {to} [{reason}]";

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    /// <summary>
    /// Log an error with context.
    /// </summary>
    public void LogError(string context, string message)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var line = $"[{timestamp}] ERROR [{context}] {message}";

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    /// <summary>
    /// Log an error with exception details.
    /// </summary>
    public void LogError(string context, Exception ex)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var line = $"[{timestamp}] ERROR [{context}] {ex.GetType().Name}: {ex.Message}";

        lock (_lock)
        {
            _writer.WriteLine(line);
            // Write first 5 lines of stack trace
            if (ex.StackTrace != null)
            {
                var stackLines = ex.StackTrace.Split('\n').Take(5);
                foreach (var sl in stackLines)
                    _writer.WriteLine($"             {sl.TrimEnd()}");
            }
        }
    }

    /// <summary>
    /// Log a warning.
    /// </summary>
    public void LogWarning(string message)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var line = $"[{timestamp}] WARN {message}";

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    /// <summary>
    /// Write session summary to traffic log file.
    /// </summary>
    public void LogSummary(string summary)
    {
        lock (_lock)
        {
            _writer.WriteLine();
            _writer.WriteLine(summary);
        }
    }

    private static string ToHexDump(byte[] data, int length)
    {
        var sb = new StringBuilder(length * 3);
        for (int i = 0; i < length; i++)
        {
            if (i > 0) sb.Append(' ');
            sb.Append(data[i].ToString("X2"));
        }
        return sb.ToString();
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _writer.WriteLine($"=== Sesja zakończona: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss.fff} UTC ===");
            _writer.Dispose();
        }
    }
}
