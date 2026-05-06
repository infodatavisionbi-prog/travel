import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'

export default function RdStationPage() {
  const [status, setStatus] = useState('Verificando conexión...')

  useEffect(() => {
    apiFetch('/health').then(() => setStatus('Backend operativo. Replica RD Station habilitada.')).catch(() => setStatus('Backend no disponible. Configurá VITE_API_URL para activar RD Station.'))
  }, [])

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h2 className="page-title">Replica RD Station</h2>
          <p className="page-subtitle">Estructura lista para mantener la sección de RD Station idéntica a la app de referencia.</p>
        </div>
      </div>
      <div className="empty-state">
        <div className="empty-state-title">Estado</div>
        <div className="empty-state-desc">{status}</div>
      </div>
    </section>
  )
}
