using System.Net.Sockets;
using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using TachoDddServer.Protocol;
using TachoDddServer.CardBridge;
using TachoDddServer.Storage;
using TachoDddServer.Logging;
using TachoDddServer.Reporting;

namespace TachoDddServer.Session;

public class DddSession
{
    private readonly TcpClient _client;
    private readonly CardBridgeClient _bridge;
    private readonly string _outputDir;
    private readonly ILogger _logger;
    private readonly TrafficLogger? _trafficLogger;
    private readonly SessionDiagnostics _diagnostics;
    private readonly WebReporter? _webReporter;
    private readonly string? _logDir;

    private SessionState _state = SessionState.WaitingForImei;
    private string _imei = "";
    private VuGeneration _vuGeneration = VuGeneration.Unknown;
    private string _cardGeneration = "Unknown";
    private string _detectedVuGenFromApdu = "Unknown";
    private byte _features = 0;
    private byte _resumeState = 0;
    private uint _lastSequenceNumber = 0;
    private int _successfulDownloads = 0;

    // SID/TREP tracking
    private byte _lastSid = 0;
    private byte _lastTrep = 0;

    // File download state
    private readonly List<DddFileType> _filesToDownload = new();
    private int _currentFileIndex = -1;
    private DddFileType _currentFileType;
    
    private byte _currentSequenceNumber = 0;
    private readonly List<byte> _fileBuffer = new();

    // Downloaded files storage for merging
    private readonly Dictionary<DddFileType, byte[]> _downloadedFiles = new();

    // CRC repeat request tracking
    private int _crcRetryCount = 0;
    private const int MaxCrcRetries = 3;

    // Authentication retry tracking
    private int _authRetryCount = 0;
    private const int MaxAuthRetries = 3;

    // Keep alive

    // Keep alive
    private DateTime _lastActivity = DateTime.UtcNow;
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(80);

    public DddSession(TcpClient client, CardBridgeClient bridge, string outputDir, ILogger logger,
        string? trafficLogDir = null, bool logTraffic = false,
        WebReporter? webReporter = null)
    {
        _client = client;
        _bridge = bridge;
        _outputDir = outputDir;
        _logger = logger;
        _logDir = trafficLogDir;

        var endpoint = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
        _diagnostics = new SessionDiagnostics(endpoint);

        if (logTraffic && trafficLogDir != null)
        {
            var sessionId = _diagnostics.SessionId;
            _trafficLogger = new TrafficLogger(trafficLogDir, sessionId);
        }

        _webReporter = webReporter;

        _logger.LogInformation("📋 Session created: id={SessionId}, endpoint={Endpoint}",
            _diagnostics.SessionId, endpoint);
    }

    // ─── State management ────────────────────────────────────────────

    private void TransitionTo(SessionState newState, string reason)
    {
        var oldState = _state;
        _state = newState;
        _diagnostics.LogStateTransition(oldState, newState, reason);
        _trafficLogger?.LogStateChange(oldState, newState, reason);
        _logger.LogInformation("STATE {From} -> {To} [{Reason}]", oldState, newState, reason);

        // Map SessionState to web dashboard status
        var webStatus = newState switch
        {
            SessionState.WaitingForImei or SessionState.WaitingForStatus => "connecting",
            SessionState.RequestingDriverInfo => "connecting",
            SessionState.ApduLoop => _vuGeneration switch
            {
                VuGeneration.Gen2v2 => "auth_gen2v2",
                VuGeneration.Gen2v1 => "auth_gen2v1",
                VuGeneration.Gen1 => "auth_gen1",
                _ => "connecting"
            },
            SessionState.CheckingInterfaceVersion => "connecting",
            SessionState.WaitingForDownloadListAck => "waiting",
            SessionState.DownloadingFile or SessionState.ResumingDownload => "downloading",
            SessionState.Complete => "completed",
            SessionState.Error => "error",
            _ => "connecting"
        };

        var progress = _filesToDownload.Count > 0
            ? (int)(_currentFileIndex * 100.0 / _filesToDownload.Count)
            : 0;

        _webReporter?.ReportStatus(
            webStatus, progress, _successfulDownloads,
            _filesToDownload.Count,
            _currentFileType.ToString(),
            _diagnostics.BytesSent + _diagnostics.BytesReceived,
            _diagnostics.ApduExchanges, _diagnostics.CrcErrors,
            "info", $"{oldState} → {newState}: {reason}", "TransitionTo");
    }

    // ─── Main loop ───────────────────────────────────────────────────

    public async Task RunAsync()
    {
        var stream = _client.GetStream();
        var buffer = new byte[8192];
        var recvBuffer = new List<byte>();

        _logger.LogInformation("🚀 Session {Id} started, state: {State}", _diagnostics.SessionId, _state);

        try
        {
            // Connect to CardBridge first (inside session so logs/diagnostics are available on failure)
            await _bridge.ConnectAsync();
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
                _diagnostics.BytesReceived += bytesRead;
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

                // Try to parse Codec 12 frames with CRC verification
                while (recvBuffer.Count > 0)
                {
                    var frameData = recvBuffer.ToArray();
                    var result = Codec12Parser.ParseWithCrc(frameData, frameData.Length);

                    if (result.Frame == null && !result.CrcError)
                        break; // incomplete frame

                    if (result.CrcError)
                    {
                        _crcRetryCount++;
                        _diagnostics.CrcErrors++;
                        _logger.LogWarning("⚠️ CRC error (attempt {Count}/{Max})", _crcRetryCount, MaxCrcRetries);
                        _trafficLogger?.LogWarning($"CRC error (attempt {_crcRetryCount}/{MaxCrcRetries})");
                        _diagnostics.LogWarning($"CRC error (attempt {_crcRetryCount}/{MaxCrcRetries})");

                        if (_crcRetryCount < MaxCrcRetries)
                        {
                            await SendDddPacketAsync(stream, DddPacketType.RepeatRequest);
                        }
                        else
                        {
                            _logger.LogError("❌ Max CRC retries exceeded, dropping frame");
                            _trafficLogger?.LogError("CRC", "Max retries exceeded, dropping frame");
                            _diagnostics.LogError("CRC", "Max CRC retries exceeded, frame dropped");
                            _crcRetryCount = 0;
                        }

                        recvBuffer.RemoveRange(0, Math.Min(result.ConsumedBytes, recvBuffer.Count));
                        continue;
                    }

                    // Valid frame — reset CRC retry counter
                    _crcRetryCount = 0;
                    recvBuffer.RemoveRange(0, Math.Min(result.ConsumedBytes, recvBuffer.Count));

                    _logger.LogInformation("📩 Codec12 frame: type=0x{Type:X2}, {Len}B, state={State}",
                        result.Frame!.Type, result.Frame.Data.Length, _state);

                    await ProcessFrameAsync(stream, result.Frame);

                    if (_state == SessionState.Complete || _state == SessionState.Error)
                        break;
                }

                if (_state == SessionState.Complete || _state == SessionState.Error)
                    break;
            }
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("RunAsync", ex);
            _trafficLogger?.LogError("RunAsync", ex);
            _logger.LogError(ex, "💥 Fatal error in session {Id}", _diagnostics.SessionId);
            TransitionTo(SessionState.Error, $"Fatal: {ex.GetType().Name}: {ex.Message}");
        }
        finally
        {
            // Generate and save session summary
            _diagnostics.Imei = _imei;
            _diagnostics.Generation = _vuGeneration;
            _diagnostics.CardGeneration = _cardGeneration;
            _diagnostics.Finish();

            var summary = _diagnostics.GenerateSummary();
            _logger.LogInformation("\n{Summary}", summary);
            _trafficLogger?.LogSummary(summary);

            // Save JSON/text report
            if (_logDir != null)
            {
                _diagnostics.SaveToFile(_logDir);
            }

            _trafficLogger?.Dispose();
            // WebReporter is owned by Program.cs, do not dispose here
        }

