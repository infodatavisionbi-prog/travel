import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertCircle, BarChart2, CheckCheck, ChevronRight, Clock,
  Edit, GripVertical, Loader2, Mail, MailCheck, MousePointerClick,
  Pause, Play, Plus, RefreshCw, Send, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'

/* ── helpers ── */
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'))
const fmtPct = (n) => (n == null ? '—' : `${n}%`)
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const SEQ_STATUS_META = {
  draft:  { label: 'Borrador', color: '#8696a0', bg: 'rgba(134,150,160,0.12)' },
  active: { label: 'Activa',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  paused: { label: 'Pausada',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

const LOG_COLOR = { sent: '#3b82f6', opened: '#22c55e', clicked: '#a855f7', failed: '#ef4444', pending: '#f59e0b' }

function SeqBadge({ status }) {
  const m = SEQ_STATUS_META[status] || SEQ_STATUS_META.draft
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600, color: m.color, background: m.bg }}>{m.label}</span>
}

function LogBadge({ status }) {
  const c = LOG_COLOR[status] || '#8696a0'
  return <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600, color: c, background: `${c}18` }}>{status}</span>
}

const STEP_DEFAULTS = { subject: '', body: '', delay_days: 1, delay_hours: 0, channel: 'email', step_order: 1 }

/* ═══════════════════════════════════════════════════════════════ */

