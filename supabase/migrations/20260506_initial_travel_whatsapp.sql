create extension if not exists pgcrypto;

create table if not exists public.trip_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.trip_groups(id) on delete cascade,
  name text not null,
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_responsibles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_passengers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.trip_groups(id) on delete set null,
  full_name text not null,
  responsible_id uuid references public.trip_responsibles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_message_schedule (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.trip_groups(id) on delete set null,
  activity_id uuid references public.trip_activities(id) on delete set null,
  message_template text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.whatsapp_campaigns(id) on delete cascade,
  phone text not null,
  message text not null,
  status text not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.price_catalog (
  id uuid primary key default gen_random_uuid(),
  concept text not null,
  amount numeric(12,2) not null,
  currency text not null default 'ARS',
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now()
);
