import { useState } from 'react'

const TABS = ['Miembros', 'Envíos', 'Viajes']

export default function TeamPage() {
  const [tab, setTab] = useState('Miembros')

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h2 className="page-title">Equipo de trabajo</h2>
          <p className="page-subtitle">Funcionalidades similares a la app actual para control de miembros, envíos y viajes.</p>
        </div>
      </div>

      <div className="company-tabs">
        {TABS.map(t => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="empty-state">
        <div className="empty-state-title">{tab}</div>
        <div className="empty-state-desc">Estructura activa para métricas y operación de {tab.toLowerCase()}.</div>
      </div>
    </section>
  )
}
