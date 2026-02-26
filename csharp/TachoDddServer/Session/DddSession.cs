using System.Net.Sockets;
using Microsoft.Extensions.Logging;
using TachoDddServer.Protocol;
using TachoDddServer.CardBridge;
using TachoDddServer.Storage;
using TachoDddServer.Logging;

namespace TachoDddServer.Session;

public class DddSession
{
    private readonly TcpClient _client;
    private readonly CardBridgeClient _bridge;
    private readonly string _outputDir;
    private readonly ILogger _logger;
    private readonly TrafficLogger? _trafficLogger;

    private SessionState _state = SessionState.WaitingForImei;
    private string _imei = "";
    private VuGeneration _vuGeneration = VuGeneration.Unknown;
    private byte _features = 0;
    private byte _resumeState = 0;

    // File download state
    private readonly List<DddFileType> _filesToDownload = new();
    private int _currentFileIndex = -1;
    private DddFileType _currentFileType;
    private string _currentFilePath = "";
    private byte _currentSequenceNumber = 0;
    private readonly List<byte> _fileBuffer = new();

    // Keep alive
    private DateTime _lastActivity = DateTime.UtcNow;
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(70);

    public DddSession(TcpClient client, CardBridgeClient bridge, string outputDir, ILogger logger,
        string? trafficLogDir = null, bool logTraffic = false)
    {
        _client = client;
        _bridge = bridge;
        _outputDir = outputDir;
        _logger = logger;

        if (logTraffic && trafficLogDir != null)
        {
            var endpoint = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
            var sessionId = endpoint.Replace(":", "_").Replace(".", "-");
            _trafficLogger = new TrafficLogger(trafficLogDir, sessionId);
        }
    }

    public async Task RunAsync()
    {
        var stream = _client.GetStream();
        var buffer = new byte[8192];
        var recvBuffer = new List<byte>();

        _logger.LogInformation("Sesja DDD rozpoczęta, stan: {State}", _state);

        try
        {
            while (_client.Connected)
            {
                // Keep alive check
                if (DateTime.UtcNow - _lastActivity > KeepAliveInterval &&
                    _state != SessionState.WaitingForImei)
                {
                    await SendKeepAliveAsync(stream);
                }

                if (!stream.DataAvailable)
                {
                    await Task.Delay(50);
                    continue;
                }

                int bytesRead = await stream.ReadAsync(buffer);
                if (bytesRead == 0) break;

                _trafficLogger?.Log("RX", buffer, bytesRead);
                _lastActivity = DateTime.UtcNow;

                recvBuffer.AddRange(buffer.AsSpan(0, bytesRead).ToArray());

                // Handle IMEI packet separately (not Codec 12)
                if (_state == SessionState.WaitingForImei)
                {
                    if (recvBuffer.Count >= 17)
                    {
                        await HandleImeiPacket(stream, recvBuffer);
                        recvBuffer.Clear();
                    }
                    continue;
                }

                // Try to parse Codec 12 frames
                while (recvBuffer.Count > 0)
                {
                    var frameData = recvBuffer.ToArray();
                    var frame = Codec12Parser.Parse(frameData, frameData.Length);

                    if (frame == null) break;

                    // Calculate consumed bytes: 4 (zeros) + 4 (dataLen) + dataLen + 4 (CRC+zeros)
                    int dataLen = (frameData[4] << 24) | (frameData[5] << 16) |
                                  (frameData[6] << 8) | frameData[7];
                    int consumed = 4 + 4 + dataLen + 4;
                    recvBuffer.RemoveRange(0, Math.Min(consumed, recvBuffer.Count));

                    _logger.LogInformation("📩 Codec 12 frame, type: 0x{Type:X2}, {Len} bytes",
                        frame.Type, frame.Data.Length);

                    await ProcessFrameAsync(stream, frame);

                    if (_state == SessionState.Complete || _state == SessionState.Error)
                        break;
                }

                if (_state == SessionState.Complete || _state == SessionState.Error)
                    break;
            }
        }
        finally
        {
            _trafficLogger?.Dispose();
        }

        _logger.LogInformation("Sesja zakończona, IMEI: {Imei}, stan: {State}, generacja: {Gen}",
            _imei, _state, _vuGeneration);
    }

