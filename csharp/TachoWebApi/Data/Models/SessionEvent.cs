using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("session_events")]
public class SessionEvent
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("session_id")]
    public Guid? SessionId { get; set; }

    [Required]
    [Column("imei")]
    public string Imei { get; set; } = "";

    [Column("type")]
    public string Type { get; set; } = "info";

    [Required]
    [Column("message")]
    public string Message { get; set; } = "";

    [Column("context")]
    public string? Context { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("SessionId")]
    public Session? Session { get; set; }
}
