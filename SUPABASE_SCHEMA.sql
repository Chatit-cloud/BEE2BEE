-- Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    country TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    node_id TEXT NOT NULL,
    content TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    tokens INTEGER DEFAULT 0,
    cost DECIMAL(12, 6) DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Node Telemetry Table
CREATE TABLE IF NOT EXISTS public.node_logs (
    id BIGSERIAL PRIMARY KEY,
    peer_id TEXT NOT NULL,
    latency_ms FLOAT NOT NULL,
    status TEXT NOT NULL,
    model TEXT,
    health_data JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Stats View
CREATE OR REPLACE VIEW public.system_stats AS
SELECT 
    (SELECT COALESCE(SUM(tokens), 0) FROM public.messages) as total_tokens,
    (SELECT COUNT(*) FROM public.messages WHERE role = 'user') as total_chats,
    (SELECT COUNT(*) FROM public.profiles) as total_users;

-- Triggers
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Policies
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can read node logs" ON public.node_logs FOR SELECT USING (true);
CREATE POLICY "Users can view all profiles for count" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Active Nodes / Mesh Discovery Table
-- Used for P2P routing and as a public key-value store for global metrics
CREATE TABLE IF NOT EXISTS public.active_nodes (
    peer_id TEXT PRIMARY KEY,
    addr TEXT NOT NULL,
    region TEXT DEFAULT 'Global',
    models TEXT[] DEFAULT '{}',
    metrics JSONB DEFAULT '{}'::jsonb,
    last_seen TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Public Access Policies for Neural Swarm
ALTER TABLE public.active_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for mesh map" 
    ON public.active_nodes FOR SELECT 
    USING (true);

CREATE POLICY "Unauthenticated mesh announcement" 
    ON public.active_nodes FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Unauthenticated telemetry updates" 
    ON public.active_nodes FOR UPDATE 
    USING (true);

-- Maintenance: Auto-prune nodes stale for > 1 hour
-- (Run this via pg_cron or manual cleanup)
-- DELETE FROM active_nodes WHERE last_seen < now() - interval '1 hour';