export default function SequencesPage() {
  const [sequences, setSequences]       = useState([])
  const [selectedId, setSelectedId]     = useState(null)
  const [seq, setSeq]                   = useState(null)
  const [contacts, setContacts]         = useState([])
  const [activity, setActivity]         = useState([])
  const [leads, setLeads]               = useState([])
  const [accounts, setAccounts]         = useState([])
  const [tab, setTab]                   = useState('pasos')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  /* modals */
  const [showNewSeq, setShowNewSeq]     = useState(false)
  const [seqForm, setSeqForm]           = useState({ name: '', description: '' })
  const [showStep, setShowStep]         = useState(false)
  const [stepForm, setStepForm]         = useState(STEP_DEFAULTS)
  const [editingStepId, setEditingStepId] = useState(null)
  const [showEnroll, setShowEnroll]     = useState(false)
  const [enrollSearch, setEnrollSearch] = useState('')
  const [enrollIds, setEnrollIds]       = useState(new Set())
  const [enrollAccountId, setEnrollAccountId] = useState('')

  const run = async (fn) => {
    setLoading(true); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  /* ── loaders ── */
  const loadList = useCallback(async () => {
    const d = await apiFetch('/sequences')
    const list = Array.isArray(d) ? d : []
    setSequences(list)
    if (list.length && !selectedId) setSelectedId(list[0].id)
  }, [])

  const loadSeq = useCallback(async (id) => {
    if (!id) return
    const [s, c, a] = await Promise.all([
      apiFetch(`/sequences/${id}`),
      apiFetch(`/sequences/${id}/contacts`).catch(() => ({ contacts: [] })),
      apiFetch(`/sequences/${id}/activity?limit=50`).catch(() => []),
    ])
    setSeq(s)
    setContacts(Array.isArray(c?.contacts) ? c.contacts : Array.isArray(c) ? c : [])
    setActivity(Array.isArray(a) ? a : [])
  }, [])

  useEffect(() => { run(loadList) }, [])
  useEffect(() => { if (selectedId) run(() => loadSeq(selectedId)) }, [selectedId])

  /* ── sequence actions ── */
  const createSeq = () => run(async () => {
    if (!seqForm.name.trim()) throw new Error('El nombre es requerido')
    await apiFetch('/sequences', { method: 'POST', body: JSON.stringify({ name: seqForm.name.trim(), description: seqForm.description.trim() }) })
    setShowNewSeq(false); setSeqForm({ name: '', description: '' })
    await loadList()
  })

  const deleteSeq = (id) => run(async () => {
    if (!confirm('¿Eliminar esta campaña y todos sus datos?')) return
    await apiFetch(`/sequences/${id}`, { method: 'DELETE' })
    setSelectedId(null); setSeq(null)
    await loadList()
  })

  const toggleStatus = () => run(async () => {
    if (!seq) return
    const next = seq.status === 'active' ? 'paused' : 'active'
    await apiFetch(`/sequences/${seq.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) })
    await loadSeq(seq.id)
    await loadList()
  })

  /* ── step actions ── */
  const openNewStep = () => {
    const order = (seq?.steps?.length || 0) + 1
    setStepForm({ ...STEP_DEFAULTS, step_order: order })
    setEditingStepId(null)
    setShowStep(true)
  }

  const openEditStep = (step) => {
    setStepForm({ subject: step.subject || '', body: step.body || '', delay_days: step.delay_days || 0, delay_hours: step.delay_hours || 0, channel: step.channel || 'email', step_order: step.step_order || 1 })
    setEditingStepId(step.id)
    setShowStep(true)
  }

  const saveStep = () => run(async () => {
    if (!stepForm.subject.trim()) throw new Error('El asunto es requerido')
    const payload = { ...stepForm, delay_days: Number(stepForm.delay_days), delay_hours: Number(stepForm.delay_hours || 0), step_order: Number(stepForm.step_order) }
    if (editingStepId) {
      await apiFetch(`/sequences/${seq.id}/steps/${editingStepId}`, { method: 'PUT', body: JSON.stringify(payload) })
    } else {
      await apiFetch(`/sequences/${seq.id}/steps`, { method: 'POST', body: JSON.stringify(payload) })
    }
    setShowStep(false)
    await loadSeq(seq.id)
  })

  const deleteStep = (stepId) => run(async () => {
    if (!confirm('¿Eliminar este paso?')) return
    await apiFetch(`/sequences/${seq.id}/steps/${stepId}`, { method: 'DELETE' })
    await loadSeq(seq.id)
  })

  /* ── enroll ── */
  const openEnroll = async () => {
    setEnrollIds(new Set()); setEnrollSearch('')
    const [l, a] = await Promise.all([
      apiFetch('/leads?limit=500').catch(() => []),
      apiFetch('/email-accounts').catch(() => []),
    ])
    setLeads(Array.isArray(l) ? l : [])
    setAccounts(Array.isArray(a) ? a : [])
    if (a?.length) setEnrollAccountId(String(a[0].id))
    setShowEnroll(true)
  }

  const doEnroll = () => run(async () => {
    if (!enrollIds.size) throw new Error('Seleccioná al menos un lead')
    await apiFetch(`/sequences/${seq.id}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ lead_ids: [...enrollIds], account_id: Number(enrollAccountId) || null }),
    })
    setShowEnroll(false)
    await loadSeq(seq.id)
  })

  const processNow = () => run(async () => {
    await apiFetch(`/sequences/${seq.id}/process`, { method: 'POST' })
    await loadSeq(seq.id)
  })

  const unenroll = (contactId) => run(async () => {
    await apiFetch(`/sequences/${seq.id}/contacts/${contactId}`, { method: 'DELETE' })
    await loadSeq(seq.id)
  })

  /* ── filtered leads for enroll modal ── */
  const enrolledLeadIds = useMemo(() => new Set(contacts.map(c => c.lead_id)), [contacts])
  const filteredLeads = useMemo(() => {
    const q = enrollSearch.toLowerCase()
    return leads.filter(l => !enrolledLeadIds.has(l.id) && (l.name?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)))
  }, [leads, enrollSearch, enrolledLeadIds])

  const selectedSeqMeta = sequences.find(s => s.id === selectedId)

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <section style={{ padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Secuencias de email</h1>
        <button className="btn btn-primary" onClick={() => setShowNewSeq(true)} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Plus size={14} /> Nueva campaña
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><AlertCircle size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left — sequence list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Campañas ({sequences.length})
          </div>
          {sequences.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin campañas</div>
          )}
          {sequences.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{ display: 'block', width: '100%', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: selectedId === s.id ? 'var(--accent-soft)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: selectedId === s.id ? '3px solid var(--accent)' : '3px solid transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{s.name}</span>
                <SeqBadge status={s.status} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                <span>{s.step_count || 0} pasos</span>
                <span>{s.total_contacts || 0} contactos</span>
              </div>
            </button>
          ))}
        </div>

        {/* Right — sequence detail */}
        {!seq && !loading && (
          <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            {sequences.length ? 'Seleccioná una campaña' : 'Creá tu primera campaña de email'}
          </div>
        )}
        {loading && <div className="card" style={{ padding: 60, textAlign: 'center' }}><Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>}

        {seq && !loading && (
          <div>
            {/* Seq header */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{seq.name}</div>
                  {seq.description && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{seq.description}</div>}
                </div>
                <SeqBadge status={seq.status} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={toggleStatus} disabled={loading} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                    {seq.status === 'active' ? <><Pause size={12} /> Pausar</> : <><Play size={12} /> Activar</>}
                  </button>
                  <button className="btn btn-secondary" onClick={processNow} disabled={loading} title="Procesar envíos ahora" style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                    <Send size={12} /> Procesar
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => deleteSeq(seq.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Quick stats */}
              <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {[
                  { label: 'Enviados',  val: fmt(seq.sent || 0),               icon: Send,              color: '#0ea5e9' },
                  { label: 'Abiertos',  val: fmt(seq.opened || 0),             icon: MailCheck,         color: '#22c55e' },
                  { label: 'Clics',     val: fmt(seq.clicked || 0),            icon: MousePointerClick, color: '#a855f7' },
                  { label: 'Apertura',  val: fmtPct(seq.open_rate || 0),       icon: BarChart2,         color: '#f59e0b' },
                  { label: 'Contactos', val: fmt(seq.total_contacts || 0),     icon: Users,             color: '#3b82f6' },
                ].map(({ label, val, icon: Icon, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Icon size={14} color={color} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="company-tabs" style={{ marginBottom: 12 }}>
              {[['pasos', 'Pasos', Mail], ['contactos', 'Contactos', Users], ['actividad', 'Actividad', Activity]].map(([id, label, Icon]) => (
                <button key={id} className={`company-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                  <Icon size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />{label}
                </button>
              ))}
            </div>

            {/* ── PASOS ── */}
            {tab === 'pasos' && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Pasos de la secuencia</span>
                  <button className="btn btn-primary btn-sm" onClick={openNewStep} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                    <Plus size={12} /> Agregar paso
                  </button>
                </div>
                {(!seq.steps || seq.steps.length === 0) && (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Sin pasos. Agregá el primer email de la secuencia.
                  </div>
                )}
                {(seq.steps || []).sort((a, b) => a.step_order - b.step_order).map((step, i) => (
                  <div key={step.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.subject || '(sin asunto)'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> {step.delay_days || 0}d {step.delay_hours || 0}h de espera
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Mail size={10} /> {step.channel || 'email'}
                        </span>
                        {step.sent > 0 && <span><Send size={10} /> {step.sent} enviados</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditStep(step)} style={{ fontSize: 11 }}><Edit size={11} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteStep(step.id)} style={{ fontSize: 11 }}><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── CONTACTOS ── */}
            {tab === 'contactos' && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{contacts.length} contactos enrolados</span>
                  <button className="btn btn-primary btn-sm" onClick={openEnroll} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                    <UserPlus size={12} /> Enrolar leads
                  </button>
                </div>
                {contacts.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin contactos enrolados</div>}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Email</th><th>Nombre</th><th>Estado</th><th>Paso actual</th><th>Próximo envío</th><th></th></tr></thead>
                    <tbody>
                      {contacts.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.email}</td>
                          <td>{c.name || '—'}</td>
                          <td><LogBadge status={c.status} /></td>
                          <td>{c.current_step ?? '—'}</td>
                          <td style={{ fontSize: 12 }}>{fmtDate(c.next_send_at)}</td>
                          <td>
                            <button className="btn btn-danger btn-sm" onClick={() => unenroll(c.id)} style={{ fontSize: 11 }}><X size={11} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ACTIVIDAD ── */}
            {tab === 'actividad' && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Últimas actividades</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => run(() => loadSeq(seq.id))} style={{ fontSize: 11 }}><RefreshCw size={11} /></button>
                </div>
                {activity.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin actividad registrada</div>}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Email</th><th>Asunto</th><th>Estado</th><th>Enviado</th><th>Abierto</th></tr></thead>
                    <tbody>
                      {activity.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.to_email}</td>
                          <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.subject || '—'}</td>
                          <td><LogBadge status={a.status} /></td>
                          <td style={{ fontSize: 12 }}>{fmtDate(a.sent_at)}</td>
                          <td style={{ fontSize: 12 }}>{fmtDate(a.opened_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: nueva secuencia ── */}
      {showNewSeq && (
        <div className="modal-overlay open" onClick={() => setShowNewSeq(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Nueva campaña de email</h3>
              <button onClick={() => setShowNewSeq(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div className="form-group">
                <label>Nombre *</label>
                <input className="form-input" placeholder="Ej: Onboarding nuevos leads" value={seqForm.name} onChange={e => setSeqForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Descripción (opcional)</label>
                <textarea className="form-input" rows={2} placeholder="Objetivo de esta campaña…" value={seqForm.description} onChange={e => setSeqForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewSeq(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createSeq} disabled={loading} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {loading && <Loader2 size={13} className="animate-spin" />} Crear campaña
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: paso ── */}
      {showStep && (
        <div className="modal-overlay open" onClick={() => setShowStep(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{editingStepId ? 'Editar paso' : 'Nuevo paso'}</h3>
              <button onClick={() => setShowStep(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Espera (días)</label>
                  <input className="form-input" type="number" min="0" value={stepForm.delay_days} onChange={e => setStepForm(f => ({ ...f, delay_days: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Espera (horas)</label>
                  <input className="form-input" type="number" min="0" max="23" value={stepForm.delay_hours} onChange={e => setStepForm(f => ({ ...f, delay_hours: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Canal</label>
                  <select className="form-select" value={stepForm.channel} onChange={e => setStepForm(f => ({ ...f, channel: e.target.value }))}>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Asunto *</label>
                <input className="form-input" placeholder="Asunto del email" value={stepForm.subject} onChange={e => setStepForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Cuerpo del mensaje</label>
                <textarea
                  className="form-input"
                  rows={8}
                  placeholder={"Hola {{name}},\n\nEscribí tu mensaje aquí.\n\nVariables disponibles: {{name}}, {{email}}, {{company}}"}
                  value={stepForm.body}
                  onChange={e => setStepForm(f => ({ ...f, body: e.target.value }))}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowStep(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveStep} disabled={loading} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {loading && <Loader2 size={13} className="animate-spin" />} Guardar paso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: enrolar leads ── */}
      {showEnroll && (
        <div className="modal-overlay open" onClick={() => setShowEnroll(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Enrolar leads — {seq?.name}</h3>
              <button onClick={() => setShowEnroll(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              {accounts.length > 0 && (
                <div className="form-group">
                  <label>Cuenta de email remitente</label>
                  <select className="form-select" value={enrollAccountId} onChange={e => setEnrollAccountId(e.target.value)}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.from_email})</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <input className="form-input" placeholder="Buscar lead…" value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{enrollIds.size} seleccionados</span>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {filteredLeads.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin leads disponibles</div>}
                {filteredLeads.map(l => (
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={enrollIds.has(l.id)} onChange={() => setEnrollIds(prev => { const n = new Set(prev); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{l.name || l.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.email}{l.company ? ` · ${l.company}` : ''}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setEnrollIds(new Set(filteredLeads.map(l => l.id))) }}>Seleccionar todos</button>
              <button className="btn btn-primary" onClick={doEnroll} disabled={loading || !enrollIds.size} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {loading && <Loader2 size={13} className="animate-spin" />} Enrolar {enrollIds.size > 0 ? `(${enrollIds.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
