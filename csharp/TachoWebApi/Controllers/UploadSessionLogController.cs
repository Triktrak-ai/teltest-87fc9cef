using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;
using TachoWebApi.Services;

namespace TachoWebApi.Controllers;

/// <summary>
/// Server-to-server endpoint. Auth via x-api-key (middleware).
/// </summary>
[ApiController]
[Route("api/upload-session-log")]
public class UploadSessionLogController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileStorageService _storage;

    public UploadSessionLogController(AppDbContext db, FileStorageService storage)
    {
        _db = db;
        _storage = storage;
    }

    [HttpPost]
    [RequestSizeLimit(50 * 1024 * 1024)] // 50 MB
    public async Task<IActionResult> Upload()
    {
        var form = await Request.ReadFormAsync();
        var sessionId = form["session_id"].FirstOrDefault();

        if (string.IsNullOrEmpty(sessionId))
            return BadRequest(new { error = "session_id is required" });

        var uploadedFiles = new List<string>();

        foreach (var file in form.Files)
        {
            await using var stream = file.OpenReadStream();
            await _storage.SaveFileAsync(sessionId, file.FileName, stream);
            uploadedFiles.Add($"{sessionId}/{file.FileName}");
        }

        if (uploadedFiles.Count > 0)
        {
            var session = await _db.Sessions.FindAsync(Guid.Parse(sessionId));
            if (session != null)
            {
                session.LogUploaded = true;
                await _db.SaveChangesAsync();
            }
        }

        return Ok(new { ok = true, files = uploadedFiles });
    }
}
