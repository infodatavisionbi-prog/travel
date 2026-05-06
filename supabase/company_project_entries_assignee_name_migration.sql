-- MIGRATION: snapshot de responsable en tareas de proyectos
-- Ejecutar en Supabase SQL Editor

alter table public.company_project_entries
  add column if not exists assigned_to_name text;