    // ─── IMEI handling ───────────────────────────────────────────────

    private async Task HandleImeiPacket(NetworkStream stream, List<byte> data)
    {
        // IMEI packet: 2 bytes length (0x000F) + 15 bytes IMEI ASCII
        int imeiLen = (data[0] << 8) | data[1];
        if (imeiLen != 15 || data.Count < 17)
        {
            _logger.LogWarning("❌ Nieprawidłowy pakiet IMEI, długość: {Len}", imeiLen);
            _state = SessionState.Error;
            return;
        }

        _imei = System.Text.Encoding.ASCII.GetString(data.ToArray(), 2, 15);
        _logger.LogInformation("📱 IMEI: {Imei}", _imei);

        // Send IMEI ACK (0x01)
        await SendRawAsync(stream, new byte[] { 0x01 });
        _state = SessionState.WaitingForStatus;
        _logger.LogInformation("✅ IMEI zaakceptowany, czekam na STATUS");
    }

    // ─── Frame processing ────────────────────────────────────────────

    private async Task ProcessFrameAsync(NetworkStream stream, Codec12Frame frame)
    {
        var packet = DddPacket.Parse(frame.Data);
        if (packet == null)
        {
            _logger.LogWarning("❌ Cannot parse DDD packet");
            return;
        }

        var (type, data) = packet.Value;
        _logger.LogInformation("📦 DDD: type=0x{Type:X2}, {Len}B, state={State}",
            (byte)type, data.Length, _state);

        // Handle keep alive from device (any state)
        if (type == DddPacketType.KeepAlive)
        {
            _logger.LogDebug("💓 Keep alive received");
            return;
        }

        // Handle errors (any state)
        if (type == DddPacketType.Error)
        {
            HandleError(data);
            // After error, request status to see if we can resume
            await SendDddPacketAsync(stream, DddPacketType.Status);
            _state = SessionState.WaitingForStatus;
            return;
        }

        switch (_state)
        {
            case SessionState.WaitingForStatus:
                await HandleStatusPacket(stream, type, data);
                break;

            case SessionState.RequestingDriverInfo:
                if (type == DddPacketType.DriverInfo)
                {
                    _logger.LogInformation("👤 Driver info received ({Len}B)", data.Length);
                    // Proceed to authentication
                    await StartAuthenticationAsync(stream);
                }
                break;

            case SessionState.ApduLoop:
                await HandleApduLoop(stream, type, data);
                break;

            case SessionState.CheckingInterfaceVersion:
                await HandleInterfaceVersionResponse(stream, type, data);
                break;

            case SessionState.WaitingForDownloadListAck:
                await HandleDownloadListAck(stream, type, data);
                break;

            case SessionState.DownloadingFile:
                await HandleFileData(stream, type, data);
                break;

            default:
                _logger.LogWarning("⚠️ Unexpected packet 0x{Type:X2} in state {State}",
                    (byte)type, _state);
                break;
        }
    }

    // ─── STATUS ──────────────────────────────────────────────────────

