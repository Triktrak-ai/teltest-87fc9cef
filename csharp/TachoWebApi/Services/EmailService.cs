using MailKit.Net.Smtp;
using MimeKit;

namespace TachoWebApi.Services;

public class EmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string to, string subject, string htmlBody)
    {
        if (_config["Email:Enabled"] != "true" && _config["Email:Enabled"] != "True")
        {
            _logger.LogWarning("Email disabled. Would send to {To}: {Subject}", to, subject);
            return;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(
            _config["Email:FromName"] ?? "TachoDDD",
            _config["Email:FromAddress"] ?? "noreply@example.com"));
        message.To.Add(MailboxAddress.Parse(to));
        message.Subject = subject;
        message.Body = new TextPart("html") { Text = htmlBody };

        using var client = new SmtpClient();
        await client.ConnectAsync(
            _config["Email:SmtpHost"],
            int.Parse(_config["Email:SmtpPort"] ?? "587"),
            MailKit.Security.SecureSocketOptions.StartTls);

        var user = _config["Email:SmtpUser"];
        var pass = _config["Email:SmtpPass"];
        if (!string.IsNullOrEmpty(user))
            await client.AuthenticateAsync(user, pass);

        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }
}
