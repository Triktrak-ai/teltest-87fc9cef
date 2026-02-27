namespace TachoDddServer.Protocol;

/// <summary>
/// Human-readable descriptions for DDD protocol error codes.
/// Based on Teltonika DDD protocol specification.
/// </summary>
public static class DddErrorCodes
{
    public static string Describe(byte errorClass, byte errorCode)
    {
        return (errorClass, errorCode) switch
        {
            // Class 0x01 — VU errors
            (0x01, 0x01) => "VU busy",
            (0x01, 0x02) => "VU internal error",
            (0x01, 0x03) => "VU not ready",
            (0x01, 0x04) => "VU communication timeout",
            (0x01, 0x05) => "VU card slot empty",
            (0x01, 0x06) => "VU card read error",

            // Class 0x02 — Authentication errors
            (0x02, 0x01) => "Authentication failed — unknown reason",
            (0x02, 0x02) => "Authentication failed — card not recognized",
            (0x02, 0x03) => "Authentication failed — card blocked",
            (0x02, 0x04) => "Authentication failed — card expired",
            (0x02, 0x05) => "Authentication failed — wrong PIN",
            (0x02, 0x0A) => "Authentication failed — certificate rejected",
            (0x02, 0x0B) => "Authentication failed — card expired (alt)",

            // Class 0x03 — File errors
            (0x03, 0x01) => "File not available",
            (0x03, 0x02) => "File access denied",
            (0x03, 0x03) => "File corrupted",
            (0x03, 0x04) => "File type not supported",
            (0x03, 0x05) => "File download aborted",

            // Class 0x04 — Communication errors
            (0x04, 0x01) => "Communication error — data link lost",
            (0x04, 0x02) => "Communication error — timeout",
            (0x04, 0x03) => "Communication error — CRC failure",

            // Class 0x05 — Protocol errors
            (0x05, 0x01) => "Protocol error — unexpected packet",
            (0x05, 0x02) => "Protocol error — invalid sequence",
            (0x05, 0x03) => "Protocol error — packet too large",

            // Class 0xFF — Generic errors
            (0xFF, 0x01) => "General device error",
            (0xFF, 0xFF) => "Unknown fatal error",

            _ => $"Unknown error (class=0x{errorClass:X2}, code=0x{errorCode:X2})"
        };
    }

    /// <summary>
    /// Format a full error description with hex codes and human-readable text.
    /// </summary>
    public static string Format(byte errorClass, byte errorCode)
    {
        return $"[0x{errorClass:X2}:0x{errorCode:X2}] {Describe(errorClass, errorCode)}";
    }

    /// <summary>
    /// Check if the error code indicates a potential generation mismatch (card not recognized).
    /// </summary>
    public static bool IsGenerationMismatch(byte errorClass, byte errorCode)
    {
        return errorClass == 0x02 && errorCode == 0x02;
    }
}
