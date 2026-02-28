ALTER TABLE public.user_devices
  ADD COLUMN vehicle_plate text,
  ADD COLUMN sim_number text,
  ADD COLUMN comment text;