    private async Task HandleStatusPacket(NetworkStream stream, DddPacketType type, byte[] data)
    {
        if (type != DddPacketType.Status)
        {
            _logger.LogWarning("⚠️ Expected STATUS, got 0x{Type:X2}", (byte)type);
            return;
        }

        // Status payload: "STATUS" (6B) + PayloadType(1B) + StatusData(4B) + ResumeState(1B) + Features(1B)
        // But from Codec12, the data after payload type is:
        // STATUS(6B ascii) + 0x01(payload type, already stripped) + ...
        // Actually the full payload parsed by DddPacket is:
        // data = [STATUS_ascii(6B)] [resume_state(1B)] [seq_number(4B)] [features(1B)]
        // Let me parse what we have
        if (data.Length >= 8)
        {
            _resumeState = data[6]; // resume state byte
            _features = data.Length >= 12 ? data[11] : (byte)0;

            _logger.LogInformation("📊 STATUS: resume=0x{Resume:X2}, features=0x{Features:X2}",
                _resumeState, _features);

            // Check ignition (bit 6 of resume state)
            if ((_resumeState & 0x40) == 0)
            {
                _logger.LogWarning("🔑 Ignition OFF — nie można pobierać DDD");
                await SendTerminateAsync(stream);
                return;
            }
        }
        else
        {
            _logger.LogInformation("📊 STATUS received ({Len}B)", data.Length);
        }

        // Check if device supports driver info (features bit 1)
        bool supportsDriverInfo = (_features & 0x02) != 0;
        if (supportsDriverInfo)
        {
            _state = SessionState.RequestingDriverInfo;
            await SendDddPacketAsync(stream, DddPacketType.DriverInfo);
            _logger.LogInformation("👤 Requesting driver info...");
        }
        else
        {
            await StartAuthenticationAsync(stream);
        }
    }

    // ─── AUTHENTICATION ──────────────────────────────────────────────

    private async Task StartAuthenticationAsync(NetworkStream stream)
    {
        _state = SessionState.ApduLoop;

        byte[] atr = await _bridge.GetAtrAsync();
        _logger.LogInformation("💳 ATR from card: {ATR}", BitConverter.ToString(atr));

        await SendDddPacketAsync(stream, DddPacketType.ATR, atr);
        _logger.LogInformation("📤 ATR sent to device");
    }

    private async Task HandleApduLoop(NetworkStream stream, DddPacketType type, byte[] data)
    {
        if (type == DddPacketType.VUReadyAPDU || type == DddPacketType.APDU)
        {
            _logger.LogInformation("🔀 APDU to card: {Len}B", data.Length);
            byte[] cardResponse = await _bridge.TransmitApduAsync(data);
            _logger.LogInformation("🔀 Card response: {Len}B", cardResponse.Length);

            await SendDddPacketAsync(stream, DddPacketType.APDU, cardResponse);
        }
        else if (type == DddPacketType.AuthOK)
        {
            _logger.LogInformation("🔐 Authentication OK!");

            // After auth OK, check interface version (Gen2v2 detection)
            _state = SessionState.CheckingInterfaceVersion;
            await RequestFileAsync(stream, DddFileType.InterfaceVersion);
        }
        else
        {
            _logger.LogWarning("⚠️ Unexpected in APDU loop: 0x{Type:X2}", (byte)type);
        }
    }

    // ─── INTERFACE VERSION (Gen detection) ───────────────────────────

    private async Task HandleInterfaceVersionResponse(NetworkStream stream, DddPacketType type, byte[] data)
    {
        if (type == DddPacketType.FileDataEOF)
        {
            // Positive response — parse TREP to detect generation
            // EOF payload: [fileType(1B)] [seqNum(1B)] [SID(1B)?] [TREP(1B)?] [data...]
            if (data.Length >= 4)
            {
                byte trep = data[3]; // 0x01=Gen1, 0x01=Gen2v1 default, 0x02=Gen2v2
                // Check for 0202 pattern meaning Gen2v2
                if (data.Length >= 5 && data[3] == 0x02 && data[4] == 0x02)
                {
                    _vuGeneration = VuGeneration.Gen2v2;
                }
                else if (data.Length >= 5 && data[3] == 0x01 && data[4] == 0x01)
                {
                    _vuGeneration = VuGeneration.Gen1; // or Gen2v1, will refine
                }
                else
                {
                    _vuGeneration = VuGeneration.Gen1;
                }
            }
            else
            {
                _vuGeneration = VuGeneration.Gen1;
            }

            _logger.LogInformation("🔍 Detected VU generation: {Gen}", _vuGeneration);
            await StartDownloadListAsync(stream);
        }
        else if (type == DddPacketType.Error)
        {
            // Negative response = Gen1 or Gen2v1 (doesn't support interface version)
            _vuGeneration = VuGeneration.Gen1;
            _logger.LogInformation("🔍 Interface version not supported — assuming Gen1");
            await StartDownloadListAsync(stream);
        }
        else
        {
            _logger.LogWarning("⚠️ Unexpected in version check: 0x{Type:X2}", (byte)type);
        }
    }

