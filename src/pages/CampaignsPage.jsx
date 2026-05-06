import { useState } from 'react'

const TABS = ['Leads', 'Envíos', 'Campañas', 'Estadísticas']

export default function CampaignsPage() {
  const [tab, setTab] = useState('Leads')

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h2 className="page-title">Campañas WhatsApp</h2>
          <p className="page-subtitle">Sin email: todo el flujo está pensado para cuenta de WhatsApp.</p>
        </div>
      </div>

      <div className="toolbar-actions" style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary">Conectar por API</button>
        <button className="btn btn-primary">Conectar por QR</button>
      </div>

      <div className="company-tabs">
        {TABS.map(t => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="empty-state">
        <div className="empty-state-title">{tab}</div>
        <div className="empty-state-desc">Sección preparada para gestionar {tab.toLowerCase()} con WhatsApp.</div>
      </div>
    </section>
  )
}
