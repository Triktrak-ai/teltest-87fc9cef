using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("sessions")]
public class Session
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("imei")]
    public string Imei { get; set; } = "";

    [Column("vehicle_plate")]
    public string? VehiclePlate { get; set; }

    [Column("status")]
    public string Status { get; set; } = "connecting";

    [Column("generation")]
    public string? Generation { get; set; } = "Unknown";

    [Column("card_generation")]
    public string? CardGeneration { get; set; } = "Unknown";

    [Column("progress")]
    public int Progress { get; set; }

    [Column("files_downloaded")]
    public int FilesDownloaded { get; set; }

    [Column("total_files")]
    public int TotalFiles { get; set; }

    [Column("current_file")]
    public string? CurrentFile { get; set; }

    [Column("error_code")]
    public string? ErrorCode { get; set; }

    [Column("error_message")]
    public string? ErrorMessage { get; set; }

    [Column("bytes_downloaded")]
    public long BytesDownloaded { get; set; }

    [Column("apdu_exchanges")]
    public int ApduExchanges { get; set; }

    [Column("crc_errors")]
    public int CrcErrors { get; set; }

    [Column("started_at")]
    public DateTime? StartedAt { get; set; } = DateTime.UtcNow;

    [Column("last_activity")]
    public DateTime? LastActivity { get; set; } = DateTime.UtcNow;

    [Column("completed_at")]
    public DateTime? CompletedAt { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("log_uploaded")]
    public bool LogUploaded { get; set; }

    // Navigation
    public ICollection<SessionEvent> Events { get; set; } = new List<SessionEvent>();
}
