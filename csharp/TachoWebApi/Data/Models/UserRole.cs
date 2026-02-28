using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("user_roles")]
public class UserRole
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Required]
    [Column("role")]
    public string Role { get; set; } = "user";

    // Navigation
    [ForeignKey("UserId")]
    public AuthUser? User { get; set; }
}
