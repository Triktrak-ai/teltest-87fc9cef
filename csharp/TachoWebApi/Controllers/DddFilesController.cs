using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/ddd-files")]
[Authorize]
public class DddFilesController : ControllerBase
{
    private readonly string _dddDir;

    public DddFilesController(IConfiguration config)
    {
        _dddDir = config["FileStorage:DddFilesDir"] ?? @"C:\TachoDDD\Downloads";
    }

    /// <summary>
    /// Lists DDD files for a given IMEI within a time window (based on file LastWriteTimeUtc).
    /// GET /api/ddd-files/{imei}?after=2026-01-01T00:00:00Z&before=2026-12-31T23:59:59Z
    /// </summary>
    [HttpGet("{imei}")]
    public IActionResult ListFiles(string imei, [FromQuery] string? after, [FromQuery] string? before)
    {
        var dir = Path.Combine(_dddDir, imei);
        if (!Directory.Exists(dir))
            return Ok(Array.Empty<object>());

        var afterDt = DateTime.TryParse(after, null, System.Globalization.DateTimeStyles.RoundtripKind, out var a)
            ? a.ToUniversalTime()
            : DateTime.MinValue;

        var beforeDt = DateTime.TryParse(before, null, System.Globalization.DateTimeStyles.RoundtripKind, out var b)
            ? b.ToUniversalTime()
            : DateTime.MaxValue;

        // Add tolerance: 5 min before session start, 5 min after session end
        afterDt = afterDt.AddMinutes(-5);
        beforeDt = beforeDt.AddMinutes(5);

        var files = Directory.GetFiles(dir, "*.ddd")
            .Select(f => new FileInfo(f))
            .Where(f => f.LastWriteTimeUtc >= afterDt && f.LastWriteTimeUtc <= beforeDt)
            .OrderBy(f => f.Name)
            .Select(f => new
            {
                name = f.Name,
                size = f.Length,
                modified_at = f.LastWriteTimeUtc.ToString("o"),
            })
            .ToList();

        return Ok(files);
    }

    /// <summary>
    /// Downloads a single DDD file.
    /// GET /api/ddd-files/{imei}/{fileName}
    /// </summary>
    [HttpGet("{imei}/{fileName}")]
    public IActionResult DownloadFile(string imei, string fileName)
    {
        // Sanitize fileName to prevent path traversal
        if (fileName.Contains("..") || fileName.Contains('/') || fileName.Contains('\\'))
            return BadRequest(new { error = "Invalid file name" });

        var filePath = Path.Combine(_dddDir, imei, fileName);
        if (!System.IO.File.Exists(filePath))
            return NotFound(new { error = "File not found" });

        var stream = System.IO.File.OpenRead(filePath);
        return File(stream, "application/octet-stream", fileName);
    }
}
