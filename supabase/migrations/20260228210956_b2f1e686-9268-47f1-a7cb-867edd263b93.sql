
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create user_devices table
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  imei text NOT NULL UNIQUE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- 5. Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT approved FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_imeis(_user_id uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT imei FROM public.user_devices WHERE user_id = _user_id
$$;

-- 6. Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. RLS policies for profiles
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 8. RLS policies for user_roles
CREATE POLICY "Admin manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 9. RLS policies for user_devices
CREATE POLICY "Users manage own devices" ON public.user_devices
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin manages all devices" ON public.user_devices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 10. Replace existing anonymous read policies on sessions/session_events/download_schedule
DROP POLICY IF EXISTS "Allow anonymous read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Allow anonymous read session_events" ON public.session_events;
DROP POLICY IF EXISTS "Allow anonymous read download_schedule" ON public.download_schedule;

CREATE POLICY "Authenticated read sessions" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.is_approved(auth.uid())
      AND imei IN (SELECT public.get_user_imeis(auth.uid()))
    )
  );

CREATE POLICY "Authenticated read session_events" ON public.session_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.is_approved(auth.uid())
      AND imei IN (SELECT public.get_user_imeis(auth.uid()))
    )
  );

CREATE POLICY "Authenticated read download_schedule" ON public.download_schedule
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.is_approved(auth.uid())
      AND imei IN (SELECT public.get_user_imeis(auth.uid()))
    )
  );
