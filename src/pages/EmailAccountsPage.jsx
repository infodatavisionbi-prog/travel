import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, Archive, CheckCircle, ChevronRight, Edit, Inbox,
  Loader2, Mail, MailCheck, MailOpen, Plus, RefreshCw, Reply,
  Send, ServerCrash, Trash2, X,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'

const emptyForm = {
  name: '', from_name: '', from_email: '',
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_tls: true,
  imap_host: '', imap_port: '993', imap_user: '', imap_pass: '', imap_tls: true,
}

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

function StatusDot({ ok }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', marginRight: 6 }} />
}

export default function EmailAccountsPage() {
  const [accounts, setAccounts]       = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [tab, setTab]                 = useState('cuentas')

  /* modal */
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [editId, setEditId]           = useState(null)
  const [testResult, setTestResult]   = useState(null)
  const [testing, setTesting]         = useState(false)

  /* inbox */
  const [selectedAccId, setSelectedAccId] = useState(null)
  const [inbox, setInbox]             = useState([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [openMsg, setOpenMsg]         = useState(null)
  const [msgBody, setMsgBody]         = useState('')
  const [msgLoading, setMsgLoading]   = useState(false)
  const [replyText, setReplyText]     = useState('')
  const [replying, setReplying]       = useState(false)

  const run = async (fn) => {
    setLoading(true); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  /* ── loaders ── */
  const loadAccounts = useCallback(async () => {
    const d = await apiFetch('/email-accounts')
    const list = Array.isArray(d) ? d : []
    setAccounts(list)
    if (!selectedAccId && list.length) setSelectedAccId(list[0].id)
  }, [])

  const loadInbox = useCallback(async (accId) => {
    if (!accId) return
    setInboxLoading(true)
    try {
      const d = await apiFetch(`/email-accounts/${accId}/inbox?limit=50`)
      setInbox(Array.isArray(d?.messages) ? d.messages : [])
    } catch { setInbox([]) }
    finally { setInboxLoading(false) }
  }, [])

  const loadMsgBody = async (accId, msgId, folder = 'inbox') => {
    setMsgLoading(true); setMsgBody('')
    try {
      const d = await apiFetch(`/email-accounts/${accId}/message/${msgId}?folder=${folder}`)
      setMsgBody(d?.body || d?.text || '(sin contenido)')
    } catch { setMsgBody('Error al cargar el mensaje') }
    finally { setMsgLoading(false) }
  }

  useEffect(() => { run(loadAccounts) }, [])
  useEffect(() => { if (tab === 'inbox' && selectedAccId) loadInbox(selectedAccId) }, [tab, selectedAccId])

  /* ── account CRUD ── */
  const openAdd = () => { setForm(emptyForm); setEditId(null); setTestResult(null); setShowModal(true) }
  const openEdit = (acc) => {
    setForm({
      name: acc.name || '', from_name: acc.from_name || '', from_email: acc.from_email || '',
      smtp_host: acc.smtp_host || '', smtp_port: String(acc.smtp_port || 587),
      smtp_user: acc.smtp_user || '', smtp_pass: '',
      smtp_tls: acc.smtp_tls !== false,
      imap_host: acc.imap_host || '', imap_port: String(acc.imap_port || 993),
      imap_user: acc.imap_user || '', imap_pass: '',
      imap_tls: acc.imap_tls !== false,
    })
    setEditId(acc.id); setTestResult(null); setShowModal(true)
  }

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const saveAccount = () => run(async () => {
    if (!form.name.trim() || !form.smtp_host.trim() || !form.from_email.trim()) throw new Error('Nombre, email remitente y SMTP host son requeridos')
    const payload = {
      name: form.name.trim(), from_name: form.from_name.trim(), from_email: form.from_email.trim(),
      smtp_host: form.smtp_host.trim(), smtp_port: Number(form.smtp_port) || 587,
      smtp_user: form.smtp_user.trim(), smtp_tls: form.smtp_tls,
      imap_host: form.imap_host.trim(), imap_port: Number(form.imap_port) || 993,
      imap_user: form.imap_user.trim(), imap_tls: form.imap_tls,
      ...(form.smtp_pass ? { smtp_pass: form.smtp_pass } : {}),
      ...(form.imap_pass ? { imap_pass: form.imap_pass } : {}),
    }
    if (editId) await apiFetch(`/email-accounts/${editId}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await apiFetch('/email-accounts', { method: 'POST', body: JSON.stringify(payload) })
    setShowModal(false)
    await loadAccounts()
  })

  const deleteAccount = (id) => run(async () => {
    if (!confirm('¿Eliminar esta cuenta de email?')) return
    await apiFetch(`/email-accounts/${id}`, { method: 'DELETE' })
    await loadAccounts()
  })

  const testSmtp = async () => {
    if (!editId) return
    setTesting(true); setTestResult(null)
    try {
      await apiFetch(`/email-accounts/${editId}/test-smtp`, { method: 'POST' })
      setTestResult({ ok: true, msg: 'Conexión SMTP exitosa ✓' })
    } catch (e) { setTestResult({ ok: false, msg: e.message }) }
    finally { setTesting(false) }
  }

  const testImap = async () => {
    if (!editId) return
    setTesting(true); setTestResult(null)
    try {
      await apiFetch(`/email-accounts/${editId}/test-imap`, { method: 'POST' })
      setTestResult({ ok: true, msg: 'Conexión IMAP exitosa ✓' })
    } catch (e) { setTestResult({ ok: false, msg: e.message }) }
    finally { setTesting(false) }
  }

  /* ── reply ── */
  const sendReply = async () => {
    if (!replyText.trim() || !openMsg) return
    setReplying(true)
    try {
      await apiFetch(`/email-accounts/${selectedAccId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message_id: openMsg.message_id, to: openMsg.from_email || openMsg.from, subject: `Re: ${openMsg.subject}`, body: replyText }),
      })
      setReplyText(''); setOpenMsg(null)
    } catch (e) { setError(e.message) }
    finally { setReplying(false) }
  }

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <section style={{ padding: '0 0 40px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Cuentas de email</h1>
        <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Plus size={14} /> Agregar cuenta
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          <span><AlertCircle size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}><X size={14} /></button>
        </div>
      )}

      <div className="company-tabs" style={{ marginBottom: 14 }}>
        {[['cuentas', 'Cuentas', Mail], ['inbox', 'Bandeja de entrada', Inbox]].map(([id, label, Icon]) => (
          <button key={id} className={`company-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />{label}
          </button>
        ))}
      </div>

      {/* ── CUENTAS ── */}
      {tab === 'cuentas' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Remitente</th><th>SMTP</th><th>IMAP</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sin cuentas de email'}
                  </td></tr>
                )}
                {accounts.map(acc => (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: 600 }}>{acc.name}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{acc.from_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{acc.from_email}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <StatusDot ok={!!acc.smtp_host} />
                      {acc.smtp_host || '—'}{acc.smtp_port ? `:${acc.smtp_port}` : ''}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {acc.imap_host
                        ? <><StatusDot ok />{acc.imap_host}:{acc.imap_port || 993}</>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(acc)} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}><Edit size={11} /> Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(acc.id)} style={{ fontSize: 11 }}><Trash2 size={11} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INBOX ── */}
      {tab === 'inbox' && (
        <div style={{ display: 'grid', gridTemplateColumns: accounts.length > 1 ? '200px 1fr' : '1fr', gap: 14 }}>
          {accounts.length > 1 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {accounts.map(acc => (
                <button key={acc.id} onClick={() => { setSelectedAccId(acc.id); setOpenMsg(null); loadInbox(acc.id) }} style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: selectedAccId === acc.id ? 'var(--accent-soft)' : 'none', border: 'none', borderBottom: '1px solid var(--border)', borderLeft: selectedAccId === acc.id ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{acc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acc.from_email}</div>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: openMsg ? '1fr 1fr' : '1fr', gap: 14 }}>
            {/* email list */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Bandeja de entrada</span>
                <button className="btn btn-secondary btn-sm" onClick={() => loadInbox(selectedAccId)} disabled={inboxLoading} style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <RefreshCw size={11} className={inboxLoading ? 'animate-spin' : ''} /> Actualizar
                </button>
              </div>
              {inboxLoading && <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>}
              {!inboxLoading && inbox.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Bandeja vacía</div>}
              {inbox.map((msg, i) => (
                <button
                  key={msg.uid || i}
                  onClick={() => { setOpenMsg(msg); loadMsgBody(selectedAccId, msg.uid || msg.message_id, 'inbox'); setReplyText('') }}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: openMsg?.uid === msg.uid ? 'var(--accent-soft)' : 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: msg.seen ? 400 : 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {!msg.seen && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginRight: 6 }} />}
                      {msg.from_name || msg.from || 'Desconocido'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{fmtDate(msg.date)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: msg.seen ? 'var(--text-muted)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.subject || '(sin asunto)'}
                  </div>
                </button>
              ))}
            </div>

            {/* email detail */}
            {openMsg && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{openMsg.subject || '(sin asunto)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>De: {openMsg.from} · {fmtDate(openMsg.date)}</div>
                  </div>
                  <button onClick={() => setOpenMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 8 }}><X size={16} /></button>
                </div>
                <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto', maxHeight: 300, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msgLoading ? <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /> : msgBody}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Reply size={12} /> Responder</div>
                  <textarea className="form-input" rows={3} placeholder="Escribe tu respuesta…" value={replyText} onChange={e => setReplyText(e.target.value)} style={{ fontSize: 12 }} />
                  <button className="btn btn-primary" onClick={sendReply} disabled={replying || !replyText.trim()} style={{ marginTop: 8, display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                    {replying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Enviar respuesta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: cuenta ── */}
      {showModal && (
        <div className="modal-overlay open" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{editId ? 'Editar cuenta' : 'Nueva cuenta de email'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 14, maxHeight: '65vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Nombre de la cuenta *</label>
                  <input className="form-input" placeholder="Ej: Ventas" value={form.name} onChange={e => f('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Nombre remitente</label>
                  <input className="form-input" placeholder="Ej: DataVision Ventas" value={form.from_name} onChange={e => f('from_name', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Email remitente *</label>
                <input className="form-input" type="email" placeholder="ventas@empresa.com" value={form.from_email} onChange={e => f('from_email', e.target.value)} />
              </div>

              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                Configuración SMTP (envío)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
                <div className="form-group">
                  <label>Host SMTP *</label>
                  <input className="form-input" placeholder="smtp.gmail.com" value={form.smtp_host} onChange={e => f('smtp_host', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Puerto</label>
                  <input className="form-input" type="number" value={form.smtp_port} onChange={e => f('smtp_port', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Usuario SMTP</label>
                  <input className="form-input" value={form.smtp_user} onChange={e => f('smtp_user', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Contraseña {editId ? '(dejar vacío = no cambiar)' : ''}</label>
                  <input className="form-input" type="password" placeholder={editId ? '••••••••' : ''} value={form.smtp_pass} onChange={e => f('smtp_pass', e.target.value)} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.smtp_tls} onChange={e => f('smtp_tls', e.target.checked)} />
                Usar TLS / STARTTLS
              </label>

              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                Configuración IMAP (bandeja de entrada, opcional)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
                <div className="form-group">
                  <label>Host IMAP</label>
                  <input className="form-input" placeholder="imap.gmail.com" value={form.imap_host} onChange={e => f('imap_host', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Puerto</label>
                  <input className="form-input" type="number" value={form.imap_port} onChange={e => f('imap_port', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Usuario IMAP</label>
                  <input className="form-input" value={form.imap_user} onChange={e => f('imap_user', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Contraseña IMAP</label>
                  <input className="form-input" type="password" value={form.imap_pass} onChange={e => f('imap_pass', e.target.value)} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.imap_tls} onChange={e => f('imap_tls', e.target.checked)} />
                Usar TLS para IMAP
              </label>

              {editId && (
                <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-secondary" onClick={testSmtp} disabled={testing} style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Probar SMTP
                  </button>
                  <button className="btn btn-secondary" onClick={testImap} disabled={testing || !form.imap_host} style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Probar IMAP
                  </button>
                </div>
              )}

              {testResult && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: testResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: testResult.ok ? '#22c55e' : '#f87171', fontSize: 13 }}>
                  {testResult.msg}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAccount} disabled={loading} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {loading && <Loader2 size={13} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
