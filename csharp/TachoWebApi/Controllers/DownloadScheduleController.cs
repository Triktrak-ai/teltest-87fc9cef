using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class DownloadScheduleController : ControllerBase
{
    private readonly AppDbContext _db;

    public DownloadScheduleController(AppDbContext db) => _db = db;

    private Guid GetUserId() => Guid.Parse(User.FindFirst("sub")!.Value);
    private bool IsAdmin() => User.IsInRole("admin");

    [HttpGet("download-schedule")]
    public async Task<IActionResult> GetSchedule()
    {
        var query = _db.DownloadSchedules.AsQueryable();

        if (!IsAdmin())
        {
            var imeis = await _db.UserDevices
                .Where(d => d.UserId == GetUserId())
                .Select(d => d.Imei)
                .ToListAsync();
            query = query.Where(s => imeis.Contains(s.Imei));
        }

        var schedules = await query
            .OrderByDescending(s => s.UpdatedAt)
            .ToListAsync();

        return Ok(schedules);
    }

    [HttpPost("reset-download-schedule")]
    public async Task<IActionResult> ResetSchedule([FromBody] ResetRequest req)
    {
        // Accept both JWT (admin) and x-api-key (already validated by middleware)
        IQueryable<Data.Models.DownloadSchedule> query;

        if (req.All == true)
        {
            query = _db.DownloadSchedules;
        }
        else if (!string.IsNullOrEmpty(req.Imei))
        {
            query = _db.DownloadSchedules.Where(d => d.Imei == req.Imei);
        }
        else
        {
            return BadRequest(new { error = "Provide 'imei' or 'all: true'" });
        }

        var items = await query.ToListAsync();
        foreach (var item in items)
        {
            item.Status = "pending";
            item.LastSuccessAt = null;
            item.AttemptsToday = 0;
            item.LastError = null;
            item.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Ok(new { ok = true, reset_count = items.Count });
    }

    [HttpPost("toggle-download-block")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ToggleDownloadBlock([FromBody] ToggleBlockRequest req)
    {
        var setting = await _db.AppSettings.FindAsync("download_block_disabled");
        if (setting == null)
        {
            setting = new Data.Models.AppSetting
            {
                Key = "download_block_disabled",
                Value = req.Disabled.ToString().ToLower(),
                UpdatedAt = DateTime.UtcNow,
            };
            _db.AppSettings.Add(setting);
        }
        else
        {
            setting.Value = req.Disabled.ToString().ToLower();
            setting.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Ok(new { ok = true, download_block_disabled = req.Disabled });
    }

    public record ResetRequest(string? Imei, bool? All);
    public record ToggleBlockRequest(bool Disabled);
}
