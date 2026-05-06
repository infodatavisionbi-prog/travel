import { useEffect, useState } from 'react'
import { Building2, ChevronRight, LayoutDashboard, Pause, Play, Plus, Trash2, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(v))
}

export default function AdminCompanies({ onSelect }) {
  const [companies, setCompanies]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [showNew, setShowNew]           = useState(false)
  const [newName, setNewName]           = useState('')
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]   = useState('')

  const load = async () => {
    setLoading(true)
    const [companiesRes, profilesRes, boardsRes] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('profiles').select('company_id').not('company_id', 'is', null),
      supabase.from('company_dashboards').select('company_id'),
    ])

    const userCounts  = {}
    const boardCounts = {}
    ;(profilesRes.data || []).forEach(p => { userCounts[p.company_id]  = (userCounts[p.company_id]  || 0) + 1 })
    ;(boardsRes.data  || []).forEach(b => { boardCounts[b.company_id] = (boardCounts[b.company_id] || 0) + 1 })

    setCompanies((companiesRes.data || []).map(c => ({
      ...c,
      userCount:  userCounts[c.id]  || 0,
      boardCount: boardCounts[c.id] || 0,
    })))
    setError(companiesRes.error?.message || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const togglePause = async (company, e) => {
    e.stopPropagation()
    const { error } = await supabase
      .from('companies')
      .update({ paused: !company.paused })
      .eq('id', company.id)
    if (error) { setError(error.message); return }
    load()
  }

  const deleteCompany = async (company, e) => {
    e.stopPropagation()
    if (!window.confirm(`¿Eliminar "${company.name}"? Los usuarios y tableros asociados no se eliminarán.`)) return
    setError('')
    const { error } = await supabase.from('companies').delete().eq('id', company.id)
    if (error) { setError(error.message); return }
    load()
  }

  const createCompany = async () => {
    if (!newName.trim()) { setCreateError('El nombre es obligatorio'); return }
    setCreating(true)
    setCreateError('')
    const { error } = await supabase.from('companies').insert({ name: newName.trim() })
    setCreating(false)
    if (error) { setCreateError(error.message); return }
    setShowNew(false)
    setNewName('')
    load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title">Empresas</div>
          <div className="page-header-sub">Gestioná empresas y sus accesos a tableros</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowNew(true); setNewName(''); setCreateError('') }}
        >
          <Plus size={15} /> Nueva empresa
        </button>
      </div>

      <div className="card table-card">
        {error && <div className="form-error visible admin-inline-error">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Usuarios</th>
                <th>Tableros</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6"><div className="table-loading"><div className="spinner" /></div></td></tr>
              ) : companies.length === 0 ? (
                <tr><td colSpan="6"><div className="empty-state">No hay empresas todavía</div></td></tr>
              ) : companies.map(c => (
                <tr key={c.id} className="clickable-row" onClick={() => onSelect(c)}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar"><Building2 size={14} /></div>
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>
                    {c.paused
                      ? <span className="badge badge-danger">Pausada</span>
                      : <span className="badge badge-success">Activa</span>
                    }
                  </td>
                  <td>
                    <span className="badge badge-accent">
                      <Users size={11} style={{ marginRight: 3 }} />
                      {c.userCount}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-warning">
                      <LayoutDashboard size={11} style={{ marginRight: 3 }} />
                      {c.boardCount}
                    </span>
                  </td>
                  <td>{formatDate(c.created_at)}</td>
                  <td style={{ width: 96, textAlign: 'right' }}>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={(e) => togglePause(c, e)}
                        title={c.paused ? 'Reanudar empresa' : 'Pausar empresa'}
                        style={{ color: c.paused ? 'var(--success)' : 'var(--warning)' }}
                      >
                        {c.paused ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={(e) => deleteCompany(c, e)}
                        title="Eliminar empresa"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Nueva empresa</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre de la empresa</label>
                <input
                  className="form-input"
                  value={newName}
                  placeholder="Ej: Acme S.A."
                  autoFocus
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCompany()}
                />
              </div>
              {createError && <div className="form-error visible" style={{ marginTop: 10 }}>{createError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createCompany} disabled={creating}>
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
