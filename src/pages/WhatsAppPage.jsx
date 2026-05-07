import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const TABS = ['Chat', 'Cuenta y perfil', 'Plantillas', 'Contactos', 'Debug']

const emptyQr = { status: 'not_started', qr: null, phone: null }
const emptyForm = {
  id: '',
  account_type: 'qr',
  name: '',
  phone_number: '',
  phone_number_id: '',
  waba_id: '',
  access_token: '',
  webhook_verify_token: '',
}

const extractError = (e) => {
  try {
    const raw = String(e?.message || 'Error')
    const parsed = JSON.parse(raw)
    return parsed?.detail || parsed?.message || raw
  } catch {
    return String(e?.message || 'Error')
  }
}

export default function WhatsAppPage() {
  const [tab, setTab] = useState('Chat')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')

  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [accountForm, setAccountForm] = useState(emptyForm)

  const [qrState, setQrState] = useState(emptyQr)

  const [chats, setChats] = useState([])
  const [chatFilter, setChatFilter] = useState('')
  const [selectedJid, setSelectedJid] = useState('')
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')

  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [templates, setTemplates] = useState([])
  const [contacts, setContacts] = useState([])
  const [receipts, setReceipts] = useState([])
  const [debugInfo, setDebugInfo] = useState(null)
  const [webhookLogs, setWebhookLogs] = useState([])

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId],
  )

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => `${c.name || ''} ${c.jid || ''} ${c.lastMessage || ''}`.toLowerCase().includes(q))
  }, [chats, chatFilter])

  const run = async (fn, okMessage) => {
    setLoading(true)
    try {
      await fn()
      if (okMessage) setStatus(okMessage)
    } catch (e) {
      setStatus(`Error: ${extractError(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const loadAccounts = async () => {
    const data = await apiFetch('/whatsapp/accounts')
    const list = Array.isArray(data) ? data : []
    setAccounts(list)
    if (list.length && !selectedAccountId) setSelectedAccountId(String(list[0].id))
    if (!list.length) setSelectedAccountId('')
  }

  const loadQr = async () => {
    const [s, q] = await Promise.all([
      apiFetch('/wa-qr/status').catch(() => ({ status: 'not_started', phone: null })),
      apiFetch('/wa-qr/qr').catch(() => ({ qr: null })),
    ])
    setQrState({ status: s.status || 'not_started', qr: q.qr || null, phone: s.phone || q.phone || null })
  }

  const loadChats = async () => {
    const data = await apiFetch('/wa-qr/chats').catch(() => ({ chats: [] }))
    const list = Array.isArray(data?.chats) ? data.chats : []
    setChats(list)
    if (list.length && !selectedJid) setSelectedJid(list[0].jid)
  }

  const loadMessages = async (jid = selectedJid) => {
    if (!jid) return
    const data = await apiFetch(`/wa-qr/messages?jid=${encodeURIComponent(jid)}`).catch(() => ({ messages: [] }))
    setMessages(Array.isArray(data?.messages) ? data.messages : [])
  }

  const loadProfile = async () => {
    if (!selectedAccountId) {
      setProfile(null)
      setProfileError('')
      return
    }
    if (selectedAccount?.account_type === 'qr') {
      const qrProf = await apiFetch('/wa-qr/profile').catch(() => ({ ok: false, profile: null }))
      setProfile(qrProf?.profile || null)
      setProfileError('')
      return
    }
    const data = await apiFetch(`/whatsapp/accounts/${selectedAccountId}/profile`).catch((e) => ({ profile: null, error: extractError(e) }))
    setProfile(data?.profile || null)
    setProfileError(data?.error || '')
  }

  const loadTemplates = async () => {
    if (!selectedAccountId || selectedAccount?.account_type === 'qr') {
      setTemplates([])
      return
    }
    const data = await apiFetch(`/whatsapp/accounts/${selectedAccountId}/templates`).catch(() => ({ templates: [] }))
    setTemplates(Array.isArray(data?.templates) ? data.templates : [])
  }

  const loadContactsAndDebug = async () => {
    const [c, r, d, l] = await Promise.all([
      apiFetch('/wa-qr/contacts').catch(() => ({ contacts: [] })),
      apiFetch('/wa-qr/receipts').catch(() => ({ receipts: [] })),
      apiFetch('/wa-qr/debug').catch(() => ({})),
      apiFetch('/whatsapp/webhook/logs?limit=60').catch(() => []),
    ])
    setContacts(Array.isArray(c?.contacts) ? c.contacts : [])
    setReceipts(Array.isArray(r?.receipts) ? r.receipts : [])
    setDebugInfo(d || null)
    setWebhookLogs(Array.isArray(l) ? l : [])
  }

  useEffect(() => {
    run(async () => {
      await Promise.all([loadAccounts(), loadQr(), loadChats(), loadContactsAndDebug()])
    })
  }, [])

  useEffect(() => {
    run(async () => {
      await Promise.all([loadProfile(), loadTemplates()])
    })
  }, [selectedAccountId, selectedAccount?.account_type])

  useEffect(() => {
    if (!selectedJid) return
    run(async () => { await loadMessages(selectedJid) })
  }, [selectedJid])

  useEffect(() => {
    const live = new Set(['starting', 'waiting_qr', 'reconnecting', 'connected'])
    if (!live.has(qrState.status)) return
    const timer = setInterval(() => {
      loadQr().catch(() => {})
      loadChats().catch(() => {})
      if (selectedJid) loadMessages(selectedJid).catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [qrState.status, selectedJid])

  const openAddAccount = () => {
    setAccountForm({ ...emptyForm, name: `Cuenta ${accounts.length + 1}`, phone_number: qrState.phone || '' })
    setShowAccountModal(true)
  }

  const openEditAccount = (acc) => {
    setAccountForm({
      id: String(acc.id),
      account_type: acc.account_type || 'api',
      name: acc.name || '',
      phone_number: acc.phone_number || '',
      phone_number_id: acc.phone_number_id || '',
      waba_id: acc.waba_id || '',
      access_token: '',
      webhook_verify_token: acc.webhook_verify_token || '',
    })
    setShowAccountModal(true)
  }

  const saveAccount = async () => run(async () => {
    const isEdit = !!accountForm.id
    const payload = {
      account_type: accountForm.account_type,
      name: accountForm.name.trim(),
      phone_number: accountForm.phone_number.trim(),
      phone_number_id: accountForm.phone_number_id.trim(),
      waba_id: accountForm.waba_id.trim(),
      access_token: accountForm.access_token.trim(),
      webhook_verify_token: accountForm.webhook_verify_token.trim(),
    }
    if (!payload.name) throw new Error('Nombre requerido')
    if (payload.account_type === 'api' && (!payload.phone_number_id || !payload.access_token) && !isEdit) {
      throw new Error('Phone Number ID y Access Token requeridos para API')
    }

    if (isEdit) await apiFetch(`/whatsapp/accounts/${accountForm.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await apiFetch('/whatsapp/accounts', { method: 'POST', body: JSON.stringify(payload) })

    setShowAccountModal(false)
    setAccountForm(emptyForm)
    await loadAccounts()
  }, 'Cuenta guardada')

  const deleteAccount = async (accId) => run(async () => {
    await apiFetch(`/whatsapp/accounts/${accId}`, { method: 'DELETE' })
    await loadAccounts()
    await loadProfile()
  }, 'Cuenta eliminada')

  const startQr = async () => run(async () => {
    await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) })
    await loadQr()
  }, 'Sesion QR iniciada')

  const syncQrAccount = async () => run(async () => {
    if (!qrState.phone) throw new Error('No hay telefono conectado')
    await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone }) })
    await loadAccounts()
  }, 'Cuenta QR sincronizada')

  const disconnectQr = async () => run(async () => {
    await apiFetch('/wa-qr/disconnect', { method: 'DELETE' })
    await Promise.all([loadQr(), loadChats()])
  }, 'Sesion QR desconectada')

  const sendMessage = async () => run(async () => {
    if (!selectedJid) throw new Error('Selecciona un chat')
    const text = messageText.trim()
    if (!text) throw new Error('Escribe un mensaje')
    const phone = selectedJid.split('@')[0]

    if (selectedAccount?.account_type === 'api') {
      await apiFetch('/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ account_id: Number(selectedAccountId), phone, text }),
      })
    } else {
      await apiFetch('/wa-qr/send', {
        method: 'POST',
        body: JSON.stringify({ jid: selectedJid, to: phone, message: text }),
      })
    }

    setMessageText('')
    await Promise.all([loadMessages(selectedJid), loadChats()])
  }, 'Mensaje enviado')

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(Number(ts))
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <section className="wa-web-wrap">
      <div className="wa-web-top">
        <div className="wa-web-title">WhatsApp</div>
        <div className="wa-web-actions">
          <button className="btn btn-secondary" onClick={() => run(async () => { await Promise.all([loadAccounts(), loadQr(), loadChats(), loadProfile(), loadTemplates(), loadContactsAndDebug()]); if (selectedJid) await loadMessages(selectedJid) }, 'Estado actualizado')} disabled={loading}>Recargar</button>
          <button className="btn btn-primary" onClick={openAddAccount} disabled={loading}>Agregar cuenta</button>
        </div>
      </div>
      <div className="wa-web-sub">Estado: {status} | QR: {qrState.status}{qrState.phone ? ` | Telefono: ${qrState.phone}` : ''}</div>

      <div className="company-tabs" style={{ marginBottom: 10 }}>
        {TABS.map((t) => <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Chat' && (
        <>
          <section className="card" style={{ marginBottom: 10, padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={startQr} disabled={loading}>Conectar QR</button>
              <button className="btn btn-secondary" onClick={syncQrAccount} disabled={loading || !qrState.phone}>Sincronizar cuenta QR</button>
              <button className="btn btn-danger" onClick={disconnectQr} disabled={loading}>Desconectar</button>
              <select className="form-select" style={{ width: 240 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                <option value="">Selecciona cuenta</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
              </select>
            </div>
            {qrState.qr && qrState.status === 'waiting_qr' && (
              <div style={{ marginTop: 10 }}>
                <img src={qrState.qr} alt="QR" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid var(--border)' }} />
              </div>
            )}
          </section>

          <div className="wa-web-shell">
            <aside className="wa-web-rail">
              <div className="wa-web-rail-btn active">??</div>
              <div className="wa-web-rail-spacer" />
            </aside>

            <aside className="wa-web-left">
              <div className="wa-web-left-head">Chats</div>
              <div className="wa-web-left-search">
                <input className="form-input" placeholder="Buscar chat" value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} />
              </div>
              <div className="wa-web-left-list">
                {filteredChats.map((c) => (
                  <button key={c.jid} className={`wa-web-chat ${selectedJid === c.jid ? 'active' : ''}`} onClick={() => setSelectedJid(c.jid)}>
                    <div className="wa-web-chat-avatar">{(c.name || c.jid).slice(0, 1).toUpperCase()}</div>
                    <div className="wa-web-chat-main">
                      <div className="wa-web-chat-row"><span>{c.name || c.jid.split('@')[0]}</span><small>{formatTime(c.lastAt)}</small></div>
                      <div className="wa-web-chat-last">{c.lastMessage || 'Sin mensajes'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <main className="wa-web-main">
              <header className="wa-web-main-head">
                <div>
                  <div className="wa-web-contact">{selectedJid ? selectedJid.split('@')[0] : 'Selecciona un chat'}</div>
                  <div className="wa-web-contact-sub">{selectedAccount ? `${selectedAccount.name} (${selectedAccount.account_type})` : ''}</div>
                </div>
              </header>
              <div className="wa-web-messages">
                {!selectedJid && <div className="wa-web-empty">Sin chat seleccionado</div>}
                {!!selectedJid && messages.map((m, i) => (
                  <div key={`${m.id || i}`} className={`wa-web-msg-row ${m.fromMe ? 'me' : 'other'}`}>
                    <div className={`wa-web-msg ${m.fromMe ? 'me' : 'other'}`}>
                      <div>{m.body || ''}</div>
                      <div className="wa-web-msg-meta">{formatTime(m.ts)} {m.fromMe ? '??' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
              <footer className="wa-web-input">
                <input className="form-input" placeholder="Escribe un mensaje" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }} />
                <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !selectedJid}>Enviar</button>
              </footer>
            </main>
          </div>
        </>
      )}

      {tab === 'Cuenta y perfil' && (
        <section className="card" style={{ padding: 12 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Telefono</th><th>Phone ID</th><th>Acciones</th></tr></thead>
              <tbody>
                {!accounts.length && <tr><td colSpan={5}>Sin cuentas</td></tr>}
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td><td>{a.account_type}</td><td>{a.phone_number || '-'}</td><td>{a.phone_number_id || '-'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedAccountId(String(a.id)); openEditAccount(a) }}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(a.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}>
            <h4 style={{ marginBottom: 6 }}>Perfil</h4>
            {profileError && <div className="text-danger">{profileError}</div>}
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(profile || {}, null, 2)}</pre>
          </div>
        </section>
      )}

      {tab === 'Plantillas' && (
        <section className="card" style={{ padding: 12 }}>
          <button className="btn btn-secondary" onClick={() => run(loadTemplates, 'Plantillas recargadas')} disabled={loading || !selectedAccountId}>Recargar plantillas</button>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table><thead><tr><th>Nombre</th><th>Idioma</th><th>Estado</th></tr></thead><tbody>{templates.map((t) => <tr key={t.id || t.name}><td>{t.name || '-'}</td><td>{t.language || '-'}</td><td>{t.status || '-'}</td></tr>)}</tbody></table>
          </div>
        </section>
      )}

      {tab === 'Contactos' && (
        <section className="card" style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <h4>Contactos QR</h4>
              <div className="table-wrap"><table><tbody>{contacts.slice(0, 300).map((c) => <tr key={c.jid}><td>{c.name || '-'}</td><td>{c.phone || '-'}</td></tr>)}</tbody></table></div>
            </div>
            <div>
              <h4>Receipts</h4>
              <div className="table-wrap"><table><tbody>{receipts.map((r, i) => <tr key={`${r.wamid || i}`}><td>{r.wamid || '-'}</td><td>{r.status || '-'}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        </section>
      )}

      {tab === 'Debug' && (
        <section className="card" style={{ padding: 12 }}>
          <h4 style={{ marginBottom: 6 }}>WA QR Debug</h4>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(debugInfo || {}, null, 2)}</pre>
          <h4 style={{ marginTop: 12, marginBottom: 6 }}>Webhook logs</h4>
          <div className="table-wrap"><table><tbody>{webhookLogs.map((l) => <tr key={l.id}><td>{l.from || '-'}</td><td>{l.body || '-'}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {showAccountModal && (
        <div className="modal-overlay open" onClick={() => setShowAccountModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>{accountForm.id ? 'Editar cuenta WhatsApp' : 'Agregar cuenta WhatsApp'}</h3>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
              <div className="form-group"><label>Nombre</label><input className="form-input" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <label><input type="radio" checked={accountForm.account_type === 'qr'} onChange={() => setAccountForm((f) => ({ ...f, account_type: 'qr' }))} /> Cuenta QR</label>
                <label><input type="radio" checked={accountForm.account_type === 'api'} onChange={() => setAccountForm((f) => ({ ...f, account_type: 'api' }))} /> Cuenta API</label>
              </div>
              <div className="form-group"><label>Telefono</label><input className="form-input" value={accountForm.phone_number} onChange={(e) => setAccountForm((f) => ({ ...f, phone_number: e.target.value }))} /></div>
              {accountForm.account_type === 'api' && (
                <>
                  <div className="form-group"><label>Phone Number ID</label><input className="form-input" value={accountForm.phone_number_id} onChange={(e) => setAccountForm((f) => ({ ...f, phone_number_id: e.target.value }))} /></div>
                  <div className="form-group"><label>WABA ID</label><input className="form-input" value={accountForm.waba_id} onChange={(e) => setAccountForm((f) => ({ ...f, waba_id: e.target.value }))} /></div>
                  <div className="form-group"><label>Access Token</label><input className="form-input" value={accountForm.access_token} onChange={(e) => setAccountForm((f) => ({ ...f, access_token: e.target.value }))} /></div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAccountModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAccount} disabled={loading}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