    // ─── DOWNLOAD LIST ───────────────────────────────────────────────

    private async Task StartDownloadListAsync(NetworkStream stream)
    {
        _state = SessionState.WaitingForDownloadListAck;

        // Build file list based on generation
        BuildFileList();

        // Send download list request
        await SendDddPacketAsync(stream, DddPacketType.DownloadList, BuildDownloadListPayload());
        _logger.LogInformation("📋 Download list sent ({Count} files, gen={Gen})",
            _filesToDownload.Count, _vuGeneration);
    }

    private void BuildFileList()
    {
        _filesToDownload.Clear();
        _filesToDownload.Add(DddFileType.Overview);
        _filesToDownload.Add(DddFileType.Activities);
        _filesToDownload.Add(DddFileType.EventsAndFaults);
        _filesToDownload.Add(DddFileType.DetailedSpeed);
        _filesToDownload.Add(DddFileType.TechnicalData);
        // Driver cards can be added if driver info indicated cards are present
    }

    private byte[] BuildDownloadListPayload()
    {
        // Download list request payload contains TRTP codes for each file
        var payload = new List<byte>();
        foreach (var fileType in _filesToDownload)
        {
            payload.Add(GetTrtp(fileType));
        }
        return payload.ToArray();
    }

    /// <summary>
    /// Get the Transfer Request Type Parameter for a file based on VU generation.
    /// Gen1: 01-05, Gen2v1: 21-25, Gen2v2: 31-35
    /// </summary>
    private byte GetTrtp(DddFileType fileType)
    {
        byte baseCode = fileType switch
        {
            DddFileType.InterfaceVersion => 0x00,
            DddFileType.Overview => 0x01,
            DddFileType.Activities => 0x02,
            DddFileType.EventsAndFaults => 0x03,
            DddFileType.DetailedSpeed => 0x04,
            DddFileType.TechnicalData => 0x05,
            DddFileType.DriverCard1 => 0x06,
            DddFileType.DriverCard2 => 0x06,
            _ => 0x01
        };

        // Driver cards and interface version don't change per generation
        if (fileType == DddFileType.DriverCard1 || fileType == DddFileType.DriverCard2 ||
            fileType == DddFileType.InterfaceVersion)
            return baseCode;

        // DetailedSpeed: Gen2v2 doesn't have it (no 0x34), use Gen2v1 code 0x24
        if (fileType == DddFileType.DetailedSpeed && _vuGeneration == VuGeneration.Gen2v2)
            return 0x24; // fallback to Gen2v1

        return _vuGeneration switch
        {
            VuGeneration.Gen2v2 => (byte)(baseCode + 0x30),
            VuGeneration.Gen2v1 => (byte)(baseCode + 0x20),
            _ => baseCode // Gen1
        };
    }

    private async Task HandleDownloadListAck(NetworkStream stream, DddPacketType type, byte[] data)
    {
        if (type == DddPacketType.DownloadList)
        {
            _logger.LogInformation("✅ Download list ACK received");
            _currentFileIndex = -1;
            await RequestNextFileAsync(stream);
        }
        else
        {
            _logger.LogWarning("⚠️ Expected DownloadList ACK, got 0x{Type:X2}", (byte)type);
        }
    }

