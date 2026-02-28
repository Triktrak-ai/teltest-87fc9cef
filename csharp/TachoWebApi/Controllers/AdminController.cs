using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;
using TachoWebApi.Data.Models;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;

    public AdminController(AppDbContext db) => _db = db;

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var profiles = await _db.Profiles.Include(p => p.Devices).ToListAsync();
        var roles = await _db.UserRoles.ToListAsync();

        var result = profiles.Select(p => new
        {
            p.Id,
            p.FullName,
            p.Phone,
            p.Approved,
            p.CreatedAt,
            IsAdmin = roles.Any(r => r.UserId == p.Id && r.Role == "admin"),
            Devices = p.Devices.Select(d => new
            {
                d.Id, d.Imei, d.Label, d.VehiclePlate, d.SimNumber, d.Comment
            }),
        });

        return Ok(result);
    }

    [HttpPatch("users/{id}/approve")]
    public async Task<IActionResult> ToggleApproval(Guid id)
    {
        var profile = await _db.Profiles.FindAsync(id);
        if (profile == null) return NotFound();

        profile.Approved = !profile.Approved;
        profile.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { approved = profile.Approved });
    }

    [HttpPost("roles/{userId}/toggle-admin")]
    public async Task<IActionResult> ToggleAdmin(Guid userId)
    {
        var existing = await _db.UserRoles
            .FirstOrDefaultAsync(r => r.UserId == userId && r.Role == "admin");

        if (existing != null)
        {
            _db.UserRoles.Remove(existing);
        }
        else
        {
            _db.UserRoles.Add(new UserRole { UserId = userId, Role = "admin" });
        }

        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}
