using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/app-settings")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SettingsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var settings = await _db.AppSettings.ToListAsync();
        return Ok(settings);
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> Get(string key)
    {
        var setting = await _db.AppSettings.FindAsync(key);
        if (setting == null) return NotFound();
        return Ok(setting);
    }
}
