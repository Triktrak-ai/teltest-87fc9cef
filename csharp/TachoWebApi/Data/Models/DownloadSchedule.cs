using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("download_schedule")]
public class DownloadSchedule
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("imei")]
    public string Imei { get; set; } = "";

    [Column("status")]
    public string Status { get; set; } = "pending";

    [Column("last_success_at")]
    public DateTime? LastSuccessAt { get; set; }

    [Column("last_attempt_at")]
    public DateTime? LastAttemptAt { get; set; }

    [Column("last_error")]
    public string? LastError { get; set; }

    [Column("attempts_today")]
    public int AttemptsToday { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; } = DateTime.UtcNow;
}