    // ─── FILE DOWNLOAD ───────────────────────────────────────────────

    private async Task RequestNextFileAsync(NetworkStream stream)
    {
        _currentFileIndex++;

        if (_currentFileIndex >= _filesToDownload.Count)
        {
            // All files downloaded — terminate session
            _logger.LogInformation("🎉 All {Count} files downloaded!", _filesToDownload.Count);
            await SendTerminateAsync(stream);
            return;
        }

        _currentFileType = _filesToDownload[_currentFileIndex];
        _currentSequenceNumber = 0;
        _fileBuffer.Clear();

        _state = SessionState.DownloadingFile;
        await RequestFileAsync(stream, _currentFileType);

        _logger.LogInformation("📥 Requesting file {Idx}/{Total}: {Type} (TRTP=0x{Trtp:X2})",
            _currentFileIndex + 1, _filesToDownload.Count, _currentFileType, GetTrtp(_currentFileType));
    }

    private async Task RequestFileAsync(NetworkStream stream, DddFileType fileType)
    {
        byte trtp = GetTrtp(fileType);
        byte[] payload;

        if (fileType == DddFileType.Activities)
        {
            // Activities need start + end timestamps (download last 28 days)
            var end = DateTimeOffset.UtcNow;
            var start = end.AddDays(-28);
            payload = new byte[9];
            payload[0] = trtp;
            WriteBigEndianUint32(payload, 1, (uint)start.ToUnixTimeSeconds());
            WriteBigEndianUint32(payload, 5, (uint)end.ToUnixTimeSeconds());
        }
        else if (fileType == DddFileType.DriverCard1)
        {
            payload = new byte[] { trtp, 0x01 }; // slot 1
        }
        else if (fileType == DddFileType.DriverCard2)
        {
            payload = new byte[] { trtp, 0x02 }; // slot 2
        }
        else
        {
            payload = new byte[] { trtp };
        }

        await SendDddPacketAsync(stream, DddPacketType.FileRequest, payload);
    }

    private async Task HandleFileData(NetworkStream stream, DddPacketType type, byte[] data)
    {
        if (type == DddPacketType.FileData)
        {
            // File data: [fileType(1B)] [seqNum(1B)] [data...]
            if (data.Length < 2) return;

            byte seqNum = data[1];
            int dataOffset = 2;

            // First packet of a file also contains SID (0x76) + TREP
            if (_currentSequenceNumber == 0 && data.Length > 4 && data[2] == 0x76)
            {
                dataOffset = 4; // skip SID + TREP
                _logger.LogInformation("📄 File start — SID=0x{SID:X2}, TREP=0x{TREP:X2}",
                    data[2], data[3]);
            }

            // Append file data (skip fileType + seqNum + SID/TREP)
            if (data.Length > dataOffset)
            {
                _fileBuffer.AddRange(data.AsSpan(dataOffset).ToArray());
            }

            _currentSequenceNumber = (byte)(seqNum + 1);
            _logger.LogInformation("📥 Chunk seq={Seq}, {Len}B, total={Total}B",
                seqNum, data.Length - dataOffset, _fileBuffer.Count);

            // Send ACK with next expected sequence number
            var ackPayload = new byte[] { data[0], _currentSequenceNumber };
            await SendDddPacketAsync(stream, DddPacketType.FileData, ackPayload);
        }
        else if (type == DddPacketType.FileDataEOF)
        {
            // EOF: [fileType(1B)] [seqNum(1B)] [remaining data...]
            if (data.Length > 2)
            {
                _fileBuffer.AddRange(data.AsSpan(2).ToArray());
            }

            // Save file
            SaveCurrentFile();
            _logger.LogInformation("💾 File saved: {Type}, {Size}B", _currentFileType, _fileBuffer.Count);

            // Request next file (no ACK for EOF)
            await RequestNextFileAsync(stream);
        }
        else if (type == DddPacketType.Error)
        {
            // Error during file download — skip this file, try next
            _logger.LogWarning("⚠️ Error downloading {Type}, skipping", _currentFileType);
            await RequestNextFileAsync(stream);
        }
        else
        {
            _logger.LogWarning("⚠️ Unexpected 0x{Type:X2} during download", (byte)type);
        }
    }

