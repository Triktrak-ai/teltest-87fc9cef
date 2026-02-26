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
string? trafficLogDir = config["TrafficLogDir"];
bool logTraffic = config.GetValue<bool>("LogTraffic");

Directory.CreateDirectory(outputDir);
if (logTraffic && trafficLogDir != null)
{
    Directory.CreateDirectory(trafficLogDir);
    logger.LogInformation("📝 Logowanie ruchu włączone, folder: {Dir}", trafficLogDir);
}

var listener = new TcpListener(IPAddress.Any, port);
listener.Start();
logger.LogInformation("🚀 TachoDDD Server nasłuchuje na porcie {Port}", port);

while (true)
{
    var client = await listener.AcceptTcpClientAsync();
    var ep = client.Client.RemoteEndPoint as IPEndPoint;
    logger.LogInformation("📡 Nowe połączenie od {IP}", ep?.Address);

    _ = Task.Run(async () =>
    {
        try
        {
            using var bridge = new CardBridgeClient(cardBridgeUrl, loggerFactory.CreateLogger<CardBridgeClient>());
            await bridge.ConnectAsync();

            var session = new DddSession(client, bridge, outputDir, loggerFactory.CreateLogger<DddSession>(),
                trafficLogDir, logTraffic);
            await session.RunAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Błąd sesji z {IP}", ep?.Address);
        }
        finally
        {
            client.Dispose();
        }
    });
}
