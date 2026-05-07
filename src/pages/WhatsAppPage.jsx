import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const TABS = ['Chat', 'Cuenta', 'Plantillas', 'Contacto', 'Webhook']

const EMPTY_ACCOUNT = {
  account_type: 'qr',
  name: '',
  phone_number: '',
  phone_number_id: '',
  waba_id: '',
  access_token: '',
}

const EMPTY_PROFILE = {
  about: '',
  address: '',
  description: '',
  email: '',
  websites: '',
  vertical: '',
}

export default function WhatsAppPage() {
  const [tab, setTab] = useState('Chat')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')

  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT)
  const [showAccountForm, setShowAccountForm] = useState(false)

  const [accountProfile, setAccountProfile] = useState(null)
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE)
  const [qrProfile, setQrProfile] = useState(null)
  const [coexistence, setCoexistence] = useState(null)

  const [templates, setTemplates] = useState([])
  const [webhookLogs, setWebhookLogs] = useState([])
  const [qrContacts, setQrContacts] = useState([])
  const [receipts, setReceipts] = useState([])

  const [qrState, setQrState] = useState({ status: 'not_started', qr: null, phone: null })

  const [chats, setChats] = useState([])
  const [chatFilter, setChatFilter] = useState('')
  const [selectedJid, setSelectedJid] = useState('')
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')

  const selectedAccount = useMemo(() => accounts.find((a) => String(a.id) === String(selectedAccountId)) || null, [accounts, selectedAccountId])
  const selectedChat = useMemo(() => chats.find((c) => c.jid === selectedJid) || null, [chats, selectedJid])

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

  const loadAccounts = async () => {
    const data = await apiFetch('/whatsapp/accounts')
    const list = Array.isArray(data) ? data : []
    setAccounts(list)
    if (!selectedAccountId && list.length) setSelectedAccountId(String(list[0].id))
  }

  const loadQr = async () => {
    const [s, q] = await Promise.all([
      apiFetch('/wa-qr/status').catch(() => ({ status: 'not_started', phone: null })),
      apiFetch('/wa-qr/qr').catch(() => ({ qr: null })),
    ])
    setQrState({ status: s.status || 'not_started', qr: q.qr || null, phone: s.phone || q.phone || null })
  }

  const loadChats = async () => {
    const data = await apiFetch('/wa-qr/chats').catch(() => ({ ok: false, chats: [] }))
    const list = Array.isArray(data?.chats) ? data.chats : []
    setChats(list)
    if (!selectedJid && list.length) setSelectedJid(list[0].jid)
  }

  const loadMessages = async (jid = selectedJid) => {
    if (!jid) return
    const data = await apiFetch(`/wa-qr/messages?jid=${encodeURIComponent(jid)}`).catch(() => ({ ok: false, messages: [] }))
    setMessages(Array.isArray(data?.messages) ? data.messages : [])
  }

  const loadAccountProfile = async (id = selectedAccountId) => {
    if (!id) {
      setAccountProfile(null)
      setQrProfile(null)
      setCoexistence(null)
      return
    }
    const acc = accounts.find((a) => String(a.id) === String(id))
    if (acc?.account_type === 'qr') {
      const qr = await apiFetch('/wa-qr/profile').catch(() => ({ ok: false, profile: null }))
      setQrProfile(qr?.profile || null)
      setAccountProfile({ profile: null, error: null })
      setCoexistence(null)
      return
    }

    const [profileData, coexistenceData] = await Promise.all([
      apiFetch(`/whatsapp/accounts/${id}/profile`).catch(() => ({ profile: null, error: 'No disponible para esta cuenta' })),
      apiFetch(`/whatsapp/accounts/${id}/coexistence`).catch(() => ({ status: null, error: 'No disponible' })),
    ])

    setAccountProfile(profileData)
    setQrProfile(null)
    setCoexistence(coexistenceData)

    const p = profileData?.profile?.[0] || profileData?.profile || {}
    setProfileForm({
      about: p.about || '',
      address: p.address || '',
      description: p.description || '',
      email: p.email || '',
      websites: Array.isArray(p.websites) ? p.websites.join(', ') : (p.websites || ''),
      vertical: p.vertical || '',
    })
  }

  const loadTemplates = async () => {
    if (!selectedAccountId) return setTemplates([])
    const data = await apiFetch(`/whatsapp/accounts/${selectedAccountId}/templates`).catch(() => ({ templates: [], error: 'No disponible' }))
    setTemplates(Array.isArray(data?.templates) ? data.templates : [])
  }

  const loadWebhookLogs = async () => {
    const data = await apiFetch('/whatsapp/webhook/logs?limit=60').catch(() => [])
    setWebhookLogs(Array.isArray(data) ? data : [])
  }

  const loadQrContacts = async () => {
    const data = await apiFetch('/wa-qr/contacts').catch(() => ({ contacts: [] }))
    setQrContacts(Array.isArray(data?.contacts) ? data.contacts : [])
  }

  const loadReceipts = async () => {
    const data = await apiFetch('/wa-qr/receipts').catch(() => ({ receipts: [] }))
    setReceipts(Array.isArray(data?.receipts) ? data.receipts : [])
  }

  useEffect(() => {
    run(async () => {
      await Promise.all([loadAccounts(), loadQr(), loadChats(), loadWebhookLogs(), loadQrContacts(), loadReceipts()])
    })
  }, [])

  useEffect(() => {
    if (!selectedJid) return
    run(async () => { await loadMessages(selectedJid) })
  }, [selectedJid])

  useEffect(() => {
    run(async () => {
      await loadAccountProfile(selectedAccountId)
      await loadTemplates()
    })
  }, [selectedAccountId])

  useEffect(() => {
    const live = new Set(['starting', 'waiting_qr', 'reconnecting', 'connected'])
    if (!live.has(qrState.status)) return
    const timer = setInterval(() => {
      loadQr().catch(() => {})
      loadChats().catch(() => {})
      loadWebhookLogs().catch(() => {})
      loadReceipts().catch(() => {})
      if (selectedJid) loadMessages(selectedJid).catch(() => {})
    }, 3500)
    return () => clearInterval(timer)
  }, [qrState.status, selectedJid])

  const startQr = async () => run(async () => {
    await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) })
    await loadQr()
  }, 'Sesion QR iniciada')

  const refreshAll = async () => run(async () => {
    await Promise.all([loadQr(), loadChats(), loadAccountProfile(), loadTemplates(), loadWebhookLogs(), loadQrContacts(), loadReceipts()])
    if (selectedJid) await loadMessages(selectedJid)
  }, 'Estado WhatsApp actualizado')

  const disconnectQr = async () => run(async () => {
    await apiFetch('/wa-qr/disconnect', { method: 'DELETE' })
    await Promise.all([loadQr(), loadChats()])
    setMessages([])
  }, 'Sesion QR desconectada')

  const syncQrAccount = async () => run(async () => {
    if (!qrState.phone) throw new Error('No hay telefono conectado por QR')
    await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone, name: selectedAccount?.name || `WhatsApp QR ${qrState.phone}` }) })
    await loadAccounts()
  }, 'Cuenta QR sincronizada')

  const testAccount = async (id = selectedAccountId) => run(async () => {
    if (!id) throw new Error('Selecciona una cuenta')
    await apiFetch(`/whatsapp/accounts/${id}/test`, { method: 'POST', body: JSON.stringify({}) })
  }, 'Test de cuenta ejecutado')

  const createAccount = async () => run(async () => {
    if (!accountForm.name.trim()) throw new Error('Nombre de cuenta requerido')
    if (accountForm.account_type === 'qr') {
      if (!qrState.phone) throw new Error('Primero conecta por QR')
      await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone, name: accountForm.name.trim() }) })
    } else {
      await apiFetch('/whatsapp/accounts', {
        method: 'POST',
        body: JSON.stringify({
          account_type: 'api',
          name: accountForm.name.trim(),
          phone_number: accountForm.phone_number,
          phone_number_id: accountForm.phone_number_id,
          waba_id: accountForm.waba_id,
          access_token: accountForm.access_token,
        }),
      })
    }
    setAccountForm(EMPTY_ACCOUNT)
    setShowAccountForm(false)
    await loadAccounts()
  }, 'Cuenta creada')

  const deleteAccount = async (id) => {
    if (!window.confirm('Eliminar esta cuenta de WhatsApp?')) return
    await run(async () => {
      await apiFetch(`/whatsapp/accounts/${id}`, { method: 'DELETE' })
      await loadAccounts()
    }, 'Cuenta eliminada')
  }

  const saveProfile = async () => run(async () => {
    if (!selectedAccountId || selectedAccount?.account_type !== 'api') throw new Error('Solo aplica para cuentas API')
    const payload = {
      about: profileForm.about,
      address: profileForm.address,
      description: profileForm.description,
      email: profileForm.email,
      websites: profileForm.websites.split(',').map((w) => w.trim()).filter(Boolean),
      vertical: profileForm.vertical,
    }
    await apiFetch(`/whatsapp/accounts/${selectedAccountId}/profile`, { method: 'POST', body: JSON.stringify(payload) })
    await loadAccountProfile(selectedAccountId)
  }, 'Perfil actualizado')

  const setCoexistenceMode = async (enable) => run(async () => {
    if (!selectedAccountId || selectedAccount?.account_type !== 'api') throw new Error('Solo aplica para cuentas API')
    await apiFetch(`/whatsapp/accounts/${selectedAccountId}/coexistence`, { method: 'POST', body: JSON.stringify({ enable }) })
    await loadAccountProfile(selectedAccountId)
  }, enable ? 'Coexistencia activada' : 'Coexistencia desactivada')

  const loadOlderHistory = async () => run(async () => {
    if (!selectedJid) throw new Error('Selecciona un chat')
    await apiFetch('/wa-qr/fetch-history', { method: 'POST', body: JSON.stringify({ jid: selectedJid }) })
    await loadMessages(selectedJid)
  }, 'Historial anterior cargado')

  const sendMessage = async () => run(async () => {
    if (!selectedJid) throw new Error('Selecciona un chat')
    if (!messageText.trim()) throw new Error('Escribe un mensaje')

    const text = messageText.trim()
    const phone = selectedJid.split('@')[0]
    if (selectedAccount?.account_type === 'api') {
      if (!selectedAccountId) throw new Error('Selecciona cuenta API')
      await apiFetch('/whatsapp/send', { method: 'POST', body: JSON.stringify({ account_id: Number(selectedAccountId), phone, text }) })
    } else {
      await apiFetch('/wa-qr/send', { method: 'POST', body: JSON.stringify({ to: phone, jid: selectedJid, message: text }) })
    }

    setMessageText('')
    await Promise.all([loadMessages(selectedJid), loadChats()])
  }, 'Mensaje enviado')

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => `${c.name || ''} ${c.jid || ''} ${c.lastMessage || ''}`.toLowerCase().includes(q))
  }, [chats, chatFilter])

  const formatMsgTime = (ts) => {
    if (!ts) return ''
    const d = new Date(Number(ts))
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <h2 className="page-title">WhatsApp</h2>
          <p className="page-subtitle">Centro completo de WhatsApp: chat, cuenta, perfil, plantillas y webhooks.</p>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Estado: {status}{loading ? ' | Procesando...' : ''}</div>

      <div className="card" style={{ padding: 10, marginBottom: 10 }}>
        <div className="toolbar-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={startQr} disabled={loading}>Conectar QR</button>
          <button className="btn btn-secondary" onClick={refreshAll} disabled={loading}>Refrescar</button>
          <button className="btn btn-secondary" onClick={syncQrAccount} disabled={loading || !qrState.phone}>Sincronizar cuenta</button>
          <button className="btn btn-danger" onClick={disconnectQr} disabled={loading}>Desconectar</button>
          <select className="form-select" style={{ width: 300 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
            <option value="">Seleccionar cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => testAccount()} disabled={loading || !selectedAccountId}>Test cuenta</button>
          {selectedAccountId && <button className="btn btn-danger" onClick={() => deleteAccount(selectedAccountId)} disabled={loading}>Eliminar cuenta</button>}
          <button className="btn btn-primary" onClick={() => setShowAccountForm((v) => !v)}>{showAccountForm ? 'Cerrar alta' : 'Agregar cuenta'}</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>QR: {qrState.status} {qrState.phone ? `| Telefono: ${qrState.phone}` : ''}</div>
        {qrState.qr && qrState.status !== 'connected' && (
          <img src={qrState.qr} alt="QR WhatsApp" style={{ width: 180, marginTop: 8, borderRadius: 8, border: '1px solid var(--border)' }} />
        )}

        {showAccountForm && (
          <div className="card" style={{ padding: 10, marginTop: 10, border: '1px solid var(--accent)' }}>
            <div className="toolbar-actions" style={{ flexWrap: 'wrap' }}>
              <select className="form-select" style={{ width: 180 }} value={accountForm.account_type} onChange={(e) => setAccountForm((v) => ({ ...v, account_type: e.target.value }))}>
                <option value="qr">QR</option>
                <option value="api">API</option>
              </select>
              <input className="form-input" style={{ width: 220 }} placeholder="Nombre de cuenta" value={accountForm.name} onChange={(e) => setAccountForm((v) => ({ ...v, name: e.target.value }))} />
              {accountForm.account_type === 'api' && (
                <>
                  <input className="form-input" style={{ width: 180 }} placeholder="Telefono" value={accountForm.phone_number} onChange={(e) => setAccountForm((v) => ({ ...v, phone_number: e.target.value }))} />
                  <input className="form-input" style={{ width: 220 }} placeholder="Phone number ID" value={accountForm.phone_number_id} onChange={(e) => setAccountForm((v) => ({ ...v, phone_number_id: e.target.value }))} />
                  <input className="form-input" style={{ width: 180 }} placeholder="WABA ID" value={accountForm.waba_id} onChange={(e) => setAccountForm((v) => ({ ...v, waba_id: e.target.value }))} />
                  <input className="form-input" style={{ width: 280 }} placeholder="Access token" value={accountForm.access_token} onChange={(e) => setAccountForm((v) => ({ ...v, access_token: e.target.value }))} />
                </>
              )}
              <button className="btn btn-primary" onClick={createAccount} disabled={loading}>Guardar</button>
            </div>
          </div>
        )}
      </div>

      <div className="company-tabs" style={{ marginBottom: 10 }}>
        {TABS.map((t) => <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Chat' && (
        <div className="wa-shell">
          <div className="wa-sidebar">
            <div className="wa-sidebar-head">Chats</div>
            <div className="wa-sidebar-search">
              <input className="form-input" placeholder="Buscar chat" value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} />
            </div>
            <div className="wa-chat-list">
              {!filteredChats.length ? <div style={{ padding: 12, color: 'var(--text-muted)' }}>Sin chats</div> : filteredChats.map((c) => (
                <button
                  key={c.jid}
                  onClick={() => setSelectedJid(c.jid)}
                  className={`wa-chat-item ${selectedJid === c.jid ? 'active' : ''}`}
                >
                  <div className="wa-chat-item-row">
                    <div className="wa-chat-name">{c.name || c.jid.split('@')[0]}</div>
                    <div className="wa-chat-time">{formatMsgTime(c.lastAt)}</div>
                  </div>
                  <div className="wa-chat-last">{c.lastMessage || 'Sin mensajes'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="wa-main">
            <div className="wa-main-head">
              <div className="wa-main-head-title">
                {selectedChat ? (selectedChat.name || selectedChat.jid.split('@')[0]) : 'Conversacion'}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={loadOlderHistory} disabled={loading || !selectedJid}>Cargar historial</button>
            </div>
            <div className="wa-main-body">
              {!selectedJid ? (
                <div style={{ color: 'var(--text-muted)' }}>Selecciona un chat.</div>
              ) : !messages.length ? (
                <div style={{ color: 'var(--text-muted)' }}>Sin mensajes en este chat.</div>
              ) : messages.map((m, i) => (
                <div key={`${m.id || i}`} className={`wa-msg-row ${m.fromMe ? 'me' : 'other'}`}>
                  <div className={`wa-msg ${m.fromMe ? 'me' : 'other'}`}>
                    <div>{m.body || ''}</div>
                    <div className="wa-msg-meta">
                      <span>{formatMsgTime(m.ts)}</span>
                      {m.fromMe ? <span style={{ marginLeft: 6 }}>✓✓</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="wa-main-input">
              <input className="form-input" placeholder="Escribe un mensaje" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }} />
              <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !selectedJid}>Enviar</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'Cuenta' && (
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Cuenta y perfil</div>
          {!selectedAccountId ? (
            <div style={{ color: 'var(--text-muted)' }}>Selecciona una cuenta para ver estado.</div>
          ) : qrProfile ? (
            <div style={{ fontSize: 12 }}>
              <div><strong>Nombre:</strong> {qrProfile.name || '-'}</div>
              <div><strong>Telefono:</strong> {qrProfile.phone || '-'}</div>
              <div><strong>Estado:</strong> {qrProfile.status || '-'}</div>
              <div><strong>ID sesion:</strong> {qrProfile.id || '-'}</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
                <input className="form-input" placeholder="About" value={profileForm.about} onChange={(e) => setProfileForm((v) => ({ ...v, about: e.target.value }))} />
                <input className="form-input" placeholder="Address" value={profileForm.address} onChange={(e) => setProfileForm((v) => ({ ...v, address: e.target.value }))} />
                <input className="form-input" placeholder="Description" value={profileForm.description} onChange={(e) => setProfileForm((v) => ({ ...v, description: e.target.value }))} />
                <input className="form-input" placeholder="Email" value={profileForm.email} onChange={(e) => setProfileForm((v) => ({ ...v, email: e.target.value }))} />
                <input className="form-input" placeholder="Websites (coma)" value={profileForm.websites} onChange={(e) => setProfileForm((v) => ({ ...v, websites: e.target.value }))} />
                <input className="form-input" placeholder="Vertical" value={profileForm.vertical} onChange={(e) => setProfileForm((v) => ({ ...v, vertical: e.target.value }))} />
              </div>
              <div className="toolbar-actions" style={{ marginBottom: 10 }}>
                <button className="btn btn-primary" onClick={saveProfile} disabled={loading}>Guardar perfil</button>
                <button className="btn btn-secondary" onClick={() => setCoexistenceMode(true)} disabled={loading}>Activar coexistencia</button>
                <button className="btn btn-secondary" onClick={() => setCoexistenceMode(false)} disabled={loading}>Desactivar coexistencia</button>
              </div>
              <pre style={{ fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ profile: accountProfile?.profile || null, coexistence }, null, 2)}</pre>
            </>
          )}
        </div>
      )}

      {tab === 'Plantillas' && (
        <div className="card" style={{ padding: 10 }}>
          <div className="toolbar-actions" style={{ marginBottom: 8 }}>
            <button className="btn btn-secondary" onClick={() => run(loadTemplates, 'Plantillas recargadas')} disabled={loading || !selectedAccountId}>Recargar plantillas</button>
          </div>
          {!templates.length ? <div style={{ color: 'var(--text-muted)' }}>Sin plantillas o cuenta sin WABA ID.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Idioma</th><th>Estado</th><th>Categoria</th></tr></thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id || `${t.name}-${t.language}`}>
                      <td>{t.name || '-'}</td>
                      <td>{t.language || '-'}</td>
                      <td>{t.status || '-'}</td>
                      <td>{t.category || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Contacto' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card" style={{ padding: 10 }}>
            <div className="toolbar-actions" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Contactos QR</div>
              <button className="btn btn-secondary btn-sm" onClick={() => run(loadQrContacts, 'Contactos recargados')} disabled={loading}>Recargar</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Telefono</th></tr></thead>
                <tbody>
                  {!qrContacts.length ? <tr><td colSpan="2" style={{ color: 'var(--text-muted)' }}>Sin contactos</td></tr> : qrContacts.slice(0, 300).map((c) => (
                    <tr key={c.jid}>
                      <td>{c.name || '-'}</td>
                      <td>{c.phone || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 10 }}>
            <div className="toolbar-actions" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Receipts</div>
              <button className="btn btn-secondary btn-sm" onClick={() => run(loadReceipts, 'Receipts actualizados')} disabled={loading}>Recargar</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>WAMID</th><th>Estado</th><th>TS</th></tr></thead>
                <tbody>
                  {!receipts.length ? <tr><td colSpan="3" style={{ color: 'var(--text-muted)' }}>Sin receipts</td></tr> : receipts.map((r, i) => (
                    <tr key={`${r.wamid}-${i}`}>
                      <td>{r.wamid || '-'}</td>
                      <td>{r.status || '-'}</td>
                      <td>{r.ts ? new Date(r.ts).toLocaleString('es-AR') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'Webhook' && (
        <div className="card" style={{ padding: 10 }}>
          <div className="toolbar-actions" style={{ marginBottom: 8 }}>
            <button className="btn btn-secondary" onClick={() => run(loadWebhookLogs, 'Logs webhook recargados')} disabled={loading}>Recargar logs</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Origen</th><th>Mensaje</th><th>Fecha</th></tr></thead>
              <tbody>
                {!webhookLogs.length ? <tr><td colSpan="4" style={{ color: 'var(--text-muted)' }}>Sin eventos webhook</td></tr> : webhookLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.id}</td>
                    <td>{l.from || '-'}</td>
                    <td>{l.body || '-'}</td>
                    <td>{l.at || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