        _logger.LogInformation("Session {Id} ended: IMEI={Imei}, state={State}, gen={Gen}",
            _diagnostics.SessionId, _imei, _state, _vuGeneration);
    }

    // ─── IMEI handling ───────────────────────────────────────────────

    private async Task HandleImeiPacket(NetworkStream stream, List<byte> data)
    {
        try
        {
            int imeiLen = (data[0] << 8) | data[1];
            if (imeiLen != 15 || data.Count < 17)
            {
                _logger.LogWarning("❌ Invalid IMEI packet, length: {Len}", imeiLen);
                _diagnostics.LogError("HandleImeiPacket", $"Invalid IMEI length: {imeiLen}, data.Count={data.Count}");
                TransitionTo(SessionState.Error, $"Invalid IMEI length: {imeiLen}");
                return;
            }

            _imei = System.Text.Encoding.ASCII.GetString(data.ToArray(), 2, 15);
            _diagnostics.Imei = _imei;
            _webReporter?.SetImei(_imei);
            _logger.LogInformation("📱 IMEI: {Imei}", _imei);
            _trafficLogger?.LogDecoded("RX", "IMEI", 15, $"IMEI={_imei}");

            // ── Download gate: check if already downloaded today ──
            if (_webReporter != null)
            {
                var shouldDownload = await _webReporter.CheckDownloadScheduleAsync();
                if (!shouldDownload)
                {
                    _logger.LogInformation("⏭️ IMEI {Imei} already downloaded today — skipping", _imei);
                    _webReporter.ReportStatus("skipped", 0, 0, 0, null, 0, 0, 0,
                        "info", $"Download skipped — already completed today for {_imei}", "DownloadSkipped");
                    await SendRawAsync(stream, new byte[] { 0x01 }); // ACK IMEI
                    _trafficLogger?.LogDecoded("TX", "IMEI_ACK", 1, "Accepted (but skipping download)");
                    TransitionTo(SessionState.Complete, "Already downloaded today — skipped");
                    return;
                }
            }

            await SendRawAsync(stream, new byte[] { 0x01 });
            _trafficLogger?.LogDecoded("TX", "IMEI_ACK", 1, "Accepted");
            TransitionTo(SessionState.WaitingForStatus, "IMEI accepted");
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("HandleImeiPacket", ex);
            _trafficLogger?.LogError("HandleImeiPacket", ex);
            _logger.LogError(ex, "Error handling IMEI packet");
            TransitionTo(SessionState.Error, $"IMEI error: {ex.Message}");
        }
    }

    // ─── Frame processing ────────────────────────────────────────────

    private async Task ProcessFrameAsync(NetworkStream stream, Codec12Frame frame)
    {
        var packet = DddPacket.Parse(frame.Data);
        if (packet == null)
        {
            _logger.LogWarning("❌ Cannot parse DDD packet from frame data ({Len}B)", frame.Data.Length);
            _diagnostics.LogWarning($"Unparseable DDD packet ({frame.Data.Length}B)");
            return;
        }

        var (type, data) = packet.Value;
        var typeName = type.ToString();

        // Log every received packet to diagnostics
        _diagnostics.LogPacket("RX", (byte)type, data.Length, $"state={_state}");
        _trafficLogger?.LogDecodedWithHex("RX", typeName, data, 32, $"state={_state}");

        _logger.LogInformation("📦 DDD: {TypeName} (0x{Type:X2}), {Len}B, state={State}",
            typeName, (byte)type, data.Length, _state);

        // Handle keep alive from device (any state)
        if (type == DddPacketType.KeepAlive)
        {
            _logger.LogDebug("💓 Keep alive received");
            return;
        }

        // Handle errors (any state)
        if (type == DddPacketType.Error &&
            _state != SessionState.CheckingInterfaceVersion &&
            _state != SessionState.DownloadingFile)
        {
            var stateBeforeError = _state;
            HandleError(data);

            // Check if this is an auth error in ApduLoop — limit retries
            if (stateBeforeError == SessionState.ApduLoop)
            {
                _authRetryCount++;
                _logger.LogWarning("🔁 Auth error attempt {Count}/{Max}", _authRetryCount, MaxAuthRetries);

                if (_authRetryCount >= MaxAuthRetries)
                {
                    _logger.LogError("❌ Max authentication retries ({Max}) exceeded — aborting session", MaxAuthRetries);
                    _diagnostics.LogError("Authentication", $"Max retries ({MaxAuthRetries}) exceeded");
                    _trafficLogger?.LogError("Authentication", $"Max retries exceeded after {_authRetryCount} attempts");
                    TransitionTo(SessionState.Error, $"Authentication failed after {MaxAuthRetries} attempts");
                    return;
                }
            }

            // Reset card to MF context before retry so VU can SELECT EF_ICC again
            if (stateBeforeError == SessionState.ApduLoop)
            {
                await TryResetCardState();
            }

            await SendDddPacketAsync(stream, DddPacketType.Status);
            TransitionTo(SessionState.WaitingForStatus, "Error received, requesting STATUS");
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
                    _trafficLogger?.LogDecoded("RX", "DriverInfo", data.Length, "Proceeding to authentication");
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
                _logger.LogWarning("⚠️ Unexpected packet {TypeName} (0x{Type:X2}) in state {State}",
                    typeName, (byte)type, _state);
                _diagnostics.LogWarning($"Unexpected packet {typeName} in state {_state}");
                break;
        }
    }

    // ─── STATUS ──────────────────────────────────────────────────────

    private async Task HandleStatusPacket(NetworkStream stream, DddPacketType type, byte[] data)
    {
        if (type != DddPacketType.Status)
        {
            _logger.LogWarning("⚠️ Expected STATUS, got {TypeName} (0x{Type:X2})", type, (byte)type);
            _diagnostics.LogWarning($"Expected STATUS, got {type} (0x{(byte)type:X2})");
            return;
        }

        try
        {
            if (data.Length >= 12)
            {
                _resumeState = data[6];
                _lastSequenceNumber = (uint)((data[7] << 24) | (data[8] << 16) | (data[9] << 8) | data[10]);
                _features = data[11];

                _logger.LogInformation("📊 STATUS: resume=0x{Resume:X2}, seqNum={SeqNum}, features=0x{Features:X2}",
                    _resumeState, _lastSequenceNumber, _features);
                _trafficLogger?.LogDecoded("RX", "STATUS", data.Length,
                    $"resume=0x{_resumeState:X2} seqNum={_lastSequenceNumber} features=0x{_features:X2}");

                if ((_resumeState & 0x40) == 0)
                {
                    _logger.LogWarning("🔑 Ignition OFF — cannot download DDD");
                    _diagnostics.LogWarning("Ignition OFF — session terminated");
                    await SendTerminateAsync(stream, "Ignition OFF");
                    return;
                }
            }
            else if (data.Length >= 8)
            {
                _resumeState = data[6];
                _features = data.Length >= 12 ? data[11] : (byte)0;

                _logger.LogInformation("📊 STATUS (short {Len}B): resume=0x{Resume:X2}, features=0x{Features:X2}",
                    data.Length, _resumeState, _features);
                _trafficLogger?.LogDecoded("RX", "STATUS", data.Length,
                    $"SHORT resume=0x{_resumeState:X2} features=0x{_features:X2}");

                if ((_resumeState & 0x40) == 0)
                {
                    _logger.LogWarning("🔑 Ignition OFF");
                    _diagnostics.LogWarning("Ignition OFF (short STATUS)");
                    await SendTerminateAsync(stream, "Ignition OFF");
                    return;
                }
            }
            else
            {
                _logger.LogWarning("📊 STATUS too short ({Len}B), cannot parse resume/features", data.Length);
                _diagnostics.LogWarning($"STATUS packet too short: {data.Length}B (expected >=12)");
                _trafficLogger?.LogDecoded("RX", "STATUS", data.Length, "TOO SHORT — cannot parse");
            }

            // Resume State logic (bits 0-4)
            byte resumeBits = (byte)(_resumeState & 0x1F);

            if ((resumeBits & 0x10) != 0)
            {
                _logger.LogInformation("🔄 Resuming from last transfer (seq={Seq})", _lastSequenceNumber);
                _diagnostics.LogWarning($"Resume from transfer, seq={_lastSequenceNumber}");
                await ResumeFromLastTransfer(stream);
            }
            else if ((resumeBits & 0x08) != 0)
            {
                _logger.LogInformation("🔄 Resuming from file request");
                _diagnostics.LogWarning("Resume from file request (skip auth+download list)");
                await ResumeFromFileRequest(stream);
            }
            else if ((resumeBits & 0x04) != 0)
            {
                _logger.LogInformation("🔄 Resuming from download list");
                _diagnostics.LogWarning("Resume from download list (skip auth)");
                await StartDownloadListAsync(stream);
            }
            else
            {
                bool supportsDriverInfo = (_features & 0x02) != 0;
                if (supportsDriverInfo)
                {
                    TransitionTo(SessionState.RequestingDriverInfo, "Features indicate driver info supported");
                    await SendDddPacketAsync(stream, DddPacketType.DriverInfo);
                    _logger.LogInformation("👤 Requesting driver info...");
                }
                else
                {
                    await StartAuthenticationAsync(stream);
                }
            }
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("HandleStatusPacket", ex);
            _trafficLogger?.LogError("HandleStatusPacket", ex);
            _logger.LogError(ex, "Error processing STATUS packet");
            TransitionTo(SessionState.Error, $"STATUS error: {ex.Message}");
        }
    }

    // ─── RESUME helpers ──────────────────────────────────────────────

    private async Task ResumeFromFileRequest(NetworkStream stream)
    {
        TransitionTo(SessionState.DownloadingFile, "Resume from file request");
        BuildFileList();
        _currentFileIndex = -1;
        await RequestNextFileAsync(stream);
    }

    private async Task ResumeFromLastTransfer(NetworkStream stream)
    {
        TransitionTo(SessionState.DownloadingFile, $"Resume from transfer (seq={_lastSequenceNumber})");
        BuildFileList();
        _currentFileIndex = -1;

        if (_lastSequenceNumber > 0)
        {
            _currentSequenceNumber = (byte)(_lastSequenceNumber & 0xFF);
            _logger.LogInformation("🔄 Sending ACK for seq={Seq} to resume", _currentSequenceNumber);
        }

        await RequestNextFileAsync(stream);
    }

    // ─── AUTHENTICATION ──────────────────────────────────────────────

    private async Task StartAuthenticationAsync(NetworkStream stream)
    {
        try
        {
            byte[] atr = await _bridge.GetAtrAsync();
            _logger.LogInformation("💳 ATR from card: {ATR} ({Len}B)", BitConverter.ToString(atr), atr.Length);
            _trafficLogger?.LogDecodedWithHex("BRIDGE", "ATR", atr, 32, "Card ATR received");

            _cardGeneration = DetectCardGeneration(atr);
            _logger.LogInformation("💳 Detected card generation (ATR): {Gen}", _cardGeneration);

            // If Gen2 detected from ATR, probe EF_ICC to distinguish Gen2v1 vs Gen2v2
            // Delay SetCardGeneration until after probe completes
            if (_cardGeneration == "Gen2")
            {
                var probed = await ProbeCardGenerationAsync();
                _cardGeneration = probed;
                _logger.LogInformation("💳 Final card generation after EF_ICC probe: {Gen}", _cardGeneration);
            }

            _webReporter?.SetCardGeneration(_cardGeneration);

            TransitionTo(SessionState.ApduLoop, "Starting authentication (ATR)");

            await SendDddPacketAsync(stream, DddPacketType.ATR, atr);
            _logger.LogInformation("📤 ATR sent to device");
        }
        catch (OperationCanceledException)
        {
            _diagnostics.LogError("StartAuthenticationAsync", "CardBridge timeout getting ATR (30s)");
            _trafficLogger?.LogError("Authentication", "CardBridge ATR timeout");
            _logger.LogError("⏱️ CardBridge ATR timeout");
            TransitionTo(SessionState.Error, "CardBridge ATR timeout");
        }
        catch (WebSocketException ex)
        {
            _diagnostics.LogError("StartAuthenticationAsync", ex);
            _trafficLogger?.LogError("Authentication", ex);
            _logger.LogError(ex, "🔌 CardBridge WebSocket error during ATR");
            TransitionTo(SessionState.Error, $"CardBridge WebSocket error: {ex.Message}");
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("StartAuthenticationAsync", ex);
            _trafficLogger?.LogError("Authentication", ex);
            _logger.LogError(ex, "Error during authentication start");
            TransitionTo(SessionState.Error, $"Auth error: {ex.Message}");
        }
    }

    // ─── EF_ICC PROBE (Gen2v1 vs Gen2v2) ──────────────────────────

    /// <summary>
    /// Probes the driver card's EF_ICC file to determine Gen2v1 vs Gen2v2.
    /// Sends APDU sequence: SELECT MF → SELECT DF 0007 → SELECT EF_ICC → READ BINARY → SELECT MF (reset).
    /// Returns "Gen2v1", "Gen2v2", or "Gen2" (fallback on error).
    /// </summary>
    private async Task<string> ProbeCardGenerationAsync()
    {
        try
        {
            _logger.LogInformation("🔬 Probing EF_ICC for card generation...");

            // 1. SELECT MF (3F00)
            var selectMf = new byte[] { 0x00, 0xA4, 0x00, 0x00, 0x02, 0x3F, 0x00 };
            var resp = await _bridge.TransmitApduAsync(selectMf);
            _trafficLogger?.LogDecodedWithHex("PROBE", "SELECT_MF", resp, resp.Length, $"SW={FormatSw(resp)}");
            if (!IsSwSuccess(resp))
            {
                _logger.LogWarning("⚠️ EF_ICC probe: SELECT MF failed (SW={SW})", FormatSw(resp));
                return "Gen2";
            }

            // 2. SELECT DF Tachograph_G2 (0007)
            var selectDf = new byte[] { 0x00, 0xA4, 0x02, 0x0C, 0x02, 0x00, 0x07 };
            resp = await _bridge.TransmitApduAsync(selectDf);
            _trafficLogger?.LogDecodedWithHex("PROBE", "SELECT_DF_0007", resp, resp.Length, $"SW={FormatSw(resp)}");
            if (!IsSwSuccess(resp))
            {
                _logger.LogInformation("🔬 SELECT DF 0007 failed (SW={SW}) — confirming Gen1 card", FormatSw(resp));
                await TryResetCardState();
                return "Gen1";
            }

            // 3. SELECT EF_ICC (0002)
            var selectEfIcc = new byte[] { 0x00, 0xA4, 0x02, 0x0C, 0x02, 0x00, 0x02 };
            resp = await _bridge.TransmitApduAsync(selectEfIcc);
            _trafficLogger?.LogDecodedWithHex("PROBE", "SELECT_EF_ICC", resp, resp.Length, $"SW={FormatSw(resp)}");
            if (!IsSwSuccess(resp))
            {
                _logger.LogWarning("⚠️ EF_ICC probe: SELECT EF_ICC failed (SW={SW})", FormatSw(resp));
                await TryResetCardState();
                return "Gen2";
            }

            // 4. READ BINARY (32 bytes — cardGeneration is at offset 25)
            var readBinary = new byte[] { 0x00, 0xB0, 0x00, 0x00, 0x20 };
            resp = await _bridge.TransmitApduAsync(readBinary);

            _trafficLogger?.LogDecodedWithHex("PROBE", "READ_BINARY_EF_ICC", resp, resp.Length, $"SW={FormatSw(resp)}");
            _logger.LogInformation("🔬 EF_ICC READ BINARY response: {Hex} ({Len}B)",
                BitConverter.ToString(resp), resp.Length);

            if (resp.Length >= 3 && IsSwSuccess(resp))
            {
                // Parse cardGeneration from EF_ICC data
                // The data portion is resp[0 .. resp.Length-3] (last 2 bytes are SW)
                var data = new byte[resp.Length - 2];
                Array.Copy(resp, 0, data, 0, data.Length);
                var generation = ParseCardGenerationFromEfIcc(data);

                await TryResetCardState();
                return generation;
            }

            _logger.LogWarning("⚠️ EF_ICC READ BINARY unexpected response ({Len}B)", resp.Length);
            await TryResetCardState();
            return "Gen2";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "⚠️ EF_ICC probe failed, falling back to Gen2");
            _diagnostics.LogWarning($"EF_ICC probe error: {ex.Message}");
            await TryResetCardState();
            return "Gen2";
        }
    }

    private async Task TryResetCardState()
    {
        // Try multiple SELECT MF variants — some cards reject certain P1/P2 combinations
        byte[][] selectMfVariants = new[]
        {
            new byte[] { 0x00, 0xA4, 0x00, 0x00, 0x02, 0x3F, 0x00 }, // SELECT MF by FID, P2=00 (return FCI)
            new byte[] { 0x00, 0xA4, 0x00, 0x0C, 0x02, 0x3F, 0x00 }, // SELECT MF by FID, P2=0C (no response)
            new byte[] { 0x00, 0xA4, 0x00, 0x00, 0x00 },             // SELECT MF no data (some cards accept this)
        };

        foreach (var selectMf in selectMfVariants)
        {
            try
            {
                var resp = await _bridge.TransmitApduAsync(selectMf);
                var sw = FormatSw(resp);
                _trafficLogger?.LogDecoded("PROBE", "SELECT_MF", resp.Length, $"SW={sw} | {BitConverter.ToString(selectMf).Replace("-", " ")}");

                if (IsSwSuccess(resp))
                {
                    _logger.LogInformation("✅ Card state reset OK (SELECT MF variant: {Apdu})",
                        BitConverter.ToString(selectMf).Replace("-", " "));
                    return;
                }
                _logger.LogDebug("SELECT MF variant {Apdu} returned SW={SW}", BitConverter.ToString(selectMf), sw);
            }
            catch (Exception ex)
            {
                _logger.LogDebug("SELECT MF variant failed: {Msg}", ex.Message);
            }
        }

        // All SELECT MF variants failed — try warm reset via SCardReconnect
        _logger.LogWarning("⚠️ All SELECT MF variants failed — attempting warm reset (SCardReconnect)");
        try
        {
            await _bridge.ReconnectAsync();
            _logger.LogInformation("✅ Card warm reset (SCardReconnect) succeeded");
            _trafficLogger?.LogDecoded("PROBE", "RECONNECT", 0, "Warm reset OK");
        }
        catch (Exception ex)
        {
            _logger.LogWarning("⚠️ Warm reset (SCardReconnect) also failed: {Msg}", ex.Message);
            _trafficLogger?.LogError("CardReset", $"All reset methods failed: {ex.Message}");
        }
    }

    private static bool IsSwSuccess(byte[] response)
    {
        return response.Length >= 2 &&
               response[^2] == 0x90 &&
               response[^1] == 0x00;
    }

    private static string FormatSw(byte[] response)
    {
        if (response.Length >= 2)
            return $"{response[^2]:X2} {response[^1]:X2}";
        return $"(len={response.Length})";
    }

    /// <summary>
    /// Parse the cardGeneration byte from EF_ICC data.
    /// Per Regulation 2016/799 Appendix 2, cardIccIdentification structure:
    ///   clockStop (1B) + cardExtendedSerialNumber (8B) + cardApprovalNumber (8B) +
    ///   cardPersonaliserID (1B) + embedderIcAssemblerId (5B) + icIdentifier (2B) = 25 bytes
    ///   → cardGeneration at offset 25 (1 byte): 0x01 = Gen2v1, 0x02 = Gen2v2
    /// </summary>
    private string ParseCardGenerationFromEfIcc(byte[] data)
    {
        _logger.LogInformation("🔬 EF_ICC data ({Len}B): {Hex}", data.Length, BitConverter.ToString(data));

        const int cardGenerationOffset = 25;

        if (data.Length > cardGenerationOffset)
        {
            byte genByte = data[cardGenerationOffset];
            _logger.LogInformation("🔬 cardGeneration byte at offset {Off}: 0x{Val:X2}", cardGenerationOffset, genByte);

            return genByte switch
            {
                0x01 => "Gen2v1",
                0x02 => "Gen2v2",
                _ => "Gen2" // Unknown sub-generation
            };
        }

        _logger.LogWarning("⚠️ EF_ICC data too short ({Len}B) for cardGeneration at offset {Off}, defaulting to Gen2",
            data.Length, cardGenerationOffset);
        return "Gen2";
    }

    private async Task HandleApduLoop(NetworkStream stream, DddPacketType type, byte[] data)
    {
        try
        {
            if (type == DddPacketType.VUReadyAPDU || type == DddPacketType.APDU)
            {
                // Detect VU generation from first APDU SELECT command
                if (_diagnostics.ApduExchanges == 0 && data.Length >= 7)
                {
                    _detectedVuGenFromApdu = DetectVuGenerationFromApdu(data);
                    if (_detectedVuGenFromApdu != "Unknown")
                    {
                        _logger.LogInformation("🔍 Detected VU generation from APDU: {Gen}", _detectedVuGenFromApdu);
                    }
                }

                _logger.LogInformation("🔀 APDU to card: {Len}B", data.Length);
                _trafficLogger?.LogDecodedWithHex("RX", type.ToString(), data, 32, "APDU from VU → card");

                byte[] cardResponse = await _bridge.TransmitApduAsync(data);
                _diagnostics.ApduExchanges++;

                _logger.LogInformation("🔀 Card response: {Len}B", cardResponse.Length);
                _trafficLogger?.LogDecodedWithHex("BRIDGE", "APDU_RESP", cardResponse, 32, "Card → VU");

                await SendDddPacketAsync(stream, DddPacketType.APDU, cardResponse);
            }
            else if (type == DddPacketType.AuthOK)
            {
                _logger.LogInformation("🔐 Authentication OK! (after {Apdu} APDU exchanges)", _diagnostics.ApduExchanges);
                _trafficLogger?.LogDecoded("RX", "AuthOK", data.Length,
                    $"Authentication successful after {_diagnostics.ApduExchanges} exchanges");

                TransitionTo(SessionState.CheckingInterfaceVersion, "Auth OK, checking interface version");
                await RequestFileAsync(stream, DddFileType.InterfaceVersion);
            }
            else
            {
                _logger.LogWarning("⚠️ Unexpected in APDU loop: {TypeName} (0x{Type:X2})", type, (byte)type);
                _diagnostics.LogWarning($"Unexpected packet in APDU loop: {type}");
            }
        }
        catch (OperationCanceledException)
        {
            _diagnostics.LogError("HandleApduLoop", "CardBridge timeout during APDU exchange (30s)");
            _trafficLogger?.LogError("ApduLoop", "CardBridge APDU timeout");
            _logger.LogError("⏱️ CardBridge APDU timeout");
            TransitionTo(SessionState.Error, "CardBridge APDU timeout");
        }
        catch (WebSocketException ex)
        {
            _diagnostics.LogError("HandleApduLoop", ex);
            _trafficLogger?.LogError("ApduLoop", ex);
            _logger.LogError(ex, "🔌 CardBridge WebSocket error during APDU");
            TransitionTo(SessionState.Error, $"CardBridge APDU WebSocket error: {ex.Message}");
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("HandleApduLoop", ex);
            _trafficLogger?.LogError("HandleApduLoop", ex);
            _logger.LogError(ex, "Error in APDU loop");
            TransitionTo(SessionState.Error, $"APDU loop error: {ex.Message}");
        }
    }

    // ─── INTERFACE VERSION (Gen detection) ───────────────────────────

    private async Task HandleInterfaceVersionResponse(NetworkStream stream, DddPacketType type, byte[] data)
    {
        try
        {
            if (type == DddPacketType.FileData)
            {
                if (data.Length > 2)
                    _fileBuffer.AddRange(data.AsSpan(2).ToArray());

                byte seqNum = data.Length > 1 ? data[1] : (byte)0;
                _currentSequenceNumber = (byte)(seqNum + 1);
                var ackPayload = new byte[] { data[0], _currentSequenceNumber };
                await SendDddPacketAsync(stream, DddPacketType.FileData, ackPayload);

                _trafficLogger?.LogDecoded("RX", "FileData(IntVer)", data.Length - 2,
                    $"chunk seq={seqNum}, buffered={_fileBuffer.Count}B");
            }
            else if (type == DddPacketType.FileDataEOF)
            {
                if (data.Length > 2)
                    _fileBuffer.AddRange(data.AsSpan(2).ToArray());

                byte trep = 0;
                if (_fileBuffer.Count >= 2)
                {
                    byte sid = _fileBuffer[0];
                    trep = _fileBuffer[1];
                    _logger.LogInformation("🔍 InterfaceVersion: SID=0x{SID:X2}, TREP=0x{TREP:X2}", sid, trep);
                    _trafficLogger?.LogDecoded("RX", "FileDataEOF(IntVer)", _fileBuffer.Count,
                        $"SID=0x{sid:X2} TREP=0x{trep:X2}");
                }
                else if (data.Length >= 4)
                {
                    trep = data[3];
                    _trafficLogger?.LogDecoded("RX", "FileDataEOF(IntVer)", data.Length,
                        $"TREP from payload=0x{trep:X2} (fallback)");
                }

                if (trep == 0x02)
                    _vuGeneration = VuGeneration.Gen2v2;
                else if (trep == 0x01)
                    _vuGeneration = VuGeneration.Gen2v1;
                else
                    _vuGeneration = VuGeneration.Gen1;

                _fileBuffer.Clear();
                _currentSequenceNumber = 0;

                _logger.LogInformation("🔍 Detected VU generation: {Gen} (TREP=0x{Trep:X2})", _vuGeneration, trep);
                _diagnostics.Generation = _vuGeneration;
                _webReporter?.SetGeneration(_vuGeneration);
                await StartDownloadListAsync(stream);
            }
            else if (type == DddPacketType.Error)
            {
                HandleError(data);
                _vuGeneration = VuGeneration.Gen1;
                _diagnostics.Generation = _vuGeneration;
                _webReporter?.SetGeneration(_vuGeneration);
                _fileBuffer.Clear();
                _currentSequenceNumber = 0;

                _logger.LogInformation("🔍 Interface version not supported — assuming Gen1");
                _diagnostics.LogWarning("InterfaceVersion error — defaulting to Gen1");
                await StartDownloadListAsync(stream);
            }
            else
            {
                _logger.LogWarning("⚠️ Unexpected in version check: {TypeName} (0x{Type:X2})", type, (byte)type);
                _diagnostics.LogWarning($"Unexpected packet in InterfaceVersion check: {type}");
            }
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("HandleInterfaceVersionResponse", ex);
            _trafficLogger?.LogError("InterfaceVersion", ex);
            _logger.LogError(ex, "Error in interface version handling");
            TransitionTo(SessionState.Error, $"InterfaceVersion error: {ex.Message}");
        }
    }

    // ─── DOWNLOAD LIST ───────────────────────────────────────────────

    private async Task StartDownloadListAsync(NetworkStream stream)
    {
        TransitionTo(SessionState.WaitingForDownloadListAck, "Sending download list");

        BuildFileList();

        var payload = BuildDownloadListPayload();
        await SendDddPacketAsync(stream, DddPacketType.DownloadList, payload);
        _logger.LogInformation("📋 Download list sent ({Count} files, gen={Gen}, payload={PayloadLen}B)",
            _filesToDownload.Count, _vuGeneration, payload.Length);
        _trafficLogger?.LogDecodedWithHex("TX", "DownloadList", payload, 32,
            $"{_filesToDownload.Count} files, gen={_vuGeneration}");
    }

    private void BuildFileList()
    {
        _filesToDownload.Clear();
        _filesToDownload.Add(DddFileType.Overview);
        _filesToDownload.Add(DddFileType.Activities);
        _filesToDownload.Add(DddFileType.EventsAndFaults);
        _filesToDownload.Add(DddFileType.DetailedSpeed);
        _filesToDownload.Add(DddFileType.TechnicalData);
        _filesToDownload.Add(DddFileType.DriverCard1);
        _filesToDownload.Add(DddFileType.DriverCard2);

        _logger.LogDebug("📋 File list built: {Files}", string.Join(", ", _filesToDownload));
    }

    /// <summary>
    /// Build Download List payload per spec (Tables 14-16).
    /// Download List ALWAYS uses Gen1 codes (0x01-0x06).
    /// </summary>
    private byte[] BuildDownloadListPayload()
    {
        var payload = new List<byte>();

        payload.Add(0x01); payload.Add(0x00); // Overview

        // Activities (0x02, dataLen=10)
        var end = DateTimeOffset.UtcNow;
        var start = end.AddDays(-28);
        payload.Add(0x02);
        payload.Add(0x0A);
        payload.Add(0x02);
        WriteBigEndianUint32ToList(payload, (uint)start.ToUnixTimeSeconds());
        payload.Add(0x03);
        WriteBigEndianUint32ToList(payload, (uint)end.ToUnixTimeSeconds());

        payload.Add(0x03); payload.Add(0x00); // Events
        payload.Add(0x04); payload.Add(0x00); // Speed
        payload.Add(0x05); payload.Add(0x00); // Technical

        payload.Add(0x06); payload.Add(0x01); payload.Add(0x01); // Driver slot 1
        payload.Add(0x06); payload.Add(0x01); payload.Add(0x02); // Driver slot 2

        return payload.ToArray();
    }

    /// <summary>
    /// Get TRTP code for FileRequest based on VU generation.
    /// Used ONLY for FileRequest (0x30), NOT for Download List.
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

        if (fileType == DddFileType.DriverCard1 || fileType == DddFileType.DriverCard2 ||
            fileType == DddFileType.InterfaceVersion)
            return baseCode;

        if (fileType == DddFileType.DetailedSpeed && _vuGeneration == VuGeneration.Gen2v2)
            return 0x24;

        return _vuGeneration switch
        {
            VuGeneration.Gen2v2 => (byte)(baseCode + 0x30),
            VuGeneration.Gen2v1 => (byte)(baseCode + 0x20),
            _ => baseCode
        };
    }

    private async Task HandleDownloadListAck(NetworkStream stream, DddPacketType type, byte[] data)
    {
        try
        {
            if (type == DddPacketType.DownloadList)
            {
                _logger.LogInformation("✅ Download list ACK received");
                _trafficLogger?.LogDecoded("RX", "DownloadListACK", data.Length, "Proceeding to file downloads");
                _currentFileIndex = -1;
                await RequestNextFileAsync(stream);
            }
            else if (type == DddPacketType.APDU)
            {
                _logger.LogInformation("🔀 APDU during Download List unlock: {Len}B", data.Length);
                _trafficLogger?.LogDecoded("RX", "APDU(DlListUnlock)", data.Length, "VU APDU during unlock");

                byte[] cardResponse = await _bridge.TransmitApduAsync(data);
                _diagnostics.ApduExchanges++;
                await SendDddPacketAsync(stream, DddPacketType.APDU, cardResponse);
                _trafficLogger?.LogDecoded("TX", "APDU(DlListUnlock)", cardResponse.Length, "Card response forwarded");
            }
            else
            {
                _logger.LogWarning("⚠️ Expected DownloadList ACK, got {TypeName} (0x{Type:X2})", type, (byte)type);
                _diagnostics.LogWarning($"Expected DownloadList ACK, got {type}");
            }
        }
        catch (OperationCanceledException)
        {
            _diagnostics.LogError("HandleDownloadListAck", "CardBridge timeout during APDU (unlock)");
            _trafficLogger?.LogError("DownloadListAck", "CardBridge APDU timeout");
            TransitionTo(SessionState.Error, "CardBridge timeout during download list unlock");
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("HandleDownloadListAck", ex);
            _trafficLogger?.LogError("HandleDownloadListAck", ex);
            _logger.LogError(ex, "Error handling download list ACK");
            TransitionTo(SessionState.Error, $"DownloadListAck error: {ex.Message}");
        }
    }

    // ─── FILE DOWNLOAD ───────────────────────────────────────────────

    private async Task RequestNextFileAsync(NetworkStream stream)
    {
        try
        {
            _currentFileIndex++;

            if (_currentFileIndex >= _filesToDownload.Count)
            {
                MergeVuFiles();

                // Determine completion status based on successful downloads
                // VU files (5): Overview, Activities, Events, Speed, Technical
                // Driver cards (2): DriverCard1, DriverCard2 (slot 2 may be empty — not an error)
                var vuFileTypes = new[] { DddFileType.Overview, DddFileType.Activities,
                    DddFileType.EventsAndFaults, DddFileType.DetailedSpeed, DddFileType.TechnicalData };
                int vuDownloaded = vuFileTypes.Count(ft => _downloadedFiles.ContainsKey(ft) && _downloadedFiles[ft].Length > 0);
                int driverCardsDownloaded = (new[] { DddFileType.DriverCard1, DddFileType.DriverCard2 })
                    .Count(ft => _downloadedFiles.ContainsKey(ft) && _downloadedFiles[ft].Length > 0);

                // At least 1 driver card is expected (slot 2 may be empty)
                bool allVuFiles = vuDownloaded >= 5;
                bool hasDriverCard = driverCardsDownloaded >= 1;

                if (allVuFiles && hasDriverCard)
                {
                    // Full success: all VU files + at least 1 driver card
                    _logger.LogInformation("🎉 All files downloaded successfully! ({Successful}/{Total})",
                        _successfulDownloads, _filesToDownload.Count);
                    await SendTerminateAsync(stream, "All files downloaded");
                }
                else if (_successfulDownloads == 0)
                {
                    // Complete failure: no files downloaded at all
                    _logger.LogError("❌ No files downloaded successfully (0/{Total})", _filesToDownload.Count);
                    TransitionTo(SessionState.Error, $"No files downloaded (0/{_filesToDownload.Count})");
                    await SendDddPacketAsync(stream, DddPacketType.Terminate);
                }
                else
                {
                    // Partial success: some files missing
                    _logger.LogWarning("⚠️ Partial download: {Downloaded}/{Total} files (VU: {Vu}/5, Cards: {Cards})",
                        _successfulDownloads, _filesToDownload.Count, vuDownloaded, driverCardsDownloaded);
                    await SendDddPacketAsync(stream, DddPacketType.Terminate);
                    TransitionTo(SessionState.Complete, 
                        $"Partial: {_successfulDownloads}/{_filesToDownload.Count} files (VU: {vuDownloaded}/5)");

                    // Report as partial instead of completed
                    _webReporter?.ReportStatus(
                        "partial", 100, _successfulDownloads, _filesToDownload.Count,
                        null, _diagnostics.BytesSent + _diagnostics.BytesReceived,
                        _diagnostics.ApduExchanges, _diagnostics.CrcErrors,
                        "warning", $"Partial download: {_successfulDownloads}/{_filesToDownload.Count} files", "PartialComplete");
                }

                return;
            }

            _currentFileType = _filesToDownload[_currentFileIndex];
            _currentSequenceNumber = 0;
            _fileBuffer.Clear();
            _lastSid = 0;
            _lastTrep = 0;

            // Start file timer
            _diagnostics.StartFileTimer(_currentFileType);

            TransitionTo(SessionState.DownloadingFile,
                $"Requesting file {_currentFileIndex + 1}/{_filesToDownload.Count}: {_currentFileType}");

            await RequestFileAsync(stream, _currentFileType);

            _logger.LogInformation("📥 Requesting file {Idx}/{Total}: {Type} (TRTP=0x{Trtp:X2})",
                _currentFileIndex + 1, _filesToDownload.Count, _currentFileType, GetTrtp(_currentFileType));
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("RequestNextFileAsync", ex);
            _trafficLogger?.LogError("RequestNextFile", ex);
            _logger.LogError(ex, "Error requesting next file");
            TransitionTo(SessionState.Error, $"RequestNextFile error: {ex.Message}");
        }
    }

    private async Task RequestFileAsync(NetworkStream stream, DddFileType fileType)
    {
        byte trtp = GetTrtp(fileType);
        byte[] payload;

        if (fileType == DddFileType.Activities)
        {
            var end = DateTimeOffset.UtcNow;
            var start = end.AddDays(-28);
            payload = new byte[9];
            payload[0] = trtp;
            WriteBigEndianUint32(payload, 1, (uint)start.ToUnixTimeSeconds());
            WriteBigEndianUint32(payload, 5, (uint)end.ToUnixTimeSeconds());
        }
        else if (fileType == DddFileType.DriverCard1)
        {
            payload = new byte[] { trtp, 0x01 };
        }
        else if (fileType == DddFileType.DriverCard2)
        {
            payload = new byte[] { trtp, 0x02 };
        }
        else
        {
            payload = new byte[] { trtp };
        }

        await SendDddPacketAsync(stream, DddPacketType.FileRequest, payload);
        _trafficLogger?.LogDecodedWithHex("TX", "FileRequest", payload, 16,
            $"{fileType} TRTP=0x{trtp:X2}");
    }

    private async Task HandleFileData(NetworkStream stream, DddPacketType type, byte[] data)
    {
        try
        {
            if (type == DddPacketType.FileData)
            {
                if (data.Length < 2) return;

                byte seqNum = data[1];
                int dataOffset = 2;

                // First packet — SID + TREP
                if (_currentSequenceNumber == 0 && data.Length > 3)
                {
                    _lastSid = data[2];
                    _lastTrep = data[3];
                    dataOffset = 4;

                    _logger.LogInformation("📄 File start — SID=0x{SID:X2}, TREP=0x{TREP:X2}", _lastSid, _lastTrep);
                    _trafficLogger?.LogDecoded("RX", "FileData(Start)", data.Length,
                        $"{_currentFileType} SID=0x{_lastSid:X2} TREP=0x{_lastTrep:X2}");

                    if (_lastSid == 0x7F)
                    {
                        _logger.LogWarning("⚠️ Negative response (SID=0x7F) for {Type}!", _currentFileType);
                        _diagnostics.LogWarning($"Negative response (SID=0x7F) for {_currentFileType}");
                    }
                }

                if (data.Length > dataOffset)
                {
                    _fileBuffer.AddRange(data.AsSpan(dataOffset).ToArray());
                }

                _currentSequenceNumber = (byte)(seqNum + 1);

                if (seqNum % 10 == 0 || seqNum == 0) // Log every 10th chunk + first
                {
                    _logger.LogInformation("📥 Chunk seq={Seq}, +{ChunkLen}B, total={Total}B",
                        seqNum, data.Length - dataOffset, _fileBuffer.Count);
                }

                var ackPayload = new byte[] { data[0], _currentSequenceNumber };
                await SendDddPacketAsync(stream, DddPacketType.FileData, ackPayload);
            }
            else if (type == DddPacketType.FileDataEOF)
            {
                if (data.Length > 2)
                {
                    _fileBuffer.AddRange(data.AsSpan(2).ToArray());
                }

                // Stop file timer
                _diagnostics.StopFileTimer(_currentFileType, _fileBuffer.Count, true);

                // Calculate speed
                var lastDownload = _diagnostics.FileDownloads.LastOrDefault();
                string speedInfo = "";
                if (lastDownload != null && lastDownload.Duration.TotalSeconds > 0)
                {
                    double kbps = (_fileBuffer.Count / 1024.0) / lastDownload.Duration.TotalSeconds;
                    speedInfo = $" ({lastDownload.Duration.TotalSeconds:F1}s, {kbps:F1} KB/s)";
                }

                // Store for merging
                if (_fileBuffer.Count > 0)
                {
                    _downloadedFiles[_currentFileType] = _fileBuffer.ToArray();
                    _successfulDownloads++;

                    // Post-download generation verification for Overview
                    if (_currentFileType == DddFileType.Overview)
                    {
                        VerifyGenerationFromOverview(_downloadedFiles[_currentFileType]);
                    }
                }

                SaveCurrentFile();
                _logger.LogInformation("💾 File saved: {Type}, {Size}B{Speed}",
                    _currentFileType, _fileBuffer.Count, speedInfo);
                _trafficLogger?.LogDecoded("RX", "FileDataEOF", data.Length,
                    $"{_currentFileType} complete: {_fileBuffer.Count}B{speedInfo}");

                await RequestNextFileAsync(stream);
            }
            else if (type == DddPacketType.Error)
            {
                HandleError(data);

                // Stop file timer with failure
                _diagnostics.StopFileTimer(_currentFileType, _fileBuffer.Count, false,
                    $"Error during download: {(data.Length >= 2 ? DddErrorCodes.Format(data[0], data[1]) : "unknown")}");

                _logger.LogWarning("⚠️ Error downloading {Type}, skipping", _currentFileType);
                await RequestNextFileAsync(stream);
            }
            else
            {
                _logger.LogWarning("⚠️ Unexpected {TypeName} (0x{Type:X2}) during download of {File}",
                    type, (byte)type, _currentFileType);
                _diagnostics.LogWarning($"Unexpected packet {type} during download of {_currentFileType}");
            }
        }
        catch (Exception ex)
        {
            _diagnostics.LogError("HandleFileData", ex);
            _diagnostics.StopFileTimer(_currentFileType, _fileBuffer.Count, false, ex.Message);
            _trafficLogger?.LogError("HandleFileData", ex);
            _logger.LogError(ex, "Error handling file data for {Type}", _currentFileType);
            TransitionTo(SessionState.Error, $"FileData error: {ex.Message}");
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

    // ─── VU FILE MERGING ─────────────────────────────────────────────

    private void MergeVuFiles()
    {
        var vuFileTypes = new[]
        {
            DddFileType.Overview,
            DddFileType.Activities,
            DddFileType.EventsAndFaults,
            DddFileType.DetailedSpeed,
            DddFileType.TechnicalData
        };

        var mergedData = new List<byte>();
        int fileCount = 0;

        foreach (var ft in vuFileTypes)
        {
            if (_downloadedFiles.TryGetValue(ft, out var fileData) && fileData.Length > 0)
            {
                mergedData.AddRange(fileData);
                fileCount++;
                _logger.LogInformation("📎 Merged {Type}: {Size}B", ft, fileData.Length);
            }
        }

        if (fileCount < 2)
        {
            _logger.LogInformation("📎 Not enough VU files to merge ({Count}), skipping", fileCount);
            return;
        }

        string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        string mergedFileName = $"{_imei}_vu_{timestamp}.ddd";
        var mergedPath = Path.Combine(_outputDir, _imei, mergedFileName);
        DddFileWriter.Save(mergedPath, mergedData.ToArray());
        _logger.LogInformation("📦 Merged VU file: {Path} ({Size}B, {Count} files)",
            mergedPath, mergedData.Count, fileCount);
    }

    // ─── ERROR handling ──────────────────────────────────────────────

    private void HandleError(byte[] data)
    {
        if (data.Length >= 2)
        {
            byte errorClass = data[0];
            byte errorCode = data[1];
            ushort errorState = data.Length >= 4 ? (ushort)((data[2] << 8) | data[3]) : (ushort)0;

            string description = DddErrorCodes.Format(errorClass, errorCode);
            _logger.LogError("❌ DDD ERROR: {Description}, state=0x{State:X4}", description, errorState);
            _trafficLogger?.LogError("DddError", $"{description}, state=0x{errorState:X4}");
            _diagnostics.LogError("DddProtocol", $"{description}, state=0x{errorState:X4}");

            // Detect generation mismatch on auth error 0x02:0x02
            if (DddErrorCodes.IsGenerationMismatch(errorClass, errorCode) &&
                _state == SessionState.ApduLoop &&
                _cardGeneration != "Unknown" &&
                _detectedVuGenFromApdu != "Unknown" &&
                _cardGeneration != _detectedVuGenFromApdu)
            {
                var mismatchMsg = $"GENERATION MISMATCH: Card is {_cardGeneration} but VU requires {_detectedVuGenFromApdu} — incompatible";
                _logger.LogWarning("⚠️ {Msg}", mismatchMsg);
                _trafficLogger?.LogWarning(mismatchMsg);
                _diagnostics.LogWarning(mismatchMsg);

                _webReporter?.ReportStatus(
                    "error", 0, 0, 0, null, 0,
                    _diagnostics.ApduExchanges, _diagnostics.CrcErrors,
                    "warning", mismatchMsg, "GenerationMismatch");
            }

            if (errorClass == 2 && errorCode == 0x0A)
            {
                _logger.LogError("🔒 Authentication failure — certificate rejected");
                TransitionTo(SessionState.Error, "Certificate rejected");
            }
        }
        else
        {
            _logger.LogError("❌ ERROR packet ({Len}B) — too short to parse", data.Length);
            _diagnostics.LogError("DddProtocol", $"Error packet too short: {data.Length}B");
        }
    }

    // ─── GENERATION DETECTION ────────────────────────────────────────

    /// <summary>
    /// Detect card generation from ATR bytes (ISO 7816-3).
    /// Gen2 cards use T=1 protocol, indicated by byte 0x31 after 0x80 in historical bytes.
    /// Gen1 cards use T=0 protocol only.
    /// </summary>
    private static string DetectCardGeneration(byte[] atr)
    {
        if (atr.Length < 4) return "Unknown";

        // Search for compact TLV indicator: 0x80 followed by byte with bit 0 set (T=1)
        // In tachograph card ATRs, 0x80 0x31 indicates T=1 support = Gen2
        for (int i = 2; i < atr.Length - 1; i++)
        {
            if (atr[i] == 0x80 && (atr[i + 1] & 0x01) != 0)
            {
                return "Gen2";
            }
        }

        // Also check TD1 byte for T=1 indication
        // T0 is at index 1, interface bytes follow based on T0's upper nibble
        byte t0 = atr[1];
        int interfaceByteCount = 0;

        // Count interface bytes indicated by T0
        if ((t0 & 0x10) != 0) interfaceByteCount++; // TA1
        if ((t0 & 0x20) != 0) interfaceByteCount++; // TB1
        if ((t0 & 0x40) != 0) interfaceByteCount++; // TC1
        if ((t0 & 0x80) != 0) interfaceByteCount++; // TD1

        // If TD1 exists, check its protocol type
        if ((t0 & 0x80) != 0 && 2 + interfaceByteCount - 1 < atr.Length)
        {
            byte td1 = atr[1 + interfaceByteCount]; // TD1 is last of the interface bytes
            if ((td1 & 0x0F) == 1) // T=1
            {
                return "Gen2";
            }
        }

        return "Gen1";
    }

    /// <summary>
    /// Detect VU generation from the first SELECT APDU command.
    /// SELECT DF 0002 = Gen1 tachograph, SELECT DF 0007 = Gen2 tachograph.
    /// </summary>
    private static string DetectVuGenerationFromApdu(byte[] apdu)
    {
        // Expected format: 00 A4 02 0C 02 XX XX
        if (apdu.Length >= 7 &&
            apdu[0] == 0x00 && apdu[1] == 0xA4 && apdu[2] == 0x02 && apdu[3] == 0x0C &&
            apdu[4] == 0x02)
        {
            ushort dfId = (ushort)((apdu[5] << 8) | apdu[6]);
            return dfId switch
            {
                0x0002 => "Gen1",
                0x0007 => "Gen2",
                _ => "Unknown"
            };
        }

        return "Unknown";
    }

    // ─── POST-DOWNLOAD GENERATION VERIFICATION ────────────────────

    /// <summary>
    /// Scans the downloaded Overview file for VU section tags to verify/correct
    /// the VU generation. Critical when InterfaceVersion check failed (0x03:0x02)
    /// and defaulted to Gen1, but the actual VU is Gen2.
    /// Tags: 0x76 0x01-0x0F = Gen1, 0x76 0x21-0x2F = Gen2v1, 0x76 0x31-0x3F = Gen2v2.
    /// </summary>
    private void VerifyGenerationFromOverview(byte[] overviewData)
    {
        try
        {
            var detectedGen = ScanForGenerationTags(overviewData);
            if (detectedGen == VuGeneration.Unknown || detectedGen == _vuGeneration)
            {
                if (detectedGen != VuGeneration.Unknown)
                    _logger.LogInformation("🔍 Post-download verification: generation confirmed as {Gen}", _vuGeneration);
                return;
            }

            // Only upgrade, never downgrade
            if (GenerationRank(detectedGen) <= GenerationRank(_vuGeneration)) return;

            var oldGen = _vuGeneration;
            _vuGeneration = detectedGen;
            _diagnostics.Generation = _vuGeneration;
            _webReporter?.SetGeneration(_vuGeneration);

            var msg = $"POST-DOWNLOAD CORRECTION: VU generation {oldGen} → {detectedGen} (Overview section tags)";
            _logger.LogWarning("⚠️ {Msg}", msg);
            _trafficLogger?.LogWarning(msg);
            _diagnostics.LogWarning(msg);

            _webReporter?.ReportStatus(
                "downloading", 0, _successfulDownloads, _filesToDownload.Count,
                _currentFileType.ToString(),
                _diagnostics.BytesSent + _diagnostics.BytesReceived,
                _diagnostics.ApduExchanges, _diagnostics.CrcErrors,
                "warning", msg, "GenerationCorrection");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "⚠️ Error during post-download generation verification");
            _diagnostics.LogWarning($"Generation verification error: {ex.Message}");
        }
    }

    private VuGeneration ScanForGenerationTags(byte[] data)
    {
        var maxGen = VuGeneration.Unknown;
        for (int i = 0; i < data.Length - 1; i++)
        {
            if (data[i] != 0x76) continue;
            byte tag = data[i + 1];
            VuGeneration tagGen;
            if (tag >= 0x31 && tag <= 0x3F) tagGen = VuGeneration.Gen2v2;
            else if (tag >= 0x21 && tag <= 0x2F) tagGen = VuGeneration.Gen2v1;
            else if (tag >= 0x01 && tag <= 0x0F) tagGen = VuGeneration.Gen1;
            else continue;

            if (GenerationRank(tagGen) > GenerationRank(maxGen))
            {
                maxGen = tagGen;
                _logger.LogDebug("🔍 Section tag 0x76 0x{Tag:X2} → {Gen}", tag, tagGen);
            }
        }
        return maxGen;
    }

    private static int GenerationRank(VuGeneration gen) => gen switch
    {
        VuGeneration.Gen2v2 => 3,
        VuGeneration.Gen2v1 => 2,
        VuGeneration.Gen1 => 1,
        _ => 0
    };

    // ─── TERMINATE ───────────────────────────────────────────────────

    private async Task SendTerminateAsync(NetworkStream stream, string reason = "session complete")
    {
        await SendDddPacketAsync(stream, DddPacketType.Terminate);
        TransitionTo(SessionState.Complete, reason);
        _logger.LogInformation("🏁 Terminate sent: {Reason}", reason);
    }

    // ─── Low-level send helpers ──────────────────────────────────────

    private async Task SendDddPacketAsync(NetworkStream stream, DddPacketType type, byte[]? data = null)
    {
        var dddPayload = DddPacket.Build(type, data);
        var frame = Codec12Parser.Build(dddPayload);

        // Log outgoing packet
        var typeName = type.ToString();
        _diagnostics.LogPacket("TX", (byte)type, frame.Length, $"{typeName}");
        _trafficLogger?.LogDecoded("TX", typeName, data?.Length ?? 0, $"frame={frame.Length}B");

        await SendRawAsync(stream, frame);
    }

    private async Task SendRawAsync(NetworkStream stream, byte[] data)
    {
        await stream.WriteAsync(data);
        _trafficLogger?.Log("TX", data, data.Length);
        _diagnostics.BytesSent += data.Length;
        _lastActivity = DateTime.UtcNow;
    }

    private async Task SendKeepAliveAsync(NetworkStream stream)
    {
        await SendDddPacketAsync(stream, DddPacketType.KeepAlive);
        _logger.LogDebug("💓 Keep alive sent");
    }

    // Note: CardBridgeClient already has internal 30s timeout per operation.

    // ─── Utilities ───────────────────────────────────────────────────

    private static void WriteBigEndianUint32(byte[] buffer, int offset, uint value)
    {
        buffer[offset] = (byte)(value >> 24);
        buffer[offset + 1] = (byte)(value >> 16);
        buffer[offset + 2] = (byte)(value >> 8);
        buffer[offset + 3] = (byte)value;
    }

    private static void WriteBigEndianUint32ToList(List<byte> list, uint value)
    {
        list.Add((byte)(value >> 24));
        list.Add((byte)(value >> 16));
        list.Add((byte)(value >> 8));
        list.Add((byte)value);
    }
}
