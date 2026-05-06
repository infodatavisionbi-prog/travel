-- MIGRATION: company information content
-- Ejecutar en Supabase SQL Editor

alter table public.companies
  add column if not exists info_text text;

