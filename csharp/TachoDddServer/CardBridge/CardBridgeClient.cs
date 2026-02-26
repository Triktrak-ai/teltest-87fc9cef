using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TachoDddServer.CardBridge;

public class CardBridgeClient : IDisposable
{
    private readonly string _url;
    private readonly ILogger _logger;
    private readonly ClientWebSocket _ws = new();

    public CardBridgeClient(string url, ILogger logger)
    {
        _url = url;
        _logger = logger;
    }

    public async Task ConnectAsync()
    {
        await _ws.ConnectAsync(new Uri(_url), CancellationToken.None);
        _logger.LogInformation("🔗 Połączono z CardBridge: {Url}", _url);
    }

    public async Task<byte[]> GetAtrAsync()
    {
        return await SendCommandAsync("GET_ATR", Array.Empty<byte>());
    }

    public async Task<byte[]> TransmitApduAsync(byte[] apdu)
    {
        return await SendCommandAsync("TRANSMIT", apdu);
    }

    private async Task<byte[]> SendCommandAsync(string command, byte[] data)
    {
        var request = JsonSerializer.Serialize(new
        {
            cmd = command,
            data = Convert.ToBase64String(data)
        });

        await _ws.SendAsync(
            Encoding.UTF8.GetBytes(request),
            WebSocketMessageType.Text,
            true,
            CancellationToken.None);

        var buffer = new byte[8192];
        var result = await _ws.ReceiveAsync(buffer, CancellationToken.None);
        var responseJson = Encoding.UTF8.GetString(buffer, 0, result.Count);
        var response = JsonSerializer.Deserialize<JsonElement>(responseJson);

        if (response.TryGetProperty("error", out var error))
            throw new Exception($"CardBridge error: {error.GetString()}");

        return Convert.FromBase64String(response.GetProperty("data").GetString()!);
    }

    public void Dispose() => _ws.Dispose();
}
