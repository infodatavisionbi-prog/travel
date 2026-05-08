import { useCallback, useEffect, useState } from 'react'
import {
  Bus, Check, ChevronRight, Clock, Edit2, Loader2, MapPin,
  MessageSquare, Plus, Send, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'

/* ─── helpers ─────────────────────────────────────────────── */
const fmt = (d) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const fmtTime = (t) => t ? t.slice(0, 5) : ''

const STATUS_COLORS = {
  active:    { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', label: 'Activo' },
  upcoming:  { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', label: 'Próximo' },
  finished:  { bg: 'rgba(100,116,139,0.12)',color: '#8696a0', label: 'Finalizado' },
}
const SEND_STATUS_COLOR = {
  pending:   '#f59e0b',
  sending:   '#3b82f6',
  sent:      '#22c55e',
  failed:    '#ef4444',
}

function Badge({ status, map = STATUS_COLORS }) {
  const c = map[status] || { bg: 'rgba(100,116,139,0.12)', color: '#8696a0', label: status }
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 700 }}>
      {c.label || status}
    </span>
  )
}

const VARS = ['{grupo}', '{actividad}', '{dia}', '{hora}', '{lugar}', '{nota}']

function insertVar(text, pos, v, onChange) {
  const next = text.slice(0, pos) + v + text.slice(pos)
  onChange(next)
}

