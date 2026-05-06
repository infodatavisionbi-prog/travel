-- ════════════════════════════════════════════════════════════
--  FUEL · DataVision BI  —  Supabase Schema
--  Seguro para ejecutar múltiples veces
-- ════════════════════════════════════════════════════════════

-- ── TABLAS ────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         text,
  full_name     text,
  company_name  text not null default '',
  role          text not null default 'user' check (role in ('user', 'admin')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists company_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists last_seen_at timestamptz;

create table if not exists public.dashboards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  embed_url   text not null,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.dashboards add column if not exists name text;
alter table public.dashboards add column if not exists description text;
alter table public.dashboards add column if not exists embed_url text;
alter table public.dashboards add column if not exists created_by uuid references auth.users on delete set null;
alter table public.dashboards add column if not exists created_at timestamptz not null default now();

create table if not exists public.user_dashboards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  dashboard_id uuid not null references public.dashboards on delete cascade,
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references auth.users on delete set null,
  unique (user_id, dashboard_id)
);

alter table public.user_dashboards add column if not exists assigned_at timestamptz not null default now();
alter table public.user_dashboards add column if not exists assigned_by uuid references auth.users on delete set null;

-- ── RLS ───────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.dashboards      enable row level security;
alter table public.user_dashboards enable row level security;

-- Función auxiliar sin recursión (security definer corre sin RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── PROFILES policies ─────────────────────────────────────
drop policy if exists "profiles: own read"       on public.profiles;
drop policy if exists "profiles: admin read all" on public.profiles;
drop policy if exists "profiles: own insert"     on public.profiles;
drop policy if exists "profiles: own update"     on public.profiles;
drop policy if exists "profiles: admin update"   on public.profiles;

create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: admin read all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: own insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: admin update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── DASHBOARDS policies ───────────────────────────────────
drop policy if exists "dashboards: admin full"         on public.dashboards;
drop policy if exists "dashboards: user read assigned" on public.dashboards;

create policy "dashboards: admin full"
  on public.dashboards for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "dashboards: user read assigned"
  on public.dashboards for select
  using (
    exists (
      select 1 from public.user_dashboards
      where user_id = auth.uid() and dashboard_id = dashboards.id
    )
  );

-- ── USER_DASHBOARDS policies ──────────────────────────────
drop policy if exists "user_dashboards: admin full" on public.user_dashboards;
drop policy if exists "user_dashboards: own read"   on public.user_dashboards;

create policy "user_dashboards: admin full"
  on public.user_dashboards for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "user_dashboards: own read"
  on public.user_dashboards for select
  using (auth.uid() = user_id);

-- ── ÍNDICES ───────────────────────────────────────────────
create index if not exists idx_user_dashboards_user  on public.user_dashboards (user_id);
create index if not exists idx_user_dashboards_board on public.user_dashboards (dashboard_id);
create index if not exists idx_profiles_role         on public.profiles (role);

insert into public.profiles (id, email, full_name, company_name, role, is_active)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'company_name', ''),
  'user',
  true
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    'user',
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
        company_name = coalesce(nullif(public.profiles.company_name, ''), excluded.company_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_create_user(
  user_email text,
  user_password text,
  user_fullname text,
  user_company text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_user_id uuid := gen_random_uuid();
  normalized_email text := lower(trim(user_email));
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede crear usuarios';
  end if;

  if normalized_email = '' or user_password = '' then
    raise exception 'Email y contrasena son obligatorios';
  end if;

  if exists (select 1 from auth.users where email = normalized_email) then
    raise exception 'Ya existe un usuario con ese email';
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    normalized_email,
    crypt(user_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', user_fullname, 'company_name', user_company),
    now(),
    now()
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    new_user_id::text,
    new_user_id,
    new_user_id::text,
    jsonb_build_object('sub', new_user_id::text, 'email', normalized_email),
    'email',
    now(),
    now(),
    now()
  );

  insert into public.profiles (id, email, full_name, company_name, role, is_active)
  values (new_user_id, normalized_email, user_fullname, user_company, 'user', true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        company_name = excluded.company_name,
        is_active = true;

  return new_user_id;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, text) to authenticated;

create or replace function public.admin_upsert_dashboard(
  board_id uuid,
  board_name text,
  board_embed_url text,
  board_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede guardar tableros';
  end if;

  if board_id is null then
    insert into public.dashboards (name, embed_url, description, created_by)
    values (board_name, board_embed_url, nullif(board_description, ''), auth.uid())
    returning id into saved_id;
  else
    update public.dashboards
    set
      name = board_name,
      embed_url = board_embed_url,
      description = nullif(board_description, '')
    where id = board_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Tablero no encontrado';
    end if;
  end if;

  return saved_id;
end;
$$;

create or replace function public.admin_delete_dashboard(board_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede eliminar tableros';
  end if;

  delete from public.dashboards where id = board_id;
end;
$$;

grant execute on function public.admin_upsert_dashboard(uuid, text, text, text) to authenticated;
grant execute on function public.admin_delete_dashboard(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  DESPUÉS DE REGISTRARTE EN LA APP, ejecutá esto para ser admin:
--    update public.profiles set role = 'admin' where email = 'infodatavisionbi@gmail.com';
-- ════════════════════════════════════════════════════════════
