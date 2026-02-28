namespace TachoWebApi.Services;

public class FileStorageService
{
    private readonly string _basePath;

    public FileStorageService(IConfiguration config)
    {
        _basePath = config["FileStorage:SessionLogsDir"] ?? @"C:\TachoDDD\SessionLogs";
        Directory.CreateDirectory(_basePath);
    }

    public async Task<string> SaveFileAsync(string sessionId, string fileName, Stream content)
    {
        var dir = Path.Combine(_basePath, sessionId);
        Directory.CreateDirectory(dir);
        var filePath = Path.Combine(dir, fileName);
        await using var fs = File.Create(filePath);
        await content.CopyToAsync(fs);
        return filePath;
    }

    public string? GetFilePath(string sessionId, string fileName)
    {
        var path = Path.Combine(_basePath, sessionId, fileName);
        return File.Exists(path) ? path : null;
    }
}
