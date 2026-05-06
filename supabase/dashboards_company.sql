-- Agregar company_id a dashboards
ALTER TABLE public.dashboards
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dashboards_company_id ON public.dashboards(company_id);
