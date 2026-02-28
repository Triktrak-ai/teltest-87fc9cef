using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;
using TachoWebApi.Data.Models;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/user-devices")]
[Authorize]
public class DevicesController : ControllerBase
{
    private readonly AppDbContext _db;

    public DevicesController(AppDbContext db) => _db = db;

    private Guid GetUserId() => Guid.Parse(User.FindFirst("sub")!.Value);
    private bool IsAdmin() => User.IsInRole("admin");

    [HttpGet]
    public async Task<IActionResult> GetDevices()
    {
        var userId = GetUserId();
        var query = IsAdmin()
            ? _db.UserDevices.AsQueryable()
            : _db.UserDevices.Where(d => d.UserId == userId);

        return Ok(await query.ToListAsync());
    }

    [HttpPost]
    public async Task<IActionResult> AddDevice([FromBody] AddDeviceRequest req)
    {
        var device = new UserDevice
        {
            UserId = req.UserId ?? GetUserId(),
            Imei = req.Imei,
            Label = req.Label,
            VehiclePlate = req.VehiclePlate,
            SimNumber = req.SimNumber,
            Comment = req.Comment,
        };

        // Non-admin can only add to own account
        if (!IsAdmin() && device.UserId != GetUserId())
            return Forbid();

        _db.UserDevices.Add(device);
        await _db.SaveChangesAsync();
        return Ok(device);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDevice(Guid id)
    {
        var device = await _db.UserDevices.FindAsync(id);
        if (device == null) return NotFound();
        if (!IsAdmin() && device.UserId != GetUserId()) return Forbid();

        _db.UserDevices.Remove(device);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    public record AddDeviceRequest(string Imei, string? Label, string? VehiclePlate, string? SimNumber, string? Comment, Guid? UserId);
}
