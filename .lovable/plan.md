
# Plan: Przepisanie backendu na ASP.NET Web API (bez Supabase)

## Podsumowanie

Caly backend (auth, baza, storage, realtime, edge functions) zostanie przeniesiony do jednego projektu ASP.NET Web API w C#, hostowanego na Windows Server obok istniejacego TachoDddServer. Frontend React pozostaje bez zmian w warstwie UI -- zmieni sie jedynie warstwa komunikacji (zamienniki dla Supabase JS SDK).

---

## Architektura docelowa

```text
+-------------------+       HTTPS/WSS        +---------------------------+
|  React Frontend   | <--------------------> |  ASP.NET Web API (.NET 8) |
|  (IIS / static)   |                        |                           |
+-------------------+                        |  - JWT Auth (login/reg)   |
                                             |  - REST API (CRUD)        |
                                             |  - SignalR (realtime)     |
                                             |  - File Storage (disk)    |
                                             |  - PostgreSQL (Npgsql/EF) |
+-------------------+       x-api-key        |                           |
|  TachoDddServer   | ---------------------> |  /api/report-session      |
|  (TCP port 5200)  |                        +---------------------------+
+-------------------+                                    |
                                                   PostgreSQL
                                                  (ten sam serwer)
```

---

## 1. Projekt ASP.NET Web API

Nowy projekt `csharp/TachoWebApi/` (.NET 8, Minimal API lub Controllers).

**NuGet dependencies:**
- `Microsoft.AspNetCore.Authentication.JwtBearer` -- JWT auth
- `Microsoft.EntityFrameworkCore` + `Npgsql.EntityFrameworkCore.PostgreSQL` -- ORM
- `Microsoft.AspNetCore.SignalR` -- realtime (wbudowane)
- `BCrypt.Net-Next` -- hashowanie hasel
- `MailKit` -- wysylka e-maili (weryfikacja, reset hasla)

---

## 2. Baza danych (PostgreSQL + EF Core)

Schemat pozostaje identyczny (profiles, user_roles, user_devices, sessions, session_events, download_schedule, app_settings). Zamiast RLS, kontrola dostepu realizowana w kodzie C# (middleware/filtry).

**Modele EF Core** mapuja 1:1 tabele z obecnego schematu. Migracje EF Core zastapia migracje SQL Supabase.

---

## 3. Autentykacja (zamiennik Supabase Auth)

| Funkcja | Implementacja |
|---------|--------------|
| Rejestracja | `POST /api/auth/signup` -- tworzy rekord w tabeli `auth_users` (nowa, lokalna), hashuje haslo (BCrypt), wysyla e-mail weryfikacyjny |
| Logowanie | `POST /api/auth/login` -- weryfikuje haslo, zwraca JWT (access + refresh token) |
| Refresh token | `POST /api/auth/refresh` |
| Reset hasla | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Tworzenie przez admina | `POST /api/auth/admin/create-user` (wymaga roli admin) |

JWT generowany z claims: `sub` (user_id), `email`, `role`, `exp`. Czas zycia: 1h access, 7d refresh.

**Nowa tabela `auth_users`:**
- id (uuid PK), email (unique), password_hash, email_confirmed, created_at, updated_at
- Trigger/logika: przy insercie tworzony profil w `profiles`

---

## 4. REST API (zamiennik Supabase PostgREST)

Endpointy odpowiadajace obecnym zapytaniom frontendu:

| Endpoint | Opis | Autoryzacja |
|----------|------|-------------|
| `GET /api/sessions` | Lista sesji (admin: wszystkie, user: wlasne IMEI) | JWT |
| `GET /api/session-events` | Lista zdarzen (jw.) | JWT |
| `GET /api/download-schedule` | Harmonogram (jw.) | JWT |
| `GET /api/app-settings` | Ustawienia globalne | publiczny |
| `GET /api/profiles/me` | Profil zalogowanego | JWT |
| `GET /api/user-devices` | Urzadzenia usera | JWT |
| `POST /api/user-devices` | Dodaj urzadzenie | JWT |
| `DELETE /api/user-devices/:id` | Usun urzadzenie | JWT |
| `GET /api/user-roles` | Role usera | JWT |
| **Admin:** | | |
| `GET /api/admin/users` | Lista uzytkownikow + urzadzenia | JWT (admin) |
| `PATCH /api/admin/users/:id/approve` | Zatwierdz konto | JWT (admin) |
| `POST /api/admin/devices` | Dodaj urzadzenie userowi | JWT (admin) |
| `DELETE /api/admin/devices/:id` | Usun urzadzenie | JWT (admin) |

---

## 5. Edge Functions -> Kontrolery API