    private void SaveCurrentFile()
    {
        if (_fileBuffer.Count == 0) return;

        string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        string fileName = _currentFileType switch
        {
            DddFileType.Overview => $"{_imei}_overview_{timestamp}.ddd",
            DddFileType.Activities => $"{_imei}_activities_{timestamp}.ddd",
            DddFileType.EventsAndFaults => $"{_imei}_events_{timestamp}.ddd",
            DddFileType.DetailedSpeed => $"{_imei}_speed_{timestamp}.ddd",
            DddFileType.TechnicalData => $"{_imei}_technical_{timestamp}.ddd",
            DddFileType.DriverCard1 => $"{_imei}_driver1_{timestamp}.ddd",
            DddFileType.DriverCard2 => $"{_imei}_driver2_{timestamp}.ddd",
            _ => $"{_imei}_unknown_{timestamp}.ddd"
        };

        var filePath = Path.Combine(_outputDir, _imei, fileName);
        DddFileWriter.Save(filePath, _fileBuffer.ToArray());
        _logger.LogInformation("💾 {Path} ({Size}B)", filePath, _fileBuffer.Count);
    }

    // ─── ERROR handling ──────────────────────────────────────────────

    private void HandleError(byte[] data)
    {
        if (data.Length >= 3)
        {
            byte errorClass = data[0];
            byte errorCode = data[1];
            ushort errorState = (ushort)((data[2] << 8) | (data.Length > 3 ? data[3] : 0));

            _logger.LogError("❌ ERROR class={Class}, code={Code:X2}, state=0x{State:X4}",
                errorClass, errorCode, errorState);

            // Error 020A = Auth failure (certificate rejected)
            if (errorClass == 2 && errorCode == 0x0A)
            {
                _logger.LogError("🔒 Authentication failure — certificate rejected");
                _state = SessionState.Error;
            }
        }
        else
        {
            _logger.LogError("❌ ERROR packet ({Len}B)", data.Length);
        }
    }

    // ─── TERMINATE ───────────────────────────────────────────────────

    private async Task SendTerminateAsync(NetworkStream stream)
    {
        await SendDddPacketAsync(stream, DddPacketType.Terminate);
        _state = SessionState.Complete;
        _logger.LogInformation("🏁 Terminate sent, session complete");
    }

    // ─── Low-level send helpers ──────────────────────────────────────

    private async Task SendDddPacketAsync(NetworkStream stream, DddPacketType type, byte[]? data = null)
    {
        var dddPayload = DddPacket.Build(type, data);
        var frame = Codec12Parser.Build(dddPayload);
        await SendRawAsync(stream, frame);
    }

    private async Task SendRawAsync(NetworkStream stream, byte[] data)
    {
        await stream.WriteAsync(data);
        _trafficLogger?.Log("TX", data, data.Length);
        _lastActivity = DateTime.UtcNow;
    }

    private async Task SendKeepAliveAsync(NetworkStream stream)
    {
        await SendDddPacketAsync(stream, DddPacketType.KeepAlive);
        _logger.LogDebug("💓 Keep alive sent");
    }

    // ─── Utilities ───────────────────────────────────────────────────

    private static void WriteBigEndianUint32(byte[] buffer, int offset, uint value)
    {
        buffer[offset] = (byte)(value >> 24);
        buffer[offset + 1] = (byte)(value >> 16);
        buffer[offset + 2] = (byte)(value >> 8);
        buffer[offset + 3] = (byte)value;
    }
}
