import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'

export default function LeadsPage() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')
  const [leads, setLeads] = useState([])

  const loadLeads = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/leads?limit=500')
      setLeads(Array.isArray(data) ? data : [])
      setStatus('Leads cargados')
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLeads() }, [])

  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="page-title">Leads</h2>
          <p className="page-subtitle">Modulo de leads para importaciones desde RD y uso en campanas de WhatsApp.</p>
        </div>
      </div>
      <div className="toolbar-actions" style={{ marginBottom: 10 }}>
        <button className="btn btn-secondary" onClick={loadLeads} disabled={loading}>Recargar</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{status}{loading ? ' | Procesando...' : ''}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Telefono</th><th>Email</th><th>Grupo</th><th>Empresa</th><th>Estado campana</th></tr></thead>
          <tbody>
            {!leads.length ? <tr><td colSpan="6" style={{ color: 'var(--text-muted)' }}>Sin leads</td></tr> : leads.map((l) => (
              <tr key={l.id}>
                <td>{l.name || '-'}</td>
                <td>{l.phone || '-'}</td>
                <td>{l.email || '-'}</td>
                <td>{l.group_name || '-'}</td>
                <td>{l.company || '-'}</td>
                <td>{l.campaign_status || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
