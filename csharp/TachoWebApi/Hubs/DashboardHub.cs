using Microsoft.AspNetCore.SignalR;

namespace TachoWebApi.Hubs;

public class DashboardHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }
}
