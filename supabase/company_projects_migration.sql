-- =============================================
-- MIGRATION: Proyectos de empresa + Kanban
-- Ejecutar en Supabase SQL Editor
-- =============================================

create table if not exists public.company_projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,
  description     text,
  budget          numeric(14,2),
  budget_currency text not null default 'ARS',
  estimated_hours numeric(10,2),
  status          text not null default 'en_fila',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint company_projects_status_check
    check (status in ('en_fila', 'en_desarrollo', 'en_curso', 'en_testeo', 'completado'))
  ,
  constraint company_projects_budget_currency_check
    check (budget_currency in ('ARS', 'USD'))
);

create table if not exists public.company_project_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.company_projects(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'en_fila',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_to_name text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint company_project_entries_status_check
    check (status in ('en_fila', 'en_desarrollo', 'en_curso', 'en_testeo', 'completado'))
);

create index if not exists idx_company_projects_company
  on public.company_projects(company_id);

create index if not exists idx_company_projects_status
  on public.company_projects(status);

create index if not exists idx_company_project_entries_project
  on public.company_project_entries(project_id);

create index if not exists idx_company_project_entries_status
  on public.company_project_entries(status);

create index if not exists idx_company_project_entries_assigned
  on public.company_project_entries(assigned_to);

alter table public.company_projects enable row level security;
alter table public.company_project_entries enable row level security;

alter table public.company_project_entries
  add column if not exists assigned_to_name text;

drop policy if exists "company_projects_admin_all" on public.company_projects;
create policy "company_projects_admin_all"
  on public.company_projects for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "company_projects_owner_all" on public.company_projects;
create policy "company_projects_owner_all"
  on public.company_projects for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.company_role = 'owner'
        and p.company_id = company_projects.company_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.company_role = 'owner'
        and p.company_id = company_projects.company_id
    )
  );

drop policy if exists "company_project_entries_admin_all" on public.company_project_entries;
create policy "company_project_entries_admin_all"
  on public.company_project_entries for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "company_project_entries_owner_all" on public.company_project_entries;
create policy "company_project_entries_owner_all"
  on public.company_project_entries for all to authenticated
  using (
    exists (
      select 1
      from public.company_projects cp
      join public.profiles p
        on p.id = auth.uid()
      where cp.id = company_project_entries.project_id
        and p.company_role = 'owner'
        and p.company_id = cp.company_id
    )
  )
  with check (
    exists (
      select 1
      from public.company_projects cp
      join public.profiles p
        on p.id = auth.uid()
      where cp.id = company_project_entries.project_id
        and p.company_role = 'owner'
        and p.company_id = cp.company_id
    )
  );
