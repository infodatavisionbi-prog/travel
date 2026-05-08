import { useCallback, useEffect, useState } from 'react'
import {
  Activity, Bus, CheckCheck, Loader2, MessageSquare,
  RefreshCw, Send, TrendingUp, UserRound, Zap,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'))
const fmtPct = (n, total) => {
  if (!total) return '—'
  return `${Math.round((n / total) * 100)}%`
}

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

const CAMPAIGN_STATUS_COLORS = {
  draft:     { bg: 'rgba(100,116,139,0.12)', color: '#8696a0' },
  active:    { bg: 'rgba(37,211,102,0.12)',  color: '#25d366' },
  sending:   { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  completed: { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  paused:    { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
}
function CampaignBadge({ status }) {
  const c = CAMPAIGN_STATUS_COLORS[status] || CAMPAIGN_STATUS_COLORS.draft
  const labels = { draft: 'Borrador', active: 'Activa', sending: 'Enviando', completed: 'Completada', paused: 'Pausada' }
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: c.bg, color: c.color, fontWeight: 600 }}>
      {labels[status] || status}
    </span>
  )
}

const TRIP_STATUS_COLORS = {
  upcoming:  { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: 'Próximo' },
  active:    { bg: 'rgba(37,211,102,0.12)', color: '#25d366', label: 'En curso' },
  finished:  { bg: 'rgba(100,116,139,0.12)',color: '#8696a0', label: 'Finalizado' },
}
function TripBadge({ status }) {
  const c = TRIP_STATUS_COLORS[status] || TRIP_STATUS_COLORS.upcoming
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: c.bg, color: c.color, fontWeight: 600 }}>
      {c.label}
    </span>
  )
}

export default function DashboardPage() {
  const [leads, setLeads]         = useState(0)
  const [campaigns, setCampaigns] = useState([])
  const [trips, setTrips]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [leadsData, campaignsData, tripsData] = await Promise.all([
        apiFetch('/leads?limit=1').catch(() => null),
        apiFetch('/wa-campaigns').catch(() => []),
        apiFetch('/trips').catch(() => []),
      ])
      // leads total — try header count or array length
      if (leadsData?.total != null) setLeads(leadsData.total)
      else if (Array.isArray(leadsData)) setLeads(leadsData.length)
      else setLeads(0)

      setCampaigns(Array.isArray(campaignsData) ? campaignsData : [])
      setTrips(Array.isArray(tripsData) ? tripsData : [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Derived stats from campaigns
  const totalSent    = campaigns.reduce((s, c) => s + (c.sent_count   || 0), 0)
  const totalRead    = campaigns.reduce((s, c) => s + (c.read_count   || 0), 0)
  const totalFailed  = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0)
  const activeCamps  = campaigns.filter(c => ['active', 'sending'].includes(c.status)).length
  const activeTrips  = trips.filter(t => t.status === 'active').length
  const totalResponsables = trips.reduce((s, t) => s + (t.responsable_count || 0), 0)

  const cards = [
    { icon: UserRound,    label: 'Total leads',          value: fmt(leads),        color: '#3b82f6' },
    { icon: Send,         label: 'Campañas WA activas',  value: fmt(activeCamps),  color: '#25d366' },
    { icon: MessageSquare,label: 'Mensajes enviados',    value: fmt(totalSent),    color: '#0ea5e9' },
    { icon: CheckCheck,   label: 'Mensajes leídos',      value: fmt(totalRead),    sub: fmtPct(totalRead, totalSent) !== '—' ? `${fmtPct(totalRead, totalSent)} tasa de lectura` : undefined, color: '#22c55e' },
    { icon: Bus,          label: 'Viajes en curso',      value: fmt(activeTrips),  sub: `${fmt(totalResponsables)} responsables`, color: '#f59e0b' },
    { icon: TrendingUp,   label: 'Total campañas',       value: fmt(campaigns.length), color: '#8b5cf6' },
  ]

  const maxSent = totalSent || 1

  return (
    <section style={{ padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard</h1>
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {cards.map(c => <StatCard key={c.label} {...c} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Message funnel */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Zap size={15} color="var(--accent)" /> Embudo de mensajes
          </div>
          {totalSent > 0 ? (
            <>
              <BarRow label="Enviados"  value={totalSent}   max={maxSent} color="#0ea5e9" />
              <BarRow label="Leídos"    value={totalRead}   max={maxSent} color="#22c55e" />
              <BarRow label="Fallidos"  value={totalFailed} max={maxSent} color="#ef4444" />
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>Sin envíos aún</div>
          )}
        </div>

        {/* Active trips overview */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Activity size={15} color="var(--accent)" /> Viajes activos
          </div>
          {trips.filter(t => t.status !== 'finished').length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>Sin viajes activos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {trips.filter(t => t.status !== 'finished').slice(0, 6).map((t, i, arr) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <Bus size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.destination || '—'} · {t.responsable_count || 0} resp.</div>
                  </div>
                  <TripBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Campaigns table */}
      {campaigns.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <MessageSquare size={15} color="var(--accent)" /> Campañas WhatsApp
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Estado</th><th>Total</th><th>Enviados</th><th>Leídos</th><th>Fallidos</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><CampaignBadge status={c.status} /></td>
                    <td>{fmt(c.total || 0)}</td>
                    <td>{fmt(c.sent_count || 0)}</td>
                    <td>
                      {fmt(c.read_count || 0)}
                      {c.sent_count > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({fmtPct(c.read_count || 0, c.sent_count)})</span>}
                    </td>
                    <td style={{ color: c.failed_count > 0 ? '#ef4444' : 'var(--text-muted)' }}>{fmt(c.failed_count || 0)}</td>
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
