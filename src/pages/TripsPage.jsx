import { useState } from 'react'

const TABS = ['Grupos', 'Pasajeros', 'Responsables', 'Actividades', 'Programación']

export default function TripsPage() {
  const [tab, setTab] = useState('Grupos')

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h2 className="page-title">Viajes</h2>
          <p className="page-subtitle">Programación manual de mensajes masivos a responsables, con plantillas tipo: El {'{grupo}'} va camino a {'{actividad}'}.</p>
        </div>
      </div>

      <div className="company-tabs">
        {TABS.map(t => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="empty-state">
        <div className="empty-state-title">{tab}</div>
        <div className="empty-state-desc">Módulo listo para carga, edición y envíos programados no automáticos.</div>
      </div>
    </section>
  )
}
