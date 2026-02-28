namespace TachoWebApi.Middleware;

/// <summary>
/// Validates x-api-key header for server-to-server endpoints (/api/report-session, /api/check-download, /api/upload-session-log).
/// </summary>
public class ApiKeyAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _expectedKey;
    private static readonly string[] ApiKeyPaths =
    {
        "/api/report-session",
        "/api/check-download",
        "/api/upload-session-log",
    };

    public ApiKeyAuthMiddleware(RequestDelegate next, IConfiguration config)
    {
        _next = next;
        _expectedKey = config["ApiKey"] ?? "";
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var path = ctx.Request.Path.Value?.ToLowerInvariant() ?? "";

        if (ApiKeyPaths.Any(p => path.StartsWith(p)))
        {
            var apiKey = ctx.Request.Headers["x-api-key"].FirstOrDefault();
            if (string.IsNullOrEmpty(_expectedKey) || apiKey != _expectedKey)
            {
                ctx.Response.StatusCode = 401;
                await ctx.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
                return;
            }
        }

        await _next(ctx);
    }
}
