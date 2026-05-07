import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const TABS = ['Chat', 'Cuenta', 'Plantillas', 'Contacto', 'Webhook']

export default function WhatsAppPage() {
  const [tab, setTab] = useState('Chat')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')

  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [accountProfile, setAccountProfile] = useState(null)
  const [qrProfile, setQrProfile] = useState(null)

  const [qrState, setQrState] = useState({ status: 'not_started', qr: null, phone: null })

  const [chats, setChats] = useState([])
  const [chatFilter, setChatFilter] = useState('')
  const [selectedJid, setSelectedJid] = useState('')
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')

  const [templates, setTemplates] = useState([])
  const [webhookLogs, setWebhookLogs] = useState([])
  const [qrContacts, setQrContacts] = useState([])
  const [receipts, setReceipts] = useState([])

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
      return
    }
    const acc = accounts.find((a) => String(a.id) === String(id))
    if (acc?.account_type === 'qr') {
      const qr = await apiFetch('/wa-qr/profile').catch(() => ({ ok: false, profile: null }))
      setQrProfile(qr?.profile || null)
      setAccountProfile({ profile: null, error: null })
      return
    }
    const data = await apiFetch(`/whatsapp/accounts/${id}/profile`).catch(() => ({ profile: null, error: 'No disponible' }))
    setQrProfile(null)
    setAccountProfile(data)
  }

  const loadTemplates = async () => {
    if (!selectedAccountId) return setTemplates([])
    const data = await apiFetch(`/whatsapp/accounts/${selectedAccountId}/templates`).catch(() => ({ templates: [] }))
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
      if (selectedJid) loadMessages(selectedJid).catch(() => {})
    }, 3500)
    return () => clearInterval(timer)
  }, [qrState.status, selectedJid])

  const startQr = async () => run(async () => { await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) }); await loadQr() }, 'Sesion QR iniciada')
  const refreshAll = async () => run(async () => { await Promise.all([loadQr(), loadChats(), loadAccountProfile(), loadTemplates(), loadWebhookLogs(), loadQrContacts(), loadReceipts()]); if (selectedJid) await loadMessages(selectedJid) }, 'Estado actualizado')
  const disconnectQr = async () => run(async () => { await apiFetch('/wa-qr/disconnect', { method: 'DELETE' }); await Promise.all([loadQr(), loadChats()]); setMessages([]) }, 'Sesion QR desconectada')
  const syncQrAccount = async () => run(async () => { if (!qrState.phone) throw new Error('No hay telefono conectado'); await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone }) }); await loadAccounts() }, 'Cuenta sincronizada')

  const sendMessage = async () => run(async () => {
    if (!selectedJid) throw new Error('Selecciona un chat')
    if (!messageText.trim()) throw new Error('Escribe un mensaje')
    const text = messageText.trim()
    const phone = selectedJid.split('@')[0]
    if (selectedAccount?.account_type === 'api') await apiFetch('/whatsapp/send', { method: 'POST', body: JSON.stringify({ account_id: Number(selectedAccountId), phone, text }) })
    else await apiFetch('/wa-qr/send', { method: 'POST', body: JSON.stringify({ to: phone, jid: selectedJid, message: text }) })
    setMessageText('')
    await Promise.all([loadMessages(selectedJid), loadChats()])
  }, 'Mensaje enviado')

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => `${c.name || ''} ${c.jid || ''} ${c.lastMessage || ''}`.toLowerCase().includes(q))
  }, [chats, chatFilter])

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
          <button className="btn btn-primary" onClick={startQr} disabled={loading}>Conectar QR</button>
          <button className="btn btn-secondary" onClick={refreshAll} disabled={loading}>Refrescar</button>
          <button className="btn btn-secondary" onClick={syncQrAccount} disabled={loading || !qrState.phone}>Sincronizar</button>
          <button className="btn btn-danger" onClick={disconnectQr} disabled={loading}>Desconectar</button>
          <select className="form-select" style={{ width: 260 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
            <option value="">Cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
          </select>
        </div>
      </div>

      <div className="wa-web-sub">Estado: {status} {qrState.phone ? `| ${qrState.phone}` : ''}</div>

      <div className="wa-web-shell">
        <aside className="wa-web-rail">
          <div className="wa-web-rail-btn active">💬</div>
          <div className="wa-web-rail-btn">🔔</div>
          <div className="wa-web-rail-btn">👥</div>
          <div className="wa-web-rail-spacer" />
          <div className="wa-web-rail-btn">⚙️</div>
        </aside>

        <aside className="wa-web-left">
          <div className="wa-web-left-head">Chats</div>
          <div className="wa-web-left-search"><input className="form-input" placeholder="Buscar un chat" value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} /></div>
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
              <div className="wa-web-contact">{selectedChat ? (selectedChat.name || selectedChat.jid.split('@')[0]) : 'Selecciona un chat'}</div>
              <div className="wa-web-contact-sub">{selectedJid || ''}</div>
            </div>
            <div className="wa-web-main-tools"><button className="btn btn-secondary btn-sm">Llamar</button><button className="btn btn-secondary btn-sm">⋮</button></div>
          </header>

          <div className="wa-web-messages">
            {!selectedJid ? <div className="wa-web-empty">Selecciona un chat</div> : messages.map((m, i) => (
              <div key={`${m.id || i}`} className={`wa-web-msg-row ${m.fromMe ? 'me' : 'other'}`}>
                <div className={`wa-web-msg ${m.fromMe ? 'me' : 'other'}`}>
                  <div>{m.body || ''}</div>
                  <div className="wa-web-msg-meta">{formatTime(m.ts)} {m.fromMe ? '✓✓' : ''}</div>
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

      <div className="company-tabs" style={{ marginTop: 10 }}>
        {TABS.map((t) => <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Cuenta' && (
        <section className="card" style={{ marginTop: 10, padding: 10 }}>
          {!selectedAccountId ? 'Selecciona una cuenta.' : qrProfile ? JSON.stringify(qrProfile, null, 2) : JSON.stringify(accountProfile || {}, null, 2)}
        </section>
      )}
      {tab === 'Plantillas' && (
        <section className="card" style={{ marginTop: 10, padding: 10 }}>
          <button className="btn btn-secondary" onClick={() => run(loadTemplates, 'Plantillas recargadas')} disabled={loading || !selectedAccountId}>Recargar plantillas</button>
          <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Nombre</th><th>Idioma</th><th>Estado</th></tr></thead><tbody>{templates.map((t) => <tr key={t.id || t.name}><td>{t.name || '-'}</td><td>{t.language || '-'}</td><td>{t.status || '-'}</td></tr>)}</tbody></table></div>
        </section>
      )}
      {tab === 'Contacto' && (
        <section className="card" style={{ marginTop: 10, padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><h4>Contactos QR</h4><div className="table-wrap"><table><tbody>{qrContacts.slice(0, 200).map((c) => <tr key={c.jid}><td>{c.name || '-'}</td><td>{c.phone || '-'}</td></tr>)}</tbody></table></div></div>
            <div><h4>Receipts</h4><div className="table-wrap"><table><tbody>{receipts.map((r, i) => <tr key={`${r.wamid}-${i}`}><td>{r.wamid || '-'}</td><td>{r.status || '-'}</td></tr>)}</tbody></table></div></div>
          </div>
        </section>
      )}
      {tab === 'Webhook' && (
        <section className="card" style={{ marginTop: 10, padding: 10 }}>
          <button className="btn btn-secondary" onClick={() => run(loadWebhookLogs, 'Logs recargados')} disabled={loading}>Recargar logs</button>
          <div className="table-wrap" style={{ marginTop: 8 }}><table><tbody>{webhookLogs.map((l) => <tr key={l.id}><td>{l.from || '-'}</td><td>{l.body || '-'}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </section>
  )
}
