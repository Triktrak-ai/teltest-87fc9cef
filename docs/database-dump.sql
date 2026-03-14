-- ============================================================================
-- TachoDDD — Pełny SQL Dump (Supabase/PostgreSQL)
-- Wygenerowano: 2026-03-14
-- Kompatybilność: PostgreSQL 15+ / Supabase
-- ============================================================================

-- ============================================================================
-- 1. TYPY ENUM
-- ============================================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ============================================================================
-- 2. TABELE
-- ============================================================================

-- --------------------------------------------------------------------------
-- profiles — profil użytkownika (1:1 z auth.users)
-- --------------------------------------------------------------------------
CREATE TABLE public.profiles (
    id          uuid        NOT NULL PRIMARY KEY,
    full_name   text        NOT NULL DEFAULT '',
    phone       text,
    approved    boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- user_roles — role użytkowników (oddzielna tabela, NIGDY na profiles)
-- --------------------------------------------------------------------------
CREATE TABLE public.user_roles (
    id      uuid     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid     NOT NULL,
    role    app_role NOT NULL,
    CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- user_devices — urządzenia Teltonika przypisane do użytkowników
-- --------------------------------------------------------------------------
CREATE TABLE public.user_devices (
    id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       uuid        NOT NULL,
    imei          text        NOT NULL,
    label         text,
    vehicle_plate text,
    sim_number    text,
    comment       text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- sessions — sesje pobierania DDD z tachografu
-- --------------------------------------------------------------------------
CREATE TABLE public.sessions (
    id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imei             text        NOT NULL,
    status           text        NOT NULL DEFAULT 'connecting',
    generation       text                 DEFAULT 'Unknown',
    card_generation  text                 DEFAULT 'Unknown',
    vehicle_plate    text,
    progress         integer              DEFAULT 0,
    current_file     text,
    files_downloaded integer              DEFAULT 0,
    total_files      integer              DEFAULT 0,
    bytes_downloaded bigint               DEFAULT 0,
    apdu_exchanges   integer              DEFAULT 0,
    crc_errors       integer              DEFAULT 0,
    error_code       text,
    error_message    text,
    log_uploaded     boolean              DEFAULT false,
    started_at       timestamptz          DEFAULT now(),
    last_activity    timestamptz          DEFAULT now(),
    completed_at     timestamptz,
    created_at       timestamptz          DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- session_events — zdarzenia w ramach sesji
-- --------------------------------------------------------------------------
CREATE TABLE public.session_events (
    id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id uuid        REFERENCES public.sessions(id),
    imei       text        NOT NULL,
    type       text        NOT NULL DEFAULT 'info',
    message    text        NOT NULL,
    context    text,
    created_at timestamptz          DEFAULT now()
);

ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- download_schedule — harmonogram pobierania DDD
-- --------------------------------------------------------------------------
CREATE TABLE public.download_schedule (
    id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imei            text        NOT NULL UNIQUE,
    status          text        NOT NULL DEFAULT 'pending',
    attempts_today  integer              DEFAULT 0,
    last_success_at timestamptz,
    last_attempt_at timestamptz,
    last_error      text,
    created_at      timestamptz          DEFAULT now(),
    updated_at      timestamptz          DEFAULT now()
);

ALTER TABLE public.download_schedule ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- app_settings — ustawienia aplikacji (klucz-wartość)
-- --------------------------------------------------------------------------
CREATE TABLE public.app_settings (
    key        text        NOT NULL PRIMARY KEY,
    value      text        NOT NULL DEFAULT '',
    updated_at timestamptz          DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. FUNKCJE BAZODANOWE
-- ============================================================================

-- Sprawdza czy użytkownik ma daną rolę (SECURITY DEFINER — omija RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Sprawdza czy profil użytkownika jest zatwierdzony
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT approved FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- Zwraca listę IMEI przypisanych do użytkownika
CREATE OR REPLACE FUNCTION public.get_user_imeis(_user_id uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT imei FROM public.user_devices WHERE user_id = _user_id
$$;

-- Inkrementuje licznik prób dziennych dla danego IMEI
CREATE OR REPLACE FUNCTION public.increment_attempts_today(p_imei text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE download_schedule
  SET attempts_today = COALESCE(attempts_today, 0) + 1,
      updated_at = now()
  WHERE imei = p_imei;
END;
$$;

-- Trigger: automatycznie tworzy profil przy rejestracji użytkownika
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- ============================================================================
-- 4. TRIGGER na auth.users (tworzenie profilu)
-- ============================================================================
-- UWAGA: Ten trigger jest podpięty do auth.users w Supabase.
-- Przy migracji na self-hosted PostgreSQL należy go ręcznie podpiąć:
--
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. POLITYKI RLS (Row Level Security)
-- ============================================================================

-- ----- profiles -----
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----- user_roles -----
CREATE POLICY "Admin manages roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ----- user_devices -----
CREATE POLICY "Admin manages all devices"
  ON public.user_devices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ----- sessions -----
CREATE POLICY "Authenticated read sessions"
  ON public.sessions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR (is_approved(auth.uid()) AND imei IN (SELECT get_user_imeis(auth.uid())))
  );

-- ----- session_events -----
CREATE POLICY "Authenticated read session_events"
  ON public.session_events FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR (is_approved(auth.uid()) AND imei IN (SELECT get_user_imeis(auth.uid())))
  );

-- ----- download_schedule -----
CREATE POLICY "Authenticated read download_schedule"
  ON public.download_schedule FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR (is_approved(auth.uid()) AND imei IN (SELECT get_user_imeis(auth.uid())))
  );

-- ----- app_settings -----
CREATE POLICY "Allow anonymous read app_settings"
  ON public.app_settings FOR SELECT TO anon, authenticated
  USING (true);

-- ============================================================================
-- 6. STORAGE BUCKETS
-- ============================================================================
-- UWAGA: Buckety tworzone są przez Supabase Dashboard/API, nie przez SQL.
-- Przy migracji na self-hosted należy je utworzyć ręcznie:
--
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('session-logs', 'session-logs', true),
--   ('ddd-files',    'ddd-files',    false);

-- ============================================================================
-- 7. REALTIME (opcjonalne)
-- ============================================================================
-- Jeśli potrzebny realtime na sesjach:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;

-- ============================================================================
-- 8. DANE POCZĄTKOWE (opcjonalne)
-- ============================================================================
-- Przykładowe ustawienia aplikacji:
-- INSERT INTO public.app_settings (key, value) VALUES
--   ('max_daily_attempts', '3'),
--   ('session_timeout_minutes', '30'),
--   ('auto_cleanup_days', '90');

-- ============================================================================
-- KONIEC DUMPA
-- ============================================================================
