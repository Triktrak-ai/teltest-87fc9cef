using System.Text;

namespace TachoDddServer.Logging;

public class TrafficLogger : IDisposable
{
    private readonly StreamWriter _writer;
    private readonly object _lock = new();

    public TrafficLogger(string logDir, string sessionId)
    {
        Directory.CreateDirectory(logDir);
        var fileName = $"traffic_{DateTime.Now:yyyyMMdd_HHmmss}_{sessionId}.log";
        var path = Path.Combine(logDir, fileName);
        _writer = new StreamWriter(path, append: true) { AutoFlush = true };
        _writer.WriteLine($"=== Sesja rozpoczęta: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} ===");
    }

    public void Log(string direction, byte[] data, int length)
    {
        var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var hex = ToHexDump(data, length);
        var line = $"[{timestamp}] {direction} {length}B: {hex}";

        lock (_lock)
        {
            _writer.WriteLine(line);
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
            _writer.WriteLine($"=== Sesja zakończona: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} ===");
            _writer.Dispose();
        }
    }
}
