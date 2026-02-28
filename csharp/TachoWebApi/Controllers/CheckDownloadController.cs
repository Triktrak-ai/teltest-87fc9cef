using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;

namespace TachoWebApi.Controllers;

/// <summary>
/// Server-to-server endpoint. Auth via x-api-key (middleware).
/// </summary>
[ApiController]
[Route("api/check-download")]
public class CheckDownloadController : ControllerBase
{
    private readonly AppDbContext _db;

    public CheckDownloadController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Check([FromQuery] string imei)
    {
        if (string.IsNullOrEmpty(imei))
            return BadRequest(new { error = "imei parameter required" });

        // Check dev mode
        var setting = await _db.AppSettings.FindAsync("download_block_disabled");
        if (setting?.Value == "true")
            return Ok(new { should_download = true });

        var sched = await _db.DownloadSchedules
            .FirstOrDefaultAsync(d => d.Imei == imei);

        if (sched == null || sched.Status != "ok" || sched.LastSuccessAt == null)
            return Ok(new { should_download = true });

        // Check if last success was today (UTC)
        var isToday = sched.LastSuccessAt.Value.Date == DateTime.UtcNow.Date;
        return Ok(new { should_download = !isToday });
    }
}
