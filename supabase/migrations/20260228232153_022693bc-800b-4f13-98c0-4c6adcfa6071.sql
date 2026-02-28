
-- Drop the old "Users manage own devices" policy that allows full CRUD
DROP POLICY IF EXISTS "Users manage own devices" ON public.user_devices;

-- Users can only READ their own devices
CREATE POLICY "Users read own devices"
ON public.user_devices
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
