import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmojiPickerLib from 'emoji-picker-react'
import {
  Bug, CheckCheck, Edit, File, FileText, ImageIcon, Loader2,
  MessageCircle, Mic, Paperclip, Phone, Play, Plus, QrCode,
  RefreshCw, Search, Send, Smartphone, Smile, Trash2, Users,
  Video, Wifi, WifiOff, X,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { apiFetch } from '../lib/api.js'

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

const TABS = ['Chat', 'Cuentas', 'Plantillas', 'Contactos', 'Debug']

const emptyForm = {
  id: '', account_type: 'qr', name: '', phone_number: '',
  phone_number_id: '', waba_id: '', access_token: '', webhook_verify_token: '',
}

const STATUS_META = {
  not_started:  { label: 'Desconectado',  color: '#8696a0', spin: false },
  starting:     { label: 'Iniciando…',    color: '#f59e0b', spin: true  },
  waiting_qr:   { label: 'Escanear QR',   color: '#3b82f6', spin: false },
  connected:    { label: 'Conectado',     color: '#25d366', spin: false },
  reconnecting: { label: 'Reconectando', color: '#f59e0b', spin: true  },
}

const API_URL = import.meta.env.VITE_API_URL || window.location.origin

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

const extractError = (e) => {
  try {
    const raw = String(e?.message || 'Error')
    const parsed = JSON.parse(raw)
    return parsed?.detail || parsed?.message || raw
  } catch {
    return String(e?.message || 'Error')
  }
}

const hasName = (name) => name && !/^\d+$/.test(name)

async function fetchBlob(path) {
  const token = localStorage.getItem('dv_token')
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

/* ─────────────────────────────────────────────────────────────────────────────
   MEDIA BUBBLE
───────────────────────────────────────────────────────────────────────────── */

function MediaBubble({ msg, jid }) {
  const { type, caption, fileName, ptt, seconds } = msg.media
  const [src, setSrc]         = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(false)

  const load = useCallback(async () => {
    if (src || loading || err) return
    setLoading(true)
    try {
      const blob = await fetchBlob(
        `/wa-qr/media?jid=${encodeURIComponent(jid)}&msg_id=${encodeURIComponent(msg.id)}`,
      )
      setSrc(URL.createObjectURL(blob))
    } catch {
      setErr(true)
    } finally {
      setLoading(false)
    }
  }, [src, loading, err, jid, msg.id])

  // Auto-load images, audio and stickers
  useEffect(() => {
    if (['image', 'audio', 'sticker'].includes(type)) load()
  }, [])

  if (err) {
    return (
      <div style={{ fontSize: 12, color: 'var(--wa-muted)', fontStyle: 'italic' }}>
        Media no disponible
      </div>
    )
  }

  const spinner = <Loader2 size={18} className="animate-spin" style={{ color: '#25d366' }} />

  /* ── Sticker ── */
  if (type === 'sticker') {
    return loading
      ? <div style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{spinner}</div>
      : src ? <img src={src} alt="sticker" style={{ width: 100, height: 100, objectFit: 'contain' }} /> : null
  }

  /* ── Image ── */
  if (type === 'image') {
    return (
      <div>
        {loading && (
          <div style={{ width: 220, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.06)', borderRadius: 8 }}>
            {spinner}
          </div>
        )}
        {src && (
          <img
            src={src} alt={caption || 'imagen'}
            style={{ maxWidth: 280, maxHeight: 320, borderRadius: 8, display: 'block', cursor: 'zoom-in' }}
            onClick={() => window.open(src, '_blank')}
          />
        )}
        {caption && <div style={{ marginTop: 5, fontSize: 13 }}>{caption}</div>}
      </div>
    )
  }

  /* ── Audio / Voice ── */
  if (type === 'audio') {
    const mm = Math.floor((seconds || 0) / 60)
    const ss = String((seconds || 0) % 60).padStart(2, '0')
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(37,211,102,0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Mic size={15} color="#25d366" />
        </div>
        {loading
          ? spinner
          : src
            ? <audio controls src={src} style={{ flex: 1, height: 32 }} />
            : <div style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.12)', borderRadius: 2 }} />
        }
        {seconds > 0 && <span style={{ fontSize: 11, color: 'var(--wa-muted)', flexShrink: 0 }}>{mm}:{ss}</span>}
      </div>
    )
  }

  /* ── Video ── */
  if (type === 'video') {
    return (
      <div>
        {!src ? (
          <button
            onClick={load}
            disabled={loading}
            style={{ background: 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 10, padding: '18px 28px', cursor: 'pointer', color: 'var(--wa-text)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
          >
            {loading ? spinner : <><Play size={18} /> Cargar video</>}
          </button>
        ) : (
          <video controls src={src} style={{ maxWidth: 280, borderRadius: 8, display: 'block' }} />
        )}
        {caption && <div style={{ marginTop: 5, fontSize: 13 }}>{caption}</div>}
      </div>
    )
  }

  /* ── Document ── */
  const handleDocDownload = async () => {
    if (loading) return
    setLoading(true)
    try {
      const blob = await fetchBlob(
        `/wa-qr/media?jid=${encodeURIComponent(jid)}&msg_id=${encodeURIComponent(msg.id)}`,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName || 'archivo'; a.click()
      URL.revokeObjectURL(url)
    } catch { setErr(true) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(37,211,102,0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <File size={20} color="#25d366" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName || 'archivo'}
        </div>
        <button
          onClick={handleDocDownload}
          disabled={loading}
          style={{ fontSize: 11, color: '#25d366', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {loading ? 'Descargando…' : 'Descargar'}
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS CHIP
───────────────────────────────────────────────────────────────────────────── */

function StatusChip({ status, phone }) {
  const meta = STATUS_META[status] || STATUS_META.not_started
  const Icon = status === 'connected' ? Wifi : status === 'not_started' ? WifiOff : status === 'waiting_qr' ? QrCode : Loader2
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--wa-chip-bg)', color: meta.color }}>
      <Icon size={12} className={meta.spin ? 'animate-spin' : ''} />
      {meta.label}{phone ? ` · +${phone}` : ''}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONNECTION CENTER
───────────────────────────────────────────────────────────────────────────── */

function ConnectionCenter({ qrState, loading, onStart, onDisconnect, onSyncAccount }) {
  const s = qrState.status
  const isConnected = s === 'connected'
  const isWaiting   = s === 'waiting_qr'
  const isLoading   = s === 'starting' || s === 'reconnecting'
  const isIdle      = s === 'not_started'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, background: 'var(--wa-center-bg)' }}>
      {isIdle && (
        <>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--wa-header)', display: 'grid', placeItems: 'center' }}>
            <Smartphone size={38} color="#25d366" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--wa-text)', marginBottom: 8 }}>Conectar WhatsApp</div>
            <div style={{ fontSize: 13, color: 'var(--wa-muted)', maxWidth: 300, lineHeight: 1.6 }}>
              Vincula tu número escaneando el código QR desde tu teléfono.
            </div>
          </div>
          <button onClick={onStart} disabled={loading} style={{ background: '#25d366', border: 'none', color: '#111b21', fontWeight: 700, padding: '12px 32px', borderRadius: 24, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrCode size={18} /> Generar código QR
          </button>
        </>
      )}
      {isLoading && (
        <>
          <Loader2 size={52} color="#25d366" className="animate-spin" />
          <div style={{ fontSize: 16, color: 'var(--wa-muted)', fontWeight: 600 }}>{STATUS_META[s]?.label}</div>
        </>
      )}
      {isWaiting && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--wa-text)' }}>Escanea con tu teléfono</div>
          {qrState.qr
            ? <div style={{ background: '#fff', padding: 14, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <img src={qrState.qr} alt="QR" style={{ width: 232, height: 232, display: 'block' }} />
              </div>
            : <Loader2 size={40} color="#25d366" className="animate-spin" />}
          <div style={{ fontSize: 12, color: 'var(--wa-muted)', textAlign: 'center', maxWidth: 300, lineHeight: 1.7 }}>
            Abre WhatsApp en tu teléfono →<br />
            <strong style={{ color: 'var(--wa-text)' }}>Dispositivos vinculados → Vincular dispositivo</strong>
          </div>
        </>
      )}
      {isConnected && (
        <>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(37,211,102,0.15)', display: 'grid', placeItems: 'center', border: '2px solid #25d366' }}>
            <Wifi size={38} color="#25d366" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--wa-text)', marginBottom: 4 }}>Conectado</div>
            {qrState.phone && <div style={{ fontSize: 15, color: '#25d366' }}>+{qrState.phone}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onSyncAccount} disabled={loading} style={{ background: 'var(--wa-header)', border: '1px solid var(--wa-border)', color: 'var(--wa-text)', padding: '9px 20px', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}>
              Sincronizar cuenta
            </button>
            <button onClick={onDisconnect} disabled={loading} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', padding: '9px 20px', borderRadius: 20, fontSize: 13, cursor: 'pointer' }}>
              Desconectar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */

export default function WhatsAppPage() {
  const { theme } = useTheme()

  const [tab, setTab]       = useState('Chat')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [sendingMedia, setSendingMedia] = useState(false)
  const [showEmoji, setShowEmoji]       = useState(false)

  const [accounts, setAccounts]                   = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [showAccountModal, setShowAccountModal]   = useState(false)
  const [accountForm, setAccountForm]             = useState(emptyForm)

  const [qrState, setQrState]         = useState({ status: 'not_started', qr: null, phone: null })
  const [chats, setChats]             = useState([])
  const [chatFilter, setChatFilter]   = useState('')
  const [selectedJid, setSelectedJid] = useState('')
  const [messages, setMessages]       = useState([])
  const [messageText, setMessageText] = useState('')

  const [profile, setProfile]           = useState(null)
  const [profileError, setProfileError] = useState('')
  const [templates, setTemplates]       = useState([])
  const [contacts, setContacts]         = useState([])
  const [debugInfo, setDebugInfo]       = useState(null)
  const [webhookLogs, setWebhookLogs]   = useState([])

  const messagesEndRef = useRef(null)
  const prevStatusRef  = useRef('not_started')
  const fastPollRef    = useRef(null)
  const fileInputRef   = useRef(null)
  const emojiRef       = useRef(null)
  const inputRef       = useRef(null)

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId],
  )

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase()
    if (!q) return chats
    const qDigits = q.replace(/\D/g, '')
    return chats.filter((c) => {
      const phone = c.jid?.split('@')[0] || ''
      const name  = (c.name || '').toLowerCase()
      const last  = (c.lastMessage || '').toLowerCase()
      return name.includes(q) || last.includes(q)
        || c.jid?.toLowerCase().includes(q)
        || (qDigits.length >= 3 && phone.includes(qDigits))
    })
  }, [chats, chatFilter])

  const isConnected = qrState.status === 'connected'

  // Auto-scroll to bottom
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e) => { if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── run helper ── */
  const run = async (fn) => {
    setLoading(true); setError('')
    try { await fn() } catch (e) { setError(extractError(e)) } finally { setLoading(false) }
  }

  /* ── Data loaders ── */
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
    setQrState({ status: s.status || 'not_started', qr: q.qr || null, phone: s.phone || q.phone || null })
  }, [])

  const loadChats = useCallback(async () => {
    const data = await apiFetch('/wa-qr/chats').catch(() => ({ chats: [] }))
    const list = Array.isArray(data?.chats) ? data.chats : []
    setChats(list)
    setSelectedJid((prev) => prev || (list[0]?.jid ?? ''))
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
      setProfile(d?.profile || null); setProfileError(''); return
    }
    const d = await apiFetch(`/whatsapp/accounts/${accId}/profile`).catch((e) => ({ profile: null, error: extractError(e) }))
    setProfile(d?.profile || null); setProfileError(d?.error || '')
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

  /* ── Effects ── */
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

  // Fast-poll on connect
  useEffect(() => {
    const was = prevStatusRef.current
    const now = qrState.status
    prevStatusRef.current = now
    if (now === 'connected' && was !== 'connected') {
      clearInterval(fastPollRef.current)
      let ticks = 0
      fastPollRef.current = setInterval(async () => {
        await loadChats().catch(() => {})
        if (++ticks >= 20) clearInterval(fastPollRef.current)
      }, 1500)
    }
    if (now === 'not_started') clearInterval(fastPollRef.current)
  }, [qrState.status])

  // Regular polling
  useEffect(() => {
    const live = new Set(['starting', 'waiting_qr', 'reconnecting', 'connected'])
    if (!live.has(qrState.status)) return
    const timer = setInterval(async () => {
      await loadQr().catch(() => {})
      if (qrState.status === 'connected') await loadChats().catch(() => {})
      if (selectedJid) await loadMessages(selectedJid).catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [qrState.status, selectedJid])

  /* ── Actions ── */
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
    setChats([]); setSelectedJid(''); setMessages([])
    await loadQr()
  })

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text || !selectedJid || loading) return
    setLoading(true); setError('')
    try {
      const phone = selectedJid.split('@')[0]
      if (selectedAccount?.account_type === 'api') {
        await apiFetch('/whatsapp/send', { method: 'POST', body: JSON.stringify({ account_id: Number(selectedAccountId), phone, text }) })
      } else {
        await apiFetch('/wa-qr/send', { method: 'POST', body: JSON.stringify({ jid: selectedJid, to: phone, message: text }) })
      }
      setMessageText('')
      await Promise.all([loadMessages(selectedJid), loadChats()])
    } catch (e) { setError(extractError(e)) }
    finally { setLoading(false) }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedJid || !isConnected) return
    setSendingMedia(true); setError('')
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const mime = file.type
      let type = 'document'
      if (mime.startsWith('image/')) type = 'image'
      else if (mime.startsWith('audio/')) type = 'audio'
      else if (mime.startsWith('video/')) type = 'video'

      await apiFetch('/wa-qr/send-media', {
        method: 'POST',
        body: JSON.stringify({ to: selectedJid.split('@')[0], type, data: base64, mimetype: mime, filename: file.name, caption: '' }),
      })
      await Promise.all([loadMessages(selectedJid), loadChats()])
    } catch (err) { setError(extractError(err)) }
    finally { setSendingMedia(false); e.target.value = '' }
  }

  const loadMoreMessages = async () => {
    if (!selectedJid || loadingMore) return
    setLoadingMore(true)
    try {
      await apiFetch('/wa-qr/fetch-history', { method: 'POST', body: JSON.stringify({ jid: selectedJid }) })
      await loadMessages(selectedJid)
    } catch (err) { setError(extractError(err)) }
    finally { setLoadingMore(false) }
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
      throw new Error('Phone Number ID y Access Token requeridos para API')
    }
    if (isEdit) await apiFetch(`/whatsapp/accounts/${accountForm.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await apiFetch('/whatsapp/accounts', { method: 'POST', body: JSON.stringify(payload) })
    setShowAccountModal(false); setAccountForm(emptyForm)
    await loadAccounts()
  })

  const deleteAccount = (id) => run(async () => {
    await apiFetch(`/whatsapp/accounts/${id}`, { method: 'DELETE' })
    await loadAccounts()
  })

  /* ── Formatting ── */
  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(Number(ts))
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  }

  const chatName = (jid) => {
    const c = chats.find((x) => x.jid === jid)
    return c?.name || jid?.split('@')[0] || ''
  }

  /* ── Avatar ── */
  const ChatAvatar = ({ name, jid, size = 49 }) => {
    const label = name || jid?.split('@')[0] || ''
    const isNum = !hasName(label)
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--wa-avatar-bg)', display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--wa-text)', flexShrink: 0, fontSize: size * 0.34 }}>
        {isNum ? <Phone size={size * 0.38} strokeWidth={2} /> : label.slice(0, 1).toUpperCase()}
      </div>
    )
  }

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <section className="wa-web-wrap">

      {/* ── Header ── */}
      <div className="wa-web-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="wa-web-title">WhatsApp</div>
          <StatusChip status={qrState.status} phone={qrState.phone} />
        </div>
        <div className="wa-web-actions">
          <button className="btn btn-secondary" onClick={reloadAll} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Recargar
          </button>
          <button className="btn btn-primary" onClick={openAddAccount} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Agregar cuenta
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="company-tabs" style={{ marginTop: 12, marginBottom: 10 }}>
        {TABS.map((t) => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'Chat'       && <MessageCircle size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Cuentas'    && <Users size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Plantillas' && <FileText size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Contactos'  && <Phone size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t === 'Debug'      && <Bug size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />}
            {t}
          </button>
        ))}
      </div>

      {/* ════════ CHAT TAB ════════ */}
      {tab === 'Chat' && (
        <div className="wa-web-shell" style={{ gridTemplateColumns: '340px 1fr' }}>

          {/* Left: chat list */}
          <aside className="wa-web-left">
            <div className="wa-web-left-head" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MessageCircle size={16} /> Chats</span>
              {!isConnected
                ? <button onClick={startQr} disabled={loading || ['starting','waiting_qr'].includes(qrState.status)} style={{ background: '#25d366', border: 'none', color: '#111b21', fontWeight: 700, fontSize: 11, padding: '4px 12px', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {['starting','waiting_qr'].includes(qrState.status) ? <Loader2 size={11} className="animate-spin" /> : <QrCode size={11} />} Conectar
                  </button>
                : <span style={{ fontSize: 10, color: '#25d366', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                    <Wifi size={10} /> Online{chats.length > 0 && ` · ${chats.length}`}
                  </span>
              }
            </div>

            <div className="wa-web-left-search">
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--wa-muted)', pointerEvents: 'none' }} />
                <input className="form-input" placeholder="Buscar nombre o número…" value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} style={{ paddingLeft: 32 }} />
              </div>
            </div>

            {isConnected && chats.length === 0 && (
              <div className="wa-sync-banner">
                <Loader2 size={12} className="animate-spin" color="#25d366" />
                Sincronizando chats…
              </div>
            )}

            <div className="wa-web-left-list">
              {filteredChats.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--wa-muted)', fontSize: 13 }}>
                  {isConnected ? (chatFilter ? 'Sin resultados' : 'Esperando chats…') : 'Conecta para ver tus chats'}
                </div>
              )}
              {filteredChats.map((c) => (
                <button key={c.jid} className={`wa-web-chat ${selectedJid === c.jid ? 'active' : ''}`} onClick={() => setSelectedJid(c.jid)}>
                  <ChatAvatar name={c.name} jid={c.jid} />
                  <div className="wa-web-chat-main">
                    <div className="wa-web-chat-row">
                      <span style={{ fontWeight: c.unread > 0 ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name || c.jid.split('@')[0]}
                      </span>
                      <small style={{ flexShrink: 0 }}>{formatTime(c.lastAt)}</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
                      <span className="wa-web-chat-last">
                        {c.lastFromMe && <CheckCheck size={11} style={{ marginRight: 3, color: '#53bdeb', verticalAlign: 'middle' }} />}
                        {c.lastMessage || 'Sin mensajes'}
                      </span>
                      {c.unread > 0 && (
                        <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#25d366', color: '#111b21', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
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
              <ConnectionCenter qrState={qrState} loading={loading} onStart={startQr} onDisconnect={disconnectQr} onSyncAccount={syncQrAccount} />
            ) : (
              <>
                {/* Chat header */}
                <header className="wa-web-main-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ChatAvatar name={chatName(selectedJid)} jid={selectedJid} size={40} />
                    <div>
                      <div className="wa-web-contact">{chatName(selectedJid)}</div>
                      <div className="wa-web-contact-sub">+{selectedJid.split('@')[0]}</div>
                    </div>
                  </div>
                  <div className="wa-web-main-tools">
                    <button onClick={loadMoreMessages} disabled={loadingMore} title="Cargar mensajes anteriores" style={{ background: 'none', border: 'none', color: 'var(--wa-icon)', cursor: 'pointer', padding: 7, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                      {loadingMore ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                    </button>
                  </div>
                </header>

                {/* Messages */}
                <div className="wa-web-messages">
                  {messages.length === 0 && (
                    <div className="wa-web-empty" style={{ textAlign: 'center', paddingTop: 48 }}>Sin mensajes</div>
                  )}
                  {messages.map((m, i) => (
                    <div key={m.id || i} className={`wa-web-msg-row ${m.fromMe ? 'me' : 'other'}`}>
                      <div className={`wa-web-msg ${m.fromMe ? 'me' : 'other'}`}>
                        {m.media && <MediaBubble msg={m} jid={selectedJid} />}
                        {m.body && <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{m.body}</div>}
                        <div className="wa-web-msg-meta">
                          {formatTime(m.ts)}
                          {m.fromMe && <CheckCheck size={13} style={{ color: '#53bdeb' }} />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <footer className="wa-web-input" style={{ position: 'relative', flexDirection: 'column', gap: 0, padding: 0 }}>
                  {/* Emoji picker popup */}
                  {showEmoji && (
                    <div ref={emojiRef} style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', borderRadius: 12, overflow: 'hidden' }}>
                      <EmojiPickerLib
                        theme={theme === 'dark' ? 'dark' : 'light'}
                        onEmojiClick={(e) => {
                          setMessageText((prev) => prev + e.emoji)
                          inputRef.current?.focus()
                        }}
                        width={320}
                        height={380}
                        searchPlaceholder="Buscar emoji…"
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, padding: '10px 12px', alignItems: 'center' }}>
                    {/* Emoji button */}
                    <button
                      onClick={() => setShowEmoji((v) => !v)}
                      title="Emoji"
                      style={{ background: 'none', border: 'none', color: showEmoji ? '#25d366' : 'var(--wa-icon)', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', flexShrink: 0, transition: 'color 0.15s' }}
                    >
                      <Smile size={22} />
                    </button>

                    {/* Attach button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!isConnected || sendingMedia}
                      title="Adjuntar archivo"
                      style={{ background: 'none', border: 'none', color: 'var(--wa-icon)', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', flexShrink: 0 }}
                    >
                      {sendingMedia ? <Loader2 size={22} className="animate-spin" color="#25d366" /> : <Paperclip size={22} />}
                    </button>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={handleFileSelect} />

                    {/* Text input */}
                    <input
                      ref={inputRef}
                      className="form-input"
                      placeholder={isConnected ? 'Escribe un mensaje…' : 'Conecta WhatsApp para enviar mensajes'}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                      disabled={!isConnected}
                      style={{ flex: 1 }}
                    />

                    {/* Send button */}
                    <button
                      onClick={sendMessage}
                      disabled={loading || !selectedJid || !messageText.trim() || !isConnected}
                      style={{
                        background: messageText.trim() && isConnected ? '#25d366' : 'var(--wa-header)',
                        border: '1px solid var(--wa-border)',
                        color: messageText.trim() && isConnected ? '#111b21' : 'var(--wa-muted)',
                        padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </footer>
              </>
            )}
          </main>
        </div>
      )}

      {/* ════════ CUENTAS TAB ════════ */}
      {tab === 'Cuentas' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Cuentas de WhatsApp</h3>
            <select className="form-select" style={{ width: 220 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
              <option value="">Selecciona cuenta…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th>Phone ID</th><th>Acciones</th></tr></thead>
              <tbody>
                {accounts.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin cuentas</td></tr>}
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: a.account_type === 'qr' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)', color: a.account_type === 'qr' ? '#22c55e' : '#3b82f6' }}>{a.account_type === 'qr' ? 'QR / Baileys' : 'API Cloud'}</span></td>
                    <td>{a.phone_number || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.phone_number_id || '—'}</td>
                    <td><div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedAccountId(String(a.id)); openEditAccount(a) }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Edit size={12} /> Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Trash2 size={12} /> Eliminar</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedAccount && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ fontWeight: 600 }}>Perfil — {selectedAccount.name}</h4>
                <button className="btn btn-secondary btn-sm" onClick={() => loadProfile(selectedAccountId, selectedAccount.account_type)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={12} /> Actualizar</button>
              </div>
              {profileError && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{profileError}</div>}
              {profile ? <pre style={{ background: 'var(--bg-elevated)', padding: 14, borderRadius: 9, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(profile, null, 2)}</pre>
                : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin datos de perfil</div>}
            </div>
          )}
        </section>
      )}

      {/* ════════ PLANTILLAS TAB ════════ */}
      {tab === 'Plantillas' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Plantillas de mensaje</h3>
            <button className="btn btn-secondary" onClick={() => { const acc = accounts.find((a) => String(a.id) === selectedAccountId); run(() => loadTemplates(selectedAccountId, acc?.account_type)) }} disabled={loading || !selectedAccountId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} /> Recargar</button>
          </div>
          {!selectedAccountId && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Selecciona una cuenta.</div>}
          {selectedAccount?.account_type === 'qr' && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Solo disponible para cuentas API Cloud.</div>}
          {templates.length > 0 && <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Idioma</th><th>Estado</th></tr></thead><tbody>{templates.map((t) => <tr key={t.id || t.name}><td style={{ fontWeight: 600 }}>{t.name}</td><td>{t.language}</td><td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: t.status === 'APPROVED' ? 'rgba(34,197,94,0.1)' : 'rgba(217,119,6,0.1)', color: t.status === 'APPROVED' ? '#22c55e' : '#d97706' }}>{t.status}</span></td></tr>)}</tbody></table></div>}
        </section>
      )}

      {/* ════════ CONTACTOS TAB ════════ */}
      {tab === 'Contactos' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Contactos <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>({contacts.length})</span></h3>
            <button className="btn btn-secondary" onClick={() => run(loadContactsAndDebug)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} /> Actualizar</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Teléfono</th></tr></thead><tbody>
            {contacts.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin contactos</td></tr>}
            {contacts.slice(0, 300).map((c) => <tr key={c.jid}><td style={{ fontWeight: 500 }}>{c.name || '—'}</td><td style={{ fontFamily: 'monospace', fontSize: 12 }}>+{c.phone}</td></tr>)}
          </tbody></table></div>
          {contacts.length > 300 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>Mostrando 300 de {contacts.length}</div>}
        </section>
      )}

      {/* ════════ DEBUG TAB ════════ */}
      {tab === 'Debug' && (
        <section className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Diagnóstico</h3>
            <button className="btn btn-secondary" onClick={() => run(loadContactsAndDebug)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} /> Actualizar</button>
          </div>
          <pre style={{ background: 'var(--bg-elevated)', padding: 14, borderRadius: 9, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(debugInfo || {}, null, 2)}</pre>
          <h4 style={{ fontWeight: 600, marginTop: 20, marginBottom: 10 }}>Webhook logs ({webhookLogs.length})</h4>
          <div className="table-wrap"><table><thead><tr><th>De</th><th>Mensaje</th></tr></thead><tbody>
            {webhookLogs.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Sin logs</td></tr>}
            {webhookLogs.map((l, i) => <tr key={l.id || i}><td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.from || '—'}</td><td>{l.body || '—'}</td></tr>)}
          </tbody></table></div>
        </section>
      )}

      {/* ════════ ACCOUNT MODAL ════════ */}
      {showAccountModal && (
        <div className="modal-overlay open" onClick={() => setShowAccountModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{accountForm.id ? 'Editar cuenta' : 'Agregar cuenta WhatsApp'}</h3>
              <button onClick={() => setShowAccountModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div className="form-group"><label>Nombre</label><input className="form-input" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Ventas Argentina" /></div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Tipo de conexión</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[{ value: 'qr', label: 'QR / Baileys', desc: 'Número personal o Business' }, { value: 'api', label: 'API Cloud', desc: 'WhatsApp Business API' }].map(({ value, label, desc }) => (
                    <label key={value} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 9, border: `1px solid ${accountForm.account_type === value ? 'var(--accent)' : 'var(--border)'}`, background: accountForm.account_type === value ? 'var(--accent-soft)' : 'var(--bg-elevated)', transition: 'all 0.15s' }}>
                      <input type="radio" style={{ marginTop: 2 }} checked={accountForm.account_type === value} onChange={() => setAccountForm((f) => ({ ...f, account_type: value }))} />
                      <div><div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div></div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group"><label>Teléfono</label><input className="form-input" placeholder="+54 11 XXXX XXXX" value={accountForm.phone_number} onChange={(e) => setAccountForm((f) => ({ ...f, phone_number: e.target.value }))} /></div>
              {accountForm.account_type === 'api' && (
                <>
                  <div className="form-group"><label>Phone Number ID</label><input className="form-input" value={accountForm.phone_number_id} onChange={(e) => setAccountForm((f) => ({ ...f, phone_number_id: e.target.value }))} /></div>
                  <div className="form-group"><label>WABA ID</label><input className="form-input" value={accountForm.waba_id} onChange={(e) => setAccountForm((f) => ({ ...f, waba_id: e.target.value }))} /></div>
                  <div className="form-group"><label>Access Token</label><input className="form-input" type="password" placeholder={accountForm.id ? '(dejar vacío para no cambiar)' : 'EAAxx…'} value={accountForm.access_token} onChange={(e) => setAccountForm((f) => ({ ...f, access_token: e.target.value }))} /></div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAccountModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAccount} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {loading && <Loader2 size={13} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
