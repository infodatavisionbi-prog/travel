# Travel + WhatsApp App

Base visual: `fuel-databi` (React + Vite).
Base funcional backend: `outreach` (FastAPI + WA bridge + RD endpoints).

## Módulos incluidos
- RD Station
- Campañas (WhatsApp): Leads, Envíos, Campañas, Estadísticas
- Viajes: Grupos, Pasajeros, Responsables, Actividades, Programación manual de mensajes
- Precios vigentes
- Equipo de trabajo: Miembros, Envíos, Viajes

## Stack
- Frontend: React + Vite
- Backend: FastAPI
- DB/Auth: Supabase
- Deploy backend: Railway
- Repo: GitHub

## Variables esperadas
Frontend (`.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

Backend (`backend/.env`):
- Variables de `outreach` (DB, JWT, RD, WhatsApp API)

## Supabase
Ejecutar migración:
- `supabase/migrations/20260506_initial_travel_whatsapp.sql`

## Run local
Frontend:
- `npm install`
- `npm run dev`

Backend:
- `cd backend`
- `py -3 -m pip install -r requirements.txt`
- `py -3 main.py`
