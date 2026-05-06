import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart2, Briefcase, Check, CircleHelp, Copy, Crown, Download, Eye, FileText, FolderOpen, Kanban, LayoutDashboard, Monitor, Plus, Power, Receipt, ShieldCheck, Trash2, Upload, UserRound, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import PdfViewer from '../components/PdfViewer.jsx'
import { CompanyInfoPanel } from './CompanyInfoPage.jsx'

const STATUS_OPTIONS = [
  { value: 'pendiente',  label: 'Pendiente',   badge: 'badge-warning' },
  { value: 'en_proceso', label: 'En proceso',  badge: 'badge-accent'  },
  { value: 'pagado',     label: 'Pagado',      badge: 'badge-success' },
]

const PROJECT_STATUS_OPTIONS = [
  { value: 'en_fila', label: 'En fila', badge: 'badge-warning' },
  { value: 'en_desarrollo', label: 'En desarrollo', badge: 'badge-accent' },
  { value: 'en_curso', label: 'En curso', badge: 'badge-accent' },
  { value: 'en_testeo', label: 'En testeo', badge: 'badge-warning' },
  { value: 'completado', label: 'Completado', badge: 'badge-success' },
]

const PROJECT_STATUS_MAP = PROJECT_STATUS_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option
  return acc
}, {})

const BUDGET_CURRENCY_OPTIONS = [
  { value: 'ARS', label: '$' },
  { value: 'USD', label: 'U$D' },
]

function fmtDate(v, fallback = '—') {
  if (!v) return fallback
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(v))
}

