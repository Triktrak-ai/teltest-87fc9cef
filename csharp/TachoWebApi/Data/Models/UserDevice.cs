using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("user_devices")]
public class UserDevice
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("imei")]
    public string Imei { get; set; } = "";

    [Column("label")]
    public string? Label { get; set; }

    [Column("vehicle_plate")]
    public string? VehiclePlate { get; set; }

    [Column("sim_number")]
    public string? SimNumber { get; set; }

    [Column("comment")]
    public string? Comment { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("UserId")]
    public Profile? User { get; set; }
}
