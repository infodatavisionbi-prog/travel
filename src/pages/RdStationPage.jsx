import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

export default function RdStationPage() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('Sin validar')
  const [loading, setLoading] = useState(false)
  const [contacts, setContacts] = useState([])
  const [deals, setDeals] = useState([])
  const [stages, setStages] = useState([])
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')

  const hasToken = useMemo(() => token.trim().length > 0, [token])

  useEffect(() => {
    apiFetch('/settings')
      .then((s) => setToken((s?.rdstation_token && s.rdstation_token !== '***') ? s.rdstation_token : ''))
      .catch(() => {})
  }, [])

  const saveToken = async () => {
    if (!token.trim()) return
    setLoading(true)
    try {
      await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ rdstation_token: token.trim() }) })
      setStatus('Token guardado')
    } catch (e) {
      setStatus(`Error guardando token: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/rdstation/test')
      setStatus(r?.ok ? `Conectado: ${r.message}` : `Sin conexión: ${r?.message || 'error'}`)
    } catch (e) {
      setStatus(`Error de conexión: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadMeta = async () => {
    setLoading(true)
    try {
      const [st, us] = await Promise.all([
        apiFetch('/rdstation/deals/stages').catch(() => ({ deal_stages: [] })),
        apiFetch('/rdstation/users').catch(() => ({ users: [] })),
      ])
      setStages(st?.deal_stages || [])
      setUsers(us?.users || [])
    } finally {
      setLoading(false)
    }
  }

  const searchContacts = async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/rdstation/contacts?page=1&limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setContacts(r?.contacts || [])
    } catch {
      setContacts([])
    } finally {
      setLoading(false)
    }
  }

  const searchDeals = async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/rdstation/deals?page=1&limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setDeals(r?.deals || [])
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h2 className="page-title">RD Station</h2>
          <p className="page-subtitle">Conexión y operación real de contactos y negocios.</p>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label">Token RD Station</label>
        <input className="form-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pegar token de RD Station" />
      </div>

      <div className="toolbar-actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" disabled={loading || !hasToken} onClick={saveToken}>Guardar token</button>
        <button className="btn btn-secondary" disabled={loading || !hasToken} onClick={testConnection}>Probar conexión</button>
        <button className="btn btn-secondary" disabled={loading || !hasToken} onClick={loadMeta}>Cargar stages y usuarios</button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Estado: {status}</div>

      <div className="toolbar-actions" style={{ marginBottom: 10 }}>
        <input className="form-input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email, deal..." />
        <button className="btn btn-secondary" disabled={loading || !hasToken} onClick={searchContacts}>Buscar contactos</button>
        <button className="btn btn-secondary" disabled={loading || !hasToken} onClick={searchDeals}>Buscar negocios</button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card"><div className="stat-card-value">{contacts.length}</div><div className="stat-card-label">Contactos</div></div>
        <div className="stat-card"><div className="stat-card-value">{deals.length}</div><div className="stat-card-label">Negocios</div></div>
        <div className="stat-card"><div className="stat-card-value">{stages.length}</div><div className="stat-card-label">Etapas</div></div>
        <div className="stat-card"><div className="stat-card-value">{users.length}</div><div className="stat-card-label">Usuarios RD</div></div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 14 }}>
        <table>
          <thead><tr><th>Contacto</th><th>Email</th><th>Teléfono</th><th>Local</th></tr></thead>
          <tbody>
            {contacts.length === 0 ? <tr><td colSpan="4" style={{ color: 'var(--text-muted)' }}>Sin resultados</td></tr> : contacts.map((c) => (
              <tr key={c._id || `${c.email}-${c.name}`}>
                <td>{c.name || '-'}</td>
                <td>{c.email || '-'}</td>
                <td>{(c.phones && c.phones[0]?.phone) || c.phone || '-'}</td>
                <td>{c._local_lead_id ? `Lead #${c._local_lead_id}` : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Negocio</th><th>Stage</th><th>Responsable</th><th>Valor</th></tr></thead>
          <tbody>
            {deals.length === 0 ? <tr><td colSpan="4" style={{ color: 'var(--text-muted)' }}>Sin resultados</td></tr> : deals.map((d) => (
              <tr key={d._id || `${d.name}-${d.amount_total}`}>
                <td>{d.name || '-'}</td>
                <td>{d.deal_stage?.name || d.deal_stage_id || '-'}</td>
                <td>{d.user?.name || d.user?.email || '-'}</td>
                <td>{d.amount_total || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
