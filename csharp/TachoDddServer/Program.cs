using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TachoDddServer.Session;
using TachoDddServer.CardBridge;
using TachoDddServer.Reporting;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;

var config = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json")
    .Build();

using var loggerFactory = LoggerFactory.Create(b => b.AddConsole());
var logger = loggerFactory.CreateLogger("TachoDddServer");

int port = config.GetValue<int>("TcpPort");
string cardBridgeUrl = config["CardBridgeUrl"]!;
string outputDir = config["OutputDir"]!;
string? trafficLogDir = config["TrafficLogDir"];
bool logTraffic = config.GetValue<bool>("LogTraffic");

// WebReport config
var webReportSection = config.GetSection("WebReport");
bool webReportEnabled = webReportSection.GetValue<bool>("Enabled");
string? webReportUrl = webReportSection["Url"];
string? webReportApiKey = webReportSection["ApiKey"];

// ─── Startup configuration log ──────────────────────────────────
logger.LogInformation("╔══════════════════════════════════════════════════════════╗");
logger.LogInformation("║           TachoDDD Server — Starting                    ║");
logger.LogInformation("╚══════════════════════════════════════════════════════════╝");
logger.LogInformation("  TCP Port:        {Port}", port);
logger.LogInformation("  CardBridge URL:  {Url}", cardBridgeUrl);
logger.LogInformation("  Output Dir:      {Dir}", outputDir);
logger.LogInformation("  Traffic Logging: {Enabled}", logTraffic ? "ENABLED" : "disabled");
if (logTraffic && trafficLogDir != null)
    logger.LogInformation("  Traffic Log Dir: {Dir}", trafficLogDir);
logger.LogInformation("  Started at:      {Time:yyyy-MM-dd HH:mm:ss} UTC", DateTime.UtcNow);

Directory.CreateDirectory(outputDir);
if (logTraffic && trafficLogDir != null)
{
    Directory.CreateDirectory(trafficLogDir);
}

var listener = new TcpListener(IPAddress.Any, port);
listener.Start();
logger.LogInformation("🚀 Listening on port {Port}", port);

while (true)
{
    var client = await listener.AcceptTcpClientAsync();
    var ep = client.Client.RemoteEndPoint as IPEndPoint;
    var connectTime = DateTime.UtcNow;
    logger.LogInformation("📡 New connection from {IP}:{Port} at {Time:HH:mm:ss.fff}",
        ep?.Address, ep?.Port, connectTime);

    _ = Task.Run(async () =>
    {
        var sessionSw = Stopwatch.StartNew();
        var sessionId = Guid.NewGuid().ToString();
        using var webReporter = new WebReporter(sessionId, webReportUrl, webReportApiKey, webReportEnabled,
            loggerFactory.CreateLogger<WebReporter>());

        try
        {
            // Report initial connecting status
            webReporter.ReportStatus("connecting");

            using var bridge = new CardBridgeClient(cardBridgeUrl, loggerFactory.CreateLogger<CardBridgeClient>());

            var session = new DddSession(client, bridge, outputDir, loggerFactory.CreateLogger<DddSession>(),
                trafficLogDir, logTraffic, webReporter);
            await session.RunAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "❌ Session error from {IP}:{Port}", ep?.Address, ep?.Port);
            webReporter.ReportError("CONNECTION_FAILED", ex.Message);
        }
        finally
        {
            sessionSw.Stop();
            await webReporter.FlushAsync();
            logger.LogInformation("📡 Disconnected {IP}:{Port} — session duration: {Duration}",
                ep?.Address, ep?.Port, FormatDuration(sessionSw.Elapsed));
            client.Dispose();
        }
    });
}

static string FormatDuration(TimeSpan ts)
{
    if (ts.TotalMinutes >= 1)
        return $"{(int)ts.TotalMinutes}m {ts.Seconds}s";
    return $"{ts.TotalSeconds:F1}s";
}
