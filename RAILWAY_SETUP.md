# Railway deployment (2 services)

## 1) Frontend service
- Root Directory: `/`
- Uses: `/railway.json`
- Required env:
  - `VITE_API_URL=https://<backend-service>.up.railway.app`
  - `VITE_SUPABASE_URL=...`
  - `VITE_SUPABASE_ANON_KEY=...`

## 2) Backend service
- Root Directory: `/backend`
- Uses: `/backend/railway.json`
- Start command:
  - `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Required env:
  - `SECRET_KEY=...`
  - `ALLOWED_ORIGINS=https://travel.datavision-bi.com`
  - Optional app envs for RD/WhatsApp integrations

## Validation
- Backend health: `https://<backend-service>.up.railway.app/health` must return JSON `{ "status": "ok" }`
- Frontend login request must target backend URL from `VITE_API_URL`.
