using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TachoWebApi.Data.Models;

[Table("app_settings")]
public class AppSetting
{
    [Key]
    [Column("key")]
    public string Key { get; set; } = "";

    [Column("value")]
    public string Value { get; set; } = "";

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; } = DateTime.UtcNow;
}
