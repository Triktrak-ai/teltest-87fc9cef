# Migracja TachoDDD Monitor — z Lovable na własny serwer

> **Cel dokumentu:** Krok po kroku przenieść część webową (frontend React + backend Supabase) z serwerów Lovable na Twój prywatny serwer, zachowując pełną funkcjonalność.

---

## Spis treści

1. [Architektura obecna vs docelowa](#1-architektura-obecna-vs-docelowa)
2. [Wymagania](#2-wymagania)
3. [Krok 1 — Pobranie kodu źródłowego](#krok-1--pobranie-kodu-źródłowego)
4. [Krok 2 — Własna instancja Supabase](#krok-2--własna-instancja-supabase)
5. [Krok 3 — Migracja bazy danych](#krok-3--migracja-bazy-danych)
6. [Krok 4 — Edge Functions → Deno / Node.js](#krok-4--edge-functions--deno--nodejs)
7. [Krok 5 — Storage (session-logs)](#krok-5--storage-session-logs)
8. [Krok 6 — Sekrety i zmienne środowiskowe](#krok-6--sekrety-i-zmienne-środowiskowe)
9. [Krok 7 — Build i deploy frontendu](#krok-7--build-i-deploy-frontendu)
10. [Krok 8 — Konfiguracja C# serwera](#krok-8--konfiguracja-c-serwera)
11. [Krok 9 — Reverse proxy (Nginx/Caddy)](#krok-9--reverse-proxy-nginxcaddy)
12. [Krok 10 — DNS i SSL](#krok-10--dns-i-ssl)
13. [Krok 11 — Weryfikacja](#krok-11--weryfikacja)
14. [Diagram docelowej architektury](#diagram-docelowej-architektury)

---

## 1. Architektura obecna vs docelowa

### Obecna (Lovable)

```
┌─────────────────────────────────────────────────┐
│ Lovable Cloud                                   │
│  ├─ Frontend React (hosting Lovable)            │
│  ├─ Supabase (baza danych, auth, storage)       │
│  └─ Edge Functions (Deno Deploy)                │
│     ├─ report-session                           │
│     ├─ check-download                           │
│     ├─ upload-session-log                       │
│     ├─ reset-download-schedule                  │
│     ├─ toggle-download-block                    │
│     └─ create-user                              │
└─────────────────────────────────────────────────┘
         ▲                          ▲
         │ HTTPS                    │ HTTPS (API)
    Przeglądarka              TachoDddServer (C#)
    użytkownika               na Twoim VPS
```

### Docelowa (Twój serwer)

```
┌─────────────────────────────────────────────────┐
│ Twój VPS / serwer                               │
│  ├─ Nginx reverse proxy (port 80/443)           │
│  │   ├─ / → Frontend (pliki statyczne)          │
│  │   └─ /functions/v1/* → Supabase Edge Func.   │
│  ├─ Supabase self-hosted (Docker)               │
│  │   ├─ PostgreSQL (port 5432)                  │
│  │   ├─ GoTrue (auth, port 9999)                │
│  │   ├─ PostgREST (API, port 3000)              │
│  │   ├─ Storage API (port 5000)                 │
│  │   └─ Edge Functions (Deno, port 8000)        │
│  ├─ TachoDddServer (port 5200)                  │
│  └─ CardBridge ← ngrok ← Laptop                │
└─────────────────────────────────────────────────┘
```

---

## 2. Wymagania

| Komponent | Minimalne wymagania |
|-----------|-------------------|
| **OS** | Linux (Ubuntu 22.04+) lub Windows Server 2025 |
| **Docker** | Docker Engine 24+ i Docker Compose v2 |
| **RAM** | min. 4 GB (Supabase self-hosted potrzebuje ~2 GB) |
| **Dysk** | min. 20 GB wolnego miejsca |
| **Node.js** | 18+ (do budowania frontendu) |
| **Deno** | 1.40+ (do Edge Functions, opcjonalnie) |
| **Domena** | Opcjonalnie, do SSL i ładnego adresu |

---

## Krok 1 — Pobranie kodu źródłowego

### Opcja A: GitHub (zalecana)

Jeśli projekt jest połączony z GitHub:

```bash
git clone https://github.com/TWOJ_USER/TWOJ_REPO.git
cd TWOJ_REPO
```

### Opcja B: Eksport z Lovable

1. W Lovable → Settings → GitHub → Connect & Create Repository
2. Po synchronizacji sklonuj repozytorium jak wyżej

### Struktura po pobraniu

```
├── src/                    ← Frontend React
├── supabase/
│   ├── functions/          ← Edge Functions (6 funkcji)
│   ├── migrations/         ← Migracje SQL
│   └── config.toml         ← Konfiguracja Supabase
├── csharp/                 ← Serwer C# (już na Twoim serwerze)
├── public/                 ← Zasoby statyczne
├── package.json
├── vite.config.ts
└── docs/
```

---

## Krok 2 — Własna instancja Supabase

### Opcja A: Supabase Self-Hosted (Docker) — pełna kontrola

```bash
# Sklonuj oficjalny Supabase Docker setup
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Skopiuj i skonfiguruj plik .env
cp .env.example .env
```

Edytuj `.env` w katalogu `supabase/docker`:

```env
# WAŻNE: Zmień te wartości!
POSTGRES_PASSWORD=twoje_silne_haslo_db
JWT_SECRET=twoj_jwt_secret_min_32_znaki_losowe
ANON_KEY=wygeneruj_nowy_anon_key
SERVICE_ROLE_KEY=wygeneruj_nowy_service_role_key

# URL twojego serwera
SITE_URL=https://tachoddd.twojadomena.pl
API_EXTERNAL_URL=https://api.tachoddd.twojadomena.pl

# SMTP do wysyłki emaili (weryfikacja, reset hasła)
SMTP_HOST=smtp.twojprovider.pl
SMTP_PORT=587
SMTP_USER=noreply@twojadomena.pl
SMTP_PASS=haslo_smtp
SMTP_SENDER_NAME=TachoDDD
```

#### Generowanie kluczy JWT

```bash
# Zainstaluj narzędzie supabase CLI
npm install -g supabase

# Lub wygeneruj klucze ręcznie:
# 1. Wygeneruj JWT_SECRET (min. 32 znaki)
openssl rand -base64 32

# 2. Wygeneruj ANON_KEY i SERVICE_ROLE_KEY
# Użyj https://supabase.com/docs/guides/self-hosting#api-keys
# lub narzędzia: https://jwt.io/
# Payload dla ANON_KEY:
# {
#   "role": "anon",
#   "iss": "supabase",
#   "iat": 1700000000,
#   "exp": 2000000000
# }
# Payload dla SERVICE_ROLE_KEY:
# {
#   "role": "service_role",
#   "iss": "supabase",
#   "iat": 1700000000,
#   "exp": 2000000000
# }
```

Uruchom Supabase:

```bash
docker compose up -d
```

Supabase będzie dostępny na:
- **Studio (panel admina):** `http://localhost:8000`
- **API (PostgREST):** `http://localhost:3000`
- **Auth (GoTrue):** `http://localhost:9999`
- **Storage:** `http://localhost:5000`
- **Edge Functions:** `http://localhost:8000/functions/v1/`

### Opcja B: Supabase Cloud (własne konto)

1. Załóż konto na https://supabase.com
2. Utwórz nowy projekt
3. Zapisz: `Project URL`, `anon key`, `service_role key`
4. Pomiń Docker — Supabase hostuje za Ciebie

---

## Krok 3 — Migracja bazy danych

### 3.1. Schemat tabel

Utwórz poniższy SQL w swojej nowej bazie (Supabase Studio → SQL Editor lub `psql`):

```sql
-- ═══════════════════════════════════════════════
-- ENUM
-- ═══════════════════════════════════════════════
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ═══════════════════════════════════════════════
-- TABELE
-- ═══════════════════════════════════════════════

-- Ustawienia aplikacji
CREATE TABLE public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Profile użytkowników
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, -- references auth.users(id)
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT,
    approved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Role użytkowników
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- references auth.users(id)
    role app_role NOT NULL
);

-- Urządzenia użytkowników
CREATE TABLE public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    imei TEXT NOT NULL,
    label TEXT,
    vehicle_plate TEXT,
    sim_number TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sesje DDD
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imei TEXT NOT NULL,
    vehicle_plate TEXT,
    status TEXT NOT NULL DEFAULT 'connecting',
    generation TEXT DEFAULT 'Unknown',
    progress INTEGER DEFAULT 0,
    files_downloaded INTEGER DEFAULT 0,
    total_files INTEGER DEFAULT 0,
    current_file TEXT,
    error_code TEXT,
    error_message TEXT,
    bytes_downloaded BIGINT DEFAULT 0,
    apdu_exchanges INTEGER DEFAULT 0,
    crc_errors INTEGER DEFAULT 0,
    card_generation TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ,
    log_uploaded BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Zdarzenia sesji
CREATE TABLE public.session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.sessions(id),
    imei TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    context TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Harmonogram pobierania
CREATE TABLE public.download_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imei TEXT NOT NULL UNIQUE,
    last_success_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT,
    attempts_today INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- FUNKCJE
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone'
  );
  RETURN NEW;
END;
$$;

-- Trigger: auto-tworzenie profilu po rejestracji
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT approved FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_imeis(_user_id UUID)
RETURNS SETOF TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT imei FROM public.user_devices WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.increment_attempts_today(p_imei TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE download_schedule
  SET attempts_today = COALESCE(attempts_today, 0) + 1,
      updated_at = now()
  WHERE imei = p_imei;
END;
$$;

-- ═══════════════════════════════════════════════
-- RLS (Row Level Security)
-- ═══════════════════════════════════════════════

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_schedule ENABLE ROW LEVEL SECURITY;

-- app_settings: publiczny odczyt
CREATE POLICY "Allow anonymous read app_settings" ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

-- profiles: użytkownik widzi swój, admin widzi wszystkie
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admin manages roles" ON public.user_roles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- user_devices
CREATE POLICY "Users manage own devices" ON public.user_devices
  FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admin manages all devices" ON public.user_devices
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- sessions: admin widzi wszystko, user widzi swoje IMEI
CREATE POLICY "Authenticated read sessions" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR (is_approved(auth.uid()) AND imei IN (SELECT get_user_imeis(auth.uid())))
  );

-- session_events
CREATE POLICY "Authenticated read session_events" ON public.session_events
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR (is_approved(auth.uid()) AND imei IN (SELECT get_user_imeis(auth.uid())))
  );

-- download_schedule
CREATE POLICY "Authenticated read download_schedule" ON public.download_schedule
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR (is_approved(auth.uid()) AND imei IN (SELECT get_user_imeis(auth.uid())))
  );

-- ═══════════════════════════════════════════════
-- STORAGE
-- ═══════════════════════════════════════════════
-- Utwórz bucket "session-logs" jako publiczny
-- (w Supabase Studio → Storage → New Bucket → "session-logs", public=true)
-- Lub via SQL:
INSERT INTO storage.buckets (id, name, public) VALUES ('session-logs', 'session-logs', true)
ON CONFLICT (id) DO NOTHING;
```

### 3.2. Migracja istniejących danych

Jeśli chcesz przenieść dane z obecnej bazy Lovable Cloud:

```bash
# Eksportuj dane z obecnej bazy (w Lovable Cloud → Database → Export)
# Lub jeśli masz dostęp do connection string:

# Eksport
pg_dump --data-only --no-owner --no-privileges \
  -t public.sessions \
  -t public.session_events \
  -t public.download_schedule \
  -t public.user_devices \
  -t public.profiles \
  -t public.user_roles \
  -t public.app_settings \
  "postgresql://postgres:PASSWORD@db.exyjnmtxacpydoeaqcti.supabase.co:5432/postgres" \
  > data_export.sql

# Import do nowej bazy
psql "postgresql://postgres:TWOJE_HASLO@localhost:5432/postgres" < data_export.sql
```

### 3.3. Migracja użytkowników (auth.users)

**UWAGA:** Tabela `auth.users` jest zarządzana przez GoTrue. Musisz:

1. Wyeksportować użytkowników z obecnej bazy:
```sql
-- Na obecnej bazie (Lovable Cloud)
SELECT id, email, encrypted_password, raw_user_meta_data, created_at
FROM auth.users;
```

2. Zaimportować do nowej bazy:
```sql
-- Na nowej bazie
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at,
  email_confirmed_at, confirmation_sent_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'UUID_USERA',
  'authenticated',
  'authenticated',
  'email@example.com',
  '$2a$10$HASH_Z_EKSPORTU',
  '{"full_name":"Jan Kowalski"}'::jsonb,
  now(), now(), now(), now()
);
```

Lub prościej — po uruchomieniu nowej instancji utwórz użytkowników na nowo przez formularz rejestracji lub Edge Function `create-user`.

---

## Krok 4 — Edge Functions → Deno / Node.js

Masz 6 Edge Functions do przeniesienia. Masz **3 opcje**:

### Opcja A: Supabase CLI (self-hosted z Edge Functions)

Jeśli używasz Supabase self-hosted, Edge Functions działają przez `supabase functions serve`:

```bash
# Zainstaluj Supabase CLI
npm install -g supabase

# W katalogu projektu
supabase functions serve --env-file ./supabase/.env.local
```

Plik `supabase/.env.local`:
```env
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=twoj_anon_key
SUPABASE_SERVICE_ROLE_KEY=twoj_service_role_key
REPORT_API_KEY=twoj_report_api_key
```

### Opcja B: Supabase Cloud (nowe konto)

```bash
# Linkuj do nowego projektu
supabase link --project-ref TWOJ_NOWY_PROJECT_ID

# Wgraj sekrety
supabase secrets set REPORT_API_KEY=twoj_klucz

# Deploy wszystkich funkcji
supabase functions deploy report-session
supabase functions deploy check-download
supabase functions deploy upload-session-log
supabase functions deploy reset-download-schedule
supabase functions deploy toggle-download-block
supabase functions deploy create-user
```

### Opcja C: Standalone Deno server (bez Supabase Functions)

Jeśli nie chcesz używać Supabase Edge Functions, możesz uruchomić te same pliki TypeScript jako standalone Deno server:

```bash
# Zainstaluj Deno
curl -fsSL https://deno.land/install.sh | sh

# Uruchom każdą funkcję osobno lub jako router
deno run --allow-net --allow-env supabase/functions/report-session/index.ts
```

Ale łatwiej jest stworzić jeden router:

```typescript
// server.ts — Deno HTTP router dla wszystkich funkcji
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Importuj handlery z istniejących plików
// (wymagają minimalnej adaptacji — zamień Deno.serve na export)

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith("/functions/v1/report-session")) {
    // forward do report-session handler
  }
  // ... analogicznie dla pozostałych
}, { port: 8000 });
```

### Lista Edge Functions i ich zastosowanie

| Funkcja | Wywołuje | Metoda | Auth |
|---------|----------|--------|------|
| `report-session` | TachoDddServer (C#) | POST | x-api-key (REPORT_API_KEY) |
| `check-download` | TachoDddServer (C#) | GET | x-api-key (REPORT_API_KEY) |
| `upload-session-log` | TachoDddServer (C#) | POST (multipart) | x-api-key (REPORT_API_KEY) |
| `reset-download-schedule` | Dashboard (frontend) | POST | Bearer JWT lub x-api-key |
| `toggle-download-block` | Dashboard (frontend) | POST | Bearer JWT |
| `create-user` | Dashboard (frontend) | POST | Bearer JWT (admin) |

---

## Krok 5 — Storage (session-logs)

### Migracja plików z obecnego Storage

```bash
# Listuj i pobierz pliki z obecnego bucketa
# Użyj Supabase JS lub curl:

curl -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  "https://exyjnmtxacpydoeaqcti.supabase.co/storage/v1/object/list/session-logs" \
  | jq -r '.[].name'

# Pobierz każdy plik i wgraj do nowego Storage
# (lub pomiń jeśli logi historyczne nie są potrzebne)
```

### Konfiguracja Storage na nowej instancji

Bucket `session-logs` musi być publiczny (ustawione w SQL z kroku 3.1).

---

## Krok 6 — Sekrety i zmienne środowiskowe

### 6.1. Sekrety (Edge Functions / backend)

| Sekret | Opis | Gdzie ustawić |
|--------|------|---------------|
| `SUPABASE_URL` | URL Twojej instancji Supabase | Auto (self-hosted) lub `.env.local` |
| `SUPABASE_ANON_KEY` | Klucz anonimowy | Wygenerowany w kroku 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Klucz service role | Wygenerowany w kroku 2 |
| `REPORT_API_KEY` | Klucz API dla C# serwera | Wygeneruj: `openssl rand -hex 32` |

### 6.2. Zmienne frontendu

Utwórz plik `.env` w katalogu projektu:

```env
VITE_SUPABASE_URL=https://api.tachoddd.twojadomena.pl
VITE_SUPABASE_PUBLISHABLE_KEY=twoj_nowy_anon_key
VITE_SUPABASE_PROJECT_ID=twoj_project_id
```

**WAŻNE:** Klient Supabase w `src/integrations/supabase/client.ts` czyta te zmienne automatycznie. Nie musisz edytować tego pliku.

---

## Krok 7 — Build i deploy frontendu

### 7.1. Budowanie

```bash
# Zainstaluj zależności
npm install

# Zbuduj produkcyjną wersję
npm run build
```

Wynik: katalog `dist/` z plikami statycznymi.

### 7.2. Usunięcie zależności Lovable (opcjonalne)

Edytuj `vite.config.ts` — usuń `lovable-tagger`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Usuń pakiet:
```bash
npm uninstall lovable-tagger
```

### 7.3. Deploy plików statycznych

Skopiuj zawartość `dist/` na serwer:

```bash
scp -r dist/* user@twoj-serwer:/var/www/tachoddd/
```

---

## Krok 8 — Konfiguracja C# serwera

Zaktualizuj `appsettings.json` na serwerze C#:

```json
{
  "TcpPort": 5200,
  "CardBridgeUrl": "ws://TWOJ_NGROK_URL",
  "OutputDir": "C:\\TachoDDD\\Downloads",
  "TrafficLogDir": "C:\\TachoDDD\\Logs",
  "LogTraffic": true,
  "WebReport": {
    "Enabled": true,
    "Url": "https://api.tachoddd.twojadomena.pl/functions/v1/report-session",
    "ApiKey": "TWOJ_NOWY_REPORT_API_KEY"
  }
}
```

**Zmienić:**
- `WebReport.Url` — na adres Twojej nowej instancji Supabase + ścieżka Edge Function
- `WebReport.ApiKey` — na nowy `REPORT_API_KEY` (ten sam co w sekretach Edge Functions)

---

## Krok 9 — Reverse proxy (Nginx/Caddy)

### Nginx

```nginx
# /etc/nginx/sites-available/tachoddd
server {
    listen 80;
    server_name tachoddd.twojadomena.pl;

    # Frontend - pliki statyczne
    root /var/www/tachoddd;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy do Supabase API (jeśli self-hosted na tym samym serwerze)
    location /rest/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /auth/ {
        proxy_pass http://localhost:9999/;
        proxy_set_header Host $host;
    }

    location /storage/ {
        proxy_pass http://localhost:5000/;
        proxy_set_header Host $host;
    }

    location /functions/ {
        proxy_pass http://localhost:8000/functions/;
        proxy_set_header Host $host;
    }
}
```

### Caddy (prostsza alternatywa z auto-SSL)

```
tachoddd.twojadomena.pl {
    root * /var/www/tachoddd
    try_files {path} /index.html
    file_server

    handle_path /rest/* {
        reverse_proxy localhost:3000
    }
    handle_path /auth/* {
        reverse_proxy localhost:9999
    }
    handle_path /storage/* {
        reverse_proxy localhost:5000
    }
    handle_path /functions/* {
        reverse_proxy localhost:8000
    }
}
```

---

## Krok 10 — DNS i SSL

### DNS

Dodaj rekord A w panelu DNS Twojej domeny:

```
tachoddd.twojadomena.pl  →  A  →  IP_TWOJEGO_VPS
```

Jeśli używasz osobnej subdomeny dla API:
```
api.tachoddd.twojadomena.pl  →  A  →  IP_TWOJEGO_VPS
```

### SSL

- **Caddy:** Automatyczny (Let's Encrypt)
- **Nginx:** Użyj Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tachoddd.twojadomena.pl
```

---

## Krok 11 — Weryfikacja

### Checklist

- [ ] **Baza danych:** Tabele i funkcje istnieją (`\dt` w psql)
- [ ] **Auth:** Można się zalogować i zarejestrować
- [ ] **RLS:** Zwykły user widzi tylko swoje IMEI, admin widzi wszystko
- [ ] **Edge Functions:** `curl -X POST https://TWOJ_URL/functions/v1/report-session -H "x-api-key: TWOJ_KEY" -d '{"session_id":"test","imei":"123"}'` → `{"ok":true}`
- [ ] **Frontend:** Otwórz `https://tachoddd.twojadomena.pl` — dashboard się ładuje
- [ ] **C# Server:** Sesja DDD raportuje do nowej bazy (sprawdź tabelę `sessions`)
- [ ] **Storage:** Logi sesji uploadują się do bucketa `session-logs`
- [ ] **HTTPS:** Certyfikat SSL jest ważny

### Testowanie Edge Functions

```bash
# report-session
curl -X POST https://TWOJ_URL/functions/v1/report-session \
  -H "Content-Type: application/json" \
  -H "x-api-key: TWOJ_REPORT_API_KEY" \
  -d '{"session_id":"test-migration","imei":"000000000000000","status":"connecting"}'

# check-download
curl "https://TWOJ_URL/functions/v1/check-download?imei=000000000000000" \
  -H "x-api-key: TWOJ_REPORT_API_KEY"

# Oczekiwany wynik: {"should_download":true}
```

---

## Diagram docelowej architektury

```mermaid
graph TB
    subgraph "Twój VPS"
        NGINX["Nginx/Caddy<br/>:80/:443"]
        FRONTEND["React SPA<br/>(pliki statyczne)"]
        
        subgraph "Supabase Self-Hosted (Docker)"
            PG["PostgreSQL<br/>:5432"]
            GOTRUE["GoTrue (Auth)<br/>:9999"]
            POSTGREST["PostgREST (API)<br/>:3000"]
            STORAGE["Storage API<br/>:5000"]
            EDGE["Edge Functions<br/>:8000"]
        end
        
        TACHO["TachoDddServer<br/>(C# .NET 8)<br/>:5200"]
    end
    
    subgraph "Laptop (lokalnie)"
        CB["CardBridgeService<br/>:5201"]
        READER["Czytnik kart<br/>PC/SC"]
    end
    
    BROWSER["Przeglądarka<br/>użytkownika"] --> NGINX
    NGINX --> FRONTEND
    NGINX --> POSTGREST
    NGINX --> GOTRUE
    NGINX --> STORAGE
    NGINX --> EDGE
    
    FMB["Teltonika FMB640<br/>urządzenia"] -->|"TCP :5200"| TACHO
    TACHO -->|"HTTPS API"| EDGE
    TACHO -->|"WSS (ngrok)"| CB
    CB --> READER
    
    EDGE --> PG
    POSTGREST --> PG
    GOTRUE --> PG
```

---

## Podsumowanie kosztów operacyjnych

| Komponent | Lovable (obecne) | Self-hosted |
|-----------|-----------------|-------------|
| Frontend hosting | Wliczone w plan Lovable | Twój serwer (0 zł) |
| Baza danych | Wliczone (Lovable Cloud) | Twój serwer (0 zł) |
| Edge Functions | Wliczone | Twój serwer (0 zł) |
| SSL | Automatyczny | Certbot / Caddy (0 zł) |
| Serwer VPS | Już opłacany (OVH) | Już opłacany |
| **Łącznie** | **Plan Lovable** | **0 zł dodatkowe** |

---

## FAQ

**P: Czy mogę nadal używać Lovable do developmentu?**
O: Tak! Możesz rozwijać frontend w Lovable, pushować do GitHub, a potem budować i deployować z GitHub na swoim serwerze.

**P: Co jeśli chcę użyć Supabase Cloud zamiast self-hosted?**
O: Załóż konto na supabase.com, utwórz nowy projekt, i zmień zmienne `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY`. Edge Functions deployujesz przez `supabase functions deploy`.

**P: Jak backupować bazę danych?**
O: Na self-hosted: `pg_dump` z crona. Na Supabase Cloud: automatyczne backupy wliczone w plan.

```bash
# Cron backup (co noc o 3:00)
0 3 * * * pg_dump -U postgres -d postgres > /backups/tachoddd_$(date +\%Y\%m\%d).sql
```
