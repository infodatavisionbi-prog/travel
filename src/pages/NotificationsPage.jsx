import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Check, CheckCheck, Loader2, Mail, RefreshCw, Trash2, UserCheck, UserPlus, X } from 'lucide-react'
import { apiFetch } from '../lib/api.js'

const TYPE_CONFIG = {
  invite:          { icon: UserPlus,   color: '#3b82f6', label: 'Invitación' },
  message:         { icon: Mail,       color: '#22c55e', label: 'Mensaje' },
  lead_assigned:   { icon: UserCheck,  color: '#8b5cf6', label: 'Lead asignado' },
  system:          { icon: Bell,       color: '#f59e0b', label: 'Sistema' },
}

function NotifIcon({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.system
  const Icon = cfg.icon
  return (
    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${cfg.color}18`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon size={17} color={cfg.color} />
    </div>
  )
}

function TypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.system
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: `${cfg.color}18`, color: cfg.color, fontWeight: 600 }}>
      {cfg.label}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'Ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function NotificationsPage() {
  const [notifs, setNotifs]     = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState('all') // all | unread | invite

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await apiFetch('/notifications')
      setNotifs(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const markRead = async (id) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'POST' })
      setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x))
    } catch {}
  }

  const markAllRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' })
      setNotifs(n => n.map(x => ({ ...x, read: true })))
    } catch {}
  }

  const deleteNotif = async (id) => {
    try {
      await apiFetch(`/notifications/${id}`, { method: 'DELETE' })
      setNotifs(n => n.filter(x => x.id !== id))
    } catch {}
  }

  const respondInvite = async (id, accept) => {
    try {
      await apiFetch(`/notifications/${id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) })
      setNotifs(n => n.map(x => x.id === id ? { ...x, read: true, invite_responded: accept ? 'accepted' : 'rejected' } : x))
    } catch {}
  }

  const filtered = notifs.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'invite') return n.type === 'invite'
    return true
  })

  const unreadCount = notifs.filter(n => !n.read).length

  return (
    <section style={{ padding: '0 0 40px', maxWidth: 720 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Notificaciones</h1>
          {unreadCount > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>
              {unreadCount}
            </span>
          )}
          {loading && <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button className="btn btn-secondary" onClick={markAllRead} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <CheckCheck size={13} /> Marcar todo leído
            </button>
          )}
          <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { key: 'all',    label: 'Todas' },
          { key: 'unread', label: 'No leídas' },
          { key: 'invite', label: 'Invitaciones' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: filter === f.key ? 'var(--accent)' : 'var(--bg-card)',
              color: filter === f.key ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <BellOff size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>
              {filter === 'unread' ? 'No hay notificaciones sin leer' :
               filter === 'invite' ? 'No hay invitaciones pendientes' :
               'No hay notificaciones'}
            </div>
          </div>
        )}

        {filtered.map((n, i) => (
          <div
            key={n.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              background: n.read ? 'transparent' : 'rgba(var(--accent-rgb, 37,211,102),0.04)',
              transition: 'background 0.2s',
            }}
          >
            <NotifIcon type={n.type} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                <TypeBadge type={n.type} />
                {!n.read && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{fmtDate(n.created_at)}</span>
              </div>

              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {n.title || n.message}
              </div>
              {n.title && n.message && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{n.message}</div>
              )}

              {/* Invite actions */}
              {n.type === 'invite' && !n.invite_responded && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => respondInvite(n.id, true)}
                  >
                    <Check size={12} /> Aceptar
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => respondInvite(n.id, false)}
                  >
                    <X size={12} /> Rechazar
                  </button>
                </div>
              )}
              {n.invite_responded && (
                <div style={{ marginTop: 8, fontSize: 11, color: n.invite_responded === 'accepted' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {n.invite_responded === 'accepted' ? '✓ Aceptada' : '✗ Rechazada'}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!n.read && (
                <button
                  title="Marcar como leída"
                  onClick={() => markRead(n.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, display: 'flex' }}
                >
                  <Check size={14} />
                </button>
              )}
              <button
                title="Eliminar"
                onClick={() => deleteNotif(n.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, display: 'flex' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
