using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("auth_users")]
public class AuthUser
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255)]
    [Column("email")]
    public string Email { get; set; } = "";

    [Required]
    [Column("password_hash")]
    public string PasswordHash { get; set; } = "";

    [Column("email_confirmed")]
    public bool EmailConfirmed { get; set; }

    [Column("refresh_token")]
    public string? RefreshToken { get; set; }

    [Column("refresh_token_expires")]
    public DateTime? RefreshTokenExpires { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Profile? Profile { get; set; }
    public ICollection<UserRole> Roles { get; set; } = new List<UserRole>();
}
