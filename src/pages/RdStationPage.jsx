import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}

function downloadCsv(filename, rows) {
  const csv = toCsv(rows)
  if (!csv) return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function RdStationPage() {
  const [tab, setTab] = useState('contacts')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('Sin validar')
  const [loading, setLoading] = useState(false)

  const [q, setQ] = useState('')
  const [contacts, setContacts] = useState([])
  const [deals, setDeals] = useState([])
  const [selectedDeals, setSelectedDeals] = useState(new Set())

  const [customFields, setCustomFields] = useState([])
  const [dealCustomFields, setDealCustomFields] = useState([])
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [userFilter, setUserFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [stages, setStages] = useState([])

  const [cfField, setCfField] = useState('')
  const [cfValue, setCfValue] = useState('')
  const [dealCfField, setDealCfField] = useState('')
  const [dealCfValue, setDealCfValue] = useState('')

  const hasToken = useMemo(() => token.trim().length > 0, [token])

  useEffect(() => {
    apiFetch('/settings').then((s) => {
      const existing = s?.rdstation_token
      if (existing && existing !== '***') setToken(existing)
    }).catch(() => {})
  }, [])

  const loadMeta = async () => {
    setLoading(true)
    try {
      const [contactCf, dealCf, rdUsers, rdTeams, rdStages] = await Promise.all([
        apiFetch('/rdstation/custom-fields?entity=contact').catch(() => ({ custom_fields: [] })),
        apiFetch('/rdstation/custom-fields?entity=deal').catch(() => ({ custom_fields: [] })),
        apiFetch('/rdstation/users').catch(() => ({ users: [] })),
        apiFetch('/rdstation/teams').catch(() => ({ teams: [] })),
        apiFetch('/rdstation/deals/stages').catch(() => ({ deal_stages: [] })),
      ])
      setCustomFields(contactCf.custom_fields || [])
      setDealCustomFields(dealCf.custom_fields || [])
      setUsers(rdUsers.users || [])
      setTeams(rdTeams.teams || [])
      setStages(rdStages.deal_stages || [])
    } finally {
      setLoading(false)
    }
  }

  const saveToken = async () => {
    setLoading(true)
    try {
      await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ rdstation_token: token.trim() }) })
      setStatus('Token guardado')
      await loadMeta()
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

  const searchContacts = async () => {
    setLoading(true)
    try {
      if (cfField && cfValue) {
        const r = await apiFetch('/rdstation/contacts/search', {
          method: 'POST',
          body: JSON.stringify({
            q,
            user_id: userFilter || undefined,
            filters: [{ field_id: cfField, operator: 'contains', value: cfValue }],
          }),
        })
        setContacts(r.contacts || [])
      } else {
        const r = await apiFetch(`/rdstation/contacts?page=1&limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`)
        setContacts(r.contacts || [])
      }
    } catch {
      setContacts([])
    } finally {
      setLoading(false)
    }
  }

  const searchDeals = async () => {
    setLoading(true)
    try {
      if (dealCfField && dealCfValue) {
        const r = await apiFetch('/rdstation/deals/search', {
          method: 'POST',
          body: JSON.stringify({
            q,
            stage_id: stageFilter || undefined,
            user_id: userFilter || undefined,
            cf_filters: [{ field_id: dealCfField, operator: 'contains', value: dealCfValue }],
          }),
        })
        setDeals(r.deals || [])
      } else {
        const r = await apiFetch(`/rdstation/deals/search?${new URLSearchParams({ q: q || '', stage_id: stageFilter || '', user_id: userFilter || '' }).toString()}`)
        setDeals(r.deals || [])
      }
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
  }

  const importSelectedContacts = async () => {
    if (!contacts.length) return
    setLoading(true)
    try {
      await apiFetch('/rdstation/contacts/import-bulk', { method: 'POST', body: JSON.stringify({ contacts }) })
      setStatus(`Importados ${contacts.length} contactos a Leads`)
    } catch (e) {
      setStatus(`Error importando: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const bulkUpdateDeals = async () => {
    const ids = [...selectedDeals]
    if (!ids.length || (!stageFilter && !userFilter)) return
    setLoading(true)
    try {
      const r = await apiFetch('/rdstation/deals/bulk-update', {
        method: 'PUT',
        body: JSON.stringify({
          deal_ids: ids,
          deal_stage_id: stageFilter || undefined,
          user_id: userFilter || undefined,
        }),
      })
      setStatus(`Deals actualizados: ${r.ok}/${r.total}`)
      await searchDeals()
      setSelectedDeals(new Set())
    } catch (e) {
      setStatus(`Error actualizando deals: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleDeal = (id) => {
    setSelectedDeals((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="page-title">RD Station CRM</h2>
          <p className="page-subtitle">Módulo operativo: token, contactos, negocios, filtros avanzados, import y acciones masivas.</p>
        </div>
      </div>

      <div className="company-tabs" style={{ marginBottom: 12 }}>
        <button className={`company-tab ${tab === 'contacts' ? 'active' : ''}`} onClick={() => setTab('contacts')}>Contactos</button>
        <button className={`company-tab ${tab === 'deals' ? 'active' : ''}`} onClick={() => setTab('deals')}>Negocios</button>
      </div>

      <div className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label">Token RD Station</label>
        <input className="form-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pegar token RD" />
      </div>

      <div className="toolbar-actions" style={{ marginBottom: 10 }}>
        <button className="btn btn-primary" disabled={!hasToken || loading} onClick={saveToken}>Guardar token</button>
        <button className="btn btn-secondary" disabled={!hasToken || loading} onClick={testConnection}>Probar conexión</button>
        <button className="btn btn-secondary" disabled={!hasToken || loading} onClick={loadMeta}>Cargar metadata</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Estado: {status}</div>

      <div className="toolbar-actions" style={{ marginBottom: 12 }}>
        <input className="form-input" style={{ maxWidth: 340 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre/email/deal" />

        <select className="form-select" style={{ width: 220 }} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="">Todos los usuarios RD</option>
          {users.map((u) => <option key={u._id || u.id} value={u._id || u.id}>{u.name || u.email}</option>)}
        </select>

        {tab === 'deals' && (
          <select className="form-select" style={{ width: 220 }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">Todas las etapas</option>
            {stages.map((s) => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {tab === 'contacts' ? (
        <>
          <div className="toolbar-actions" style={{ marginBottom: 12 }}>
            <select className="form-select" style={{ width: 260 }} value={cfField} onChange={(e) => setCfField(e.target.value)}>
              <option value="">Filtro custom field (opcional)</option>
              {customFields.map((f) => <option key={f._id || f.id} value={f._id || f.id}>{f.name}</option>)}
            </select>
            <input className="form-input" style={{ maxWidth: 220 }} value={cfValue} onChange={(e) => setCfValue(e.target.value)} placeholder="Valor del campo" />
            <button className="btn btn-secondary" disabled={!hasToken || loading} onClick={searchContacts}>Buscar contactos</button>
            <button className="btn btn-secondary" disabled={!contacts.length || loading} onClick={() => downloadCsv('rd_contacts.csv', contacts.map(c => ({ id: c._id || '', name: c.name || '', email: c.email || '', phone: (c.phones && c.phones[0]?.phone) || c.phone || '', local_lead_id: c._local_lead_id || '' })))}>Exportar CSV</button>
            <button className="btn btn-primary" disabled={!contacts.length || loading} onClick={importSelectedContacts}>Importar a Leads</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Empresa</th><th>Lead local</th></tr></thead>
              <tbody>
                {!contacts.length ? <tr><td colSpan="5" style={{ color: 'var(--text-muted)' }}>Sin resultados</td></tr> : contacts.map((c) => (
                  <tr key={c._id || `${c.name}-${c.email}`}>
                    <td>{c.name || '-'}</td>
                    <td>{c.email || '-'}</td>
                    <td>{(c.phones && c.phones[0]?.phone) || c.phone || '-'}</td>
                    <td>{c.organization?.name || '-'}</td>
                    <td>{c._local_lead_id ? `Lead #${c._local_lead_id}` : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar-actions" style={{ marginBottom: 12 }}>
            <select className="form-select" style={{ width: 260 }} value={dealCfField} onChange={(e) => setDealCfField(e.target.value)}>
              <option value="">Filtro custom field deal (opcional)</option>
              {dealCustomFields.map((f) => <option key={f._id || f.id} value={f._id || f.id}>{f.name}</option>)}
            </select>
            <input className="form-input" style={{ maxWidth: 220 }} value={dealCfValue} onChange={(e) => setDealCfValue(e.target.value)} placeholder="Valor del campo" />
            <button className="btn btn-secondary" disabled={!hasToken || loading} onClick={searchDeals}>Buscar negocios</button>
            <button className="btn btn-secondary" disabled={!deals.length || loading} onClick={() => downloadCsv('rd_deals.csv', deals.map(d => ({ id: d._id || '', name: d.name || '', stage: d.deal_stage?.name || d.deal_stage_id || '', owner: d.user?.name || d.user?.email || '', amount: d.amount_total || '' })))}>Exportar CSV</button>
            <button className="btn btn-primary" disabled={!selectedDeals.size || loading || (!stageFilter && !userFilter)} onClick={bulkUpdateDeals}>Actualizar seleccionados</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ width: 32 }}></th><th>Negocio</th><th>Etapa</th><th>Responsable</th><th>Valor</th></tr></thead>
              <tbody>
                {!deals.length ? <tr><td colSpan="5" style={{ color: 'var(--text-muted)' }}>Sin resultados</td></tr> : deals.map((d) => {
                  const id = String(d._id || d.id || '')
                  return (
                    <tr key={id || `${d.name}-${d.amount_total}`}>
                      <td><input type="checkbox" checked={selectedDeals.has(id)} onChange={() => toggleDeal(id)} /></td>
                      <td>{d.name || '-'}</td>
                      <td>{d.deal_stage?.name || d.deal_stage_id || '-'}</td>
                      <td>{d.user?.name || d.user?.email || '-'}</td>
                      <td>{d.amount_total || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)' }}>
        Equipos disponibles en RD: {teams.length}
      </div>
    </section>
  )
}
