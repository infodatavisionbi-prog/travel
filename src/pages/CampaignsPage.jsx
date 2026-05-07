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
  const [selectedAccountId, setSelectedAccountId] = useState('')

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
      await Promise.all([loadLeads(), loadAccounts(), loadCampaigns()])
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
          <p className="page-subtitle">Usa cuentas creadas en Configuracion para enviar campanas por WhatsApp.</p>
        </div>
      </div>

      <div className="company-tabs" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t} className={`company-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Estado: {status}{loading ? ' | Procesando...' : ''}</div>

      {!accounts.length && (
        <div className="card" style={{ padding: 12, marginBottom: 12, border: '1px solid #ff5300' }}>
          No hay cuentas WhatsApp configuradas. Crea una en la pestana Configuracion.
        </div>
      )}

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
            <select className="form-select" style={{ width: 320 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
              <option value="">Seleccionar cuenta WhatsApp</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>)}
            </select>
            <input className="form-input" style={{ width: 220 }} placeholder="Nombre campana" value={campaignForm.name} onChange={(e) => setCampaignForm((v) => ({ ...v, name: e.target.value }))} />
            <input className="form-input" style={{ width: 320 }} placeholder="Mensaje (para cuenta QR)" value={campaignForm.message_body} onChange={(e) => setCampaignForm((v) => ({ ...v, message_body: e.target.value }))} />
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
