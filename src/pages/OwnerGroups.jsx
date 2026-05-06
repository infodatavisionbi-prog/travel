import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, LayoutDashboard, Plus, Trash2, UserRound, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import PowerBIEmbed from '../components/PowerBIEmbed.jsx'
import PdfViewer from '../components/PdfViewer.jsx'

const STATUS_OPTIONS = [
  { value: 'pendiente',  label: 'Pendiente',  badge: 'badge-warning' },
  { value: 'en_proceso', label: 'En proceso', badge: 'badge-accent'  },
  { value: 'pagado',     label: 'Pagado',     badge: 'badge-success' },
]

function fmtDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(v))
}

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function GruposTab({ companyId }) {
  const [groups, setGroups]               = useState([])
  const [companyUsers, setCompanyUsers]   = useState([])
  const [companyBoards, setCompanyBoards] = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupMembers, setGroupMembers]   = useState([])
  const [groupBoards, setGroupBoards]     = useState([])
  const [loadingGroup, setLoadingGroup]   = useState(false)
  const [showNew, setShowNew]             = useState(false)
  const [newName, setNewName]             = useState('')
  const [creating, setCreating]           = useState(false)
  const [userToAdd, setUserToAdd]         = useState('')
  const [boardToAdd, setBoardToAdd]       = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [groupsRes, usersRes, boardsRes] = await Promise.all([
        supabase.from('groups').select('*').eq('company_id', companyId).order('name'),
        supabase.from('profiles').select('id, full_name, email').eq('company_id', companyId).order('full_name'),
        supabase.from('company_dashboards')
          .select('dashboard_id, dashboards(id, name)')
          .eq('company_id', companyId),
      ])
      if (groupsRes.error) throw groupsRes.error
      setGroups(groupsRes.data || [])
      setCompanyUsers(usersRes.data || [])
      setCompanyBoards((boardsRes.data || []).map(r => r.dashboards).filter(Boolean))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (companyId) load() }, [companyId])

  const openGroup = async (group) => {
    setSelectedGroup(group)
    setLoadingGroup(true)
    setUserToAdd('')
    setBoardToAdd('')
    const [membersRes, boardsRes] = await Promise.all([
      supabase.from('group_members').select('user_id, profiles(id, full_name, email)').eq('group_id', group.id),
      supabase.from('group_dashboards').select('dashboard_id, dashboards(id, name)').eq('group_id', group.id),
    ])
    setGroupMembers(membersRes.data || [])
    setGroupBoards(boardsRes.data || [])
    setLoadingGroup(false)
  }

  const createGroup = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const { error } = await supabase.from('groups').insert({ name: newName.trim(), company_id: companyId })
    setCreating(false)
    if (error) { setError(error.message); return }
    setShowNew(false); setNewName(''); load()
  }

  const deleteGroup = async (group, e) => {
    e.stopPropagation()
    if (!window.confirm(`¿Eliminar el grupo "${group.name}"?`)) return
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) { setError(error.message); return }
    if (selectedGroup?.id === group.id) setSelectedGroup(null)
    load()
  }

  const addMember = async () => {
    if (!userToAdd) return
    const { error } = await supabase.from('group_members').insert({ group_id: selectedGroup.id, user_id: userToAdd })
    if (error) { setError(error.message); return }
    setUserToAdd(''); openGroup(selectedGroup)
  }

  const removeMember = async (userId) => {
    const { error } = await supabase.from('group_members').delete().eq('group_id', selectedGroup.id).eq('user_id', userId)
    if (error) { setError(error.message); return }
    openGroup(selectedGroup)
  }

  const addBoard = async () => {
    if (!boardToAdd) return
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('group_dashboards').insert({ group_id: selectedGroup.id, dashboard_id: boardToAdd, assigned_by: user?.id })
    if (error) { setError(error.message); return }
    setBoardToAdd(''); openGroup(selectedGroup)
  }

  const removeBoard = async (dashboardId) => {
    const { error } = await supabase.from('group_dashboards').delete().eq('group_id', selectedGroup.id).eq('dashboard_id', dashboardId)
    if (error) { setError(error.message); return }
    openGroup(selectedGroup)
  }

  const membersSet  = useMemo(() => new Set(groupMembers.map(m => m.user_id)), [groupMembers])
  const boardsSet   = useMemo(() => new Set(groupBoards.map(b => b.dashboard_id)), [groupBoards])
  const availUsers  = useMemo(() => companyUsers.filter(u => !membersSet.has(u.id)), [companyUsers, membersSet])
  const availBoards = useMemo(() => companyBoards.filter(b => !boardsSet.has(b.id)), [companyBoards, boardsSet])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => { setShowNew(true); setNewName('') }}>
          <Plus size={15} /> Nuevo grupo
        </button>
      </div>

      {error && <div className="form-error visible" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedGroup ? '1fr 1.2fr' : '1fr', gap: 20, alignItems: 'start' }}>
        <div className="card table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Grupo</th><th style={{ width: 110 }}></th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="2"><div className="table-loading"><div className="spinner" /></div></td></tr>
                ) : groups.length === 0 ? (
                  <tr><td colSpan="2"><div className="empty-state">Sin grupos todavía</div></td></tr>
                ) : groups.map(g => (
                  <tr key={g.id} style={{ background: selectedGroup?.id === g.id ? 'var(--bg-elevated)' : undefined }}>
                    <td><strong>{g.name}</strong></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openGroup(g)}>Gestionar</button>
                        <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={e => deleteGroup(g, e)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedGroup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>{selectedGroup.name}</strong>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedGroup(null)}><X size={16} /></button>
            </div>
            {loadingGroup ? <div className="table-loading"><div className="spinner" /></div> : (
              <>
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div className="boards-section-header" style={{ marginBottom: 10 }}>
                    <Users size={12} /> Usuarios <span className="boards-section-count">{groupMembers.length}</span>
                  </div>
                  <div className="assign-row" style={{ marginBottom: 10 }}>
                    <select className="form-input" value={userToAdd} onChange={e => setUserToAdd(e.target.value)}>
                      <option value="">Agregar usuario…</option>
                      {availUsers.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={addMember} disabled={!userToAdd}><Plus size={13} /></button>
                  </div>
                  <div className="assigned-list" style={{ gap: 6 }}>
                    {groupMembers.length === 0 ? (
                      <div className="empty-state" style={{ padding: '8px 0', fontSize: 12 }}>Sin usuarios</div>
                    ) : groupMembers.map(m => (
                      <div className="assigned-item" key={m.user_id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <UserRound size={13} style={{ color: 'var(--text-muted)' }} />
                          <span>{m.profiles?.full_name || m.profiles?.email}</span>
                        </div>
                        <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => removeMember(m.user_id)}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div className="boards-section-header" style={{ marginBottom: 10 }}>
                    <LayoutDashboard size={12} /> Tableros <span className="boards-section-count">{groupBoards.length}</span>
                  </div>
                  <div className="assign-row" style={{ marginBottom: 10 }}>
                    <select className="form-input" value={boardToAdd} onChange={e => setBoardToAdd(e.target.value)}>
                      <option value="">Asignar tablero…</option>
                      {availBoards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={addBoard} disabled={!boardToAdd}><Plus size={13} /></button>
                  </div>
                  <div className="assigned-list" style={{ gap: 6 }}>
                    {groupBoards.length === 0 ? (
                      <div className="empty-state" style={{ padding: '8px 0', fontSize: 12 }}>Sin tableros</div>
                    ) : groupBoards.map(b => (
                      <div className="assigned-item" key={b.dashboard_id}>
                        <span>{b.dashboards?.name}</span>
                        <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => removeBoard(b.dashboard_id)}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showNew && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Nuevo grupo</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={newName} placeholder="Ej: Ventas, Finanzas…" autoFocus
                  onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createGroup()} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createGroup} disabled={creating || !newName.trim()}>
                {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Plus size={14} />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── TABLEROS ──────────────────────────────────────────────────────────────────
function TablerosTab({ companyId }) {
  const [dashboards, setDashboards] = useState([])
  const [active, setActive]         = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('company_dashboards')
        .select('dashboard_id, dashboards(id, name, embed_url, report_id, group_id)')
        .eq('company_id', companyId)
      const boards = (data || []).map(r => r.dashboards).filter(Boolean)
      setDashboards(boards)
      if (boards.length > 0) setActive(boards[0])
      setLoading(false)
    }
    load()
  }, [companyId])

  if (loading) return <div className="card table-loading"><div className="spinner" /></div>
  if (dashboards.length === 0) return <div className="empty-state page-empty">No hay tableros asignados a la empresa</div>

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 220px)', minHeight: 400 }}>
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {dashboards.map(d => (
          <button
            key={d.id}
            className={`nav-item ${active?.id === d.id ? 'active' : ''}`}
            onClick={() => setActive(d)}
          >
            <LayoutDashboard size={14} />
            <span className="nav-item-label">{d.name}</span>
          </button>
        ))}
      </div>
      {active && (
        <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <PowerBIEmbed dashboard={active} style={{ flex: 1 }} />
        </div>
      )}
    </div>
  )
}

// ── FACTURAS ──────────────────────────────────────────────────────────────────
function FacturasTab({ companyId }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [viewing, setViewing]   = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('company_invoices')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      setInvoices(data || [])
      setError(error?.message || '')
      setLoading(false)
    }
    load()
  }, [companyId])

  return (
    <>
      {error && <div className="form-error visible" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Estado</th>
                <th>Tamaño</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5"><div className="table-loading"><div className="spinner" /></div></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan="5"><div className="empty-state">No hay facturas disponibles</div></td></tr>
              ) : invoices.map(inv => {
                const st = STATUS_OPTIONS.find(s => s.value === inv.status) || STATUS_OPTIONS[0]
                return (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                        <span>{inv.name}</span>
                      </div>
                    </td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtSize(inv.file_size)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtDate(inv.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setViewing(inv)}>
                        <Download size={13} /> Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && <PdfViewer invoice={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

// ── PRINCIPAL ─────────────────────────────────────────────────────────────────
export default function OwnerGroups() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [tab, setTab] = useState('grupos')

  const tabs = [
    { id: 'grupos',    label: 'Mi empresa',  icon: Users },
    { id: 'tableros',  label: 'Tableros',    icon: LayoutDashboard },
    { id: 'facturas',  label: 'Facturas',    icon: FileText },
  ]

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title">{profile?.company_name || 'Mi empresa'}</div>
          <div className="page-header-sub">Panel del administrador de empresa</div>
        </div>
      </div>

      <div className="company-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`company-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {tab === 'grupos'   && <GruposTab    companyId={companyId} />}
        {tab === 'tableros' && <TablerosTab  companyId={companyId} />}
        {tab === 'facturas' && <FacturasTab  companyId={companyId} />}
      </div>
    </>
  )
}
