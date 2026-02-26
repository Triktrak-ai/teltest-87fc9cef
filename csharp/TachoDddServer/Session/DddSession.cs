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
    private byte _features = 0;
    private byte _resumeState = 0;
    private uint _lastSequenceNumber = 0;

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
            webStatus, progress, _currentFileIndex > 0 ? _currentFileIndex : 0,
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

                        if (_crcRetryCount <= MaxCrcRetries)
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
                        result.Frame.Type, result.Frame.Data.Length, _state);

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
            HandleError(data);
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
        TransitionTo(SessionState.ApduLoop, "Starting authentication (ATR)");

        try
        {
            byte[] atr = await _bridge.GetAtrAsync();
            _logger.LogInformation("💳 ATR from card: {ATR} ({Len}B)", BitConverter.ToString(atr), atr.Length);
            _trafficLogger?.LogDecodedWithHex("BRIDGE", "ATR", atr, 32, "Card ATR received");

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

    private async Task HandleApduLoop(NetworkStream stream, DddPacketType type, byte[] data)
    {
        try
        {
            if (type == DddPacketType.VUReadyAPDU || type == DddPacketType.APDU)
            {
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
                    _vuGeneration = VuGeneration.Gen1;
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
                _logger.LogInformation("🎉 All {Count} files downloaded!", _filesToDownload.Count);
                MergeVuFiles();
                await SendTerminateAsync(stream, "All files downloaded");
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
