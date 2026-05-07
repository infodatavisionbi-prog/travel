import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const EMPTY_FORM = {
  id: null,
  name: '',
  email: '',
  email2: '',
  company: '',
  role: '',
  phone: '',
  tags: '',
  notes: '',
  group_name: '',
  status: 'active',
}

function campaignMeta(status) {
  const key = String(status || '').toLowerCase()
  if (key === 'active') return { label: 'Activa', color: 'var(--success-dim)', text: 'var(--success)' }
  if (key === 'paused') return { label: 'Pausada', color: 'var(--warning-dim)', text: 'var(--warning)' }
  if (key === 'completed') return { label: 'Completada', color: 'var(--accent-dim)', text: 'var(--accent)' }
  if (key === 'inactive') return { label: 'Inactiva', color: 'var(--bg-elevated)', text: 'var(--text-muted)' }
  return { label: 'Asignada', color: 'var(--bg-elevated)', text: 'var(--text-secondary)' }
}

export default function LeadsPage() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')

  const [leads, setLeads] = useState([])
  const [groups, setGroups] = useState([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('')

  const [selected, setSelected] = useState(new Set())

  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [leadForm, setLeadForm] = useState(EMPTY_FORM)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploading, setUploading] = useState(false)

  const selectedCount = selected.size

  const run = async (fn, okText) => {
    setLoading(true)
    try {
      await fn()
      if (okText) setStatus(okText)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadGroups = async () => {
    const res = await apiFetch('/leads/groups')
    setGroups(Array.isArray(res?.groups) ? res.groups : [])
  }

  const loadLeads = async (q = search, g = groupFilter) => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('search', q.trim())
    if (g) params.set('group', g)
    const data = await apiFetch(`/leads${params.toString() ? `?${params.toString()}` : ''}`)
    setLeads(Array.isArray(data) ? data : [])
    setSelected(new Set())
  }

  useEffect(() => {
    run(async () => {
      await Promise.all([loadLeads('', ''), loadGroups()])
    }, 'Leads cargados')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      run(async () => {
        await loadLeads(search, groupFilter)
      })
    }, 300)
    return () => clearTimeout(t)
  }, [search, groupFilter])

  const allSelected = useMemo(() => leads.length > 0 && leads.every((l) => selected.has(l.id)), [leads, selected])

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(leads.map((l) => l.id)))
  }

  const openNewLead = () => {
    setLeadForm(EMPTY_FORM)
    setLeadModalOpen(true)
  }

  const openEditLead = (lead) => {
    setLeadForm({
      id: lead.id,
      name: lead.name || '',
      email: lead.email || '',
      email2: lead.email2 || '',
      company: lead.company || '',
      role: lead.role || '',
      phone: lead.phone || '',
      tags: lead.tags || '',
      notes: lead.notes || '',
      group_name: lead.group_name || '',
      status: lead.status || 'active',
    })
    setLeadModalOpen(true)
  }

  const saveLead = async () => run(async () => {
    if (!leadForm.name.trim() || !leadForm.email.trim()) throw new Error('Nombre y email son obligatorios')
    const payload = {
      name: leadForm.name.trim(),
      email: leadForm.email.trim(),
      email2: leadForm.email2.trim(),
      company: leadForm.company.trim(),
      role: leadForm.role.trim(),
      phone: leadForm.phone.trim(),
      tags: leadForm.tags.trim(),
      notes: leadForm.notes.trim(),
      group_name: leadForm.group_name.trim(),
      status: leadForm.status,
    }
    if (leadForm.id) await apiFetch(`/leads/${leadForm.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await apiFetch('/leads', { method: 'POST', body: JSON.stringify(payload) })
    setLeadModalOpen(false)
    await Promise.all([loadLeads(), loadGroups()])
  }, leadForm.id ? 'Lead actualizado' : 'Lead creado')

  const deleteLead = async (id) => {
    if (!window.confirm('Eliminar este lead?')) return
    await run(async () => {
      await apiFetch(`/leads/${id}`, { method: 'DELETE' })
      await loadLeads()
    }, 'Lead eliminado')
  }

  const deleteSelected = async () => {
    if (!selectedCount) return
    if (!window.confirm(`Eliminar ${selectedCount} leads?`)) return
    await run(async () => {
      await apiFetch('/leads', { method: 'DELETE', body: JSON.stringify([...selected]) })
      await loadLeads()
    }, 'Leads eliminados')
  }

  const pushLeadRd = async (id) => run(async () => {
    await apiFetch(`/rdstation/leads/${id}/push`, { method: 'POST', body: JSON.stringify({}) })
  }, 'Lead enviado a RD Station')

  const openDetails = async (id) => {
    setDetailOpen(true)
    setDetailData(null)
    await run(async () => {
      const d = await apiFetch(`/leads/${id}/campaigns`)
      setDetailData(d)
    })
  }

  const uploadFile = async (file) => {
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    try {
      const token = localStorage.getItem('dv_token')
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${import.meta.env.VITE_API_URL || window.location.origin}/leads/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.detail || 'Error de importacion')
      setUploadResult(data)
      await Promise.all([loadLeads(), loadGroups()])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="page-title">Leads</h2>
          <p className="page-subtitle">Paridad funcional del modulo original: gestion completa de leads.</p>
        </div>
      </div>

      <div className="toolbar-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="form-input" style={{ width: 280 }} placeholder="Buscar nombre/email/empresa" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-select" style={{ width: 220 }} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">Todos los grupos</option>
          {groups.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => run(async () => { await Promise.all([loadLeads(), loadGroups()]) }, 'Leads recargados')} disabled={loading}>Recargar</button>
        <button className="btn btn-primary" onClick={openNewLead}>Nuevo lead</button>
        <button className="btn btn-secondary" onClick={() => setUploadOpen(true)}>Importar CSV/XLSX</button>
        {selectedCount > 0 && <button className="btn btn-danger" onClick={deleteSelected}>Eliminar seleccionados ({selectedCount})</button>}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Estado: {status}{loading ? ' | Procesando...' : ''}</div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Empresa</th>
              <th>Cargo</th>
              <th>Grupo</th>
              <th>Estado</th>
              <th>Campanas</th>
              <th>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!leads.length ? (
              <tr><td colSpan="10" style={{ color: 'var(--text-muted)' }}>Sin leads</td></tr>
            ) : leads.map((l) => {
              const meta = campaignMeta(l.campaign_status)
              return (
                <tr key={l.id}>
                  <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} /></td>
                  <td>{l.name || '-'}</td>
                  <td>{l.email || '-'}</td>
                  <td>{l.company || '-'}</td>
                  <td>{l.role || '-'}</td>
                  <td>{l.group_name || '-'}</td>
                  <td>{l.status || '-'}</td>
                  <td>
                    {Number(l.campaign_count || 0) ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: meta.color, color: meta.text }}>{meta.label}</span>
                        <span>{l.campaign_count}</span>
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>Sin campana</span>}
                  </td>
                  <td>{l.tags || '-'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetails(l.id)}>Ver</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditLead(l)}>Editar</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => pushLeadRd(l.id)}>RD</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteLead(l.id)}>Del</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {leadModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 12 }}>
          <div className="card" style={{ width: 'min(780px, 96vw)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{leadForm.id ? 'Editar Lead' : 'Nuevo Lead'}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setLeadModalOpen(false)}>Cerrar</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              <input className="form-input" placeholder="Nombre" value={leadForm.name} onChange={(e) => setLeadForm((v) => ({ ...v, name: e.target.value }))} />
              <input className="form-input" placeholder="Email" value={leadForm.email} onChange={(e) => setLeadForm((v) => ({ ...v, email: e.target.value }))} />
              <input className="form-input" placeholder="Email 2" value={leadForm.email2} onChange={(e) => setLeadForm((v) => ({ ...v, email2: e.target.value }))} />
              <input className="form-input" placeholder="Telefono" value={leadForm.phone} onChange={(e) => setLeadForm((v) => ({ ...v, phone: e.target.value }))} />
              <input className="form-input" placeholder="Empresa" value={leadForm.company} onChange={(e) => setLeadForm((v) => ({ ...v, company: e.target.value }))} />
              <input className="form-input" placeholder="Cargo" value={leadForm.role} onChange={(e) => setLeadForm((v) => ({ ...v, role: e.target.value }))} />
              <input className="form-input" placeholder="Grupo" value={leadForm.group_name} onChange={(e) => setLeadForm((v) => ({ ...v, group_name: e.target.value }))} list="lead-group-options" />
              <input className="form-input" placeholder="Tags (coma)" value={leadForm.tags} onChange={(e) => setLeadForm((v) => ({ ...v, tags: e.target.value }))} />
              <select className="form-select" value={leadForm.status} onChange={(e) => setLeadForm((v) => ({ ...v, status: e.target.value }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
              <div />
              <textarea className="form-textarea" style={{ gridColumn: '1 / -1', minHeight: 90 }} placeholder="Notas" value={leadForm.notes} onChange={(e) => setLeadForm((v) => ({ ...v, notes: e.target.value }))} />
            </div>
            <datalist id="lead-group-options">{groups.map((g) => <option key={g.name} value={g.name} />)}</datalist>
            <div className="toolbar-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={saveLead} disabled={loading}>Guardar</button>
              <button className="btn btn-secondary" onClick={() => setLeadModalOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 71, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 12 }}>
          <div className="card" style={{ width: 'min(900px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Detalle del lead</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetailOpen(false)}>Cerrar</button>
            </div>
            {!detailData ? <div style={{ color: 'var(--text-muted)' }}>Cargando...</div> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
                  <div>Nombre: {detailData.lead?.name || '-'}</div>
                  <div>Email: {detailData.lead?.email || '-'}</div>
                  <div>Empresa: {detailData.lead?.company || '-'}</div>
                  <div>Cargo: {detailData.lead?.role || '-'}</div>
                  <div>Grupo: {detailData.lead?.group_name || '-'}</div>
                  <div>Telefono: {detailData.lead?.phone || '-'}</div>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Campanas del lead</div>
                {!detailData.campaigns?.length ? (
                  <div style={{ color: 'var(--text-muted)' }}>Este lead no participa en campanas todavia.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {detailData.campaigns.map((c) => (
                      <div key={`${c.sequence_id}-${c.enrolled_at || ''}`} className="card" style={{ padding: 10 }}>
                        <div style={{ fontWeight: 600 }}>{c.sequence_name || `Campana #${c.sequence_id}`}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Estado campana: {c.sequence_status || '-'} | Estado lead: {c.contact_status || '-'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Paso actual: {c.current_step || 0} | Etapa: {c.follow_up_stage || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {uploadOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 72, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 12 }}>
          <div className="card" style={{ width: 'min(580px, 96vw)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>Importar leads</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setUploadOpen(false)}>Cerrar</button>
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => uploadFile(e.target.files?.[0])} disabled={uploading} />
            {uploading && <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Subiendo archivo...</div>}
            {uploadResult && (
              <div className="card" style={{ marginTop: 10, padding: 10 }}>
                <div>Total: {uploadResult.total_in_file}</div>
                <div>Creados: {uploadResult.created}</div>
                <div>Duplicados: {uploadResult.skipped}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
