import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

export default function WhatsAppPage() {
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
      return
    }
    const acc = accounts.find((a) => String(a.id) === String(id))
    if (acc?.account_type === 'qr') {
      const qr = await apiFetch('/wa-qr/profile').catch(() => ({ ok: false, profile: null }))
      setQrProfile(qr?.profile || null)
      setAccountProfile({ profile: null, error: null })
      return
    }
    const data = await apiFetch(`/whatsapp/accounts/${id}/profile`).catch(() => ({ profile: null, error: 'No disponible para esta cuenta' }))
    setQrProfile(null)
    setAccountProfile(data)
  }

  useEffect(() => {
    run(async () => {
      await Promise.all([loadAccounts(), loadQr(), loadChats()])
    })
  }, [])

  useEffect(() => {
    if (!selectedJid) return
    run(async () => { await loadMessages(selectedJid) })
  }, [selectedJid])

  useEffect(() => {
    run(async () => { await loadAccountProfile(selectedAccountId) })
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

  const startQr = async () => run(async () => {
    await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) })
    await loadQr()
  }, 'Sesion QR iniciada')

  const refreshQr = async () => run(async () => {
    await Promise.all([loadQr(), loadChats()])
    if (selectedJid) await loadMessages(selectedJid)
  }, 'Estado WhatsApp actualizado')

  const disconnectQr = async () => run(async () => {
    await apiFetch('/wa-qr/disconnect', { method: 'DELETE' })
    await Promise.all([loadQr(), loadChats()])
    setMessages([])
  }, 'Sesion QR desconectada')

  const syncQrAccount = async () => run(async () => {
    if (!qrState.phone) throw new Error('No hay telefono conectado por QR')
    await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone }) })
    await loadAccounts()
  }, 'Cuenta QR sincronizada')

  const testAccount = async () => run(async () => {
    if (!selectedAccountId) throw new Error('Selecciona una cuenta')
    await apiFetch(`/whatsapp/accounts/${selectedAccountId}/test`, { method: 'POST', body: JSON.stringify({}) })
  }, 'Test de cuenta ejecutado')

  const sendMessage = async () => run(async () => {
    if (!selectedJid) throw new Error('Selecciona un chat')
    if (!messageText.trim()) throw new Error('Escribe un mensaje')
    const to = selectedJid.split('@')[0]
    await apiFetch('/wa-qr/send', { method: 'POST', body: JSON.stringify({ to, jid: selectedJid, message: messageText.trim() }) })
    setMessageText('')
    await loadMessages(selectedJid)
    await loadChats()
  }, 'Mensaje enviado')

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => `${c.name || ''} ${c.jid || ''} ${c.lastMessage || ''}`.toLowerCase().includes(q))
  }, [chats, chatFilter])

  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <h2 className="page-title">WhatsApp</h2>
          <p className="page-subtitle">Vista de cuenta, estado y chat estilo WhatsApp Web.</p>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Estado: {status}{loading ? ' | Procesando...' : ''}</div>

      <div className="card" style={{ padding: 10, marginBottom: 10 }}>
        <div className="toolbar-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={startQr} disabled={loading}>Conectar QR</button>
          <button className="btn btn-secondary" onClick={refreshQr} disabled={loading}>Refrescar</button>
          <button className="btn btn-secondary" onClick={syncQrAccount} disabled={loading || !qrState.phone}>Sincronizar cuenta</button>
          <button className="btn btn-danger" onClick={disconnectQr} disabled={loading}>Desconectar</button>
          <select className="form-select" style={{ width: 280 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
            <option value="">Seleccionar cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
          </select>
          <button className="btn btn-secondary" onClick={testAccount} disabled={loading || !selectedAccountId}>Test cuenta</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>QR: {qrState.status} {qrState.phone ? `| Telefono: ${qrState.phone}` : ''}</div>
        {qrState.qr && qrState.status !== 'connected' && (
          <img src={qrState.qr} alt="QR WhatsApp" style={{ width: 180, marginTop: 8, borderRadius: 8, border: '1px solid var(--border)' }} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 320px', gap: 10, minHeight: '68vh' }}>
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Chats</div>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input className="form-input" placeholder="Buscar chat" value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {!filteredChats.length ? <div style={{ padding: 12, color: 'var(--text-muted)' }}>Sin chats</div> : filteredChats.map((c) => (
              <button
                key={c.jid}
                onClick={() => setSelectedJid(c.jid)}
                style={{ width: '100%', border: 'none', background: selectedJid === c.jid ? 'var(--accent-dim)' : 'transparent', textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name || c.jid.split('@')[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage || 'Sin mensajes'}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
            {selectedChat ? (selectedChat.name || selectedChat.jid.split('@')[0]) : 'Conversacion'}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10, background: 'var(--bg-elevated)' }}>
            {!selectedJid ? (
              <div style={{ color: 'var(--text-muted)' }}>Selecciona un chat.</div>
            ) : !messages.length ? (
              <div style={{ color: 'var(--text-muted)' }}>Sin mensajes en este chat.</div>
            ) : messages.map((m, i) => (
              <div key={`${m.id || i}`} style={{ display: 'flex', justifyContent: m.fromMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{ maxWidth: '78%', background: m.fromMe ? 'var(--accent-dim)' : 'var(--bg-surface)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 10, fontSize: 13 }}>
                  <div>{m.body || ''}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="Escribe un mensaje" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }} />
            <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !selectedJid}>Enviar</button>
          </div>
        </div>

        <div className="card" style={{ padding: 10, overflowY: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Cuenta y perfil</div>
          {!selectedAccountId ? (
            <div style={{ color: 'var(--text-muted)' }}>Selecciona una cuenta para ver estado.</div>
          ) : (
            <>
              <div style={{ fontSize: 12, marginBottom: 6 }}>ID cuenta: {selectedAccountId}</div>
              <div style={{ fontSize: 12, marginBottom: 10 }}>Tipo: {accounts.find((a) => String(a.id) === String(selectedAccountId))?.account_type || '-'}</div>
              {qrProfile ? (
                <div style={{ fontSize: 12 }}>
                  <div style={{ marginBottom: 6 }}><strong>Nombre:</strong> {qrProfile.name || '-'}</div>
                  <div style={{ marginBottom: 6 }}><strong>Telefono:</strong> {qrProfile.phone || '-'}</div>
                  <div style={{ marginBottom: 6 }}><strong>Estado:</strong> {qrProfile.status || '-'}</div>
                  <div style={{ marginBottom: 6 }}><strong>ID sesion:</strong> {qrProfile.id || '-'}</div>
                </div>
              ) : accountProfile?.error ? (
                <div style={{ fontSize: 12, color: 'var(--warning)' }}>Perfil no disponible: {String(accountProfile.error)}</div>
              ) : (
                <pre style={{ fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(accountProfile?.profile || {}, null, 2)}</pre>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
