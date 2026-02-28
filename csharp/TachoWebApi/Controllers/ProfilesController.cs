using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/profiles")]
[Authorize]
public class ProfilesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProfilesController(AppDbContext db) => _db = db;

    private Guid GetUserId() => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile()
    {
        var profile = await _db.Profiles.FindAsync(GetUserId());
        if (profile == null) return NotFound();
        return Ok(profile);
    }

    [HttpGet("user-roles")]
    public async Task<IActionResult> GetMyRoles()
    {
        var userId = GetUserId();
        var roles = await _db.UserRoles
            .Where(r => r.UserId == userId)
            .Select(r => new { r.Role })
            .ToListAsync();
        return Ok(roles);
    }
}
