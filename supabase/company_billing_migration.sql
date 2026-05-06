-- MIGRATION: Facturas + Pagos por empresa
-- Ejecutar en Supabase SQL Editor

-- FACTURAS
create table if not exists public.company_invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,
  file_path       text not null,
  file_size       bigint,
  status          text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'pagado')),
  document_number text,
  amount          numeric(14,2),
  issue_date      date,
  due_date        date,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.company_invoices add column if not exists document_number text;
alter table public.company_invoices add column if not exists amount numeric(14,2);
alter table public.company_invoices add column if not exists issue_date date;
alter table public.company_invoices add column if not exists due_date date;

create index if not exists idx_company_invoices_company
  on public.company_invoices(company_id);

alter table public.company_invoices enable row level security;

drop policy if exists "company_invoices_admin_all" on public.company_invoices;
create policy "company_invoices_admin_all"
  on public.company_invoices for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "company_invoices_company_read" on public.company_invoices;
create policy "company_invoices_company_read"
  on public.company_invoices for select to authenticated
  using (
    is_admin()
    or company_id in (select company_id from public.profiles where id = auth.uid())
  );

-- PAGOS
create table if not exists public.company_payments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  invoice_id   uuid references public.company_invoices(id) on delete set null,
  name         text not null,
  file_path    text not null,
  file_size    bigint,
  amount       numeric(14,2),
  payment_date date,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_company_payments_company
  on public.company_payments(company_id);

create index if not exists idx_company_payments_invoice
  on public.company_payments(invoice_id);

alter table public.company_payments enable row level security;

drop policy if exists "company_payments_admin_all" on public.company_payments;
create policy "company_payments_admin_all"
  on public.company_payments for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "company_payments_company_read" on public.company_payments;
create policy "company_payments_company_read"
  on public.company_payments for select to authenticated
  using (
    is_admin()
    or company_id in (select company_id from public.profiles where id = auth.uid())
  );

