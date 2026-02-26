
-- Table: sessions
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imei text NOT NULL,
  vehicle_plate text,
  status text NOT NULL DEFAULT 'connecting',
  generation text DEFAULT 'Unknown',
  progress integer DEFAULT 0,
  files_downloaded integer DEFAULT 0,
  total_files integer DEFAULT 0,
  current_file text,
  error_code text,
  error_message text,
  bytes_downloaded bigint DEFAULT 0,
  apdu_exchanges integer DEFAULT 0,
  crc_errors integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  last_activity timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Table: session_events
CREATE TABLE public.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  imei text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  context text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_last_activity ON public.sessions(last_activity DESC);
CREATE INDEX idx_session_events_session_id ON public.session_events(session_id);
CREATE INDEX idx_session_events_created_at ON public.session_events(created_at DESC);

-- RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- Public read (anonymous dashboard)
CREATE POLICY "Allow anonymous read sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read session_events" ON public.session_events FOR SELECT USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_events;
