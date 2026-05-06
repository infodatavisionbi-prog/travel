import { useEffect, useMemo, useState } from 'react'
import { Building2, Edit3, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useLang } from '../context/LanguageContext.jsx'
import { extractPowerBiReportIdentifiers } from '../lib/powerbiUrl.js'

const emptyForm = { name: '', embed_url: '', description: '', company_id: '' }

function extractEmbedUrl(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/src=["']([^"']+)["']/)
  if (match) return match[1].replace(/&amp;/g, '&').trim()
  if (trimmed.startsWith('http')) return trimmed.replace(/&amp;/g, '&')
  return trimmed
}

function isValidPowerBiUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('powerbi.com')
  } catch {
    return false
  }
}

export default function AdminDashboards() {
  const { t } = useLang()
  const [dashboards, setDashboards] = useState([])
  const [companies, setCompanies]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState(emptyForm)
  const [formError, setFormError]   = useState('')
  const [filterCompany, setFilterCompany] = useState('')

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [boardsRes, companiesRes, userBoardsRes, groupBoardsRes, groupMembersRes] = await Promise.all([
        supabase
          .from('dashboards')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('companies').select('id, name').order('name'),
        supabase.from('user_dashboards').select('dashboard_id, user_id'),
        supabase.from('group_dashboards').select('dashboard_id, group_id'),
        supabase.from('group_members').select('group_id, user_id'),
      ])
      if (boardsRes.error) throw boardsRes.error
      if (companiesRes.error) throw companiesRes.error
      if (userBoardsRes.error) throw userBoardsRes.error
      if (groupBoardsRes.error) throw groupBoardsRes.error
      if (groupMembersRes.error) throw groupMembersRes.error

      const usersByBoard = new Map()

      ;(userBoardsRes.data || []).forEach(row => {
        if (!usersByBoard.has(row.dashboard_id)) usersByBoard.set(row.dashboard_id, new Set())
        usersByBoard.get(row.dashboard_id).add(row.user_id)
      })

      const membersByGroup = new Map()
      ;(groupMembersRes.data || []).forEach(row => {
        if (!membersByGroup.has(row.group_id)) membersByGroup.set(row.group_id, new Set())
        membersByGroup.get(row.group_id).add(row.user_id)
      })

      ;(groupBoardsRes.data || []).forEach(row => {
        if (!usersByBoard.has(row.dashboard_id)) usersByBoard.set(row.dashboard_id, new Set())
        const boardUsers = usersByBoard.get(row.dashboard_id)
        const groupUsers = membersByGroup.get(row.group_id)
        if (!groupUsers) return
        groupUsers.forEach(userId => boardUsers.add(userId))
      })

      setDashboards((boardsRes.data || []).map(board => ({
        ...board,
        assigned_users_count: usersByBoard.get(board.id)?.size || 0,
      })))
      setCompanies(companiesRes.data || [])
    } catch (err) {
      setLoadError(err.message || 'Error cargando tableros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Agrupar por empresa: empresas ordenadas alfa, sin empresa al final
  const grouped = useMemo(() => {
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]))
    const map = {}
    dashboards.forEach(board => {
      const key  = board.company_id || '__none__'
      const name = (board.company_id && companyMap[board.company_id]) || 'Sin empresa'
      if (!map[key]) map[key] = { name, boards: [] }
      map[key].boards.push(board)
    })
    return Object.entries(map).sort(([ka], [kb]) => {
      if (ka === '__none__') return 1
      if (kb === '__none__') return -1
      return map[ka].name.localeCompare(map[kb].name)
    })
  }, [dashboards])

  const openNew = () => {
    setEditing({ id: null }); setForm(emptyForm); setFormError('')
  }

  const openEdit = (board) => {
    setEditing(board)
    setForm({
      name:        board.name        || '',
      embed_url:   board.embed_url   || '',
      description: board.description || '',
      company_id:  board.company_id  || '',
    })
    setFormError('')
  }

  const save = async () => {
    setFormError('')
    const name     = form.name.trim()
    const embedUrl = form.embed_url.trim()

    if (!name)     { setFormError('El nombre es obligatorio'); return }
    if (!embedUrl) { setFormError('La URL de Power BI es obligatoria'); return }
    if (!embedUrl.startsWith('https://')) {
      setFormError('La URL debe comenzar con https://')
      return
    }

    setSaving(true)
    const { reportId, groupId } = extractPowerBiReportIdentifiers(embedUrl)
    const payload = {
      name,
      embed_url:   embedUrl,
      description: form.description.trim() || null,
      company_id:  form.company_id || null,
      report_id: reportId,
      group_id: groupId,
    }

    try {
      let error
      if (editing.id) {
        ;({ error } = await supabase.from('dashboards').update(payload).eq('id', editing.id))
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        ;({ error } = await supabase.from('dashboards').insert({ ...payload, created_by: user?.id }))
      }
      if (error) throw error
      setEditing(null)
      setForm(emptyForm)
      load()
    } catch (err) {
      setFormError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!window.confirm(t('common.confirm_delete'))) return
    const { error } = await supabase.from('dashboards').delete().eq('id', id)
    if (error) setFormError(error.message)
    else load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title">{t('admin.boards.title')}</div>
          <div className="page-header-sub">{t('admin.boards.subtitle')}</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={15} /> {t('admin.boards.new')}
        </button>
      </div>

      {loadError && <div className="form-error visible" style={{ marginBottom: 16 }}>{loadError}</div>}

      {!loading && !loadError && companies.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <select
            className="form-input"
            style={{ maxWidth: 240 }}
            value={filterCompany}
            onChange={e => setFilterCompany(e.target.value)}
          >
            <option value="">Todas las empresas</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="__none__">Sin empresa</option>
          </select>
          {filterCompany && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFilterCompany('')}
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="card table-loading"><div className="spinner" /></div>
      ) : !loadError && dashboards.length === 0 ? (
        <div className="empty-state page-empty">{t('admin.boards.empty')}</div>
      ) : !loadError ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {grouped.filter(([key]) => !filterCompany || key === filterCompany).map(([key, { name, boards }]) => (
            <div key={key}>
              <div className="boards-section-header">
                <Building2 size={13} />
                {name}
                <span className="boards-section-count">{boards.length}</span>
              </div>
              <div className="boards-grid">
                {boards.map(board => (
                  <article className="board-card" key={board.id}>
                    <div className="board-card-main">
                      <div>
                        <h3>{board.name}</h3>
                        {board.description && <p>{board.description}</p>}
                      </div>
                      <span className="badge badge-accent">
                        {board.assigned_users_count || 0} {t('admin.boards.assigned')}
                      </span>
                    </div>
                    <div className="board-url">{board.embed_url}</div>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(board)}>
                        <Edit3 size={13} /> {t('admin.boards.edit')}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(board.id)}>
                        <Trash2 size={13} /> {t('admin.boards.delete')}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {editing && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">
                {editing.id ? t('admin.boards.edit') : t('admin.boards.new')}
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditing(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('admin.boards.name')}</label>
                <input
                  className="form-input"
                  value={form.name}
                  placeholder={t('admin.boards.name_placeholder')}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Empresa</label>
                <select
                  className="form-input"
                  value={form.company_id}
                  onChange={e => setForm({ ...form, company_id: e.target.value })}
                >
                  <option value="">Sin empresa</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t('admin.boards.embed_url')}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    — podés pegar la URL o el código iframe completo
                  </span>
                </label>
                <textarea
                  className="form-input form-textarea"
                  value={form.embed_url}
                  placeholder={t('admin.boards.url_hint')}
                  onChange={e => setForm({ ...form, embed_url: extractEmbedUrl(e.target.value) })}
                />
                {isValidPowerBiUrl(form.embed_url) && (
                  <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>
                    ✓ URL detectada correctamente
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">{t('admin.boards.description')}</label>
                <input
                  className="form-input"
                  value={form.description}
                  placeholder={t('admin.boards.desc_placeholder')}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {formError && <div className="form-error visible">{formError}</div>}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving && <span className="spinner" style={{ width: 14, height: 14 }} />}
                {t('admin.boards.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
