using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

Console.WriteLine("💳 CardBridge Service - Serwis czytnika kart");
Console.WriteLine("============================================");

var listener = new HttpListener();
listener.Prefixes.Add("http://+:5201/");
listener.Start();
Console.WriteLine("🚀 WebSocket nasłuchuje na porcie 5201");

while (true)
{
    var context = await listener.GetContextAsync();

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

static async Task HandleSessionAsync(WebSocket ws)
{
    IntPtr hContext = IntPtr.Zero;
    IntPtr hCard = IntPtr.Zero;
    int activeProtocol = 0;

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
            else
            {
                var errorResp = JsonSerializer.Serialize(new { error = $"Unknown command: {cmd}" });
                await ws.SendAsync(Encoding.UTF8.GetBytes(errorResp),
                    WebSocketMessageType.Text, true, CancellationToken.None);
                continue;
            }

            var response = JsonSerializer.Serialize(new { data = Convert.ToBase64String(responseData) });
            await ws.SendAsync(Encoding.UTF8.GetBytes(response),
                WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ Błąd: {ex.Message}");
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
    }
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
