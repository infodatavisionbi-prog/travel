import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bug, CheckCheck, Edit, FileText, Loader2, MessageCircle,
  Plus, QrCode, RefreshCw, Search, Send, Smartphone, Trash2,
  Users, Wifi, WifiOff, X,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'

const TABS = ['Chat', 'Cuentas', 'Plantillas', 'Contactos', 'Debug']

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

const STATUS_META = {
  not_started:  { label: 'Desconectado',  color: '#8696a0', spin: false },
  starting:     { label: 'Iniciando…',    color: '#f59e0b', spin: true  },
  waiting_qr:   { label: 'Escanear QR',   color: '#3b82f6', spin: false },
  connected:    { label: 'Conectado',     color: '#25d366', spin: false },
  reconnecting: { label: 'Reconectando', color: '#f59e0b', spin: true  },
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

function StatusChip({ status, phone }) {
  const meta = STATUS_META[status] || STATUS_META.not_started
  const Icon = status === 'connected'
    ? Wifi
    : status === 'not_started'
    ? WifiOff
    : status === 'waiting_qr'
    ? QrCode
    : Loader2
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, padding: '3px 10px', borderRadius: 20,
      background: '#202c33', color: meta.color,
    }}>
      <Icon size={12} className={meta.spin ? 'animate-spin' : ''} />
      {meta.label}
      {phone ? ` · +${phone}` : ''}
    </span>
  )
}

