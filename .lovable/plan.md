
# Plan: Przepisanie backendu na ASP.NET Web API (bez Supabase)

## Status: ✅ ZAIMPLEMENTOWANY

Caly backend (auth, baza, storage, realtime, edge functions) zostal przeniesiony do jednego projektu ASP.NET Web API w C# (`csharp/TachoWebApi/`). Frontend React zostal przepisany — warstwa komunikacji uzywa `fetch()` + JWT zamiast Supabase JS SDK, a realtime dziala przez SignalR.

---

## Co zostalo utworzone

### Backend C# (`csharp/TachoWebApi/`)

| Plik | Opis |
|------|------|
| `Program.cs` | Konfiguracja: EF Core, JWT, SignalR, CORS, auto-migracja |
| `appsettings.json` | Connection string, JWT secret, API key, CORS origins |
| **Data/** | |
| `AppDbContext.cs` | DbContext z mapowaniem 8 tabel |
| `Models/AuthUser.cs` | Nowa tabela auth_users (email, password_hash, refresh_token) |
| `Models/Profile.cs` | Profil uzytkownika (1:1 z AuthUser) |
| `Models/UserRole.cs` | Role (admin/user) w osobnej tabeli |
| `Models/UserDevice.cs` | Urzadzenia IMEI |
| `Models/Session.cs` | Sesje pobierania DDD |
| `Models/SessionEvent.cs` | Zdarzenia sesji |
| `Models/DownloadSchedule.cs` | Harmonogram pobierania |
| `Models/AppSetting.cs` | Ustawienia globalne |
| **Controllers/** | |
| `AuthController.cs` | signup, login, refresh, forgot/reset password, admin/create-user |
| `SessionsController.cs` | GET sessions, session-events (filtrowane wg roli) |
| `DownloadScheduleController.cs` | GET schedule, POST reset, POST toggle-block |
| `DevicesController.cs` | CRUD user-devices |
| `AdminController.cs` | GET users, PATCH approve, POST toggle-admin |
| `ProfilesController.cs` | GET me, GET user-roles |
| `SettingsController.cs` | GET app-settings (publiczny) |
| `ReportSessionController.cs` | POST report-session (x-api-key) + SignalR notify |
| `CheckDownloadController.cs` | GET check-download (x-api-key) |
| `UploadSessionLogController.cs` | POST upload-session-log (x-api-key, pliki na dysk) |
| `SessionLogsController.cs` | GET session-logs (JWT admin) |
| **Hubs/** | |
| `DashboardHub.cs` | SignalR hub `/hubs/dashboard` |
| **Services/** | |
| `JwtService.cs` | Generowanie/walidacja JWT |
| `EmailService.cs` | Wysylka e-maili (MailKit) |
| `FileStorageService.cs` | Zapis plikow na dysk |
| **Middleware/** | |
| `ApiKeyAuthMiddleware.cs` | Walidacja x-api-key dla endpointow server-to-server |

### Frontend (zmienione pliki)

| Plik | Zmiana |
|------|--------|
| `src/lib/api-client.ts` | **NOWY** — wrapper fetch() z JWT, auto-refresh, auth API |
| `src/hooks/useSignalR.ts` | **NOWY** — wspoldzielone polaczenie SignalR |
| `src/contexts/AuthContext.tsx` | Przepisany — JWT w localStorage zamiast Supabase Auth |
| `src/hooks/useSessions.ts` | apiFetch + SignalR zamiast supabase.from + postgres_changes |
| `src/hooks/useDownloadSchedule.ts` | Analogicznie |
| `src/hooks/useImeiOwners.ts` | Analogicznie |
| `src/components/AdminPanel.tsx` | apiFetch zamiast supabase.from + supabase.functions |
| `src/components/DeviceManagement.tsx` | Analogicznie |
| `src/components/AdminFilter.tsx` | Analogicznie |
| `src/components/DownloadScheduleTable.tsx` | Analogicznie |
| `src/pages/Auth.tsx` | apiLogin/apiSignup zamiast supabase.auth |
| `src/pages/ResetPassword.tsx` | apiResetPassword z query param token |

### Dodana zaleznosc npm
- `@microsoft/signalr` — klient SignalR

---

## Uruchomienie na Windows Server

1. Zainstaluj PostgreSQL, utworz baze `tachoddd`
2. Edytuj `csharp/TachoWebApi/appsettings.json` (connection string, JWT key, API key, CORS origins)
3. `cd csharp/TachoWebApi && dotnet ef migrations add Initial && dotnet ef database update`
4. `dotnet run` (lub zainstaluj jako Windows Service)
5. Frontend: ustaw `VITE_API_BASE_URL=https://twoj-serwer:5100` w `.env`, `npm run build`, serwuj z IIS
6. TachoDddServer: `appsettings.json` juz wskazuje na `http://localhost:5100/api/report-session`
