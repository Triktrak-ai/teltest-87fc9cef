using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TachoWebApi.Data;
using TachoWebApi.Data.Models;
using TachoWebApi.Hubs;

namespace TachoWebApi.Controllers;

/// <summary>
/// Server-to-server endpoint. Auth via x-api-key (middleware).
/// </summary>
[ApiController]
[Route("api/report-session")]
public class ReportSessionController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<DashboardHub> _hub;

    public ReportSessionController(AppDbContext db, IHubContext<DashboardHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    private static readonly HashSet<string> FinalStatuses = new(StringComparer.OrdinalIgnoreCase)
        { "completed", "partial", "error" };

    [HttpPost]
    public async Task<IActionResult> Report([FromBody] ReportPayload body)
    {
        if (string.IsNullOrEmpty(body.SessionId))
            return BadRequest(new { error = "session_id is required" });

        var imei = body.Imei ?? "unknown";

        // Upsert session
        var session = await _db.Sessions.FindAsync(Guid.Parse(body.SessionId));
        if (session == null)
        {
            session = new Session { Id = Guid.Parse(body.SessionId), Imei = imei };
            _db.Sessions.Add(session);
        }

        session.Imei = imei;
        session.LastActivity = DateTime.UtcNow;

        // Race condition protection: don't let intermediate status overwrite final
        var currentIsFinal = FinalStatuses.Contains(session.Status);
        var newIsFinal = body.Status != null && FinalStatuses.Contains(body.Status);
        if (!(currentIsFinal && !newIsFinal))
        {
            session.Status = body.Status ?? session.Status;
        }

        if (body.VehiclePlate != null) session.VehiclePlate = body.VehiclePlate;
        if (body.Generation != null) session.Generation = body.Generation;
        if (body.CardGeneration != null) session.CardGeneration = body.CardGeneration;
        if (body.Progress.HasValue) session.Progress = body.Progress.Value;
        if (body.FilesDownloaded.HasValue) session.FilesDownloaded = body.FilesDownloaded.Value;
        if (body.TotalFiles.HasValue) session.TotalFiles = body.TotalFiles.Value;
        if (body.CurrentFile != null) session.CurrentFile = body.CurrentFile;
        if (body.ErrorCode != null) session.ErrorCode = body.ErrorCode;
        if (body.ErrorMessage != null) session.ErrorMessage = body.ErrorMessage;
        if (body.BytesDownloaded.HasValue) session.BytesDownloaded = body.BytesDownloaded.Value;
        if (body.ApduExchanges.HasValue) session.ApduExchanges = body.ApduExchanges.Value;
        if (body.CrcErrors.HasValue) session.CrcErrors = body.CrcErrors.Value;

        if (body.Status is "completed" or "partial")
            session.CompletedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Insert event if present
        if (body.Event != null)
        {
            var evt = new SessionEvent
            {
                SessionId = session.Id,
                Imei = imei,
                Type = body.Event.Type ?? "info",
                Message = body.Event.Message ?? "",
                Context = body.Event.Context,
            };
            _db.SessionEvents.Add(evt);
            await _db.SaveChangesAsync();
            await _hub.Clients.All.SendAsync("EventCreated", evt.Id);
        }

        // Upsert download_schedule
        var status = body.Status;
        if (status is "completed" or "partial" or "error" or "skipped")
        {
            var sched = await _db.DownloadSchedules.FirstOrDefaultAsync(d => d.Imei == imei);
            if (sched == null)
            {
                sched = new DownloadSchedule { Imei = imei };
                _db.DownloadSchedules.Add(sched);
            }

            sched.LastAttemptAt = DateTime.UtcNow;
            sched.UpdatedAt = DateTime.UtcNow;

            switch (status)
            {
                case "completed":
                    sched.Status = "ok";
                    sched.LastSuccessAt = DateTime.UtcNow;
                    sched.LastError = null;
                    break;
                case "partial":
                    sched.Status = "partial";
                    sched.LastSuccessAt = DateTime.UtcNow;
                    sched.LastError = $"Partial: {body.FilesDownloaded ?? 0}/{body.TotalFiles ?? 0} files";
                    break;
                case "error":
                    sched.Status = "error";
                    sched.LastError = body.ErrorMessage ?? "Unknown error";
                    break;
                case "skipped":
                    sched.Status = "skipped";
                    sched.AttemptsToday++;
                    break;
            }

            await _db.SaveChangesAsync();
        }

        await _hub.Clients.All.SendAsync("SessionUpdated", session.Id);

        return Ok(new { ok = true });
    }

    public record EventPayload(string? Type, string? Message, string? Context);

    public record ReportPayload
    {
        public string? SessionId { get; init; }
        public string? Imei { get; init; }
        public string? Status { get; init; }
        public string? VehiclePlate { get; init; }
        public string? Generation { get; init; }
        public string? CardGeneration { get; init; }
        public int? Progress { get; init; }
        public int? FilesDownloaded { get; init; }
        public int? TotalFiles { get; init; }
        public string? CurrentFile { get; init; }
        public string? ErrorCode { get; init; }
        public string? ErrorMessage { get; init; }
        public long? BytesDownloaded { get; init; }
        public int? ApduExchanges { get; init; }
        public int? CrcErrors { get; init; }
        public EventPayload? Event { get; init; }
    }
}
