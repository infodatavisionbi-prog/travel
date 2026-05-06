-- =============================================
-- MIGRATION: Moneda de presupuesto en proyectos
-- =============================================

alter table public.company_projects
  add column if not exists budget_currency text;

update public.company_projects
set budget_currency = 'ARS'
where budget_currency is null or btrim(budget_currency) = '';

alter table public.company_projects
  alter column budget_currency set default 'ARS';

alter table public.company_projects
  alter column budget_currency set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_projects_budget_currency_check'
      and conrelid = 'public.company_projects'::regclass
  ) then
    alter table public.company_projects
      add constraint company_projects_budget_currency_check
      check (budget_currency in ('ARS', 'USD'));
  end if;
end $$;

