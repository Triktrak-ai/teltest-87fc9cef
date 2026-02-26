using System.Net.Sockets;
using Microsoft.Extensions.Logging;
using TachoDddServer.Protocol;
using TachoDddServer.CardBridge;
using TachoDddServer.Storage;

namespace TachoDddServer.Session;

public class DddSession
{
    private readonly TcpClient _client;
    private readonly CardBridgeClient _bridge;
    private readonly string _outputDir;
    private readonly ILogger _logger;
    private SessionState _state = SessionState.WaitingForStatus;
    private readonly List<byte> _fileBuffer = new();

    public DddSession(TcpClient client, CardBridgeClient bridge, string outputDir, ILogger logger)
    {
        _client = client;
        _bridge = bridge;
        _outputDir = outputDir;
        _logger = logger;
    }

    public async Task RunAsync()
    {
        var stream = _client.GetStream();
        var buffer = new byte[4096];
        var recvBuffer = new List<byte>();

        _logger.LogInformation("Sesja DDD rozpoczęta, stan: {State}", _state);

        while (_client.Connected)
        {
            int bytesRead = await stream.ReadAsync(buffer);
            if (bytesRead == 0) break;

            recvBuffer.AddRange(buffer.AsSpan(0, bytesRead).ToArray());

            var frameData = recvBuffer.ToArray();
            var frame = Codec12Parser.Parse(frameData, frameData.Length);

            if (frame == null) continue;

            recvBuffer.Clear();
            _logger.LogInformation("📩 Odebrano ramkę Codec 12, typ: 0x{Type:X2}, {Len} bajtów",
                frame.Type, frame.Data.Length);

            await ProcessFrameAsync(stream, frame);

            if (_state == SessionState.Complete || _state == SessionState.Error)
                break;
        }

        _logger.LogInformation("Sesja zakończona, stan: {State}", _state);
    }

    private async Task ProcessFrameAsync(NetworkStream stream, Codec12Frame frame)
    {
        var packet = DddPacket.Parse(frame.Data);
        if (packet == null)
        {
            _logger.LogWarning("Nie można sparsować pakietu DDD");
            return;
        }

        var (type, data) = packet.Value;
        _logger.LogInformation("📦 Pakiet DDD: typ=0x{Type:X2}, dane={Len}B", (byte)type, data.Length);

        switch (_state)
        {
            case SessionState.WaitingForStatus:
                if (type == DddPacketType.Status)
                {
                    _logger.LogInformation("✅ Status odebrany: {Data}", BitConverter.ToString(data));
                    _state = SessionState.SendingATR;

                    byte[] atr = await _bridge.GetAtrAsync();
                    _logger.LogInformation("💳 ATR z karty: {ATR}", BitConverter.ToString(atr));

                    var atrPacket = DddPacket.Build(DddPacketType.SendATR, atr);
                    var atrFrame = Codec12Parser.Build(atrPacket);
                    await stream.WriteAsync(atrFrame);

                    _state = SessionState.WaitingForATR;
                    _logger.LogInformation("📤 ATR wysłany do FMB640");
                }
                break;

            case SessionState.WaitingForATR:
                _state = SessionState.ApduLoop;
                _logger.LogInformation("🔄 Wejście w pętlę APDU");
                goto case SessionState.ApduLoop;

            case SessionState.ApduLoop:
                if (type == DddPacketType.APDUResponse || type == DddPacketType.SendAPDU)
                {
                    _logger.LogInformation("🔀 APDU do karty: {Len}B", data.Length);
                    byte[] cardResponse = await _bridge.TransmitApduAsync(data);
                    _logger.LogInformation("🔀 Odpowiedź karty: {Len}B", cardResponse.Length);

                    var respPacket = DddPacket.Build(DddPacketType.SendAPDU, cardResponse);
                    var respFrame = Codec12Parser.Build(respPacket);
                    await stream.WriteAsync(respFrame);
                }
                else if (type == DddPacketType.AuthOK)
                {
                    _logger.LogInformation("🔐 Autentykacja zakończona pomyślnie!");
                    _state = SessionState.Downloading;
                }
                else if (type == DddPacketType.FileData)
                {
                    _state = SessionState.Downloading;
                    goto case SessionState.Downloading;
                }
                break;

            case SessionState.Downloading:
                if (type == DddPacketType.FileData)
                {
                    _fileBuffer.AddRange(data);
                    _logger.LogInformation("📥 Fragment pliku: {Len}B, łącznie: {Total}B",
                        data.Length, _fileBuffer.Count);
                }
                else if (type == DddPacketType.Status && data.Length > 0 && data[0] == 0x00)
                {
                    var fileName = $"tacho_{DateTime.Now:yyyyMMdd_HHmmss}.ddd";
                    var filePath = Path.Combine(_outputDir, fileName);
                    DddFileWriter.Save(filePath, _fileBuffer.ToArray());
                    _logger.LogInformation("💾 Plik zapisany: {Path} ({Size}B)", filePath, _fileBuffer.Count);
                    _state = SessionState.Complete;
                }
                break;
        }
    }
}
