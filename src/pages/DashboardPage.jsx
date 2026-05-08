import { useCallback, useEffect, useState } from 'react'
import {
  Activity, BarChart3, CheckCheck, Loader2, Mail, MousePointerClick,
  RefreshCw, Send, TrendingUp, UserRound, Zap,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'))
const fmtPct = (n) => (n == null ? '—' : `${n}%`)

function StatCard({ icon: Icon, label, value, sub, color = '#25d366' }) {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <div style={{ width: 72, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ width: 44, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{fmt(value)}</div>
      <div style={{ width: 36, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{pct}%</div>
    </div>
  )
}

const STATUS_COLOR = {
  sent: '#3b82f6', opened: '#22c55e', clicked: '#a855f7',
  failed: '#ef4444', pending: '#f59e0b',
}
function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || '#8696a0'
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: `${color}20`, color, fontWeight: 600 }}>
      {status}
    </span>
  )
}

export default function DashboardPage() {
  const [stats, setStats]           = useState(null)
  const [activity, setActivity]     = useState([])
  const [sequences, setSequences]   = useState([])
  const [selectedSeq, setSelectedSeq] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const load = useCallback(async (seqId) => {
    setLoading(true); setError('')
    try {
      const qs  = seqId ? `?seq_id=${seqId}` : ''
      const aqs = seqId ? `?limit=12&seq_id=${seqId}` : '?limit=12'
      const [s, a] = await Promise.all([
        apiFetch(`/stats${qs}`),
        apiFetch(`/stats/activity${aqs}`),
      ])
      setStats(s)
      setActivity(Array.isArray(a) ? a : [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    apiFetch('/sequences').then(d => setSequences(Array.isArray(d) ? d : [])).catch(() => {})
    load('')
  }, [])

  const onSeqChange = (id) => { setSelectedSeq(id); load(id) }

  const cards = stats ? [
    { icon: UserRound,         label: 'Total leads',       value: fmt(stats.total_leads),      color: '#3b82f6' },
    { icon: BarChart3,         label: 'Campañas activas',  value: fmt(stats.total_campaigns),   color: '#8b5cf6' },
    { icon: Send,              label: 'Emails enviados',   value: fmt(stats.total_sent),         color: '#0ea5e9' },
    { icon: Mail,              label: 'Emails abiertos',   value: fmt(stats.total_opened),       color: '#22c55e' },
    { icon: TrendingUp,        label: 'Tasa apertura',     value: fmtPct(stats.open_rate),       color: '#f59e0b' },
    { icon: MousePointerClick, label: 'Tasa de clics',     value: fmtPct(stats.click_rate),      color: '#ec4899' },
  ] : []

  const maxSent = stats?.total_sent || 1

  const fmtDate = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <section style={{ padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard</h1>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="form-select"
            style={{ width: 220 }}
            value={selectedSeq}
            onChange={e => onSeqChange(e.target.value)}
          >
            <option value="">Todas las campañas</option>
            {sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => load(selectedSeq)} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {cards.map(c => <StatCard key={c.label} {...c} />)}
        {!stats && !loading && (
          <div className="card" style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Sin datos disponibles
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Bar chart */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Zap size={15} color="var(--accent)" /> Rendimiento general
          </div>
          {stats ? (
            <>
              <BarRow label="Enviados" value={stats.total_sent}    max={maxSent} color="#0ea5e9" />
              <BarRow label="Abiertos" value={stats.total_opened}  max={maxSent} color="#22c55e" />
              <BarRow label="Clics"    value={stats.total_clicked} max={maxSent} color="#a855f7" />
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>Sin datos</div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Activity size={15} color="var(--accent)" /> Actividad reciente
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activity.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>Sin actividad reciente</div>
            )}
            {activity.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.to_email}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.campaign_name} {a.subject && `· ${a.subject}`}
                  </div>
                </div>
                <StatusBadge status={a.status} />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, minWidth: 70, textAlign: 'right' }}>{fmtDate(a.sent_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sequences table */}
      {sequences.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCheck size={15} color="var(--accent)" /> Campañas de email
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Estado</th><th>Contactos</th><th>Pasos</th><th>Enviados</th><th>Apertura</th><th>Clics</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600, background: s.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)', color: s.status === 'active' ? '#22c55e' : '#8696a0' }}>
                        {s.status === 'active' ? 'Activa' : s.status === 'paused' ? 'Pausada' : 'Borrador'}
                      </span>
                    </td>
                    <td>{fmt(s.total_contacts || 0)}</td>
                    <td>{fmt(s.step_count || 0)}</td>
                    <td>{fmt(s.sent || 0)}</td>
                    <td>{fmtPct(s.open_rate || 0)}</td>
                    <td>{fmtPct(s.click_rate || 0)}</td>
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
