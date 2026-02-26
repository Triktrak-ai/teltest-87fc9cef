using Microsoft.Extensions.Logging;

namespace TachoDddServer.Logging;

/// <summary>
/// Logs all raw TCP traffic (IN/OUT) with timestamps to a daily log file.
/// </summary>
public class TrafficLogger : IDisposable
{
    private readonly StreamWriter _writer;
    private readonly object _lock = new();
    private readonly ILogger _logger;

    public TrafficLogger(string logDir, string sessionId, ILogger logger)
    {
        _logger = logger;
        Directory.CreateDirectory(logDir);

        var fileName = $"traffic_{sessionId}_{DateTime.Now:yyyyMMdd_HHmmss}.log";
        var filePath = Path.Combine(logDir, fileName);

        _writer = new StreamWriter(filePath, append: false) { AutoFlush = true };
        _logger.LogInformation("📝 Traffic log: {Path}", filePath);

        WriteHeader();
    }

    private void WriteHeader()
    {
        _writer.WriteLine("=== TachoDDD Traffic Log ===");
        _writer.WriteLine($"=== Started: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} ===");
        _writer.WriteLine();
    }

    public void LogIncoming(byte[] data, int length)
    {
        Log("IN ", data, length);
    }

    public void LogOutgoing(byte[] data, int length)
    {
        Log("OUT", data, length);
    }

    public void LogOutgoing(byte[] data)
    {
        Log("OUT", data, data.Length);
    }

    public void LogEvent(string message)
    {
        lock (_lock)
        {
            _writer.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] --- {message}");
        }
    }

    private void Log(string direction, byte[] data, int length)
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
        var hex = BitConverter.ToString(data, 0, length);

        lock (_lock)
        {
            _writer.WriteLine($"[{timestamp}] {direction} ({length}B): {hex}");
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _writer.WriteLine();
            _writer.WriteLine($"=== Ended: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} ===");
            _writer.Dispose();
        }
    }
}
