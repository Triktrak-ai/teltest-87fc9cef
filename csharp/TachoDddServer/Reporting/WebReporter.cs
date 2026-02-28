using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TachoDddServer.Session;

namespace TachoDddServer.Reporting;

public class WebReporter : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _url;
    private readonly string _apiKey;
    private readonly bool _enabled;
    private readonly ILogger _logger;
    private readonly string _sessionId;
    private string _imei = "unknown";
    private VuGeneration _generation = VuGeneration.Unknown;
    private string _cardGeneration = "Unknown";

    private readonly object _lock = new();
    private readonly List<Task> _inFlight = new();

    public WebReporter(string sessionId, string? url, string? apiKey, bool enabled, ILogger logger)
    {
        _sessionId = sessionId;
        _url = url ?? "";
        _apiKey = apiKey ?? "";
        _enabled = enabled && !string.IsNullOrEmpty(url) && !string.IsNullOrEmpty(apiKey);
        _logger = logger;

        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        _http.DefaultRequestHeaders.Add("x-api-key", _apiKey);
    }

    public void SetImei(string imei) => _imei = imei;
    public void SetGeneration(VuGeneration gen) => _generation = gen;
    public void SetCardGeneration(string gen) => _cardGeneration = gen;

    /// <summary>
    /// Report current session status (fire-and-forget, tracked for flush).
    /// </summary>
    public void ReportStatus(string status, int progress = 0, int filesDownloaded = 0,
        int totalFiles = 0, string? currentFile = null, long bytesDownloaded = 0,
        int apduExchanges = 0, int crcErrors = 0, string? eventType = null,
        string? eventMessage = null, string? eventContext = null)
    {
        if (!_enabled) return;

        var payload = new Dictionary<string, object?>
        {
            ["session_id"] = _sessionId,
            ["imei"] = _imei,
            ["status"] = status,
            ["generation"] = _generation.ToString(),
            ["card_generation"] = _cardGeneration,
            ["progress"] = progress,
            ["files_downloaded"] = filesDownloaded,
            ["total_files"] = totalFiles,
            ["current_file"] = currentFile,
            ["bytes_downloaded"] = bytesDownloaded,
            ["apdu_exchanges"] = apduExchanges,
            ["crc_errors"] = crcErrors,
        };

        if (eventType != null && eventMessage != null)
        {
            payload["event"] = new Dictionary<string, object?>
            {
                ["type"] = eventType,
                ["message"] = eventMessage,
                ["context"] = eventContext,
            };
        }

        Track(SendAsync(payload));
    }

    /// <summary>
    /// Report error (fire-and-forget, tracked for flush).
    /// </summary>
    public void ReportError(string errorCode, string errorMessage, int apduExchanges = 0, int crcErrors = 0)
    {
        if (!_enabled) return;

        var payload = new Dictionary<string, object?>
        {
            ["session_id"] = _sessionId,
            ["imei"] = _imei,
            ["status"] = "error",
            ["generation"] = _generation.ToString(),
            ["card_generation"] = _cardGeneration,
            ["error_code"] = errorCode,
            ["error_message"] = errorMessage,
            ["apdu_exchanges"] = apduExchanges,
            ["crc_errors"] = crcErrors,
            ["event"] = new Dictionary<string, object?>
            {
                ["type"] = "error",
                ["message"] = $"ERROR {errorCode} — {errorMessage}",
                ["context"] = "DddProtocol",
            },
        };

        Track(SendAsync(payload));
    }

    private void Track(Task task)
    {
        lock (_lock)
        {
            _inFlight.Add(task);
        }
    }

    /// <summary>
    /// Wait for all pending HTTP requests to complete. Call before Dispose.
    /// </summary>
    public async Task FlushAsync()
    {
        Task[] pending;
        lock (_lock)
        {
            pending = _inFlight.ToArray();
            _inFlight.Clear();
        }

        try
        {
            await Task.WhenAll(pending);
        }
        catch
        {
            // Errors already logged in SendAsync
        }
    }

    private async Task SendAsync(Dictionary<string, object?> payload)
    {
        try
        {
            var response = await _http.PostAsJsonAsync(_url, payload);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("WebReporter: HTTP {Status} — {Body}", (int)response.StatusCode, body);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("WebReporter: {Error}", ex.Message);
        }
    }

    /// <summary>
    /// Check if this IMEI should download today. Returns true if download should proceed.
    /// On any error, returns true (fail-open — always allow download if uncertain).
    /// </summary>
    public async Task<bool> CheckDownloadScheduleAsync()
    {
        if (!_enabled) return true;
        try
        {
            var checkUrl = _url.Replace("/report-session", "/check-download");
            var response = await _http.GetAsync($"{checkUrl}?imei={_imei}");
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("CheckDownloadSchedule: HTTP {Status}", (int)response.StatusCode);
                return true;
            }
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("should_download").GetBoolean();
        }
        catch (Exception ex)
        {
            _logger.LogWarning("CheckDownloadSchedule error: {Error}", ex.Message);
            return true; // Fail-open
        }
    }

    public void Dispose()
    {
        _http.Dispose();
    }
}
