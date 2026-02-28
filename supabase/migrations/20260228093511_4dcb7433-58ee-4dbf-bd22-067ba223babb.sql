
CREATE OR REPLACE FUNCTION public.increment_attempts_today(p_imei TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE download_schedule
  SET attempts_today = COALESCE(attempts_today, 0) + 1,
      updated_at = now()
  WHERE imei = p_imei;
END;
$$;
