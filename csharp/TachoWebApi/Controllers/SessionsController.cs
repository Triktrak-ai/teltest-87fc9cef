using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class SessionsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SessionsController(AppDbContext db) => _db = db;

    private Guid GetUserId() => Guid.Parse(User.FindFirst("sub")!.Value);
    private bool IsAdmin() => User.IsInRole("admin");

    private async Task<List<string>> GetUserImeis()
    {
        var userId = GetUserId();
        return await _db.UserDevices
            .Where(d => d.UserId == userId)
            .Select(d => d.Imei)
            .ToListAsync();
    }

    [HttpGet("sessions")]
    public async Task<IActionResult> GetSessions()
    {
        var query = _db.Sessions.AsQueryable();

        if (!IsAdmin())
        {
            var imeis = await GetUserImeis();
            query = query.Where(s => imeis.Contains(s.Imei));
        }

        var sessions = await query
            .OrderByDescending(s => s.LastActivity)
            .ToListAsync();

        return Ok(sessions);
    }

    [HttpGet("session-events")]
    public async Task<IActionResult> GetSessionEvents()
    {
        var query = _db.SessionEvents.AsQueryable();

        if (!IsAdmin())
        {
            var imeis = await GetUserImeis();
            query = query.Where(e => imeis.Contains(e.Imei));
        }

        var events = await query
            .OrderByDescending(e => e.CreatedAt)
            .Take(100)
            .ToListAsync();

        return Ok(events);
    }
}
