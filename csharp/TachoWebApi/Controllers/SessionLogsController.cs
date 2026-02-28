using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TachoWebApi.Services;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/session-logs")]
[Authorize(Roles = "admin")]
public class SessionLogsController : ControllerBase
{
    private readonly FileStorageService _storage;

    public SessionLogsController(FileStorageService storage) => _storage = storage;

    [HttpGet("{sessionId}/{fileName}")]
    public IActionResult Download(string sessionId, string fileName)
    {
        var path = _storage.GetFilePath(sessionId, fileName);
        if (path == null) return NotFound();

        var contentType = fileName.EndsWith(".json") ? "application/json"
            : fileName.EndsWith(".log") || fileName.EndsWith(".txt") ? "text/plain"
            : "application/octet-stream";

        return PhysicalFile(path, contentType, fileName);
    }
}
