using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

Console.WriteLine("💳 CardBridge Service - Serwis czytnika kart");
Console.WriteLine("============================================");

// Konfiguracja logowania
var logDir = Path.Combine(AppContext.BaseDirectory, "Logs");
Directory.CreateDirectory(logDir);

// Graceful shutdown on Ctrl+C
var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    Console.WriteLine("\n⏹️ Ctrl+C — zamykanie serwisu...");
    cts.Cancel();
};

var listener = new HttpListener();
listener.Prefixes.Add("http://+:5201/");
listener.Start();
Console.WriteLine("🚀 WebSocket nasłuchuje na porcie 5201");
Console.WriteLine("   (Ctrl+C aby zakończyć)");

try
{
    while (!cts.Token.IsCancellationRequested)
    {
        var contextTask = listener.GetContextAsync();
        var completedTask = await Task.WhenAny(contextTask, Task.Delay(Timeout.Infinite, cts.Token));
        if (completedTask != contextTask) break;

        var context = await contextTask;

        if (!context.Request.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            context.Response.Close();
            continue;
        }

        var wsContext = await context.AcceptWebSocketAsync(null);
        Console.WriteLine("🔗 VPS połączony!");

        _ = Task.Run(() => HandleSessionAsync(wsContext.WebSocket));
    }
}
catch (OperationCanceledException) { }
finally
{
    listener.Stop();
    Console.WriteLine("✅ Serwis zakończony.");
}

