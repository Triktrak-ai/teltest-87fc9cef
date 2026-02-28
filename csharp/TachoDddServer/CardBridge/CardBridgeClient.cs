using System.Diagnostics;
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
    private static readonly TimeSpan CommandTimeout = TimeSpan.FromSeconds(30);

    public CardBridgeClient(string url, ILogger logger)
    {
        _url = url;
        _logger = logger;
    }

    public async Task ConnectAsync()
    {
        using var cts = new CancellationTokenSource(CommandTimeout);
        try
        {
            await _ws.ConnectAsync(new Uri(_url), cts.Token);
            _logger.LogInformation("🔗 CardBridge connected: {Url}, state={State}", _url, _ws.State);
        }
        catch (OperationCanceledException)
        {
            _logger.LogError("⏱️ CardBridge connect timeout after {Timeout}s to {Url}", CommandTimeout.TotalSeconds, _url);
            throw;
        }
        catch (WebSocketException ex)
        {
            _logger.LogError(ex, "🔌 CardBridge WebSocket connect failed: {Url}", _url);
            throw;
        }
    }

    public async Task<byte[]> GetAtrAsync()
    {
        _logger.LogDebug("📤 CardBridge: GET_ATR");
        var sw = Stopwatch.StartNew();
        var result = await SendCommandAsync("GET_ATR", Array.Empty<byte>());
        sw.Stop();
        _logger.LogInformation("📥 CardBridge: ATR received, {Len}B in {Ms}ms", result.Length, sw.ElapsedMilliseconds);
        return result;
    }

    public async Task<byte[]> TransmitApduAsync(byte[] apdu)
    {
        _logger.LogDebug("📤 CardBridge: TRANSMIT {Len}B", apdu.Length);
        var sw = Stopwatch.StartNew();
        var result = await SendCommandAsync("TRANSMIT", apdu);
        sw.Stop();
        _logger.LogInformation("📥 CardBridge: response {Len}B in {Ms}ms", result.Length, sw.ElapsedMilliseconds);
        return result;
    }

    /// <summary>
    /// Perform a warm reset of the card via SCardReconnect on the CardBridge side.
    /// This resets the card to its initial state without removing power.
    /// </summary>
    public async Task ReconnectAsync()
    {
        _logger.LogInformation("🔄 CardBridge: RECONNECT (warm reset)");
        var sw = Stopwatch.StartNew();
        await SendCommandAsync("RECONNECT", Array.Empty<byte>());
        sw.Stop();
        _logger.LogInformation("🔄 CardBridge: reconnect completed in {Ms}ms", sw.ElapsedMilliseconds);
    }

    private async Task<byte[]> SendCommandAsync(string command, byte[] data)
    {
        // Check WebSocket state before sending
        if (_ws.State != WebSocketState.Open)
        {
            var msg = $"CardBridge WebSocket not open (state={_ws.State}), cannot send {command}";
            _logger.LogError("🔌 {Message}", msg);
            throw new InvalidOperationException(msg);
        }

        var request = JsonSerializer.Serialize(new
        {
            cmd = command,
            data = Convert.ToBase64String(data)
        });

        _logger.LogDebug("📤 CardBridge JSON TX: {Json}", request);

        using var cts = new CancellationTokenSource(CommandTimeout);

        try
        {
            await _ws.SendAsync(
                Encoding.UTF8.GetBytes(request),
                WebSocketMessageType.Text,
                true,
                cts.Token);
        }
        catch (OperationCanceledException)
        {
            _logger.LogError("⏱️ CardBridge send timeout ({Command}, {Timeout}s)", command, CommandTimeout.TotalSeconds);
            throw;
        }
        catch (WebSocketException ex)
        {
            _logger.LogError(ex, "🔌 CardBridge send failed ({Command}), wsState={State}", command, _ws.State);
            throw;
        }

        try
        {
            var buffer = new byte[8192];
            var result = await _ws.ReceiveAsync(buffer, cts.Token);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                _logger.LogError("🔌 CardBridge closed connection during {Command}", command);
                throw new WebSocketException("CardBridge closed connection unexpectedly");
            }

            var responseJson = Encoding.UTF8.GetString(buffer, 0, result.Count);
            _logger.LogDebug("📥 CardBridge JSON RX: {Json}", responseJson);

            var response = JsonSerializer.Deserialize<JsonElement>(responseJson);

            if (response.TryGetProperty("error", out var error))
            {
                var errorMsg = error.GetString();
                _logger.LogError("❌ CardBridge error response ({Command}): {Error}", command, errorMsg);
                throw new Exception($"CardBridge error ({command}): {errorMsg}");
            }

            return Convert.FromBase64String(response.GetProperty("data").GetString()!);
        }
        catch (OperationCanceledException)
        {
            _logger.LogError("⏱️ CardBridge receive timeout ({Command}, {Timeout}s)", command, CommandTimeout.TotalSeconds);
            throw;
        }
        catch (WebSocketException ex)
        {
            _logger.LogError(ex, "🔌 CardBridge receive failed ({Command}), wsState={State}", command, _ws.State);
            throw;
        }
    }

    public void Dispose() => _ws.Dispose();
}