| Edge Function | Nowy endpoint | Uwagi |
|--------------|---------------|-------|
| `report-session` | `POST /api/report-session` | Auth: x-api-key (serwer C#) |
| `check-download` | `GET /api/check-download?imei=X` | Auth: x-api-key |
| `upload-session-log` | `POST /api/upload-session-log` | Auth: x-api-key, pliki na dysk |
| `reset-download-schedule` | `POST /api/reset-download-schedule` | Auth: JWT (admin) lub x-api-key |
| `toggle-download-block` | `POST /api/toggle-download-block` | Auth: JWT (admin) |
| `create-user` | `POST /api/auth/admin/create-user` | Auth: JWT (admin) |

---

## 6. Realtime (zamiennik Supabase Realtime -> SignalR)

**SignalR Hub:** `/hubs/dashboard`

- Gdy `report-session` upsertuje sesje lub event, hub wysyla powiadomienie do podlaczonych klientow
- Metody: `SessionUpdated(sessionId)`, `EventCreated(eventId)`
- Frontend subskrybuje i invaliduje react-query cache (identycznie jak teraz)

---

## 7. Storage (zamiennik Supabase Storage -> dysk)

Pliki session-logs zapisywane na dysku: `C:\TachoDDD\SessionLogs\{sessionId}\{filename}`

Endpoint `GET /api/session-logs/{sessionId}/{filename}` do pobrania (auth: JWT admin).

---

## 8. Zmiany w React Frontend

**Nowy plik:** `src/lib/api-client.ts` -- wrapper HTTP z JWT w headerze.

**Zmiany w istniejacych plikach:**

| Plik | Zmiana |
|------|--------|
| `src/contexts/AuthContext.tsx` | Zamiast `supabase.auth.*` -> wywolania `/api/auth/*`, JWT w localStorage |
| `src/hooks/useSessions.ts` | Zamiast `supabase.from("sessions")` -> `fetch("/api/sessions")`, SignalR zamiast `postgres_changes` |
| `src/hooks/useDownloadSchedule.ts` | Analogicznie |
| `src/hooks/useImeiOwners.ts` | Analogicznie |
| `src/components/AdminPanel.tsx` | Wywolania edge functions -> `/api/*` |
| `src/components/DeviceManagement.tsx` | `supabase.from("user_devices")` -> `/api/user-devices` |
| `src/components/AdminFilter.tsx` | Analogicznie |
| `src/pages/Auth.tsx` | `supabase.auth.signInWithPassword` -> `POST /api/auth/login` |
| `src/pages/ResetPassword.tsx` | Analogicznie |

**Nowa zaleznosc npm:** `@microsoft/signalr` (klient SignalR dla przegladarki).

---

## 9. Konfiguracja Windows Server

1. Zainstalowac PostgreSQL na Windows
2. Wykonac migracje EF Core (`dotnet ef database update`)
3. Uruchomic TachoWebApi jako Windows Service (lub IIS z Kestrel)
4. Frontend: `npm run build` -> IIS static site
5. TachoDddServer: zmienic `WebReport.Url` na `https://localhost:XXXX/api/report-session`

---

## 10. Kolejnosc implementacji

1. Utworzyc projekt `TachoWebApi` z EF Core + modele + migracje
2. Zaimplementowac auth (rejestracja, login, JWT, refresh)
3. Przepisac 6 edge functions na kontrolery
4. Dodac SignalR hub
5. Dodac storage na dysku
6. Przepisac frontend (api-client, AuthContext, hooki)
7. Testy integracyjne

---

## Sekcja techniczna: struktura projektu

```text
csharp/TachoWebApi/
  Program.cs
  appsettings.json
  Controllers/
    AuthController.cs
    SessionsController.cs
    ReportSessionController.cs
    CheckDownloadController.cs
    UploadSessionLogController.cs
    DownloadScheduleController.cs
    DevicesController.cs
    AdminController.cs
    SettingsController.cs
  Hubs/
    DashboardHub.cs
  Data/
    AppDbContext.cs
    Models/
      AuthUser.cs, Profile.cs, UserRole.cs, UserDevice.cs,
      Session.cs, SessionEvent.cs, DownloadSchedule.cs, AppSetting.cs
  Services/
    JwtService.cs
    EmailService.cs
    FileStorageService.cs
  Middleware/
    ApiKeyAuthMiddleware.cs
```

**Uwaga:** Ten plan to dokumentacja architektoniczna. Implementacja tego projektu wykracza poza mozliwosci Lovable (backend C# nie moze byc uruchomiony na platformie). Plan nalezy zrealizowac lokalnie w Visual Studio / Rider, a nastepnie dostosowac frontend w Lovable lub rowniez lokalnie.
