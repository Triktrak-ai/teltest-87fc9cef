using System.IO.Compression;
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

    private (DateTime after, DateTime before) ParseTimeWindow(string? after, string? before)
    {
        var afterDt = DateTime.TryParse(after, null, System.Globalization.DateTimeStyles.RoundtripKind, out var a)
            ? a.ToUniversalTime() : DateTime.MinValue;
        var beforeDt = DateTime.TryParse(before, null, System.Globalization.DateTimeStyles.RoundtripKind, out var b)
            ? b.ToUniversalTime() : DateTime.MaxValue;
        return (afterDt.AddMinutes(-5), beforeDt.AddMinutes(5));
    }

    private List<FileInfo> GetMatchingFiles(string imei, DateTime afterDt, DateTime beforeDt)
    {
        var dir = Path.Combine(_dddDir, imei);
        if (!Directory.Exists(dir)) return new List<FileInfo>();
        return Directory.GetFiles(dir, "*.ddd")
            .Select(f => new FileInfo(f))
            .Where(f => f.LastWriteTimeUtc >= afterDt && f.LastWriteTimeUtc <= beforeDt)
            .OrderBy(f => f.Name)
            .ToList();
    }

    /// <summary>
    /// Lists DDD files for a given IMEI within a time window.
    /// </summary>
    [HttpGet("{imei}")]
    public IActionResult ListFiles(string imei, [FromQuery] string? after, [FromQuery] string? before)
    {
        var (afterDt, beforeDt) = ParseTimeWindow(after, before);
        var files = GetMatchingFiles(imei, afterDt, beforeDt)
            .Select(f => new { name = f.Name, size = f.Length, modified_at = f.LastWriteTimeUtc.ToString("o") })
            .ToList();
        return Ok(files);
    }

    /// <summary>
    /// Downloads a single DDD file.
    /// </summary>
    [HttpGet("{imei}/{fileName}")]
    public IActionResult DownloadFile(string imei, string fileName)
    {
        if (fileName.Contains("..") || fileName.Contains('/') || fileName.Contains('\\'))
            return BadRequest(new { error = "Invalid file name" });

        var filePath = Path.Combine(_dddDir, imei, fileName);
        if (!System.IO.File.Exists(filePath))
            return NotFound(new { error = "File not found" });

        var stream = System.IO.File.OpenRead(filePath);
        return File(stream, "application/octet-stream", fileName);
    }

    /// <summary>
    /// Downloads all matching DDD files as a ZIP archive.
    /// GET /api/ddd-files/{imei}/zip?after=...&before=...
    /// </summary>
    [HttpGet("{imei}/zip")]
    public IActionResult DownloadZip(string imei, [FromQuery] string? after, [FromQuery] string? before)
    {
        var (afterDt, beforeDt) = ParseTimeWindow(after, before);
        var files = GetMatchingFiles(imei, afterDt, beforeDt);

        if (files.Count == 0)
            return NotFound(new { error = "No files found" });

        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var fi in files)
            {
                var entry = zip.CreateEntry(fi.Name, CompressionLevel.Fastest);
                using var entryStream = entry.Open();
                using var fileStream = fi.OpenRead();
                fileStream.CopyTo(entryStream);
            }
        }
        ms.Position = 0;

        var zipName = $"{imei}_ddd_{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
        return File(ms, "application/zip", zipName);
    }
}
