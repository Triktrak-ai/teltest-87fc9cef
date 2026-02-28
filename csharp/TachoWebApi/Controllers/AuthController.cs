using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;
using TachoWebApi.Data.Models;
using TachoWebApi.Services;

namespace TachoWebApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;

    public AuthController(AppDbContext db, JwtService jwt, IConfiguration config)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
    }

    public record SignupRequest(string Email, string Password, string? FullName, string? Phone);
    public record LoginRequest(string Email, string Password);
    public record RefreshRequest(string RefreshToken);
    public record ForgotPasswordRequest(string Email);
    public record ResetPasswordRequest(string Token, string NewPassword);
    public record CreateUserRequest(string Email, string Password, string? FullName, string? Phone);

    [HttpPost("signup")]
    public async Task<IActionResult> Signup([FromBody] SignupRequest req)
    {
        if (await _db.AuthUsers.AnyAsync(u => u.Email == req.Email.ToLower()))
            return BadRequest(new { error = "Email already exists" });

        var user = new AuthUser
        {
            Email = req.Email.ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            EmailConfirmed = false, // Require email verification
        };

        _db.AuthUsers.Add(user);

        var profile = new Profile
        {
            Id = user.Id,
            FullName = req.FullName ?? "",
            Phone = req.Phone,
            Approved = false,
        };
        _db.Profiles.Add(profile);

        await _db.SaveChangesAsync();

        // TODO: Send verification email via EmailService

        return Ok(new { message = "Account created. Check your email for verification." });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await _db.AuthUsers
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.Email == req.Email.ToLower());

        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { error = "Invalid credentials" });

        if (!user.EmailConfirmed)
            return Unauthorized(new { error = "Email not confirmed" });

        var isAdmin = user.Roles.Any(r => r.Role == "admin");
        var accessToken = _jwt.GenerateAccessToken(user.Id, user.Email, isAdmin);
        var refreshToken = _jwt.GenerateRefreshToken();

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpires = DateTime.UtcNow.AddDays(
            int.Parse(_config["Jwt:RefreshTokenDays"] ?? "7"));
        await _db.SaveChangesAsync();

        return Ok(new
        {
            access_token = accessToken,
            refresh_token = refreshToken,
            user = new { id = user.Id, email = user.Email },
        });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var user = await _db.AuthUsers
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.RefreshToken == req.RefreshToken);

        if (user == null || user.RefreshTokenExpires < DateTime.UtcNow)
            return Unauthorized(new { error = "Invalid refresh token" });

        var isAdmin = user.Roles.Any(r => r.Role == "admin");
        var accessToken = _jwt.GenerateAccessToken(user.Id, user.Email, isAdmin);
        var refreshToken = _jwt.GenerateRefreshToken();

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpires = DateTime.UtcNow.AddDays(
            int.Parse(_config["Jwt:RefreshTokenDays"] ?? "7"));
        await _db.SaveChangesAsync();

        return Ok(new
        {
            access_token = accessToken,
            refresh_token = refreshToken,
            user = new { id = user.Id, email = user.Email },
        });
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        // Always return OK to prevent email enumeration
        var user = await _db.AuthUsers.FirstOrDefaultAsync(u => u.Email == req.Email.ToLower());
        if (user != null)
        {
            // TODO: Generate reset token, send email via EmailService
        }
        return Ok(new { message = "If the email exists, a reset link has been sent." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
    {
        // TODO: Validate reset token, update password
        return Ok(new { message = "Password updated" });
    }

    [HttpPost("admin/create-user")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AdminCreateUser([FromBody] CreateUserRequest req)
    {
        if (await _db.AuthUsers.AnyAsync(u => u.Email == req.Email.ToLower()))
            return BadRequest(new { error = "Email already exists" });

        var user = new AuthUser
        {
            Email = req.Email.ToLower(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            EmailConfirmed = true, // Admin-created: auto-confirm
        };
        _db.AuthUsers.Add(user);

        var profile = new Profile
        {
            Id = user.Id,
            FullName = req.FullName ?? "",
            Phone = req.Phone,
            Approved = true, // Admin-created: auto-approve
        };
        _db.Profiles.Add(profile);

        await _db.SaveChangesAsync();

        return Ok(new { id = user.Id, email = user.Email });
    }
}
