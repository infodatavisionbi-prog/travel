-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: Companies, Company Dashboards, User Sessions
-- Ejecutar completo en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- 1. Tabla de empresas
CREATE TABLE IF NOT EXISTS public.companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  info_text  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_unique UNIQUE (name)
);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS info_text text;

-- 2. Columna company_id en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3. Tableros de empresa (asignación a nivel empresa)
CREATE TABLE IF NOT EXISTS public.company_dashboards (
  company_id   uuid NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  assigned_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, dashboard_id)
);

-- 4. Sesiones de usuario (para estadísticas)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz
);

-- 5. Conexiones remotas por empresa (TeamViewer)
CREATE TABLE IF NOT EXISTS public.company_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  teamviewer_id         text NOT NULL,
  teamviewer_password   text NOT NULL,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_profiles_company_id       ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_company_dashboards_company ON public.company_dashboards(company_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user        ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started     ON public.user_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_connections_company ON public.company_connections(company_id);

-- ══════════════════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_connections ENABLE ROW LEVEL SECURITY;

-- Companies: admin todo, usuarios leen la propia
DROP POLICY IF EXISTS "companies_admin"    ON public.companies;
DROP POLICY IF EXISTS "companies_own_read" ON public.companies;
CREATE POLICY "companies_admin"    ON public.companies FOR ALL  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "companies_own_read" ON public.companies FOR SELECT TO authenticated
  USING (id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Company dashboards: admin todo, usuarios leen la empresa propia
DROP POLICY IF EXISTS "company_boards_admin" ON public.company_dashboards;
DROP POLICY IF EXISTS "company_boards_read"  ON public.company_dashboards;
CREATE POLICY "company_boards_admin" ON public.company_dashboards FOR ALL  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "company_boards_read"  ON public.company_dashboards FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- User sessions: admin lee todo, usuario gestiona las propias
DROP POLICY IF EXISTS "sessions_admin" ON public.user_sessions;
DROP POLICY IF EXISTS "sessions_own"   ON public.user_sessions;
CREATE POLICY "sessions_admin" ON public.user_sessions FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "sessions_own"   ON public.user_sessions FOR ALL    TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Company connections: solo admin
DROP POLICY IF EXISTS "company_connections_admin" ON public.company_connections;
CREATE POLICY "company_connections_admin" ON public.company_connections FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- BACKFILL: vincular usuarios existentes a empresas
-- ══════════════════════════════════════════════════════════════════════

-- Crear empresas desde company_name existentes en profiles
INSERT INTO public.companies (name)
SELECT DISTINCT TRIM(company_name)
FROM   public.profiles
WHERE  company_name IS NOT NULL AND TRIM(company_name) <> ''
ON CONFLICT (name) DO NOTHING;

-- Vincular profiles a su empresa por company_name
UPDATE public.profiles p
SET    company_id = c.id
FROM   public.companies c
WHERE  TRIM(p.company_name) = c.name
  AND  p.company_id IS NULL;

-- ══════════════════════════════════════════════════════════════════════
-- TRIGGER: auto-crear empresa al registrar usuario
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id   uuid;
  v_company_name text;
BEGIN
  v_company_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');

  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.companies (name)
    VALUES (v_company_name)
    ON CONFLICT (name) DO NOTHING;

    SELECT id INTO v_company_id
    FROM   public.companies
    WHERE  name = v_company_name;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, company_name, company_id, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')),
    COALESCE(v_company_name, ''),
    v_company_id,
    'user',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
