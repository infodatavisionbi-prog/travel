-- MIGRATION: conexiones por empresa (TeamViewer)
-- Ejecutar en Supabase SQL Editor

create table if not exists public.company_connections (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  name                text not null,
  teamviewer_id       text not null,
  teamviewer_password text not null,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_company_connections_company
  on public.company_connections(company_id);

alter table public.company_connections enable row level security;

drop policy if exists "company_connections_admin" on public.company_connections;
create policy "company_connections_admin"
  on public.company_connections for all to authenticated
  using (is_admin())
  with check (is_admin());