function ConnectionCenter({ qrState, loading, onStart, onDisconnect, onSyncAccount }) {
  const s = qrState.status
  const isConnected   = s === 'connected'
  const isWaiting     = s === 'waiting_qr'
  const isLoading     = s === 'starting' || s === 'reconnecting'
  const isIdle        = s === 'not_started'

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 20, padding: 40,
      background: 'radial-gradient(circle at 50% 30%, #101a20 0%, #0b141a 100%)',
    }}>
      {isIdle && (
        <>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#202c33', display: 'grid', placeItems: 'center' }}>
            <Smartphone size={38} color="#25d366" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e9edef', marginBottom: 8 }}>Conectar WhatsApp</div>
            <div style={{ fontSize: 13, color: '#8696a0', maxWidth: 300, lineHeight: 1.6 }}>
              Vincula tu número de WhatsApp escaneando el código QR desde tu teléfono.
            </div>
          </div>
          <button
            onClick={onStart}
            disabled={loading}
            style={{
              background: '#25d366', border: 'none', color: '#111b21',
              fontWeight: 700, padding: '12px 32px', borderRadius: 24,
              fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <QrCode size={18} /> Generar código QR
          </button>
        </>
      )}

      {isLoading && (
        <>
          <Loader2 size={52} color="#25d366" className="animate-spin" />
          <div style={{ fontSize: 16, color: '#8696a0', fontWeight: 600 }}>
            {STATUS_META[s]?.label}
          </div>
        </>
      )}

      {isWaiting && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e9edef' }}>Escanea con tu teléfono</div>
          {qrState.qr ? (
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <img src={qrState.qr} alt="QR" style={{ width: 232, height: 232, display: 'block' }} />
            </div>
          ) : (
            <Loader2 size={40} color="#25d366" className="animate-spin" />
          )}
          <div style={{ fontSize: 12, color: '#8696a0', textAlign: 'center', maxWidth: 300, lineHeight: 1.7 }}>
            Abre WhatsApp en tu teléfono →<br />
            <strong style={{ color: '#e9edef' }}>Dispositivos vinculados → Vincular dispositivo</strong>
          </div>
        </>
      )}

      {isConnected && (
        <>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(37,211,102,0.15)', display: 'grid', placeItems: 'center', border: '2px solid #25d366' }}>
            <Wifi size={38} color="#25d366" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e9edef', marginBottom: 4 }}>Conectado</div>
            {qrState.phone && <div style={{ fontSize: 15, color: '#25d366' }}>+{qrState.phone}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onSyncAccount}
              disabled={loading}
              style={{ background: '#202c33', border: '1px solid #374248', color: '#e9edef', padding: '9px 20px', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}
            >
              Sincronizar cuenta
            </button>
            <button
              onClick={onDisconnect}
              disabled={loading}
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', padding: '9px 20px', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}
            >
              Desconectar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function WhatsAppPage() {
  const [tab, setTab]       = useState('Chat')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const [accounts, setAccounts]             = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [showAccountModal, setShowAccountModal]   = useState(false)
  const [accountForm, setAccountForm]             = useState(emptyForm)

  const [qrState, setQrState]       = useState({ status: 'not_started', qr: null, phone: null })
  const [chats, setChats]           = useState([])
  const [chatFilter, setChatFilter] = useState('')
  const [selectedJid, setSelectedJid] = useState('')
  const [messages, setMessages]     = useState([])
  const [messageText, setMessageText] = useState('')

  const [profile, setProfile]           = useState(null)
  const [profileError, setProfileError] = useState('')
  const [templates, setTemplates]       = useState([])
  const [contacts, setContacts]         = useState([])
  const [debugInfo, setDebugInfo]       = useState(null)
  const [webhookLogs, setWebhookLogs]   = useState([])

  const messagesEndRef = useRef(null)

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId],
  )

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) =>
      `${c.name || ''} ${c.jid || ''} ${c.lastMessage || ''}`.toLowerCase().includes(q),
    )
  }, [chats, chatFilter])

  const isConnected = qrState.status === 'connected'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const run = async (fn) => {
    setLoading(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(extractError(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    const data = await apiFetch('/whatsapp/accounts')
    const list = Array.isArray(data) ? data : []
    setAccounts(list)
    if (list.length) setSelectedAccountId((prev) => prev || String(list[0].id))
    else setSelectedAccountId('')
  }, [])

  const loadQr = useCallback(async () => {
    const [s, q] = await Promise.all([
      apiFetch('/wa-qr/status').catch(() => ({ status: 'not_started', phone: null })),
      apiFetch('/wa-qr/qr').catch(() => ({ qr: null })),
    ])
    setQrState({
      status: s.status || 'not_started',
      qr:     q.qr || null,
      phone:  s.phone || q.phone || null,
    })
  }, [])

  const loadChats = useCallback(async () => {
    const data = await apiFetch('/wa-qr/chats').catch(() => ({ chats: [] }))
    const list = Array.isArray(data?.chats) ? data.chats : []
    setChats(list)
    setSelectedJid((prev) => (prev || (list[0]?.jid ?? '')))
  }, [])

  const loadMessages = useCallback(async (jid) => {
    if (!jid) return
    const data = await apiFetch(`/wa-qr/messages?jid=${encodeURIComponent(jid)}`).catch(() => ({ messages: [] }))
    setMessages(Array.isArray(data?.messages) ? data.messages : [])
  }, [])

  const loadProfile = useCallback(async (accId, accType) => {
    if (!accId) { setProfile(null); setProfileError(''); return }
    if (accType === 'qr') {
      const d = await apiFetch('/wa-qr/profile').catch(() => ({ ok: false, profile: null }))
      setProfile(d?.profile || null); setProfileError('')
      return
    }
    const d = await apiFetch(`/whatsapp/accounts/${accId}/profile`).catch((e) => ({ profile: null, error: extractError(e) }))
    setProfile(d?.profile || null)
    setProfileError(d?.error || '')
  }, [])

  const loadTemplates = useCallback(async (accId, accType) => {
    if (!accId || accType === 'qr') { setTemplates([]); return }
    const d = await apiFetch(`/whatsapp/accounts/${accId}/templates`).catch(() => ({ templates: [] }))
    setTemplates(Array.isArray(d?.templates) ? d.templates : [])
  }, [])

  const loadContactsAndDebug = useCallback(async () => {
    const [c, d, l] = await Promise.all([
      apiFetch('/wa-qr/contacts').catch(() => ({ contacts: [] })),
      apiFetch('/wa-qr/debug').catch(() => ({})),
      apiFetch('/whatsapp/webhook/logs?limit=60').catch(() => []),
    ])
    setContacts(Array.isArray(c?.contacts) ? c.contacts : [])
    setDebugInfo(d || null)
    setWebhookLogs(Array.isArray(l) ? l : [])
  }, [])

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    run(async () => {
      await Promise.all([loadAccounts(), loadQr(), loadChats(), loadContactsAndDebug()])
    })
  }, [])

  useEffect(() => {
    if (!selectedAccountId) return
    const acc = accounts.find((a) => String(a.id) === selectedAccountId)
    loadProfile(selectedAccountId, acc?.account_type)
    loadTemplates(selectedAccountId, acc?.account_type)
  }, [selectedAccountId, accounts])

  useEffect(() => {
    if (!selectedJid) return
    run(() => loadMessages(selectedJid))
  }, [selectedJid])

  useEffect(() => {
    const live = new Set(['starting', 'waiting_qr', 'reconnecting', 'connected'])
    if (!live.has(qrState.status)) return
    const timer = setInterval(async () => {
      await loadQr().catch(() => {})
      await loadChats().catch(() => {})
      if (selectedJid) await loadMessages(selectedJid).catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [qrState.status, selectedJid])

  // ── Actions ───────────────────────────────────────────────────────────────

  const startQr = () => run(async () => {
    await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) })
    await loadQr()
  })

  const syncQrAccount = () => run(async () => {
    if (!qrState.phone) throw new Error('No hay teléfono conectado')
    await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone }) })
    await loadAccounts()
  })

  const disconnectQr = () => run(async () => {
    await apiFetch('/wa-qr/disconnect', { method: 'DELETE' })
    setChats([])
    setSelectedJid('')
    setMessages([])
    await loadQr()
  })

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text || !selectedJid || loading) return
    setLoading(true); setError('')
    try {
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
    } catch (e) {
      setError(extractError(e))
    } finally {
      setLoading(false)
    }
  }

  const loadMoreMessages = async () => {
    if (!selectedJid || loadingMore) return
    setLoadingMore(true)
    try {
      await apiFetch('/wa-qr/fetch-history', { method: 'POST', body: JSON.stringify({ jid: selectedJid }) })
      await loadMessages(selectedJid)
    } catch (e) {
      setError(extractError(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const reloadAll = () => run(async () => {
    await Promise.all([loadAccounts(), loadQr(), loadChats(), loadContactsAndDebug()])
    if (selectedJid) await loadMessages(selectedJid)
  })

  const openAddAccount = () => {
    setAccountForm({ ...emptyForm, name: `Cuenta ${accounts.length + 1}`, phone_number: qrState.phone || '' })
    setShowAccountModal(true)
  }

  const openEditAccount = (acc) => {
    setAccountForm({
      id: String(acc.id), account_type: acc.account_type || 'api',
      name: acc.name || '', phone_number: acc.phone_number || '',
      phone_number_id: acc.phone_number_id || '', waba_id: acc.waba_id || '',
      access_token: '', webhook_verify_token: acc.webhook_verify_token || '',
    })
    setShowAccountModal(true)
  }

  const saveAccount = () => run(async () => {
    const isEdit = !!accountForm.id
    const payload = {
      account_type: accountForm.account_type, name: accountForm.name.trim(),
      phone_number: accountForm.phone_number.trim(), phone_number_id: accountForm.phone_number_id.trim(),
      waba_id: accountForm.waba_id.trim(), access_token: accountForm.access_token.trim(),
      webhook_verify_token: accountForm.webhook_verify_token.trim(),
    }
    if (!payload.name) throw new Error('Nombre requerido')
    if (payload.account_type === 'api' && !isEdit && (!payload.phone_number_id || !payload.access_token)) {
      throw new Error('Phone Number ID y Access Token requeridos para cuentas API')
    }
    if (isEdit) {
      await apiFetch(`/whatsapp/accounts/${accountForm.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    } else {
      await apiFetch('/whatsapp/accounts', { method: 'POST', body: JSON.stringify(payload) })
    }
    setShowAccountModal(false)
    setAccountForm(emptyForm)
    await loadAccounts()
  })

  const deleteAccount = (id) => run(async () => {
    await apiFetch(`/whatsapp/accounts/${id}`, { method: 'DELETE' })
    await loadAccounts()
  })

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(Number(ts))
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  }

  const chatName = (jid) => {
    const c = chats.find((x) => x.jid === jid)
    return c?.name || jid?.split('@')[0] || ''
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="wa-web-wrap">

      {/* ── Top bar ── */}
      <div className="wa-web-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="wa-web-title">WhatsApp</div>
          <StatusChip status={qrState.status} phone={qrState.phone} />
        </div>
        <div className="wa-web-actions">
          <button className="btn btn-secondary" onClick={reloadAll} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button className="btn btn-primary" onClick={openAddAccount} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Agregar cuenta
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          marginTop: 10, padding: '9px 14px', borderRadius: 9,
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
          fontSize: 12, color: '#f87171',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="company-tabs" style={{ marginTop: 12, marginBottom: 10 }}>
        {TABS.map((t) => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'Chat' && <MessageCircle size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Cuentas' && <Users size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Plantillas' && <FileText size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Contactos' && <Users size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Debug' && <Bug size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t}
          </button>
        ))}
      </div>

      {/* ════════════════ CHAT TAB ════════════════ */}
      {tab === 'Chat' && (
        <div
          className="wa-web-shell"
          style={{
            height: '76vh',
            gridTemplateColumns: '340px 1fr',
          }}
        >
          {/* Left: chat list */}
          <aside className="wa-web-left">
            <div className="wa-web-left-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <MessageCircle size={16} /> Chats
              </span>
              {!isConnected && (
                <button
                  onClick={startQr}
                  disabled={loading || qrState.status === 'starting' || qrState.status === 'waiting_qr'}
                  style={{
                    background: '#25d366', border: 'none', color: '#111b21',
                    fontWeight: 700, fontSize: 11, padding: '4px 12px', borderRadius: 16,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {(qrState.status === 'starting' || qrState.status === 'waiting_qr')
                    ? <Loader2 size={11} className="animate-spin" />
                    : <QrCode size={11} />}
                  Conectar
                </button>
              )}
              {isConnected && (
                <span style={{ fontSize: 10, color: '#25d366', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Wifi size={10} /> Online
                </span>
              )}
            </div>

            <div className="wa-web-left-search">
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8696a0', pointerEvents: 'none' }} />
                <input
                  className="form-input"
                  placeholder="Buscar chat…"
                  value={chatFilter}
                  onChange={(e) => setChatFilter(e.target.value)}
                  style={{ paddingLeft: 32, background: '#202c33', border: 'none', color: '#e9edef', borderRadius: 8 }}
                />
              </div>
            </div>

            <div className="wa-web-left-list">
              {filteredChats.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8696a0', fontSize: 13 }}>
                  {isConnected ? (chatFilter ? 'Sin resultados' : 'Sin chats') : 'Conecta para ver tus chats'}
                </div>
              )}
              {filteredChats.map((c) => (
                <button
                  key={c.jid}
                  className={`wa-web-chat ${selectedJid === c.jid ? 'active' : ''}`}
                  onClick={() => setSelectedJid(c.jid)}
                >
                  <div className="wa-web-chat-avatar" style={{ flexShrink: 0 }}>
                    {(c.name || c.jid).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="wa-web-chat-main">
                    <div className="wa-web-chat-row">
                      <span style={{ fontWeight: c.unread > 0 ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name || c.jid.split('@')[0]}
                      </span>
                      <small style={{ flexShrink: 0 }}>{formatTime(c.lastAt)}</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
                      <span className="wa-web-chat-last" style={{ flex: 1 }}>
                        {c.lastFromMe && (
                          <CheckCheck size={11} style={{ marginRight: 3, color: '#53bdeb', verticalAlign: 'middle' }} />
                        )}
                        {c.lastMessage || 'Sin mensajes'}
                      </span>
                      {c.unread > 0 && (
                        <span style={{
                          minWidth: 20, height: 20, borderRadius: 10, background: '#25d366',
                          color: '#111b21', fontSize: 11, fontWeight: 700, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0,
                        }}>
                          {c.unread > 99 ? '99+' : c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* Main: messages OR connection center */}
          <main className="wa-web-main" style={{ position: 'relative' }}>
            {!selectedJid ? (
              <ConnectionCenter
                qrState={qrState}
                loading={loading}
                onStart={startQr}
                onDisconnect={disconnectQr}
                onSyncAccount={syncQrAccount}
              />
            ) : (
              <>
                {/* Chat header */}
                <header className="wa-web-main-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', background: '#54656f',
                      display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0,
                    }}>
                      {chatName(selectedJid).slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="wa-web-contact">{chatName(selectedJid)}</div>
                      <div className="wa-web-contact-sub">+{selectedJid.split('@')[0]}</div>
                    </div>
                  </div>
                  <div className="wa-web-main-tools">
                    <button
                      onClick={loadMoreMessages}
                      disabled={loadingMore}
                      title="Cargar mensajes anteriores"
                      style={{
                        background: 'none', border: 'none', color: '#aebac1',
                        cursor: 'pointer', padding: 7, borderRadius: 8, display: 'flex', alignItems: 'center',
                      }}
                    >
                      {loadingMore
                        ? <Loader2 size={17} className="animate-spin" />
                        : <RefreshCw size={17} />}
                    </button>
                  </div>
                </header>

                {/* Messages */}
                <div className="wa-web-messages">
                  {messages.length === 0 && (
                    <div className="wa-web-empty" style={{ textAlign: 'center', paddingTop: 48 }}>
                      Sin mensajes en esta conversación
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={m.id || i} className={`wa-web-msg-row ${m.fromMe ? 'me' : 'other'}`}>
                      <div className={`wa-web-msg ${m.fromMe ? 'me' : 'other'}`}>
                        <div style={{ wordBreak: 'break-word' }}>{m.body || ''}</div>
                        <div className="wa-web-msg-meta">
                          {formatTime(m.ts)}
                          {m.fromMe && (
                            <CheckCheck
                              size={13}
                              style={{ marginLeft: 4, verticalAlign: 'middle', color: '#53bdeb' }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <footer className="wa-web-input">
                  <input
                    className="form-input"
                    placeholder={isConnected ? 'Escribe un mensaje…' : 'Conecta WhatsApp para enviar mensajes'}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                    }}
                    disabled={!isConnected}
                    style={{ background: '#2a3942', border: 'none', color: '#e9edef', flex: 1 }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={loading || !selectedJid || !messageText.trim() || !isConnected}
                    style={{
                      background: messageText.trim() && isConnected ? '#25d366' : '#374248',
                      border: 'none', color: messageText.trim() && isConnected ? '#111b21' : '#8696a0',
                      padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.2s, color 0.2s',
                    }}
                  >
                    <Send size={16} />
                  </button>
                </footer>
              </>
            )}
          </main>
        </div>
      )}

      {/* ════════════════ CUENTAS TAB ════════════════ */}
      {tab === 'Cuentas' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Cuentas de WhatsApp</h3>
            <select
              className="form-select"
              style={{ width: 220 }}
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">Selecciona cuenta…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th>Phone ID</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin cuentas configuradas</td></tr>
                )}
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 12,
                        background: a.account_type === 'qr' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                        color: a.account_type === 'qr' ? '#22c55e' : '#3b82f6',
                      }}>
                        {a.account_type === 'qr' ? 'QR / Baileys' : 'API Cloud'}
                      </span>
                    </td>
                    <td>{a.phone_number || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.phone_number_id || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setSelectedAccountId(String(a.id)); openEditAccount(a) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Edit size={12} /> Editar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteAccount(a.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedAccount && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ fontWeight: 600 }}>Perfil — {selectedAccount.name}</h4>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadProfile(selectedAccountId, selectedAccount.account_type)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RefreshCw size={12} /> Actualizar
                </button>
              </div>
              {profileError && (
                <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{profileError}</div>
              )}
              {profile ? (
                <pre style={{
                  background: 'var(--bg-elevated)', padding: 14, borderRadius: 9,
                  fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {JSON.stringify(profile, null, 2)}
                </pre>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
                  Sin datos de perfil disponibles
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ════════════════ PLANTILLAS TAB ════════════════ */}
      {tab === 'Plantillas' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Plantillas de mensaje</h3>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const acc = accounts.find((a) => String(a.id) === selectedAccountId)
                run(() => loadTemplates(selectedAccountId, acc?.account_type))
              }}
              disabled={loading || !selectedAccountId}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} /> Recargar
            </button>
          </div>

          {!selectedAccountId && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Selecciona una cuenta en la pestaña Cuentas.</div>
          )}
          {selectedAccountId && selectedAccount?.account_type === 'qr' && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Las plantillas solo están disponibles para cuentas API (WhatsApp Cloud).
            </div>
          )}

          {templates.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Idioma</th><th>Estado</th></tr></thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id || t.name}>
                      <td style={{ fontWeight: 600 }}>{t.name || '—'}</td>
                      <td>{t.language || '—'}</td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 12,
                          background: t.status === 'APPROVED' ? 'rgba(34,197,94,0.1)' : 'rgba(217,119,6,0.1)',
                          color: t.status === 'APPROVED' ? '#22c55e' : '#d97706',
                        }}>
                          {t.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {templates.length === 0 && selectedAccountId && selectedAccount?.account_type === 'api' && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>Sin plantillas cargadas.</div>
          )}
        </section>
      )}

      {/* ════════════════ CONTACTOS TAB ════════════════ */}
      {tab === 'Contactos' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>
              Contactos sincronizados
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13, marginLeft: 8 }}>({contacts.length})</span>
            </h3>
            <button
              className="btn btn-secondary"
              onClick={() => run(loadContactsAndDebug)}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} /> Actualizar
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Teléfono</th></tr></thead>
              <tbody>
                {contacts.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                    Sin contactos. Conecta WhatsApp y espera la sincronización.
                  </td></tr>
                )}
                {contacts.slice(0, 300).map((c) => (
                  <tr key={c.jid}>
                    <td style={{ fontWeight: 500 }}>{c.name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>+{c.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contacts.length > 300 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Mostrando 300 de {contacts.length} contactos
            </div>
          )}
        </section>
      )}

      {/* ════════════════ DEBUG TAB ════════════════ */}
      {tab === 'Debug' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Diagnóstico de sesión</h3>
            <button className="btn btn-secondary" onClick={() => run(loadContactsAndDebug)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} /> Actualizar
            </button>
          </div>
          <pre style={{ background: 'var(--bg-elevated)', padding: 14, borderRadius: 9, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(debugInfo || {}, null, 2)}
          </pre>

          <h4 style={{ fontWeight: 600, marginTop: 20, marginBottom: 10 }}>
            Webhook logs
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13, marginLeft: 8 }}>({webhookLogs.length})</span>
          </h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>De</th><th>Mensaje</th></tr></thead>
              <tbody>
                {webhookLogs.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin logs de webhook</td></tr>
                )}
                {webhookLogs.map((l, i) => (
                  <tr key={l.id || i}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.from || '—'}</td>
                    <td>{l.body || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ════════════════ ACCOUNT MODAL ════════════════ */}
      {showAccountModal && (
        <div className="modal-overlay open" onClick={() => setShowAccountModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{accountForm.id ? 'Editar cuenta WhatsApp' : 'Agregar cuenta WhatsApp'}</h3>
              <button
                onClick={() => setShowAccountModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div className="form-group">
                <label>Nombre de la cuenta</label>
                <input
                  className="form-input"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Ventas Argentina"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Tipo de conexión</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { value: 'qr',  label: 'QR / Baileys',   desc: 'Número personal o Business' },
                    { value: 'api', label: 'API Cloud',       desc: 'WhatsApp Business API' },
                  ].map(({ value, label, desc }) => (
                    <label
                      key={value}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '10px 14px', borderRadius: 9, border: `1px solid ${accountForm.account_type === value ? 'var(--accent)' : 'var(--border)'}`,
                        background: accountForm.account_type === value ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        style={{ marginTop: 2 }}
                        checked={accountForm.account_type === value}
                        onChange={() => setAccountForm((f) => ({ ...f, account_type: value }))}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Teléfono</label>
                <input
                  className="form-input"
                  placeholder="+54 11 XXXX XXXX"
                  value={accountForm.phone_number}
                  onChange={(e) => setAccountForm((f) => ({ ...f, phone_number: e.target.value }))}
                />
              </div>

              {accountForm.account_type === 'api' && (
                <>
                  <div className="form-group">
                    <label>Phone Number ID</label>
                    <input
                      className="form-input"
                      placeholder="123456789012345"
                      value={accountForm.phone_number_id}
                      onChange={(e) => setAccountForm((f) => ({ ...f, phone_number_id: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>WABA ID</label>
                    <input
                      className="form-input"
                      placeholder="ID del Business Account"
                      value={accountForm.waba_id}
                      onChange={(e) => setAccountForm((f) => ({ ...f, waba_id: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Access Token</label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder={accountForm.id ? '(dejar vacío para no cambiar)' : 'EAAxx...'}
                      value={accountForm.access_token}
                      onChange={(e) => setAccountForm((f) => ({ ...f, access_token: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAccountModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={saveAccount}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {loading && <Loader2 size={13} className="animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
