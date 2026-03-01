using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TachoDddServer.Session;
using TachoDddServer.CardBridge;
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

logger.LogInformation("╔══════════════════════════════════════════════════════════╗");
logger.LogInformation("║           TachoDDD Server — Starting                    ║");
logger.LogInformation("╚══════════════════════════════════════════════════════════╝");
logger.LogInformation("  TCP Port:        {Port}", port);
logger.LogInformation("  CardBridge URL:  {Url}", cardBridgeUrl);
logger.LogInformation("  Output Dir:      {Dir}", outputDir);

Directory.CreateDirectory(outputDir);

var listener = new TcpListener(IPAddress.Any, port);
listener.Start();
logger.LogInformation("🚀 Listening on port {Port}", port);

while (true)
{
    var client = await listener.AcceptTcpClientAsync();
    var ep = client.Client.RemoteEndPoint as IPEndPoint;
    logger.LogInformation("📡 New connection from {IP}:{Port}", ep?.Address, ep?.Port);

    _ = Task.Run(async () =>
    {
        try
        {
            using var bridge = new CardBridgeClient(cardBridgeUrl, loggerFactory.CreateLogger<CardBridgeClient>());
            var session = new DddSession(client, bridge, outputDir, loggerFactory.CreateLogger<DddSession>());
            await session.RunAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "❌ Session error from {IP}:{Port}", ep?.Address, ep?.Port);
        }
        finally
        {
            client.Dispose();
        }
    });
}
