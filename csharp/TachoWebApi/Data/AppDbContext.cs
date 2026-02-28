using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data.Models;

namespace TachoWebApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<AuthUser> AuthUsers => Set<AuthUser>();
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<UserDevice> UserDevices => Set<UserDevice>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<SessionEvent> SessionEvents => Set<SessionEvent>();
    public DbSet<DownloadSchedule> DownloadSchedules => Set<DownloadSchedule>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // AuthUser -> Profile one-to-one
        modelBuilder.Entity<Profile>()
            .HasOne(p => p.AuthUser)
            .WithOne(a => a.Profile)
            .HasForeignKey<Profile>(p => p.Id);

        // Unique email
        modelBuilder.Entity<AuthUser>()
            .HasIndex(u => u.Email)
            .IsUnique();

        // Unique (user_id, role)
        modelBuilder.Entity<UserRole>()
            .HasIndex(r => new { r.UserId, r.Role })
            .IsUnique();

        // Unique IMEI per download_schedule
        modelBuilder.Entity<DownloadSchedule>()
            .HasIndex(d => d.Imei)
            .IsUnique();

        // AppSetting key is PK (already via [Key])

        // Session -> SessionEvents
        modelBuilder.Entity<SessionEvent>()
            .HasOne(e => e.Session)
            .WithMany(s => s.Events)
            .HasForeignKey(e => e.SessionId);

        // UserDevices -> Profile
        modelBuilder.Entity<UserDevice>()
            .HasOne(d => d.User)
            .WithMany(p => p.Devices)
            .HasForeignKey(d => d.UserId);
    }
}
