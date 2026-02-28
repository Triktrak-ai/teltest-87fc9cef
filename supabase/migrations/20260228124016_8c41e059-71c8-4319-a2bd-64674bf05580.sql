-- Fix: app_settings SELECT policy should be PERMISSIVE, not RESTRICTIVE
DROP POLICY IF EXISTS "Allow anonymous read app_settings" ON public.app_settings;

CREATE POLICY "Allow anonymous read app_settings"
ON public.app_settings
AS PERMISSIVE
FOR SELECT
TO anon, authenticated
USING (true);