using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("profiles")]
public class Profile
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("full_name")]
    public string FullName { get; set; } = "";

    [Column("phone")]
    public string? Phone { get; set; }

    [Column("approved")]
    public bool Approved { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("Id")]
    public AuthUser? AuthUser { get; set; }
    public ICollection<UserDevice> Devices { get; set; } = new List<UserDevice>();
}