function fmtDuration(seconds) {
  if (!seconds || seconds < 60) return '<1 min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── USUARIOS ──────────────────────────────────────────────────────────────────
const emptyCreate = { full_name: '', email: '', username: '', password: '' }

function UsersTab({ company }) {
  const { isAdmin, isCompanyOwner } = useAuth()
  const [users, setUsers]         = useState([])
  const [allUsers, setAllUsers]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [userToAdd, setUserToAdd] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreate)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating]   = useState(false)
  const canCreateUsers = isAdmin || isCompanyOwner

  const load = async () => {
    setLoading(true)
    const [compRes, allRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('company_id', company.id).order('full_name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ])
    setUsers(compRes.data || [])
    setAllUsers(allRes.data || [])
    setError(compRes.error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const usersNotIn = useMemo(() => {
    const inComp = new Set(users.map(u => u.id))
    return allUsers.filter(u => !inComp.has(u.id))
  }, [users, allUsers])

  const addUser = async () => {
    if (!userToAdd) return
    const { error } = await supabase
      .from('profiles')
      .update({ company_id: company.id, company_name: company.name })
      .eq('id', userToAdd)
    if (error) { setError(error.message); return }
    setShowAdd(false)
    setUserToAdd('')
    load()
  }

  const removeUser = async (userId) => {
    const { error } = await supabase.from('profiles').update({ company_id: null }).eq('id', userId)
    if (error) { setError(error.message); return }
    load()
  }

  const toggleActive = async (user) => {
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    if (error) { setError(error.message); return }
    load()
  }

  const toggleOwner = async (user) => {
    const newRole = user.company_role === 'owner' ? null : 'owner'
    const { error } = await supabase.from('profiles').update({ company_role: newRole }).eq('id', user.id)
    if (error) { setError(error.message); return }
    load()
  }

  const createUser = async () => {
    setCreateError('')
    const { full_name, email, username, password } = createForm
    if (!full_name.trim())              { setCreateError('El nombre es obligatorio'); return }
    if (!username.trim())               { setCreateError('El usuario es obligatorio'); return }
    if (!email.trim())                  { setCreateError('El email es obligatorio'); return }
    if (!password || password.length < 6) { setCreateError('La contraseña debe tener al menos 6 caracteres'); return }
    setCreating(true)
    try {
      let { error } = await supabase.rpc('create_company_user', {
        target_company_id: company.id,
        user_email:        email.trim(),
        user_username:     username.trim(),
        user_password:     password,
        user_fullname:     full_name.trim(),
      })
      if (error && /user_username/i.test(error.message || '')) {
        const fallback = await supabase.rpc('create_company_user', {
          target_company_id: company.id,
          user_email:        email.trim(),
          user_password:     password,
          user_fullname:     full_name.trim(),
        })
        error = fallback.error
      }
      if (error) throw error
      setShowCreate(false)
      setCreateForm(emptyCreate)
      load()
    } catch (err) {
      setCreateError(err.message || 'Error al crear el usuario')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        {isAdmin && (
          <button className="btn btn-secondary" onClick={() => { setShowAdd(true); setUserToAdd('') }}>
            <Plus size={14} /> Agregar usuario
          </button>
        )}
        {canCreateUsers && (
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setCreateForm(emptyCreate); setCreateError('') }}>
            <Plus size={14} /> Crear usuario
          </button>
        )}
      </div>

      <div className="card table-card">
        {error && <div className="form-error visible admin-inline-error">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
                {isAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 7 : 6}><div className="table-loading"><div className="spinner" /></div></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6}><div className="empty-state">No hay usuarios en esta empresa</div></td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar"><UserRound size={14} /></div>
                      <strong>{u.full_name || u.email}</strong>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.username || '-'}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-accent' : 'badge-warning'}`}>
                      {u.role === 'admin' && <ShieldCheck size={11} />}
                      {u.role === 'admin' ? 'Admin' : 'Usuario'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{fmtDate(u.last_seen_at)}</td>
                  {isAdmin && (
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={() => toggleOwner(u)}
                          title={u.company_role === 'owner' ? 'Quitar owner' : 'Hacer owner'}
                          style={{ color: u.company_role === 'owner' ? 'var(--accent)' : undefined }}
                        >
                          <Crown size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => toggleActive(u)}
                          title={u.is_active ? 'Desactivar' : 'Activar'}>
                          <Power size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => removeUser(u.id)}
                          title="Quitar de empresa" style={{ color: 'var(--danger)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Agregar usuario a {company.name}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Seleccioná un usuario</label>
              <select className="form-input" value={userToAdd} onChange={e => setUserToAdd(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {usersNotIn.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={addUser} disabled={!userToAdd}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Nuevo usuario en {company.name}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input className="form-input" autoFocus value={createForm.full_name} placeholder="Juan García"
                  onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={createForm.email} placeholder="juan@empresa.com"
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Usuario</label>
                <input className="form-input" value={createForm.username} placeholder="juan_garcia"
                  onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contraseña inicial</label>
                <input className="form-input" type="password" value={createForm.password} placeholder="Mínimo 6 caracteres"
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && createUser()} />
              </div>
              {createError && <div className="form-error visible" style={{ marginTop: 12 }}>{createError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createUser} disabled={creating}>
                {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Plus size={14} />}
                Crear usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── TABLEROS ──────────────────────────────────────────────────────────────────
function BoardsTab({ company }) {
  const { isAdmin }                = useAuth()
  const [assigned, setAssigned]       = useState([])
  const [allBoards, setAllBoards]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [boardToAdd, setBoardToAdd]   = useState('')
  const [previewUrl, setPreviewUrl]   = useState(null)
  const [previewName, setPreviewName] = useState('')

  const load = async () => {
    setLoading(true)
    const [assignedRes, allRes] = await Promise.all([
      supabase.from('company_dashboards')
        .select('dashboard_id, dashboards(id, name, embed_url)')
        .eq('company_id', company.id),
      supabase.from('dashboards').select('*').order('name'),
    ])
    setAssigned(assignedRes.data || [])
    setAllBoards(allRes.data || [])
    setError(assignedRes.error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const available = useMemo(() => {
    const ids = new Set(assigned.map(a => a.dashboard_id))
    return allBoards.filter(b => !ids.has(b.id))
  }, [allBoards, assigned])

  const assignBoard = async () => {
    if (!boardToAdd) return
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('company_dashboards').insert({
      company_id: company.id, dashboard_id: boardToAdd, assigned_by: userData.user?.id,
    })
    if (error) { setError(error.message); return }
    setBoardToAdd('')
    load()
  }

  const removeBoard = async (dashboardId) => {
    const { error } = await supabase.from('company_dashboards')
      .delete().eq('company_id', company.id).eq('dashboard_id', dashboardId)
    if (error) { setError(error.message); return }
    load()
  }

  if (loading) return <div className="table-loading"><div className="spinner" /></div>

  return (
    <>
      {isAdmin && (
        <div className="assign-row" style={{ marginBottom: 16 }}>
          <select className="form-input" value={boardToAdd} onChange={e => setBoardToAdd(e.target.value)}>
            <option value="">Asignar tablero…</option>
            {available.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={assignBoard} disabled={!boardToAdd}>Asignar</button>
        </div>
      )}

      {error && <div className="form-error visible" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="assigned-list">
        {assigned.length === 0 ? (
          <div className="empty-state">No hay tableros asignados a esta empresa</div>
        ) : assigned.map(item => (
          <div className="assigned-item" key={item.dashboard_id}>
            <span>{item.dashboards?.name}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setPreviewUrl(item.dashboards?.embed_url); setPreviewName(item.dashboards?.name) }}
              >
                <Eye size={13} /> Ver
              </button>
              {isAdmin && (
                <button className="btn btn-danger btn-sm" onClick={() => removeBoard(item.dashboard_id)}>
                  Quitar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {previewUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{previewName}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPreviewUrl(null)}>
              <X size={14} /> Cerrar
            </button>
          </div>
          <iframe src={previewUrl} title={previewName} style={{ flex: 1, border: 'none', width: '100%' }} allowFullScreen />
        </div>
      )}
    </>
  )
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────────────────────
function StatsTab({ company }) {
  const [users, setUsers]       = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: compUsers, error: usersErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, last_seen_at')
        .eq('company_id', company.id)
        .order('full_name')

      if (usersErr) { setError(usersErr.message); setLoading(false); return }
      setUsers(compUsers || [])

      if (compUsers && compUsers.length > 0) {
        const { data: sessData, error: sessErr } = await supabase
          .from('user_sessions')
          .select('*')
          .in('user_id', compUsers.map(u => u.id))
          .order('started_at', { ascending: false })

        // 42P01 = tabla no existe aún (correr migración SQL)
        if (sessErr && sessErr.code !== '42P01') setError(sessErr.message)
        else setSessions(sessData || [])
      }
      setLoading(false)
    }
    load()
  }, [company.id])

  const statsByUser = useMemo(() => {
    const map = {}
    users.forEach(u => { map[u.id] = { ...u, sessions: [], totalSeconds: 0 } })
    sessions.forEach(s => {
      if (!map[s.user_id]) return
      const end = new Date(s.ended_at || s.last_active_at)
      const dur = Math.max(0, Math.floor((end - new Date(s.started_at)) / 1000))
      map[s.user_id].sessions.push({ ...s, dur })
      map[s.user_id].totalSeconds += dur
    })
    return Object.values(map)
  }, [users, sessions])

  if (loading) return <div className="table-loading"><div className="spinner" /></div>
  if (error)   return <div className="form-error visible" style={{ marginTop: 8 }}>{error}</div>
  if (users.length === 0) return <div className="empty-state">Esta empresa no tiene usuarios todavía</div>

  const totalSessions = sessions.length
  const activeNow     = sessions.filter(s => !s.ended_at && new Date(s.last_active_at) > new Date(Date.now() - 5 * 60000)).length
  const totalHours    = Math.floor(statsByUser.reduce((a, u) => a + u.totalSeconds, 0) / 3600)

  return (
    <>
      {/* Summary cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-value">{users.length}</div>
          <div className="stat-card-label">Usuarios</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{totalSessions}</div>
          <div className="stat-card-label">Sesiones totales</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{totalHours}h</div>
          <div className="stat-card-label">Tiempo acumulado</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value" style={{ color: activeNow > 0 ? 'var(--success)' : undefined }}>
            {activeNow}
          </div>
          <div className="stat-card-label">Activos ahora</div>
        </div>
      </div>

      {/* Per-user breakdown */}
      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Sesiones</th>
                <th>Tiempo total</th>
                <th>Último acceso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {statsByUser.map(u => (
                <Fragment key={u.id}>
                  <tr
                    style={{ cursor: u.sessions.length > 0 ? 'pointer' : 'default' }}
                    onClick={() => u.sessions.length > 0 && setExpanded(expanded === u.id ? null : u.id)}
                  >
                    <td>
                      <div className="user-cell">
                        <div className="avatar"><UserRound size={14} /></div>
                        <strong>{u.full_name || u.email}</strong>
                      </div>
                    </td>
                    <td><span className="badge badge-accent">{u.sessions.length}</span></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {u.sessions.length > 0 ? fmtDuration(u.totalSeconds) : '—'}
                    </td>
                    <td>{fmtDate(u.last_seen_at)}</td>
                    <td style={{ width: 32, color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
                      {u.sessions.length > 0 && (expanded === u.id ? '▲' : '▼')}
                    </td>
                  </tr>
                  {expanded === u.id && u.sessions.map(s => (
                    <tr key={s.id} style={{ background: 'var(--bg-elevated)' }}>
                      <td style={{ paddingLeft: 48, fontSize: 12, color: 'var(--text-muted)' }}>
                        {fmtDate(s.started_at)}
                      </td>
                      <td colSpan="2" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {fmtDuration(s.dur)}
                        <span
                          className={`badge ${s.ended_at ? 'badge-success' : 'badge-warning'}`}
                          style={{ marginLeft: 8, fontSize: 10 }}
                        >
                          {s.ended_at ? 'cerrada' : 'activa'}
                        </span>
                      </td>
                      <td colSpan="2" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        hasta {fmtDate(s.ended_at || s.last_active_at)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ── GRUPOS ────────────────────────────────────────────────────────────────────
function GroupsTab({ company }) {
  const [groups, setGroups]           = useState([])
  const [companyUsers, setCompanyUsers] = useState([])
  const [companyBoards, setCompanyBoards] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupMembers, setGroupMembers]   = useState([])
  const [groupBoards, setGroupBoards]     = useState([])
  const [loadingGroup, setLoadingGroup]   = useState(false)
  const [showNew, setShowNew]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)
  const [newMemberIds, setNewMemberIds] = useState([])
  const [newBoardIds, setNewBoardIds] = useState([])
  const [userToAdd, setUserToAdd]   = useState('')
  const [boardToAdd, setBoardToAdd] = useState('')

  const load = async () => {
    setLoading(true)
    const [groupsRes, usersRes, boardsRes] = await Promise.all([
      supabase.from('groups').select('*').eq('company_id', company.id).order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('company_id', company.id).order('full_name'),
      supabase.from('company_dashboards').select('dashboard_id, dashboards(id, name)').eq('company_id', company.id),
    ])
    setGroups(groupsRes.data || [])
    setCompanyUsers(usersRes.data || [])
    setCompanyBoards((boardsRes.data || []).map(r => r.dashboards).filter(Boolean))
    setError(groupsRes.error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const openGroup = async (group) => {
    setSelectedGroup(group)
    setLoadingGroup(true)
    setUserToAdd('')
    setBoardToAdd('')
    const [membersRes, boardsRes] = await Promise.all([
      // Load member ids first (works even if nested FK metadata is missing)
      supabase.from('group_members').select('user_id').eq('group_id', group.id),
      supabase.from('group_dashboards').select('dashboard_id, dashboards(id, name)').eq('group_id', group.id),
    ])

    if (membersRes.error) {
      setError(membersRes.error.message)
      setGroupMembers([])
    } else {
      const memberIds = (membersRes.data || []).map(m => m.user_id).filter(Boolean)
      if (memberIds.length === 0) {
        setGroupMembers([])
      } else {
        const { data: profilesData, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', memberIds)
        if (profilesErr) {
          setError(profilesErr.message)
          setGroupMembers(memberIds.map(userId => ({ user_id: userId, profile: null })))
        } else {
          const profileById = new Map((profilesData || []).map(p => [p.id, p]))
          setGroupMembers(memberIds.map(userId => ({ user_id: userId, profile: profileById.get(userId) || null })))
        }
      }
    }

    if (boardsRes.error) {
      setError(boardsRes.error.message)
      setGroupBoards([])
    } else {
      setGroupBoards(boardsRes.data || [])
    }
    setLoadingGroup(false)
  }

  const createGroup = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const { data: authData } = await supabase.auth.getUser()
    const { data: groupRow, error } = await supabase
      .from('groups')
      .insert({ name: newName.trim(), company_id: company.id })
      .select('id')
      .single()
    if (!error && groupRow?.id && newMemberIds.length > 0) {
      const memberRows = newMemberIds.map(userId => ({ group_id: groupRow.id, user_id: userId }))
      const { error: membersErr } = await supabase.from('group_members').insert(memberRows)
      if (membersErr) { setCreating(false); setError(membersErr.message); return }
    }
    if (!error && groupRow?.id && newBoardIds.length > 0) {
      const boardRows = newBoardIds.map(dashboardId => ({ group_id: groupRow.id, dashboard_id: dashboardId, assigned_by: authData?.user?.id }))
      const { error: boardsErr } = await supabase.from('group_dashboards').insert(boardRows)
      if (boardsErr) { setCreating(false); setError(boardsErr.message); return }
    }
    setCreating(false)
    if (error) { setError(error.message); return }
    setShowNew(false)
    setNewName('')
    setNewMemberIds([])
    setNewBoardIds([])
    load()
  }

  const deleteGroup = async (group, e) => {
    e.stopPropagation()
    if (!window.confirm(`¿Eliminar "${group.name}"?`)) return
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
        <button className="btn btn-primary" onClick={() => { setShowNew(true); setNewName(''); setNewMemberIds([]); setNewBoardIds([]) }}>
          <Plus size={14} /> Nuevo grupo
        </button>
      </div>

      {error && <div className="form-error visible admin-inline-error">{error}</div>}

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
                          <span>{m.profile?.full_name || m.profile?.email || m.profiles?.full_name || m.profiles?.email || m.user_id}</span>
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
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Nuevo grupo</div>
              <button className="btn btn-ghost btn-icon" onClick={() => { setShowNew(false); setNewMemberIds([]); setNewBoardIds([]) }}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={newName} placeholder="Ej: Ventas" autoFocus
                  onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createGroup()} />
              </div>
              <div className="form-group">
                <label className="form-label">Usuarios del grupo</label>
                <div className="assigned-list" style={{ maxHeight: 140, overflow: 'auto' }}>
                  {companyUsers.length === 0 ? (
                    <div className="empty-state" style={{ padding: 10, fontSize: 12 }}>No hay usuarios de empresa</div>
                  ) : companyUsers.map(u => {
                    const checked = newMemberIds.includes(u.id)
                    return (
                      <label key={u.id} className="assigned-item" style={{ cursor: 'pointer' }}>
                        <span>{u.full_name || u.email}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setNewMemberIds(prev => checked ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tableros del grupo</label>
                <div className="assigned-list" style={{ maxHeight: 140, overflow: 'auto' }}>
                  {companyBoards.length === 0 ? (
                    <div className="empty-state" style={{ padding: 10, fontSize: 12 }}>No hay tableros de empresa</div>
                  ) : companyBoards.map(b => {
                    const checked = newBoardIds.includes(b.id)
                    return (
                      <label key={b.id} className="assigned-item" style={{ cursor: 'pointer' }}>
                        <span>{b.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setNewBoardIds(prev => checked ? prev.filter(id => id !== b.id) : [...prev, b.id])}
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowNew(false); setNewMemberIds([]); setNewBoardIds([]) }}>Cancelar</button>
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

// ── FACTURAS ──────────────────────────────────────────────────────────────────
function InvoicesTab({ company }) {
  const { isAdmin } = useAuth()
  const [invoices, setInvoices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [viewing, setViewing]     = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [form, setForm] = useState({
    file: null,
    document_number: '',
    amount: '',
    issue_date: '',
    due_date: '',
  })

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('company_invoices')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setError(error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const handleUpload = async () => {
    const file = form.file
    if (!file) { setError('Selecciona un archivo'); return }
    const documentNumber = form.document_number.trim()
    const amount = form.amount === '' ? null : Number(form.amount)
    if (amount !== null && Number.isNaN(amount)) { setError('El importe debe ser numerico'); return }
    setUploading(true)
    setError('')
    try {
      const invoiceId = crypto.randomUUID()
      const path = `${company.id}/${invoiceId}.pdf`
      const { error: storageErr } = await supabase.storage.from('invoices').upload(path, file)
      if (storageErr) throw storageErr
      const { data: { user } } = await supabase.auth.getUser()
      const { error: dbErr } = await supabase.from('company_invoices').insert({
        company_id: company.id,
        name: file.name,
        file_path: path,
        file_size: file.size,
        document_number: documentNumber || null,
        amount,
        issue_date: form.issue_date || null,
        due_date: form.due_date || null,
        uploaded_by: user?.id,
      })
      if (dbErr) throw dbErr
      setShowUpload(false)
      setForm({ file: null, document_number: '', amount: '', issue_date: '', due_date: '' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const updateStatus = async (inv, status) => {
    const { error } = await supabase.from('company_invoices').update({ status }).eq('id', inv.id)
    if (error) { setError(error.message); return }
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status } : i))
  }

  const deleteInvoice = async (invoice) => {
    if (!window.confirm(`¿Eliminar "${invoice.name}"?`)) return
    await supabase.storage.from('invoices').remove([invoice.file_path])
    await supabase.from('company_invoices').delete().eq('id', invoice.id)
    load()
  }

  return (
    <>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => { setShowUpload(true); setError('') }}>
            <Upload size={14} /> Agregar factura
          </button>
        </div>
      )}

      {error && <div className="form-error visible" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nro documento</th>
                <th>Importe</th>
                <th>Emision</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th>Tamaño</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9"><div className="table-loading"><div className="spinner" /></div></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan="9"><div className="empty-state">No hay facturas subidas todavía</div></td></tr>
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
                    <td style={{ fontSize: 12 }}>{inv.document_number || '-'}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {inv.amount === null || inv.amount === undefined ? '-' : `$ ${Number(inv.amount).toLocaleString('es-AR')}`}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.issue_date || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.due_date || '-'}</td>
                    <td>
                      {isAdmin ? (
                        <select
                          className={`badge ${st.badge}`}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                          value={inv.status}
                          onChange={e => updateStatus(inv, e.target.value)}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {inv.file_size ? (inv.file_size < 1048576 ? `${(inv.file_size / 1024).toFixed(0)} KB` : `${(inv.file_size / 1048576).toFixed(1)} MB`) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtDate(inv.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewing(inv)}>
                          <Eye size={13} /> Ver
                        </button>
                        {isAdmin && (
                          <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => deleteInvoice(inv)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && <PdfViewer invoice={viewing} onClose={() => setViewing(null)} />}

      {isAdmin && showUpload && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Agregar factura</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowUpload(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Archivo</label>
                <input className="form-input" type="file" accept="application/pdf" onChange={e => setForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Numero de documento</label>
                <input className="form-input" value={form.document_number} onChange={e => setForm(prev => ({ ...prev, document_number: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Importe</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de emision</label>
                  <input className="form-input" type="date" value={form.issue_date} onChange={e => setForm(prev => ({ ...prev, issue_date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha de vencimiento</label>
                <input className="form-input" type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpload(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Upload size={14} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PaymentsTab({ company }) {
  const { isAdmin } = useAuth()
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ file: null, payment_date: '', amount: '', invoice_id: '' })

  const invoicesById = useMemo(() => new Map(invoices.map(inv => [inv.id, inv])), [invoices])

  const load = async () => {
    setLoading(true)
    const [paymentsRes, invoicesRes] = await Promise.all([
      supabase.from('company_payments').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('company_invoices').select('id, name, document_number').eq('company_id', company.id).order('created_at', { ascending: false }),
    ])
    setPayments(paymentsRes.data || [])
    setInvoices(invoicesRes.data || [])
    setError(paymentsRes.error?.message || invoicesRes.error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const savePayment = async () => {
    if (!form.file) { setError('Selecciona un archivo de pago'); return }
    const amount = form.amount === '' ? null : Number(form.amount)
    if (amount !== null && Number.isNaN(amount)) { setError('El monto debe ser numerico'); return }

    setSaving(true)
    setError('')
    try {
      const paymentId = crypto.randomUUID()
      const path = `${company.id}/${paymentId}_payment.pdf`
      const { error: storageErr } = await supabase.storage.from('invoices').upload(path, form.file)
      if (storageErr) throw storageErr
      const { data: { user } } = await supabase.auth.getUser()
      const { error: insertErr } = await supabase.from('company_payments').insert({
        company_id: company.id,
        invoice_id: form.invoice_id || null,
        name: form.file.name,
        file_path: path,
        file_size: form.file.size,
        amount,
        payment_date: form.payment_date || null,
        uploaded_by: user?.id || null,
      })
      if (insertErr) throw insertErr
      setShowNew(false)
      setForm({ file: null, payment_date: '', amount: '', invoice_id: '' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deletePayment = async (payment) => {
    if (!window.confirm(`Eliminar pago "${payment.name}"?`)) return
    await supabase.storage.from('invoices').remove([payment.file_path])
    await supabase.from('company_payments').delete().eq('id', payment.id)
    load()
  }

  return (
    <>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => { setShowNew(true); setError('') }}>
            <Upload size={14} /> Agregar pago
          </button>
        </div>
      )}

      {error && <div className="form-error visible" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Factura relacionada</th>
                <th>Fecha de pago</th>
                <th>Monto</th>
                <th>Fecha carga</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6"><div className="table-loading"><div className="spinner" /></div></td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan="6"><div className="empty-state">No hay pagos cargados todavia</div></td></tr>
              ) : payments.map(pay => {
                const relatedInvoice = pay.invoice_id ? invoicesById.get(pay.invoice_id) : null
                return (
                  <tr key={pay.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <span>{pay.name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{relatedInvoice ? (relatedInvoice.document_number || relatedInvoice.name) : '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pay.payment_date || '-'}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{pay.amount === null || pay.amount === undefined ? '-' : `$ ${Number(pay.amount).toLocaleString('es-AR')}`}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(pay.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewing(pay)}>
                          <Eye size={13} /> Ver
                        </button>
                        {isAdmin && (
                          <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => deletePayment(pay)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && <PdfViewer invoice={viewing} onClose={() => setViewing(null)} />}

      {isAdmin && showNew && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Agregar pago</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Archivo</label>
                <input className="form-input" type="file" accept="application/pdf" onChange={e => setForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Factura relacionada</label>
                <select className="form-input" value={form.invoice_id} onChange={e => setForm(prev => ({ ...prev, invoice_id: e.target.value }))}>
                  <option value="">Sin relacionar</option>
                  {invoices.map(inv => <option key={inv.id} value={inv.id}>{inv.document_number || inv.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Fecha de pago</label>
                  <input className="form-input" type="date" value={form.payment_date} onChange={e => setForm(prev => ({ ...prev, payment_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Monto</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePayment} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Upload size={14} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── SERVICIOS ─────────────────────────────────────────────────────────────────
const emptyProjectForm = {
  name: '',
  description: '',
  budget: '',
  budget_currency: 'ARS',
  estimated_hours: '',
  status: 'en_fila',
}

const emptyProjectEntryForm = {
  title: '',
  description: '',
  assigned_to: '',
}

function ProjectsTab({ company }) {
  const { isAdmin, isCompanyOwner } = useAuth()
  const canCreateProject = isAdmin
  const canEditProject = isAdmin
  const canAddEntry = isAdmin || isCompanyOwner
  const canManageEntries = isAdmin

  const [projects, setProjects] = useState([])
  const [companyUsers, setCompanyUsers] = useState([])
  const [projectEntries, setProjectEntries] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [error, setError] = useState('')

  const [showNewProject, setShowNewProject] = useState(false)
  const [projectForm, setProjectForm] = useState(emptyProjectForm)
  const [projectSaving, setProjectSaving] = useState(false)

  const [entryForm, setEntryForm] = useState(emptyProjectEntryForm)
  const [entrySaving, setEntrySaving] = useState(false)
  const [draggedEntryId, setDraggedEntryId] = useState(null)

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )

  const usersById = useMemo(() => {
    const map = new Map()
    companyUsers.forEach(user => map.set(user.id, user))
    return map
  }, [companyUsers])

  const entriesByStatus = useMemo(() => {
    const grouped = {}
    PROJECT_STATUS_OPTIONS.forEach(option => { grouped[option.value] = [] })
    projectEntries.forEach(entry => {
      const status = grouped[entry.status] ? entry.status : 'en_fila'
      grouped[status].push(entry)
    })
    return grouped
  }, [projectEntries])

  const loadProjects = async (keepSelection = true) => {
    setLoading(true)
    const [projectsRes, usersRes] = await Promise.all([
      supabase
        .from('company_projects')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name, email, role, company_id')
        .or(`company_id.eq.${company.id},role.eq.admin`)
        .order('full_name', { ascending: true }),
    ])

    const loadedProjects = (projectsRes.data || []).map(project => ({
      ...project,
      budget_currency: project.budget_currency || 'ARS',
    }))
    const usersUniq = Array.from(
      new Map((usersRes.data || []).map(user => [user.id, user])).values()
    )
    setProjects(loadedProjects)
    setCompanyUsers(usersUniq)
    setError(projectsRes.error?.message || usersRes.error?.message || '')

    setSelectedProjectId(prev => {
      if (!loadedProjects.length) return null
      if (keepSelection && prev && loadedProjects.some(project => project.id === prev)) return prev
      return loadedProjects[0].id
    })
    setLoading(false)
  }

  const loadEntries = async (projectId) => {
    if (!projectId) {
      setProjectEntries([])
      return
    }
    setLoadingEntries(true)
    const { data, error: queryError } = await supabase
      .from('company_project_entries')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    setProjectEntries(data || [])
    setError(queryError?.message || '')
    setLoadingEntries(false)
  }

  useEffect(() => {
    loadProjects(false)
  }, [company.id])

  useEffect(() => {
    loadEntries(selectedProjectId)
  }, [selectedProjectId])

  const createProject = async () => {
    if (!canCreateProject || projectSaving) return
    const name = projectForm.name.trim()
    if (!name) { setError('El nombre del proyecto es obligatorio'); return }

    const budget = projectForm.budget === '' ? null : Number(projectForm.budget)
    const estimatedHours = projectForm.estimated_hours === '' ? null : Number(projectForm.estimated_hours)
    const budgetCurrency = projectForm.budget_currency || 'ARS'
    if (budget !== null && Number.isNaN(budget)) { setError('El presupuesto debe ser numérico'); return }
    if (estimatedHours !== null && Number.isNaN(estimatedHours)) { setError('Las horas estimadas deben ser numéricas'); return }

    setProjectSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { data, error: insertError } = await supabase
      .from('company_projects')
      .insert({
        company_id: company.id,
        name,
        description: projectForm.description.trim() || null,
        budget,
        budget_currency: budgetCurrency,
        estimated_hours: estimatedHours,
        status: projectForm.status,
        created_by: authData?.user?.id || null,
      })
      .select('id')
      .single()
    setProjectSaving(false)

    if (insertError) { setError(insertError.message); return }

    setShowNewProject(false)
    setProjectForm(emptyProjectForm)
    await loadProjects(false)
    if (data?.id) setSelectedProjectId(data.id)
  }

  const saveProjectDetail = async () => {
    if (!selectedProject || !canEditProject || projectSaving) return

    const name = selectedProject.name?.trim() || ''
    if (!name) { setError('El nombre del proyecto es obligatorio'); return }

    const budget = selectedProject.budget === '' || selectedProject.budget === null ? null : Number(selectedProject.budget)
    const estimatedHours = selectedProject.estimated_hours === '' || selectedProject.estimated_hours === null ? null : Number(selectedProject.estimated_hours)
    const budgetCurrency = selectedProject.budget_currency || 'ARS'
    if (budget !== null && Number.isNaN(budget)) { setError('El presupuesto debe ser numérico'); return }
    if (estimatedHours !== null && Number.isNaN(estimatedHours)) { setError('Las horas estimadas deben ser numéricas'); return }

    setProjectSaving(true)
    const payload = {
      name,
      description: selectedProject.description?.trim() || null,
      budget,
      budget_currency: budgetCurrency,
      estimated_hours: estimatedHours,
      status: selectedProject.status,
    }

    const { error: updateError } = await supabase
      .from('company_projects')
      .update(payload)
      .eq('id', selectedProject.id)
    setProjectSaving(false)

    if (updateError) { setError(updateError.message); return }
    loadProjects(true)
  }

  const removeProject = async (project) => {
    if (!isAdmin) return
    if (!window.confirm(`¿Eliminar proyecto "${project.name}"?`)) return
    const { error: deleteError } = await supabase.from('company_projects').delete().eq('id', project.id)
    if (deleteError) { setError(deleteError.message); return }
    loadProjects(false)
  }

  const createEntry = async () => {
    if (!selectedProject || !canAddEntry || entrySaving) return
    const title = entryForm.title.trim()
    if (!title) { setError('El título de la tarea es obligatorio'); return }
    const assignedUser = entryForm.assigned_to ? usersById.get(entryForm.assigned_to) : null

    setEntrySaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { error: insertError } = await supabase
      .from('company_project_entries')
      .insert({
        project_id: selectedProject.id,
        title,
        description: entryForm.description.trim() || null,
        assigned_to: entryForm.assigned_to || null,
        assigned_to_name: assignedUser ? (assignedUser.full_name || assignedUser.email || null) : null,
        status: 'en_fila',
        created_by: authData?.user?.id || null,
      })
    setEntrySaving(false)
    if (insertError) { setError(insertError.message); return }
    setEntryForm(emptyProjectEntryForm)
    loadEntries(selectedProject.id)
  }

  const moveEntry = async (entryId, status) => {
    if (!canManageEntries || !selectedProjectId || !entryId) return
    const { error: updateError } = await supabase
      .from('company_project_entries')
      .update({ status })
      .eq('id', entryId)
      .eq('project_id', selectedProjectId)
    if (updateError) { setError(updateError.message); return }
    setProjectEntries(prev => prev.map(entry => (
      entry.id === entryId ? { ...entry, status } : entry
    )))
  }

  const updateEntryAssignee = async (entryId, assignedTo) => {
    if (!(isAdmin || isCompanyOwner) || !selectedProjectId || !entryId) return
    const assignedUser = assignedTo ? usersById.get(assignedTo) : null
    const { error: updateError } = await supabase
      .from('company_project_entries')
      .update({
        assigned_to: assignedTo || null,
        assigned_to_name: assignedUser ? (assignedUser.full_name || assignedUser.email || null) : null,
      })
      .eq('id', entryId)
      .eq('project_id', selectedProjectId)
    if (updateError) { setError(updateError.message); return }
    setProjectEntries(prev => prev.map(entry => (
      entry.id === entryId
        ? { ...entry, assigned_to: assignedTo || null, assigned_to_name: assignedUser ? (assignedUser.full_name || assignedUser.email || null) : null }
        : entry
    )))
  }

  const removeEntry = async (entry) => {
    if (!canManageEntries || !selectedProjectId) return
    const { error: deleteError } = await supabase
      .from('company_project_entries')
      .delete()
      .eq('id', entry.id)
      .eq('project_id', selectedProjectId)
    if (deleteError) { setError(deleteError.message); return }
    setProjectEntries(prev => prev.filter(current => current.id !== entry.id))
  }

  const onDropColumn = (event, targetStatus) => {
    event.preventDefault()
    if (!canManageEntries) return
    const entryId = event.dataTransfer.getData('text/plain') || draggedEntryId
    setDraggedEntryId(null)
    if (entryId) moveEntry(entryId, targetStatus)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="boards-section-header" style={{ margin: 0, padding: 0, border: 'none' }}>
          <Kanban size={14} /> Proyectos <span className="boards-section-count">{projects.length}</span>
        </div>
        {canCreateProject && (
          <button
            className="btn btn-primary"
            onClick={() => { setShowNewProject(true); setProjectForm(emptyProjectForm); setError('') }}
          >
            <Plus size={14} /> Nuevo proyecto
          </button>
        )}
      </div>

      {error && <div className="form-error visible admin-inline-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedProject ? '280px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
        <div className="card table-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th style={{ width: 115 }}>Estado</th>
                  {isAdmin && <th style={{ width: 50 }}></th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isAdmin ? 3 : 2}><div className="table-loading"><div className="spinner" /></div></td></tr>
                ) : projects.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 3 : 2}><div className="empty-state">Sin proyectos todavía</div></td></tr>
                ) : projects.map(project => {
                  const statusMeta = PROJECT_STATUS_MAP[project.status] || PROJECT_STATUS_OPTIONS[0]
                  return (
                    <tr key={project.id} className="clickable-row" onClick={() => setSelectedProjectId(project.id)} style={{ background: selectedProjectId === project.id ? 'var(--bg-elevated)' : undefined }}>
                      <td><strong>{project.name}</strong></td>
                      <td><span className={`badge ${statusMeta.badge}`}>{statusMeta.label}</span></td>
                      {isAdmin && (
                        <td>
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ color: 'var(--danger)' }}
                            onClick={(event) => { event.stopPropagation(); removeProject(project) }}
                            title="Eliminar proyecto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selectedProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 180px 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Proyecto</label>
                  <input
                    className="form-input"
                    value={selectedProject.name || ''}
                    disabled={!canEditProject}
                    onChange={event => setProjects(prev => prev.map(project => (
                      project.id === selectedProject.id ? { ...project, name: event.target.value } : project
                    )))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Presupuesto</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedProject.budget ?? ''}
                    disabled={!canEditProject}
                    onChange={event => setProjects(prev => prev.map(project => (
                      project.id === selectedProject.id ? { ...project, budget: event.target.value } : project
                    )))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Moneda</label>
                  <select
                    className="form-input"
                    value={selectedProject.budget_currency || 'ARS'}
                    disabled={!canEditProject}
                    onChange={event => setProjects(prev => prev.map(project => (
                      project.id === selectedProject.id ? { ...project, budget_currency: event.target.value } : project
                    )))}
                  >
                    {BUDGET_CURRENCY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Horas estimadas</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.25"
                    value={selectedProject.estimated_hours ?? ''}
                    disabled={!canEditProject}
                    onChange={event => setProjects(prev => prev.map(project => (
                      project.id === selectedProject.id ? { ...project, estimated_hours: event.target.value } : project
                    )))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Estado general</label>
                  <select
                    className="form-input"
                    value={selectedProject.status || 'en_fila'}
                    disabled={!isAdmin}
                    onChange={event => setProjects(prev => prev.map(project => (
                      project.id === selectedProject.id ? { ...project, status: event.target.value } : project
                    )))}
                  >
                    {PROJECT_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                {canEditProject && (
                  <button className="btn btn-primary" onClick={saveProjectDetail} disabled={projectSaving}>
                    {projectSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
                  </button>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
                <label className="form-label">Descripción</label>
                <textarea
                  className="form-textarea"
                  value={selectedProject.description || ''}
                  disabled={!canEditProject}
                  placeholder="Breve descripción del proyecto"
                  onChange={event => setProjects(prev => prev.map(project => (
                    project.id === selectedProject.id ? { ...project, description: event.target.value } : project
                  )))}
                />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="assign-row">
                <input
                  className="form-input"
                  style={{ flex: '1 1 220px' }}
                  placeholder="Título de tarea..."
                  value={entryForm.title}
                  disabled={!canAddEntry}
                  onChange={event => setEntryForm(prev => ({ ...prev, title: event.target.value }))}
                />
                <input
                  className="form-input"
                  style={{ flex: '1 1 240px' }}
                  placeholder="Descripción corta..."
                  value={entryForm.description}
                  disabled={!canAddEntry}
                  onChange={event => setEntryForm(prev => ({ ...prev, description: event.target.value }))}
                />
                <select
                  className="form-input"
                  style={{ width: 140, fontSize: 11, height: 30 }}
                  value={entryForm.assigned_to}
                  disabled={!canAddEntry}
                  onChange={event => setEntryForm(prev => ({ ...prev, assigned_to: event.target.value }))}
                >
                  <option value="">Sin responsable</option>
                  {companyUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email}{user.role === 'admin' ? ' (Admin)' : ''}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm" onClick={createEntry} disabled={!canAddEntry || entrySaving}>
                  <Plus size={13} /> Agregar
                </button>
              </div>
            </div>

            {loadingEntries ? (
              <div className="table-loading"><div className="spinner" /></div>
            ) : (
              <div className="kanban-board">
                {PROJECT_STATUS_OPTIONS.map(column => (
                  <div
                    key={column.value}
                    className="kanban-column"
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => onDropColumn(event, column.value)}
                  >
                    <div className="kanban-column-head">
                      <span>{column.label}</span>
                      <span className="boards-section-count">{entriesByStatus[column.value]?.length || 0}</span>
                    </div>
                    <div className="kanban-column-body">
                      {(entriesByStatus[column.value] || []).map(entry => (
                        <div
                          key={entry.id}
                          className="kanban-card"
                          draggable={canManageEntries}
                          onDragStart={event => {
                            if (!canManageEntries) return
                            setDraggedEntryId(entry.id)
                            event.dataTransfer.setData('text/plain', entry.id)
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: 13 }}>{entry.title}</strong>
                            {canManageEntries && (
                              <button
                                className="btn btn-ghost btn-icon"
                                style={{ color: 'var(--danger)', padding: 4 }}
                                onClick={() => removeEntry(entry)}
                                title="Eliminar tarea"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                          {entry.description && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                              {entry.description}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>Responsable</div>
                            <select
                              className="form-input"
                              style={{ height: 24, fontSize: 10 }}
                              value={entry.assigned_to || ''}
                              disabled={!(isAdmin || isCompanyOwner)}
                              onChange={event => updateEntryAssignee(entry.id, event.target.value)}
                            >
                              <option value="">Sin responsable</option>
                              {entry.assigned_to && !usersById.get(entry.assigned_to) && (
                                <option value={entry.assigned_to}>{entry.assigned_to_name || 'Administrador'}</option>
                              )}
                              {companyUsers.map(user => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name || user.email}{user.role === 'admin' ? ' (Admin)' : ''}
                                </option>
                              ))}
                            </select>
                            {entry.assigned_to && (usersById.get(entry.assigned_to) || entry.assigned_to_name) && (
                              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                                {usersById.get(entry.assigned_to)?.full_name || usersById.get(entry.assigned_to)?.email || entry.assigned_to_name}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {canCreateProject && showNewProject && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div className="modal-title">Nuevo proyecto</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowNewProject(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-body-stack">
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input
                    className="form-input"
                    autoFocus
                    value={projectForm.name}
                    placeholder="Ej: Optimización tablero comercial"
                    onChange={event => setProjectForm(prev => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción breve</label>
                  <textarea
                    className="form-textarea"
                    value={projectForm.description}
                    placeholder="Objetivo principal del proyecto"
                    onChange={event => setProjectForm(prev => ({ ...prev, description: event.target.value }))}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 1fr 1fr', gap: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Presupuesto</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={projectForm.budget}
                      onChange={event => setProjectForm(prev => ({ ...prev, budget: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Moneda</label>
                    <select
                      className="form-input"
                      value={projectForm.budget_currency || 'ARS'}
                      onChange={event => setProjectForm(prev => ({ ...prev, budget_currency: event.target.value }))}
                    >
                      {BUDGET_CURRENCY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Horas estimadas</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.25"
                      value={projectForm.estimated_hours}
                      onChange={event => setProjectForm(prev => ({ ...prev, estimated_hours: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Estado general</label>
                    <select
                      className="form-input"
                      value={projectForm.status}
                      onChange={event => setProjectForm(prev => ({ ...prev, status: event.target.value }))}
                    >
                      {PROJECT_STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createProject} disabled={projectSaving}>
                {projectSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Plus size={14} />}
                Crear proyecto
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ServicesTab() {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="empty-state" style={{ padding: '24px 10px' }}>
        Próximamente podrás gestionar servicios desde esta pestaña
      </div>
    </div>
  )
}

// ── CONEXIONES ────────────────────────────────────────────────────────────────
const emptyConnection = { name: '', teamviewer_id: '', teamviewer_password: '' }
const emptyContact = { name: '', email: '', phone: '', sector: '' }

function ConnectionsTab({ company }) {
  const { isAdmin } = useAuth()
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyConnection)
  const [visiblePasswords, setVisiblePasswords] = useState({})
  const [copiedField, setCopiedField] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('company_connections')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    setConnections(data || [])
    setError(error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const saveConnection = async () => {
    setError('')
    const name = form.name.trim()
    const teamviewerId = form.teamviewer_id.trim()
    const teamviewerPassword = form.teamviewer_password.trim()

    if (!name) { setError('El nombre es obligatorio'); return }
    if (!teamviewerId) { setError('El ID de TeamViewer es obligatorio'); return }
    if (!teamviewerPassword) { setError('La contraseña es obligatoria'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('company_connections').insert({
      company_id: company.id,
      name,
      teamviewer_id: teamviewerId,
      teamviewer_password: teamviewerPassword,
      created_by: user?.id || null,
    })
    setSaving(false)

    if (error) { setError(error.message); return }

    setShowNew(false)
    setForm(emptyConnection)
    load()
  }

  const removeConnection = async (connection) => {
    if (!window.confirm(`¿Eliminar conexión "${connection.name}"?`)) return
    const { error } = await supabase.from('company_connections').delete().eq('id', connection.id)
    if (error) { setError(error.message); return }
    load()
  }

  const togglePassword = (id) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const copyValue = async (value, key) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(key)
      setTimeout(() => {
        setCopiedField(prev => (prev === key ? '' : prev))
      }, 1200)
    } catch {
      setError('No se pudo copiar al portapapeles')
    }
  }

  if (!isAdmin) {
    return <div className="empty-state">Solo administradores pueden gestionar conexiones</div>
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          className="btn btn-primary"
          onClick={() => { setShowNew(true); setForm(emptyConnection); setError('') }}
        >
          <Plus size={14} /> Agregar conexión
        </button>
      </div>

      {error && <div className="form-error visible" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="table-loading"><div className="spinner" /></div>
      ) : connections.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          <div className="empty-state" style={{ padding: '24px 10px' }}>
            No hay conexiones cargadas para esta empresa
          </div>
        </div>
      ) : (
        <div className="assigned-list" style={{ gap: 10 }}>
          {connections.map(conn => (
            <div key={conn.id} className="assigned-item" style={{ alignItems: 'stretch', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <strong style={{ fontSize: 14 }}>{conn.name}</strong>
                <button className="btn btn-danger btn-sm" onClick={() => removeConnection(conn)}>
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 6, minWidth: 250, flex: '1 1 250px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID TeamViewer</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: 6, fontWeight: 600, minHeight: 30, display: 'inline-flex', alignItems: 'center' }}>
                      {conn.teamviewer_id}
                    </code>
                    <button className="btn btn-secondary btn-sm" onClick={() => copyValue(conn.teamviewer_id, `${conn.id}-id`)}>
                      {copiedField === `${conn.id}-id` ? <Check size={13} /> : <Copy size={13} />}
                      {copiedField === `${conn.id}-id` ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6, minWidth: 250, flex: '1 1 250px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Contraseña</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <code style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: 6, minHeight: 30, display: 'inline-flex', alignItems: 'center' }}>
                      {visiblePasswords[conn.id] ? conn.teamviewer_password : '********'}
                    </code>
                    <button className="btn btn-secondary btn-sm" onClick={() => togglePassword(conn.id)}>
                      <Eye size={13} /> {visiblePasswords[conn.id] ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => copyValue(conn.teamviewer_password, `${conn.id}-pass`)}>
                      {copiedField === `${conn.id}-pass` ? <Check size={13} /> : <Copy size={13} />}
                      {copiedField === `${conn.id}-pass` ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">Agregar conexión</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre del equipo</label>
                <input
                  className="form-input"
                  autoFocus
                  value={form.name}
                  placeholder="Ej: PC Oficina 1"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">ID TeamViewer</label>
                <input
                  className="form-input"
                  value={form.teamviewer_id}
                  placeholder="Ej: 123 456 789"
                  onChange={e => setForm(f => ({ ...f, teamviewer_id: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contraseña</label>
                <input
                  className="form-input"
                  value={form.teamviewer_password}
                  placeholder="Contraseña de conexión"
                  onChange={e => setForm(f => ({ ...f, teamviewer_password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveConnection()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveConnection} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Plus size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ContactsTab({ company }) {
  const { isAdmin } = useAuth()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyContact)
  const [copiedField, setCopiedField] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('company_contacts')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    setContacts(data || [])
    setError(queryError?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const copyValue = async (value, key) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(key)
      setTimeout(() => {
        setCopiedField(prev => (prev === key ? '' : prev))
      }, 1200)
    } catch {
      setError('No se pudo copiar al portapapeles')
    }
  }

  const saveContact = async () => {
    setError('')
    const name = form.name.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()
    const sector = form.sector.trim()

    if (!name) { setError('El nombre es obligatorio'); return }
    if (!email) { setError('El email es obligatorio'); return }
    if (!sector) { setError('El sector es obligatorio'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('company_contacts').insert({
      company_id: company.id,
      name,
      email,
      phone: phone || null,
      sector,
      created_by: user?.id || null,
    })
    setSaving(false)

    if (insertError) { setError(insertError.message); return }
    setShowNew(false)
    setForm(emptyContact)
    load()
  }

  const removeContact = async (contact) => {
    if (!window.confirm(`¿Eliminar contacto "${contact.name}"?`)) return
    const { error: deleteError } = await supabase.from('company_contacts').delete().eq('id', contact.id)
    if (deleteError) { setError(deleteError.message); return }
    load()
  }

  if (!isAdmin) {
    return <div className="empty-state">Solo administradores pueden gestionar contactos</div>
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          className="btn btn-primary"
          onClick={() => { setShowNew(true); setForm(emptyContact); setError('') }}
        >
          <Plus size={14} /> Agregar contacto
        </button>
      </div>

      {error && <div className="form-error visible" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="table-loading"><div className="spinner" /></div>
      ) : contacts.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          <div className="empty-state" style={{ padding: '24px 10px' }}>
            No hay contactos cargados para esta empresa
          </div>
        </div>
      ) : (
        <div className="assigned-list" style={{ gap: 10 }}>
          {contacts.map(contact => (
            <div key={contact.id} className="assigned-item" style={{ alignItems: 'stretch', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <strong style={{ fontSize: 14 }}>{contact.name}</strong>
                <button className="btn btn-danger btn-sm" onClick={() => removeContact(contact)}>
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 6, minWidth: 240, flex: '1 1 240px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: 6, minHeight: 30, display: 'inline-flex', alignItems: 'center' }}>
                      {contact.email}
                    </code>
                    <button className="btn btn-secondary btn-sm" onClick={() => copyValue(contact.email, `${contact.id}-email`)}>
                      {copiedField === `${contact.id}-email` ? <Check size={13} /> : <Copy size={13} />}
                      {copiedField === `${contact.id}-email` ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6, minWidth: 220, flex: '1 1 220px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Teléfono</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: 6, minHeight: 30, display: 'inline-flex', alignItems: 'center' }}>
                      {contact.phone || '-'}
                    </code>
                    {contact.phone && (
                      <button className="btn btn-secondary btn-sm" onClick={() => copyValue(contact.phone, `${contact.id}-phone`)}>
                        {copiedField === `${contact.id}-phone` ? <Check size={13} /> : <Copy size={13} />}
                        {copiedField === `${contact.id}-phone` ? 'Copiado' : 'Copiar'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6, minWidth: 180, flex: '1 1 180px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sector</span>
                  <code style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: 6, minHeight: 30, display: 'inline-flex', alignItems: 'center' }}>
                    {contact.sector}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">Agregar contacto</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input
                  className="form-input"
                  autoFocus
                  value={form.name}
                  placeholder="Ej: Juan Pérez"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={form.email}
                  placeholder="juan@empresa.com"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input
                  className="form-input"
                  value={form.phone}
                  placeholder="+54 9 11 1234 5678"
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sector</label>
                <input
                  className="form-input"
                  value={form.sector}
                  placeholder="Ej: Operaciones"
                  onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveContact()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveContact} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Plus size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── PRINCIPAL ─────────────────────────────────────────────────────────────────
export default function AdminCompanyDetail({ company, onBack, initialTab = 'users' }) {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState(initialTab)

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button className="btn btn-ghost btn-icon" onClick={onBack} title="Volver">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <div className="page-header-title">{company.name}</div>
            <div className="page-header-sub">Gestión de empresa</div>
          </div>
        </div>
      </div>

      <div className="company-tabs">
        <button className={`company-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          <Users size={20} />
          <span>Usuarios</span>
        </button>
        <button className={`company-tab ${tab === 'boards' ? 'active' : ''}`} onClick={() => setTab('boards')}>
          <LayoutDashboard size={20} />
          <span>Tableros</span>
        </button>
        <button className={`company-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          <BarChart2 size={20} />
          <span>Estadísticas</span>
        </button>
        <button className={`company-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>
          <FolderOpen size={20} />
          <span>Grupos</span>
        </button>
        <button className={`company-tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>
          <Receipt size={20} />
          <span>Facturas</span>
        </button>
        <button className={`company-tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>
          <Receipt size={20} />
          <span>Pagos</span>
        </button>
        <button className={`company-tab ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
          <Kanban size={20} />
          <span>Proyectos</span>
        </button>
        <button className={`company-tab ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>
          <Briefcase size={20} />
          <span>Servicios</span>
        </button>
        {isAdmin && (
          <button className={`company-tab ${tab === 'connections' ? 'active' : ''}`} onClick={() => setTab('connections')}>
            <Monitor size={20} />
            <span>Conexiones</span>
          </button>
        )}
        {isAdmin && (
          <button className={`company-tab ${tab === 'contacts' ? 'active' : ''}`} onClick={() => setTab('contacts')}>
            <UserRound size={20} />
            <span>Contactos</span>
          </button>
        )}
        {isAdmin && (
          <button className={`company-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
            <CircleHelp size={20} />
            <span>Información</span>
          </button>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        {tab === 'users'    && <UsersTab    company={company} />}
        {tab === 'boards'   && <BoardsTab   company={company} />}
        {tab === 'stats'    && <StatsTab    company={company} />}
        {tab === 'groups'   && <GroupsTab   company={company} />}
        {tab === 'invoices' && <InvoicesTab company={company} />}
        {tab === 'payments' && <PaymentsTab company={company} />}
        {tab === 'projects' && <ProjectsTab company={company} />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'connections' && <ConnectionsTab company={company} />}
        {tab === 'contacts' && <ContactsTab company={company} />}
        {tab === 'info'     && <CompanyInfoPanel company={company} />}
      </div>
    </>
  )
}

