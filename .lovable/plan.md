

# Panel logowania z rolami (admin + użytkownik) i zatwierdzaniem kont

## Cel
System autentykacji gdzie administrator widzi wszystkie dane i zarządza kontami, a zwykli użytkownicy widzą tylko sesje powiązane ze swoimi IMEI. Użytkownik może się sam zarejestrować, ale konto wymaga zatwierdzenia przez admina.

## Architektura

```text
+------------------+       +------------------+       +------------------+
|   /auth          | ----> |   AuthProvider   | ----> |   Dashboard      |
|  login/signup    |       |  + ProtectedRoute|       |  (filtrowane     |
|                  |       |  + rola + approved|       |   przez RLS)     |
+------------------+       +------------------+       +------------------+
                                    |
                    +---------------+---------------+
                    |               |               |
              profiles        user_roles       user_devices
              (dane osobowe)  (admin/user)     (IMEI mapping)
```

## Zmiany w bazie danych (4 migracje)

### 1. Tabela `profiles`
- `id` (uuid, PK, FK -> auth.users.id ON DELETE CASCADE)
- `full_name` (text)
- `phone` (text, nullable)
- `approved` (boolean, default false) -- klucz: nowe konto wymaga zatwierdzenia
- `created_at`, `updated_at`
- Trigger: automatyczne tworzenie profilu przy rejestracji (approved = false)
- RLS: użytkownik czyta/edytuje swój profil; admin czyta wszystkie

### 2. Tabela `user_roles` (zgodnie z wytycznymi bezpieczenstwa)
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE)
- `role` (app_role enum: admin, user)
- UNIQUE (user_id, role)
- Funkcja `has_role(uuid, app_role)` -- SECURITY DEFINER
- RLS: admin widzi wszystkie role

### 3. Tabela `user_devices`
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, NOT NULL)
- `imei` (text, UNIQUE)
- `label` (text, nullable)
- `created_at`
- RLS: użytkownik zarządza swoimi; admin zarządza wszystkimi

### 4. Zmiana polityk RLS na istniejacych tabelach
- Funkcja `get_user_imeis(uuid)` SECURITY DEFINER -- zwraca IMEI usera
- Funkcja `is_approved(uuid)` SECURITY DEFINER -- sprawdza czy konto zatwierdzone
- `sessions` SELECT: admin widzi wszystko; zatwierdzony user widzi tylko swoje IMEI
- `session_events` SELECT: jak wyzej
- `download_schedule` SELECT: jak wyzej
- Dotychczasowe polityki "Allow anonymous read" zostana zastapione
- Polityki INSERT/UPDATE dla service_role pozostaja bez zmian (serwer C# raportuje dalej)

## Nowe komponenty frontendowe

### 1. `src/contexts/AuthContext.tsx`
- Kontekst sesji z `onAuthStateChange`
- Pobiera profil i role zalogowanego usera
- Udostepnia: `user`, `profile`, `isAdmin`, `isApproved`, `signOut`

### 2. `src/components/ProtectedRoute.tsx`
- Niezalogowany -> przekierowanie na `/auth`
- Zalogowany ale niezatwierdzony -> ekran "Twoje konto oczekuje na zatwierdzenie"

### 3. `src/pages/Auth.tsx`
- Zakladki: Logowanie / Rejestracja
- Rejestracja: email, haslo, imie, telefon (opcjonalnie)
- Po rejestracji: komunikat "Konto utworzone, oczekuje na zatwierdzenie administratora"

### 4. `src/pages/ResetPassword.tsx`
- Formularz ustawiania nowego hasla po kliknieciu linku z emaila

### 5. `src/components/AdminPanel.tsx`
- Widoczny tylko dla admina (w headerze lub osobna zakladka)
- Lista uzytkownikow z przyciskami: Zatwierdz / Odrzuc / Nadaj role admin
- Zarzadzanie przypisaniami IMEI do uzytkownikow

### 6. `src/components/DeviceManagement.tsx`
- Sekcja na dashboardzie: "Moje urzadzenia"
- Dodawanie/usuwanie IMEI (z opcjonalna etykieta np. "MAN TGX AB1234")
- Admin moze przypisywac IMEI do dowolnego usera

## Zmiany w istniejacym kodzie

- **App.tsx**: AuthProvider wrapper, ProtectedRoute na `/` i `/ddd-reader`, publiczne trasy `/auth` i `/reset-password`
- **Index.tsx**: przycisk wylogowania, link do panelu admina (warunkowo), sekcja DeviceManagement
- **useSessions.ts**: bez zmian w kodzie -- RLS automatycznie filtruje dane

## Pierwszy administrator

Pierwszego admina trzeba utworzyc recznie: zarejestruj konto, potem wstaw rekord do `user_roles` i ustaw `approved = true` w `profiles`. Kolejnych adminow moze juz dodawac z poziomu panelu.

## Przeplyw

1. Uzytkownik rejestruje sie na `/auth` -> profil tworzony z `approved = false`
2. Admin widzi nowe konto w panelu -> klika "Zatwierdz"
3. Uzytkownik loguje sie -> widzi dashboard z danymi tylko ze swoich IMEI
4. Admin loguje sie -> widzi wszystkie sesje + panel administracyjny