static async Task HandleSessionAsync(WebSocket ws)
{
    IntPtr hContext = IntPtr.Zero;
    IntPtr hCard = IntPtr.Zero;
    int activeProtocol = 0;

    var logDir = Path.Combine(AppContext.BaseDirectory, "Logs");
    Directory.CreateDirectory(logDir);
    var logFile = Path.Combine(logDir, $"cardbridge_{DateTime.Now:yyyyMMdd_HHmmss}.log");
    using var logWriter = new StreamWriter(logFile, append: true) { AutoFlush = true };
    logWriter.WriteLine($"=== Sesja rozpoczęta: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} ===");

    try
    {
        int ret = SCardEstablishContext(2, IntPtr.Zero, IntPtr.Zero, out hContext);
        if (ret != 0) throw new Exception($"SCardEstablishContext failed: 0x{ret:X8}");

        int readerLen = 0;
        SCardListReadersW(hContext, null, null, ref readerLen);
        var readerBuf = new char[readerLen];
        SCardListReadersW(hContext, null, readerBuf, ref readerLen);
        string readerName = new string(readerBuf).Split('\0').First(s => s.Length > 0);
        Console.WriteLine($"📟 Czytnik: {readerName}");

        ret = SCardConnectW(hContext, readerName, 2, 3, out hCard, out activeProtocol);
        if (ret != 0) throw new Exception($"SCardConnect failed: 0x{ret:X8}");

        Console.WriteLine("💳 Karta połączona!");

        var buffer = new byte[8192];
        while (ws.State == WebSocketState.Open)
        {
            var result = await ws.ReceiveAsync(buffer, CancellationToken.None);
            if (result.MessageType == WebSocketMessageType.Close) break;

            var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
            var request = JsonSerializer.Deserialize<JsonElement>(json);
            string cmd = request.GetProperty("cmd").GetString()!;
            byte[] data = Convert.FromBase64String(request.GetProperty("data").GetString()!);

            // Log RX
            logWriter.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] RX cmd={cmd} {data.Length}B: {ToHex(data)}");

            Console.WriteLine($"📩 Komenda: {cmd}, dane: {data.Length}B");

            byte[] responseData;

            if (cmd == "GET_ATR")
            {
                byte[] atrBuf = new byte[256];
                int atrLen = atrBuf.Length;
                int state = 0, protocol = 0;
                byte[] readerNameBuf = new byte[256];
                int readerNameLen = readerNameBuf.Length;

                ret = SCardStatusA(hCard, readerNameBuf, ref readerNameLen,
                    out state, out protocol, atrBuf, ref atrLen);
                if (ret != 0) throw new Exception($"SCardStatus failed: 0x{ret:X8}");

                responseData = new byte[atrLen];
                Array.Copy(atrBuf, responseData, atrLen);
                Console.WriteLine($"💳 ATR: {BitConverter.ToString(responseData)}");
            }
            else if (cmd == "TRANSMIT")
            {
                var ioSend = new SCARD_IO_REQUEST
                {
                    dwProtocol = (uint)activeProtocol,
                    cbPciLength = (uint)Marshal.SizeOf<SCARD_IO_REQUEST>()
                };

                byte[] recvBuf = new byte[4096];
                int recvLen = recvBuf.Length;

                ret = SCardTransmit(hCard, ref ioSend, data, data.Length,
                    IntPtr.Zero, recvBuf, ref recvLen);
                if (ret != 0) throw new Exception($"SCardTransmit failed: 0x{ret:X8}");

                responseData = new byte[recvLen];
                Array.Copy(recvBuf, responseData, recvLen);
                Console.WriteLine($"📤 Odpowiedź APDU: {recvLen}B, SW={recvBuf[recvLen - 2]:X2}{recvBuf[recvLen - 1]:X2}");
            }
            else if (cmd == "RECONNECT")
            {
                // Warm reset: disconnect + reconnect to reset card state
                Console.WriteLine("🔄 Warm reset (RECONNECT)...");
                logWriter.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] RECONNECT — warm reset requested");

                if (hCard != IntPtr.Zero)
                {
                    SCardDisconnect(hCard, 0); // SCARD_LEAVE_CARD = 0
                    hCard = IntPtr.Zero;
                }

                ret = SCardConnectW(hContext, readerName, 2, 3, out hCard, out activeProtocol);
                if (ret != 0) throw new Exception($"SCardReconnect failed: 0x{ret:X8}");

                // Read new ATR after reconnect
                byte[] atrBuf = new byte[256];
                int atrLen = atrBuf.Length;
                int state2 = 0, protocol2 = 0;
                byte[] readerNameBuf2 = new byte[256];
                int readerNameLen2 = readerNameBuf2.Length;
                SCardStatusA(hCard, readerNameBuf2, ref readerNameLen2,
                    out state2, out protocol2, atrBuf, ref atrLen);

                responseData = new byte[atrLen];
                Array.Copy(atrBuf, responseData, atrLen);
                Console.WriteLine($"🔄 Reconnect OK — nowy ATR: {BitConverter.ToString(responseData)}");
                logWriter.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] RECONNECT OK — ATR: {ToHex(responseData)}");
            }
            else
            {
                var errorResp = JsonSerializer.Serialize(new { error = $"Unknown command: {cmd}" });
                await ws.SendAsync(Encoding.UTF8.GetBytes(errorResp),
                    WebSocketMessageType.Text, true, CancellationToken.None);
                logWriter.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] TX ERROR: Unknown command: {cmd}");
                continue;
            }

            // Log TX
            logWriter.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] TX {responseData.Length}B: {ToHex(responseData)}");

            var response = JsonSerializer.Serialize(new { data = Convert.ToBase64String(responseData) });
            await ws.SendAsync(Encoding.UTF8.GetBytes(response),
                WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ Błąd: {ex.Message}");
        logWriter.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] ERROR: {ex.Message}");
        if (ws.State == WebSocketState.Open)
        {
            var errorResp = JsonSerializer.Serialize(new { error = ex.Message });
            await ws.SendAsync(Encoding.UTF8.GetBytes(errorResp),
                WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    finally
    {
        if (hCard != IntPtr.Zero) SCardDisconnect(hCard, 0);
        if (hContext != IntPtr.Zero) SCardReleaseContext(hContext);
        logWriter.WriteLine($"=== Sesja zakończona: {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} ===");
    }
}

static string ToHex(byte[] data)
{
    var sb = new StringBuilder(data.Length * 3);
    for (int i = 0; i < data.Length; i++)
    {
        if (i > 0) sb.Append(' ');
        sb.Append(data[i].ToString("X2"));
    }
    return sb.ToString();
}

// ===== winscard.dll P/Invoke =====

[DllImport("winscard.dll")]
static extern int SCardEstablishContext(int dwScope, IntPtr pvReserved1, IntPtr pvReserved2, out IntPtr phContext);
[DllImport("winscard.dll")]
static extern int SCardReleaseContext(IntPtr hContext);
[DllImport("winscard.dll", CharSet = CharSet.Unicode)]
static extern int SCardListReadersW(IntPtr hContext, string? mszGroups, char[]? mszReaders, ref int pcchReaders);
[DllImport("winscard.dll", CharSet = CharSet.Unicode)]
static extern int SCardConnectW(IntPtr hContext, string szReader, int dwShareMode, int dwPreferredProtocols, out IntPtr phCard, out int pdwActiveProtocol);
[DllImport("winscard.dll")]
static extern int SCardDisconnect(IntPtr hCard, int dwDisposition);
[DllImport("winscard.dll")]
static extern int SCardStatusA(IntPtr hCard, byte[] szReaderName, ref int pcchReaderLen, out int pdwState, out int pdwProtocol, byte[] pbAtr, ref int pcbAtrLen);
[DllImport("winscard.dll")]
static extern int SCardTransmit(IntPtr hCard, ref SCARD_IO_REQUEST pioSendPci, byte[] pbSendBuffer, int cbSendLength, IntPtr pioRecvPci, byte[] pbRecvBuffer, ref int pcbRecvLength);

[StructLayout(LayoutKind.Sequential)]
struct SCARD_IO_REQUEST { public uint dwProtocol; public uint cbPciLength; }
