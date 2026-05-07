import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const TABS = ['Leads', 'Envios', 'Campanas', 'Estadisticas']

export default function CampaignsPage() {
  const [tab, setTab] = useState('Leads')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')

  const [leads, setLeads] = useState([])
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set())

  const [accounts, setAccounts] = useState([])
  const [apiForm, setApiForm] = useState({ name: '', phone_number: '', phone_number_id: '', waba_id: '', access_token: '' })
  const [selectedAccountId, setSelectedAccountId] = useState('')

  const [qrState, setQrState] = useState({ status: 'not_started', qr: null, phone: null })

  const [campaigns, setCampaigns] = useState([])
  const [campaignForm, setCampaignForm] = useState({ name: '', message_body: '', delay_min: 3, delay_max: 8 })
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [campaignDetail, setCampaignDetail] = useState(null)

  const selectedCount = selectedLeadIds.size

  const selectedCampaign = useMemo(() => campaigns.find((c) => String(c.id) === String(selectedCampaignId)) || null, [campaigns, selectedCampaignId])

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

  const loadLeads = async () => {
    const data = await apiFetch('/leads?limit=300')
    setLeads(Array.isArray(data) ? data : [])
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

  const loadCampaigns = async () => {
    const data = await apiFetch('/wa-campaigns')
    const list = Array.isArray(data) ? data : []
    setCampaigns(list)
    if (!selectedCampaignId && list.length) setSelectedCampaignId(String(list[0].id))
  }

  const loadCampaignDetail = async (campaignId) => {
    if (!campaignId) return
    const data = await apiFetch(`/wa-campaigns/${campaignId}`)
    setCampaignDetail(data)
  }

  useEffect(() => {
    run(async () => {
      await Promise.all([loadLeads(), loadAccounts(), loadQr(), loadCampaigns()])
    })
  }, [])

  useEffect(() => {
    if (selectedCampaignId) {
      run(async () => { await loadCampaignDetail(selectedCampaignId) })
    }
  }, [selectedCampaignId])

  const toggleLead = (id) => {
    const leadId = Number(id)
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const createApiAccount = async () => run(async () => {
    await apiFetch('/whatsapp/accounts', { method: 'POST', body: JSON.stringify({ ...apiForm, account_type: 'api' }) })
    setApiForm({ name: '', phone_number: '', phone_number_id: '', waba_id: '', access_token: '' })
    await loadAccounts()
  }, 'Cuenta API creada')

  const startQr = async () => run(async () => {
    await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) })
    await loadQr()
  }, 'Sesion QR iniciada')

  const refreshQr = async () => run(async () => { await loadQr() }, 'Estado QR actualizado')

  const disconnectQr = async () => run(async () => {
    await apiFetch('/wa-qr/disconnect', { method: 'DELETE' })
    await loadQr()
    await loadAccounts()
  }, 'Sesion QR desconectada')

  const syncQrAccount = async () => run(async () => {
    await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone || '' }) })
    await loadAccounts()
  }, 'Cuenta QR sincronizada')

  const createCampaign = async () => run(async () => {
    if (!campaignForm.name.trim() || !selectedAccountId) throw new Error('Completa nombre y cuenta')
    await apiFetch('/wa-campaigns', {
      method: 'POST',
      body: JSON.stringify({
        account_id: Number(selectedAccountId),
        name: campaignForm.name.trim(),
        message_body: campaignForm.message_body,
        delay_min: Number(campaignForm.delay_min) || 3,
        delay_max: Number(campaignForm.delay_max) || 8,
      }),
    })
    setCampaignForm({ name: '', message_body: '', delay_min: 3, delay_max: 8 })
    await loadCampaigns()
  }, 'Campana creada')

  const importSelectedLeadsToCampaign = async () => run(async () => {
    if (!selectedCampaignId) throw new Error('Selecciona una campana')
    if (!selectedLeadIds.size) throw new Error('Selecciona leads')
    await apiFetch(`/wa-campaigns/${selectedCampaignId}/recipients/from-leads`, {
      method: 'POST',
      body: JSON.stringify({ lead_ids: [...selectedLeadIds] }),
    })
    await loadCampaignDetail(selectedCampaignId)
  }, 'Leads importados a campana')

  const sendCampaign = async () => run(async () => {
    if (!selectedCampaignId) throw new Error('Selecciona una campana')
    await apiFetch(`/wa-campaigns/${selectedCampaignId}/send`, { method: 'POST', body: JSON.stringify({}) })
    await loadCampaigns()
    await loadCampaignDetail(selectedCampaignId)
  }, 'Campana en envio')

  const refreshCampaign = async () => run(async () => {
    if (!selectedCampaignId) throw new Error('Selecciona una campana')
    await apiFetch(`/wa-campaigns/${selectedCampaignId}/refresh`)
    await loadCampaigns()
    await loadCampaignDetail(selectedCampaignId)
  }, 'Estado de campana actualizado')

  const totalRecipients = campaignDetail?.recipients?.length || 0
  const sentRecipients = campaignDetail?.recipients?.filter((r) => ['sent', 'delivered', 'read'].includes(r.status)).length || 0

  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="page-title">Campanas WhatsApp</h2>
          <p className="page-subtitle">Conexion por API o QR, importacion de leads y envios masivos.</p>
        </div>
      </div>

      <div className="company-tabs" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Estado: {status}{loading ? ' | Procesando...' : ''}</div>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Conexion WhatsApp</div>
        <div className="toolbar-actions" style={{ marginBottom: 8 }}>
          <button className="btn btn-primary" onClick={startQr} disabled={loading}>Conectar por QR</button>
          <button className="btn btn-secondary" onClick={refreshQr} disabled={loading}>Refrescar QR</button>
          <button className="btn btn-secondary" onClick={syncQrAccount} disabled={loading || !qrState.phone}>Sincronizar cuenta QR</button>
          <button className="btn btn-danger" onClick={disconnectQr} disabled={loading}>Desconectar QR</button>
        </div>
        <div style={{ fontSize: 12, marginBottom: 8 }}>QR estado: {qrState.status} {qrState.phone ? `| Telefono: ${qrState.phone}` : ''}</div>
        {qrState.qr && (
          <div style={{ marginBottom: 10 }}>
            <img src={qrState.qr} alt="QR WhatsApp" style={{ width: 220, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
          </div>
        )}

        <div style={{ fontWeight: 600, marginBottom: 6 }}>Crear cuenta API</div>
        <div className="toolbar-actions" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          <input className="form-input" style={{ width: 180 }} placeholder="Nombre" value={apiForm.name} onChange={(e) => setApiForm((v) => ({ ...v, name: e.target.value }))} />
          <input className="form-input" style={{ width: 180 }} placeholder="Telefono" value={apiForm.phone_number} onChange={(e) => setApiForm((v) => ({ ...v, phone_number: e.target.value }))} />
          <input className="form-input" style={{ width: 180 }} placeholder="Phone Number ID" value={apiForm.phone_number_id} onChange={(e) => setApiForm((v) => ({ ...v, phone_number_id: e.target.value }))} />
          <input className="form-input" style={{ width: 160 }} placeholder="WABA ID" value={apiForm.waba_id} onChange={(e) => setApiForm((v) => ({ ...v, waba_id: e.target.value }))} />
          <input className="form-input" style={{ width: 260 }} placeholder="Access Token" value={apiForm.access_token} onChange={(e) => setApiForm((v) => ({ ...v, access_token: e.target.value }))} />
          <button className="btn btn-primary" onClick={createApiAccount} disabled={loading}>Guardar API</button>
        </div>

        <select className="form-select" style={{ width: 320 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
          <option value="">Seleccionar cuenta</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
        </select>
      </div>

      {tab === 'Leads' && (
        <div className="card" style={{ padding: 12 }}>
          <div className="toolbar-actions" style={{ marginBottom: 10 }}>
            <button className="btn btn-secondary" onClick={() => run(loadLeads, 'Leads recargados')} disabled={loading}>Recargar leads</button>
            <button className="btn btn-primary" onClick={importSelectedLeadsToCampaign} disabled={loading || !selectedCampaignId || !selectedCount}>Importar seleccionados a campana</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Seleccionados: {selectedCount}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th>Nombre</th><th>Telefono</th><th>Grupo</th><th>Empresa</th></tr></thead>
              <tbody>
                {!leads.length ? <tr><td colSpan="5" style={{ color: 'var(--text-muted)' }}>Sin leads</td></tr> : leads.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" checked={selectedLeadIds.has(l.id)} onChange={() => toggleLead(l.id)} /></td>
                    <td>{l.name || '-'}</td>
                    <td>{l.phone || '-'}</td>
                    <td>{l.group_name || '-'}</td>
                    <td>{l.company || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Campanas' && (
        <div className="card" style={{ padding: 12 }}>
          <div className="toolbar-actions" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            <input className="form-input" style={{ width: 220 }} placeholder="Nombre campana" value={campaignForm.name} onChange={(e) => setCampaignForm((v) => ({ ...v, name: e.target.value }))} />
            <input className="form-input" style={{ width: 320 }} placeholder="Mensaje (QR)" value={campaignForm.message_body} onChange={(e) => setCampaignForm((v) => ({ ...v, message_body: e.target.value }))} />
            <input className="form-input" style={{ width: 80 }} type="number" min="1" value={campaignForm.delay_min} onChange={(e) => setCampaignForm((v) => ({ ...v, delay_min: e.target.value }))} />
            <input className="form-input" style={{ width: 80 }} type="number" min="1" value={campaignForm.delay_max} onChange={(e) => setCampaignForm((v) => ({ ...v, delay_max: e.target.value }))} />
            <button className="btn btn-primary" onClick={createCampaign} disabled={loading || !selectedAccountId}>Crear campana</button>
          </div>

          <div className="toolbar-actions" style={{ marginBottom: 10 }}>
            <select className="form-select" style={{ width: 340 }} value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
              <option value="">Seleccionar campana</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
            </select>
            <button className="btn btn-secondary" onClick={() => run(loadCampaigns, 'Campanas recargadas')} disabled={loading}>Recargar</button>
            <button className="btn btn-primary" onClick={sendCampaign} disabled={loading || !selectedCampaignId}>Enviar</button>
            <button className="btn btn-secondary" onClick={refreshCampaign} disabled={loading || !selectedCampaignId}>Refrescar estado</button>
          </div>

          {selectedCampaign && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Estado: {selectedCampaign.status} | Total: {selectedCampaign.total} | Enviados: {selectedCampaign.sent_count} | Leidos: {selectedCampaign.read_count}
            </div>
          )}
        </div>
      )}

      {tab === 'Envios' && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Detalle de envios</div>
          {!campaignDetail?.recipients?.length ? (
            <div style={{ color: 'var(--text-muted)' }}>Selecciona una campana con destinatarios.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Telefono</th><th>Estado</th><th>Error</th></tr></thead>
                <tbody>
                  {campaignDetail.recipients.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name || '-'}</td>
                      <td>{r.phone || '-'}</td>
                      <td>{r.status}</td>
                      <td>{r.error_msg || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Estadisticas' && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 12 }}>Leads</div><div style={{ fontWeight: 700, fontSize: 20 }}>{leads.length}</div></div>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 12 }}>Campanas</div><div style={{ fontWeight: 700, fontSize: 20 }}>{campaigns.length}</div></div>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 12 }}>Destinatarios</div><div style={{ fontWeight: 700, fontSize: 20 }}>{totalRecipients}</div></div>
            <div className="card" style={{ padding: 10 }}><div style={{ fontSize: 12 }}>Enviados</div><div style={{ fontWeight: 700, fontSize: 20 }}>{sentRecipients}</div></div>
          </div>
        </div>
      )}
    </section>
  )
}
