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

  const [contactDetail, setContactDetail] = useState(null)
  const [dealDetail, setDealDetail] = useState(null)

  const [automations, setAutomations] = useState([])
  const [autoName, setAutoName] = useState('')
  const [selectedAuto, setSelectedAuto] = useState(null)

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
          body: JSON.stringify({ q, user_id: userFilter || undefined, filters: [{ field_id: cfField, operator: 'contains', value: cfValue }] }),
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

  const openContactDetail = async (id) => {
    setLoading(true)
    try {
      const r = await apiFetch(`/rdstation/contacts/${id}`)
      setContactDetail(r.contact || null)
    } catch {
      setContactDetail(null)
    } finally {
      setLoading(false)
    }
  }

  const importContactDetail = async () => {
    if (!contactDetail) return
    setLoading(true)
    try {
      await apiFetch('/rdstation/contacts/import', {
        method: 'POST',
        body: JSON.stringify({
          rd_id: contactDetail._id || '',
          name: contactDetail.name || '',
          email: contactDetail.email || '',
          phone: (contactDetail.phones && contactDetail.phones[0]?.phone) || contactDetail.phone || '',
          company: contactDetail.organization?.name || '',
          role: contactDetail.title || '',
        }),
      })
      setStatus('Contacto importado como lead')
    } catch (e) {
      setStatus(`Error importando contacto: ${e.message}`)
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
          body: JSON.stringify({ q, stage_id: stageFilter || undefined, user_id: userFilter || undefined, cf_filters: [{ field_id: dealCfField, operator: 'contains', value: dealCfValue }] }),
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

  const openDealDetail = async (id) => {
    setLoading(true)
    try {
      const [dealRes, contactsRes] = await Promise.all([
        apiFetch(`/rdstation/deals/${id}`),
        apiFetch(`/rdstation/deals/${id}/contacts`).catch(() => ({ contacts: [] })),
      ])
      setDealDetail({ deal: dealRes.deal || null, contacts: contactsRes.contacts || [] })
    } catch {
      setDealDetail(null)
    } finally {
      setLoading(false)
    }
  }

  const importListedDeals = async () => {
    if (!deals.length) return
    setLoading(true)
    try {
      const payloadDeals = deals.map((d) => ({
        rd_id: d._id || d.id || '',
        name: d.name || 'Sin nombre',
        company: d.organization?.name || '',
      }))
      await apiFetch('/rdstation/deals/import-bulk', { method: 'POST', body: JSON.stringify({ deals: payloadDeals, group_name: '' }) })
      setStatus(`Importados ${payloadDeals.length} negocios como leads`)
    } catch (e) {
      setStatus(`Error importando negocios: ${e.message}`)
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
        body: JSON.stringify({ deal_ids: ids, deal_stage_id: stageFilter || undefined, user_id: userFilter || undefined }),
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

  const loadAutomations = async () => {
    setLoading(true)
    try {
      const list = await apiFetch('/rdstation/automations')
      setAutomations(Array.isArray(list) ? list : [])
    } finally {
      setLoading(false)
    }
  }

  const createAutomation = async () => {
    if (!autoName.trim()) return
    setLoading(true)
    try {
      await apiFetch('/rdstation/automations', { method: 'POST', body: JSON.stringify({ name: autoName.trim() }) })
      setAutoName('')
      await loadAutomations()
      setStatus('Automatización creada')
    } catch (e) {
      setStatus(`Error creando automatización: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleAuto = async (a) => {
    setLoading(true)
    try {
      await apiFetch(`/rdstation/automations/${a.id}`, { method: 'PUT', body: JSON.stringify({ status: a.status === 'active' ? 'paused' : 'active' }) })
      await loadAutomations()
    } finally {
      setLoading(false)
    }
  }

  const runAuto = async (id, dryRun = false) => {
    setLoading(true)
    try {
      const r = await apiFetch(`/rdstation/automations/${id}/run`, { method: 'POST', body: JSON.stringify({ dry_run: dryRun }) })
      setStatus(`Run ok: ${r.processed || 0} procesados`) 
      setSelectedAuto(r)
    } catch (e) {
      setStatus(`Error run automation: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const resetAuto = async (id) => {
    setLoading(true)
    try {
      await apiFetch(`/rdstation/automations/${id}/reset`, { method: 'POST', body: JSON.stringify({}) })
      setStatus('Automatización reseteada')
    } catch (e) {
      setStatus(`Error reset automation: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteAuto = async (id) => {
    setLoading(true)
    try {
      await apiFetch(`/rdstation/automations/${id}`, { method: 'DELETE' })
      await loadAutomations()
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
          <p className="page-subtitle">Paridad funcional progresiva con la app original.</p>
        </div>
      </div>

      <div className="company-tabs" style={{ marginBottom: 12 }}>
        <button className={`company-tab ${tab === 'contacts' ? 'active' : ''}`} onClick={() => setTab('contacts')}>Contactos</button>
        <button className={`company-tab ${tab === 'deals' ? 'active' : ''}`} onClick={() => setTab('deals')}>Negocios</button>
        <button className={`company-tab ${tab === 'automations' ? 'active' : ''}`} onClick={() => { setTab('automations'); loadAutomations() }}>Automatizaciones</button>
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

      {tab !== 'automations' && (
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
      )}

      {tab === 'contacts' && (
        <>
          <div className="toolbar-actions" style={{ marginBottom: 12 }}>
            <select className="form-select" style={{ width: 260 }} value={cfField} onChange={(e) => setCfField(e.target.value)}>
              <option value="">Filtro custom field (opcional)</option>
              {customFields.map((f) => <option key={f._id || f.id} value={f._id || f.id}>{f.name}</option>)}
            </select>
            <input className="form-input" style={{ maxWidth: 220 }} value={cfValue} onChange={(e) => setCfValue(e.target.value)} placeholder="Valor del campo" />
            <button className="btn btn-secondary" disabled={!hasToken || loading} onClick={searchContacts}>Buscar contactos</button>
            <button className="btn btn-secondary" disabled={!contacts.length || loading} onClick={() => downloadCsv('rd_contacts.csv', contacts.map(c => ({ id: c._id || '', name: c.name || '', email: c.email || '', phone: (c.phones && c.phones[0]?.phone) || c.phone || '' })))}>Exportar CSV</button>
            <button className="btn btn-primary" disabled={!contacts.length || loading} onClick={importSelectedContacts}>Importar a Leads</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Empresa</th><th>Lead local</th><th></th></tr></thead>
              <tbody>
                {!contacts.length ? <tr><td colSpan="6" style={{ color: 'var(--text-muted)' }}>Sin resultados</td></tr> : contacts.map((c) => (
                  <tr key={c._id || `${c.name}-${c.email}`}>
                    <td>{c.name || '-'}</td><td>{c.email || '-'}</td><td>{(c.phones && c.phones[0]?.phone) || c.phone || '-'}</td><td>{c.organization?.name || '-'}</td><td>{c._local_lead_id ? `Lead #${c._local_lead_id}` : 'No'}</td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => openContactDetail(c._id || c.id)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contactDetail && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Detalle contacto</div>
              <div style={{ fontSize: 13 }}>Nombre: {contactDetail.name || '-'}</div>
              <div style={{ fontSize: 13 }}>Email: {contactDetail.email || '-'}</div>
              <div style={{ fontSize: 13 }}>Tel: {(contactDetail.phones && contactDetail.phones[0]?.phone) || contactDetail.phone || '-'}</div>
              <div style={{ marginTop: 8 }}><button className="btn btn-primary btn-sm" onClick={importContactDetail}>Importar este contacto</button></div>
            </div>
          )}
        </>
      )}

      {tab === 'deals' && (
        <>
          <div className="toolbar-actions" style={{ marginBottom: 12 }}>
            <select className="form-select" style={{ width: 260 }} value={dealCfField} onChange={(e) => setDealCfField(e.target.value)}>
              <option value="">Filtro custom field deal (opcional)</option>
              {dealCustomFields.map((f) => <option key={f._id || f.id} value={f._id || f.id}>{f.name}</option>)}
            </select>
            <input className="form-input" style={{ maxWidth: 220 }} value={dealCfValue} onChange={(e) => setDealCfValue(e.target.value)} placeholder="Valor del campo" />
            <button className="btn btn-secondary" disabled={!hasToken || loading} onClick={searchDeals}>Buscar negocios</button>
            <button className="btn btn-secondary" disabled={!deals.length || loading} onClick={() => downloadCsv('rd_deals.csv', deals.map(d => ({ id: d._id || '', name: d.name || '', stage: d.deal_stage?.name || d.deal_stage_id || '', owner: d.user?.name || d.user?.email || '' })))}>Exportar CSV</button>
            <button className="btn btn-secondary" disabled={!deals.length || loading} onClick={importListedDeals}>Importar como leads</button>
            <button className="btn btn-primary" disabled={!selectedDeals.size || loading || (!stageFilter && !userFilter)} onClick={bulkUpdateDeals}>Actualizar seleccionados</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ width: 32 }}></th><th>Negocio</th><th>Etapa</th><th>Responsable</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {!deals.length ? <tr><td colSpan="6" style={{ color: 'var(--text-muted)' }}>Sin resultados</td></tr> : deals.map((d) => {
                  const id = String(d._id || d.id || '')
                  return (
                    <tr key={id || `${d.name}-${d.amount_total}`}>
                      <td><input type="checkbox" checked={selectedDeals.has(id)} onChange={() => toggleDeal(id)} /></td>
                      <td>{d.name || '-'}</td><td>{d.deal_stage?.name || d.deal_stage_id || '-'}</td><td>{d.user?.name || d.user?.email || '-'}</td><td>{d.amount_total || '-'}</td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => openDealDetail(id)}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {dealDetail?.deal && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Detalle negocio</div>
              <div style={{ fontSize: 13 }}>Nombre: {dealDetail.deal.name || '-'}</div>
              <div style={{ fontSize: 13 }}>Etapa: {dealDetail.deal.deal_stage?.name || dealDetail.deal.deal_stage_id || '-'}</div>
              <div style={{ fontSize: 13 }}>Responsable: {dealDetail.deal.user?.name || dealDetail.deal.user?.email || '-'}</div>
              <div style={{ fontSize: 13 }}>Contactos asociados: {dealDetail.contacts?.length || 0}</div>
            </div>
          )}
        </>
      )}

      {tab === 'automations' && (
        <>
          <div className="toolbar-actions" style={{ marginBottom: 12 }}>
            <input className="form-input" style={{ maxWidth: 340 }} value={autoName} onChange={(e) => setAutoName(e.target.value)} placeholder="Nombre nueva automatización" />
            <button className="btn btn-primary" disabled={!autoName.trim() || loading} onClick={createAutomation}>Crear</button>
            <button className="btn btn-secondary" disabled={loading} onClick={loadAutomations}>Recargar</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Estado</th><th>Origen</th><th>Destino</th><th>Secuencia</th><th></th></tr></thead>
              <tbody>
                {!automations.length ? <tr><td colSpan="6" style={{ color: 'var(--text-muted)' }}>Sin automatizaciones</td></tr> : automations.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.status}</td>
                    <td>{a.source_stage_id || '-'}</td>
                    <td>{a.target_stage_id || '-'}</td>
                    <td>{a.sequence_id || '-'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleAuto(a)}>{a.status === 'active' ? 'Pausar' : 'Activar'}</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => runAuto(a.id, true)}>Dry</button>
                      <button className="btn btn-primary btn-sm" onClick={() => runAuto(a.id, false)}>Run</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => resetAuto(a.id)}>Reset</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteAuto(a.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedAuto && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Resultado última ejecución</div>
              <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(selectedAuto, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)' }}>Equipos disponibles en RD: {teams.length}</div>
    </section>
  )
}
