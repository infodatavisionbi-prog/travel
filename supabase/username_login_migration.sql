-- =============================================
-- MIGRATION: Login por nombre de usuario
-- =============================================

alter table public.profiles
  add column if not exists username text;

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9._-]+', '_', 'g'))
$$;

do $$
declare
  rec record;
  base_name text;
  candidate text;
  n integer;
begin
  for rec in
    select
      p.id,
      coalesce(
        nullif(btrim(p.username), ''),
        nullif(btrim(p.full_name), ''),
        nullif(split_part(lower(coalesce(p.email, '')), '@', 1), ''),
        'user'
      ) as seed
    from public.profiles p
    order by p.created_at nulls last, p.id
  loop
    base_name := public.normalize_username(rec.seed);
    if base_name = '' then base_name := 'user'; end if;

    candidate := base_name;
    n := 1;
    while exists (
      select 1
      from public.profiles p
      where p.id <> rec.id
        and lower(coalesce(p.username, '')) = lower(candidate)
    ) loop
      n := n + 1;
      candidate := base_name || '_' || n::text;
    end loop;

    update public.profiles
    set username = candidate
    where id = rec.id;
  end loop;
end $$;

create unique index if not exists idx_profiles_username_unique_ci
  on public.profiles (lower(username));

create or replace function public.ensure_profile_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  n integer;
begin
  base_name := public.normalize_username(
    coalesce(
      nullif(btrim(new.username), ''),
      nullif(btrim(new.full_name), ''),
      nullif(split_part(lower(coalesce(new.email, '')), '@', 1), ''),
      'user'
    )
  );
  if base_name = '' then base_name := 'user'; end if;

  candidate := base_name;
  n := 1;
  while exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and lower(coalesce(p.username, '')) = lower(candidate)
  ) loop
    n := n + 1;
    candidate := base_name || '_' || n::text;
  end loop;

  new.username := candidate;
  return new;
end;
$$;

drop trigger if exists trg_profiles_ensure_username on public.profiles;
create trigger trg_profiles_ensure_username
before insert or update of username, full_name, email
on public.profiles
for each row execute function public.ensure_profile_username();

create or replace function public.resolve_login_email(login_identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := lower(trim(coalesce(login_identifier, '')));
  resolved text;
begin
  if normalized = '' then
    return null;
  end if;

  if position('@' in normalized) > 0 then
    select p.email
      into resolved
    from public.profiles p
    where lower(coalesce(p.email, '')) = normalized
      and p.is_active = true
    limit 1;
    return resolved;
  end if;

  select p.email
    into resolved
  from public.profiles p
  where lower(coalesce(p.username, '')) = normalized
    and p.is_active = true
  limit 1;

  return resolved;
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

