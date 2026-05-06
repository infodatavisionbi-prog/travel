-- MIGRATION: contactos por empresa
-- Ejecutar en Supabase SQL Editor

create table if not exists public.company_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  email       text not null,
  phone       text,
  sector      text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_company_contacts_company
  on public.company_contacts(company_id);

alter table public.company_contacts enable row level security;

drop policy if exists "company_contacts_admin" on public.company_contacts;
create policy "company_contacts_admin"
  on public.company_contacts for all to authenticated
  using (is_admin())
  with check (is_admin());