/* ─── Modals ──────────────────────────────────────────────── */
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div className="card" style={{ width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TripModal({ trip, onSave, onClose }) {
  const [form, setForm] = useState({
    name: trip?.name || '',
    destination: trip?.destination || '',
    departure_date: trip?.departure_date?.slice(0, 10) || '',
    return_date: trip?.return_date?.slice(0, 10) || '',
    status: trip?.status || 'upcoming',
    notes: trip?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setErr('El nombre es obligatorio'); return }
    setSaving(true); setErr('')
    try {
      const method = trip ? 'PUT' : 'POST'
      const url = trip ? `/trips/${trip.id}` : '/trips'
      await apiFetch(url, { method, body: JSON.stringify(form) })
      onSave()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={trip ? 'Editar grupo' : 'Nuevo grupo'} onClose={onClose}>
      {err && <div style={{ marginBottom: 12, color: '#f87171', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del grupo *</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: Grupo A – Bariloche 2025" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Destino</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: Bariloche, Río Negro" value={form.destination} onChange={e => set('destination', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Salida</label>
            <input type="date" className="form-input" style={{ width: '100%' }} value={form.departure_date} onChange={e => set('departure_date', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Regreso</label>
            <input type="date" className="form-input" style={{ width: '100%' }} value={form.return_date} onChange={e => set('return_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Estado</label>
          <select className="form-select" style={{ width: '100%' }} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="upcoming">Próximo</option>
            <option value="active">Activo (en curso)</option>
            <option value="finished">Finalizado</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas internas</label>
          <textarea className="form-input" style={{ width: '100%', height: 70, resize: 'vertical' }} placeholder="Información adicional..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {trip ? 'Guardar cambios' : 'Crear grupo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ItemModal({ tripId, item, onSave, onClose }) {
  const [form, setForm] = useState({
    day_number: item?.day_number || 1,
    time: item?.time || '',
    activity: item?.activity || '',
    location: item?.location || '',
    message_template: item?.message_template || 'Hola! El {grupo} ya está en {lugar} disfrutando de {actividad}. 🎉',
    notes: item?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [cursor, setCursor] = useState(0)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.activity.trim()) { setErr('La actividad es obligatoria'); return }
    setSaving(true); setErr('')
    try {
      const method = item ? 'PUT' : 'POST'
      const url = item ? `/trips/${tripId}/itinerary/${item.id}` : `/trips/${tripId}/itinerary`
      await apiFetch(url, { method, body: JSON.stringify(form) })
      onSave()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={item ? 'Editar ítem' : 'Nuevo ítem de itinerario'} onClose={onClose} width={540}>
      {err && <div style={{ marginBottom: 12, color: '#f87171', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Día #</label>
            <input type="number" min="1" className="form-input" style={{ width: '100%' }} value={form.day_number} onChange={e => set('day_number', Number(e.target.value))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hora</label>
            <input type="time" className="form-input" style={{ width: '100%' }} value={form.time} onChange={e => set('time', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Actividad *</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: Llegada al hotel, Ski en Catedral..." value={form.activity} onChange={e => set('activity', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Lugar</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: Cerro Catedral, Hotel Llao Llao..." value={form.location} onChange={e => set('location', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Mensaje WhatsApp
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>Variables disponibles:</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
            {VARS.map(v => (
              <button key={v} onClick={() => insertVar(form.message_template, cursor, v, val => set('message_template', val))}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'rgba(37,211,102,0.12)', color: 'var(--accent)', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}>
                {v}
              </button>
            ))}
          </div>
          <textarea
            className="form-input"
            style={{ width: '100%', height: 100, resize: 'vertical', fontFamily: 'inherit' }}
            value={form.message_template}
            onChange={e => set('message_template', e.target.value)}
            onSelect={e => setCursor(e.target.selectionStart)}
            placeholder="Hola! El {grupo} ya está en {lugar}..."
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Vista previa: {form.message_template
              .replace('{grupo}', form.activity ? 'Grupo A' : '{grupo}')
              .replace('{actividad}', form.activity || '{actividad}')
              .replace('{lugar}', form.location || '{lugar}')
              .replace('{dia}', `Día ${form.day_number}`)
              .replace('{hora}', fmtTime(form.time) || '{hora}')
              .replace('{nota}', form.notes || '{nota}')}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nota interna (no se envía)</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: Esperar confirmación del guía antes de enviar" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {item ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ResponsableModal({ tripId, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', phone: '', student_name: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.phone.trim()) { setErr('El teléfono es obligatorio'); return }
    setSaving(true); setErr('')
    try {
      await apiFetch(`/trips/${tripId}/responsables`, { method: 'POST', body: JSON.stringify(form) })
      onSave()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title="Agregar responsable" onClose={onClose} width={420}>
      {err && <div style={{ marginBottom: 12, color: '#f87171', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del responsable</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: María González" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Teléfono WhatsApp *</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: 5491162441380" value={form.phone} onChange={e => set('phone', e.target.value)} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Código de país sin + (Argentina: 549...)</div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del pasajero</label>
          <input className="form-input" style={{ width: '100%' }} placeholder="Ej: Juan González" value={form.student_name} onChange={e => set('student_name', e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
            Agregar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Send confirmation panel ─────────────────────────────── */
function SendPanel({ trip, item, responsables, onClose, onDone }) {
  const [preview, setPreview] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const resolveMsg = (r) => (item.message_template || '')
    .replace(/{grupo}/g, trip.name)
    .replace(/{actividad}/g, item.activity)
    .replace(/{lugar}/g, item.location || '')
    .replace(/{dia}/g, `Día ${item.day_number}`)
    .replace(/{hora}/g, fmtTime(item.time))
    .replace(/{nota}/g, item.notes || '')
    .replace(/{nombre}/g, r?.name || '')

  const launch = async () => {
    setSending(true); setErr(''); setPreview(false)
    try {
      const data = await apiFetch(`/trips/${trip.id}/itinerary/${item.id}/send`, { method: 'POST', body: JSON.stringify({}) })
      setResult(data)
      onDone()
    } catch (e) { setErr(e.message) } finally { setSending(false) }
  }

  const sampleMsg = resolveMsg(responsables[0])

  return (
    <Modal title={`Enviar: Día ${item.day_number} – ${item.activity}`} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* message preview */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Vista previa del mensaje:</div>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {sampleMsg || '(mensaje vacío)'}
          </div>
        </div>

        {/* recipients */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Destinatarios: <strong style={{ color: 'var(--text-primary)' }}>{responsables.length} responsable{responsables.length !== 1 ? 's' : ''}</strong>
          </div>
          <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {responsables.slice(0, 20).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-primary)' }}>{r.name || r.phone}</span>
                {r.student_name && <span style={{ color: 'var(--text-muted)' }}>– pasajero: {r.student_name}</span>}
              </div>
            ))}
            {responsables.length > 20 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>y {responsables.length - 20} más...</div>}
          </div>
        </div>

        {err && <div style={{ color: '#f87171', fontSize: 12 }}>{err}</div>}

        {result && (
          <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 13 }}>
            ✓ Envío iniciado — {result.queued || responsables.length} mensajes en cola
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          {!result && (
            <button className="btn btn-primary" onClick={launch} disabled={sending || !responsables.length} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {sending ? 'Enviando...' : `Enviar a ${responsables.length}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ─── Main component ──────────────────────────────────────── */
export default function TripsPage() {
  const [trips, setTrips]             = useState([])
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [tab, setTab]                 = useState('itinerario')
  const [itinerary, setItinerary]     = useState([])
  const [responsables, setResponsables] = useState([])
  const [sends, setSends]             = useState([])
  const [loading, setLoading]         = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [tripModal, setTripModal]     = useState(null) // null | 'new' | trip object
  const [itemModal, setItemModal]     = useState(null) // null | 'new' | item object
  const [respModal, setRespModal]     = useState(false)
  const [sendPanel, setSendPanel]     = useState(null) // itinerary item

  const loadTrips = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiFetch('/trips')
      const list = Array.isArray(d) ? d : []
      setTrips(list)
      if (!selectedTrip && list.length) setSelectedTrip(list[0])
    } catch {} finally { setLoading(false) }
  }, [selectedTrip])

  const loadDetail = useCallback(async (trip) => {
    if (!trip) return
    setLoadingDetail(true)
    try {
      const [it, rs, sn] = await Promise.all([
        apiFetch(`/trips/${trip.id}/itinerary`).catch(() => []),
        apiFetch(`/trips/${trip.id}/responsables`).catch(() => []),
        apiFetch(`/trips/${trip.id}/sends`).catch(() => []),
      ])
      setItinerary(Array.isArray(it) ? it : [])
      setResponsables(Array.isArray(rs) ? rs : [])
      setSends(Array.isArray(sn) ? sn : [])
    } finally { setLoadingDetail(false) }
  }, [])

  useEffect(() => { loadTrips() }, [])
  useEffect(() => { loadDetail(selectedTrip) }, [selectedTrip])

  const selectTrip = (t) => {
    setSelectedTrip(t)
    setTab('itinerario')
  }

  const deleteTrip = async (id) => {
    if (!confirm('¿Eliminar este grupo?')) return
    await apiFetch(`/trips/${id}`, { method: 'DELETE' }).catch(() => {})
    const remaining = trips.filter(t => t.id !== id)
    setTrips(remaining)
    if (selectedTrip?.id === id) setSelectedTrip(remaining[0] || null)
  }

  const deleteItem = async (itemId) => {
    if (!confirm('¿Eliminar este ítem?')) return
    await apiFetch(`/trips/${selectedTrip.id}/itinerary/${itemId}`, { method: 'DELETE' }).catch(() => {})
    setItinerary(it => it.filter(x => x.id !== itemId))
  }

  const deleteResp = async (respId) => {
    await apiFetch(`/trips/${selectedTrip.id}/responsables/${respId}`, { method: 'DELETE' }).catch(() => {})
    setResponsables(rs => rs.filter(r => r.id !== respId))
  }

  const groupedItinerary = itinerary.reduce((acc, item) => {
    const k = item.day_number || 1
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})

  return (
    <section style={{ display: 'flex', gap: 16, height: 'calc(100vh - 110px)', overflow: 'hidden' }}>

      {/* ── Left panel: trip list ─────────────────────────── */}
      <div className="card" style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Grupos de viaje</div>
          {loading ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} /> :
            <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', gap: 4, alignItems: 'center' }} onClick={() => setTripModal('new')}>
              <Plus size={12} /> Nuevo
            </button>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {trips.length === 0 && !loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <Bus size={28} style={{ marginBottom: 8, opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
              Sin grupos aún
            </div>
          )}
          {trips.map(t => (
            <div
              key={t.id}
              onClick={() => selectTrip(t)}
              style={{
                padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background: selectedTrip?.id === t.id ? 'rgba(37,211,102,0.07)' : 'transparent',
                borderLeft: selectedTrip?.id === t.id ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  {t.destination && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    <MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />{t.destination}
                  </div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{fmt(t.departure_date)} → {fmt(t.return_date)}</div>
                </div>
                <Badge status={t.status} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <span><Users size={10} style={{ display: 'inline', marginRight: 2 }} />{t.responsable_count || 0}</span>
                <span><MessageSquare size={10} style={{ display: 'inline', marginRight: 2 }} />{t.item_count || 0} ítems</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedTrip ? (
          <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}>
            <Bus size={36} style={{ opacity: 0.25 }} />
            <div style={{ fontSize: 14 }}>Seleccioná un grupo para ver su detalle</div>
            <button className="btn btn-primary" onClick={() => setTripModal('new')} style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 6 }}>
              <Plus size={13} /> Crear primer grupo
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="card" style={{ padding: '14px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedTrip.name}</div>
                  <Badge status={selectedTrip.status} />
                  {loadingDetail && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 14 }}>
                  {selectedTrip.destination && <span><MapPin size={11} style={{ display: 'inline', marginRight: 2 }} />{selectedTrip.destination}</span>}
                  <span><Clock size={11} style={{ display: 'inline', marginRight: 2 }} />{fmt(selectedTrip.departure_date)} → {fmt(selectedTrip.return_date)}</span>
                  <span><Users size={11} style={{ display: 'inline', marginRight: 2 }} />{responsables.length} responsables</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => setTripModal(selectedTrip)}>
                  <Edit2 size={12} /> Editar
                </button>
                <button className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center', color: '#ef4444' }} onClick={() => deleteTrip(selectedTrip.id)}>
                  <Trash2 size={12} /> Eliminar
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {[
                { key: 'itinerario', label: 'Itinerario' },
                { key: 'responsables', label: `Responsables (${responsables.length})` },
                { key: 'envios', label: 'Historial de envíos' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: tab === t.key ? 'var(--accent)' : 'var(--bg-card)',
                  color: tab === t.key ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}>{t.label}</button>
              ))}
            </div>

            {/* Tab content */}
            <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

              {/* ── Itinerario tab ── */}
              {tab === 'itinerario' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {itinerary.length} ítem{itinerary.length !== 1 ? 's' : ''} en el itinerario
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => setItemModal('new')}>
                      <Plus size={13} /> Agregar ítem
                    </button>
                  </div>

                  {itinerary.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      <Clock size={30} style={{ opacity: 0.25, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13 }}>El itinerario está vacío. Agregá el primer ítem.</div>
                    </div>
                  )}

                  {Object.keys(groupedItinerary).sort((a, b) => Number(a) - Number(b)).map(day => (
                    <div key={day} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(37,211,102,0.15)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800 }}>{day}</div>
                        DÍA {day}
                      </div>
                      {groupedItinerary[day].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-secondary, rgba(255,255,255,0.03))', marginBottom: 8, border: '1px solid var(--border)' }}>
                          <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 44 }}>
                            {item.time ? (
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtTime(item.time)}</div>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin hora</div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.activity}</div>
                            {item.location && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}><MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />{item.location}</div>}
                            {item.message_template && (
                              <div style={{ marginTop: 6, padding: '7px 10px', borderRadius: 7, background: 'rgba(37,211,102,0.07)', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                <MessageSquare size={10} style={{ display: 'inline', marginRight: 4 }} />{item.message_template.slice(0, 120)}{item.message_template.length > 120 ? '…' : ''}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              title="Enviar a responsables"
                              className="btn btn-primary"
                              style={{ fontSize: 11, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => setSendPanel(item)}
                              disabled={responsables.length === 0}
                            >
                              <Send size={11} /> Enviar
                            </button>
                            <button onClick={() => setItemModal(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Edit2 size={13} /></button>
                            <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}

              {/* ── Responsables tab ── */}
              {tab === 'responsables' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {responsables.length} responsable{responsables.length !== 1 ? 's' : ''} registrados
                    </div>
                    <button className="btn btn-primary" style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => setRespModal(true)}>
                      <UserPlus size={13} /> Agregar responsable
                    </button>
                  </div>

                  {responsables.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      <Users size={30} style={{ opacity: 0.25, display: 'block', margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13 }}>Sin responsables aún. Agregá el primero.</div>
                    </div>
                  )}

                  <div className="table-wrap">
                    {responsables.length > 0 && (
                      <table>
                        <thead>
                          <tr><th>Responsable</th><th>Teléfono</th><th>Pasajero</th><th></th></tr>
                        </thead>
                        <tbody>
                          {responsables.map(r => (
                            <tr key={r.id}>
                              <td style={{ fontWeight: 500 }}>{r.name || '—'}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.phone}</td>
                              <td>{r.student_name || '—'}</td>
                              <td>
                                <button onClick={() => deleteResp(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}

              {/* ── Envíos tab ── */}
              {tab === 'envios' && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
                    {sends.length} envío{sends.length !== 1 ? 's' : ''} registrados
                  </div>

                  {sends.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      <Send size={30} style={{ opacity: 0.25, display: 'block', margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13 }}>Sin envíos aún. Lanzá un ítem del itinerario.</div>
                    </div>
                  )}

                  {sends.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Ítem</th><th>Responsable</th><th>Estado</th><th>Fecha</th></tr>
                        </thead>
                        <tbody>
                          {sends.map(s => (
                            <tr key={s.id}>
                              <td>{s.activity || s.item_activity || '—'}</td>
                              <td>{s.responsable_name || s.phone || '—'}</td>
                              <td>
                                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, fontWeight: 600, background: `${SEND_STATUS_COLOR[s.status] || '#8696a0'}20`, color: SEND_STATUS_COLOR[s.status] || '#8696a0' }}>
                                  {s.status}
                                </span>
                              </td>
                              <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(s.sent_at || s.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {(tripModal === 'new' || (tripModal && tripModal !== 'new')) && (
        <TripModal
          trip={tripModal === 'new' ? null : tripModal}
          onSave={() => { setTripModal(null); loadTrips() }}
          onClose={() => setTripModal(null)}
        />
      )}

      {(itemModal === 'new' || (itemModal && itemModal !== 'new')) && selectedTrip && (
        <ItemModal
          tripId={selectedTrip.id}
          item={itemModal === 'new' ? null : itemModal}
          onSave={() => { setItemModal(null); loadDetail(selectedTrip) }}
          onClose={() => setItemModal(null)}
        />
      )}

      {respModal && selectedTrip && (
        <ResponsableModal
          tripId={selectedTrip.id}
          onSave={() => { setRespModal(false); loadDetail(selectedTrip) }}
          onClose={() => setRespModal(false)}
        />
      )}

      {sendPanel && selectedTrip && (
        <SendPanel
          trip={selectedTrip}
          item={sendPanel}
          responsables={responsables}
          onClose={() => setSendPanel(null)}
          onDone={() => { loadDetail(selectedTrip) }}
        />
      )}
    </section>
  )
}
