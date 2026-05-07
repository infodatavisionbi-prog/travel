import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'

export default function ConfiguracionPage() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Listo')
  const [qrState, setQrState] = useState({ status: 'not_started', qr: null, phone: null })
  const [accounts, setAccounts] = useState([])

  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState('qr')
  const [addName, setAddName] = useState('')
  const [apiForm, setApiForm] = useState({ phone_number: '', phone_number_id: '', waba_id: '', access_token: '' })

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
    setAccounts(Array.isArray(data) ? data : [])
  }

  const loadQr = async () => {
    const [s, q] = await Promise.all([
      apiFetch('/wa-qr/status').catch(() => ({ status: 'not_started', phone: null })),
      apiFetch('/wa-qr/qr').catch(() => ({ qr: null })),
    ])
    setQrState({ status: s.status || 'not_started', qr: q.qr || null, phone: s.phone || q.phone || null })
  }

  useEffect(() => {
    run(async () => {
      await Promise.all([loadAccounts(), loadQr()])
    })
  }, [])

  useEffect(() => {
    const liveStatuses = new Set(['starting', 'waiting_qr', 'reconnecting'])
    if (!liveStatuses.has(qrState.status)) return
    const timer = setInterval(() => {
      loadQr().catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [qrState.status])

  const startQr = async () => run(async () => {
    await apiFetch('/wa-qr/start', { method: 'POST', body: JSON.stringify({}) })
    await loadQr()
  }, 'Sesion QR iniciada')

  const refreshQr = async () => run(async () => { await loadQr() }, 'Estado QR actualizado')

  const disconnectQr = async () => run(async () => {
    await apiFetch('/wa-qr/disconnect', { method: 'DELETE' })
    await loadQr()
  }, 'Sesion QR desconectada')

  const createSelectedAccount = async () => run(async () => {
    if (!addName.trim()) throw new Error('Completa el nombre de la cuenta')

    if (addType === 'qr') {
      if (qrState.status !== 'connected' || !qrState.phone) {
        throw new Error('Primero conecta WhatsApp por QR')
      }
      await apiFetch('/wa-qr/sync-account', { method: 'POST', body: JSON.stringify({ phone: qrState.phone, name: addName.trim() }) })
    } else {
      await apiFetch('/whatsapp/accounts', {
        method: 'POST',
        body: JSON.stringify({
          account_type: 'api',
          name: addName.trim(),
          phone_number: apiForm.phone_number,
          phone_number_id: apiForm.phone_number_id,
          waba_id: apiForm.waba_id,
          access_token: apiForm.access_token,
        }),
      })
    }

    setShowAdd(false)
    setAddType('qr')
    setAddName('')
    setApiForm({ phone_number: '', phone_number_id: '', waba_id: '', access_token: '' })
    await loadAccounts()
  }, 'Cuenta agregada')

  const testAccount = async (id) => run(async () => {
    await apiFetch(`/whatsapp/accounts/${id}/test`, { method: 'POST', body: JSON.stringify({}) })
  }, 'Test de cuenta ejecutado')

  const deleteAccount = async (id) => run(async () => {
    await apiFetch(`/whatsapp/accounts/${id}`, { method: 'DELETE' })
    await loadAccounts()
  }, 'Cuenta eliminada')

  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="page-title">Configuracion</h2>
          <p className="page-subtitle">Gestion de cuentas WhatsApp para usar en Campanas.</p>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Estado: {status}{loading ? ' | Procesando...' : ''}</div>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Cuentas registradas</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => run(loadAccounts, 'Cuentas recargadas')} disabled={loading}>Recargar</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)} disabled={loading}>{showAdd ? 'Cerrar' : 'Agregar cuenta'}</button>
          </div>
        </div>
        <div className="table-wrap" style={{ marginBottom: showAdd ? 12 : 0 }}>
          <table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Telefono</th><th>Phone ID</th><th></th></tr></thead>
            <tbody>
              {!accounts.length ? <tr><td colSpan="5" style={{ color: 'var(--text-muted)' }}>Sin cuentas</td></tr> : accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name || '-'}</td>
                  <td>{a.account_type || '-'}</td>
                  <td>{a.phone_number || '-'}</td>
                  <td>{a.phone_number_id || '-'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => testAccount(a.id)} disabled={loading}>Test</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(a.id)} disabled={loading}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAdd && (
          <div className="card" style={{ padding: 12, border: '1px solid #ff5300' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Agregar cuenta</div>
            <div className="toolbar-actions" style={{ marginBottom: 10 }}>
              <select className="form-select" style={{ width: 220 }} value={addType} onChange={(e) => setAddType(e.target.value)}>
                <option value="qr">Cuenta por QR</option>
                <option value="api">Cuenta por API</option>
              </select>
              <input className="form-input" style={{ width: 260 }} placeholder="Nombre de la cuenta" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>

            {addType === 'qr' && (
              <>
                <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: '#ff5300' }}>Advertencias modo QR</div>
                  <div style={{ fontSize: 12 }}>1. Si cerras sesion en WhatsApp del telefono, se desconecta esta cuenta.</div>
                  <div style={{ fontSize: 12 }}>2. No uses la misma cuenta en varios navegadores/sistemas al mismo tiempo.</div>
                  <div style={{ fontSize: 12 }}>3. Si cambia el QR o expira, refresca y escanea de nuevo.</div>
                </div>
                <div className="toolbar-actions" style={{ marginBottom: 8 }}>
                  <button className="btn btn-primary" onClick={startQr} disabled={loading}>Conectar por QR</button>
                  <button className="btn btn-secondary" onClick={refreshQr} disabled={loading}>Refrescar</button>
                  <button className="btn btn-danger" onClick={disconnectQr} disabled={loading}>Desconectar</button>
                </div>
                <div style={{ fontSize: 12, marginBottom: 8 }}>Estado QR: {qrState.status} {qrState.phone ? `| Telefono: ${qrState.phone}` : ''}</div>
                {qrState.qr && <img src={qrState.qr} alt="QR WhatsApp" style={{ width: 220, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10 }} />}
              </>
            )}

            {addType === 'api' && (
              <div className="toolbar-actions" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                <input className="form-input" style={{ width: 180 }} placeholder="Telefono" value={apiForm.phone_number} onChange={(e) => setApiForm((v) => ({ ...v, phone_number: e.target.value }))} />
                <input className="form-input" style={{ width: 200 }} placeholder="Phone Number ID" value={apiForm.phone_number_id} onChange={(e) => setApiForm((v) => ({ ...v, phone_number_id: e.target.value }))} />
                <input className="form-input" style={{ width: 180 }} placeholder="WABA ID" value={apiForm.waba_id} onChange={(e) => setApiForm((v) => ({ ...v, waba_id: e.target.value }))} />
                <input className="form-input" style={{ width: 280 }} placeholder="Access Token" value={apiForm.access_token} onChange={(e) => setApiForm((v) => ({ ...v, access_token: e.target.value }))} />
              </div>
            )}

            <div className="toolbar-actions">
              <button className="btn btn-primary" onClick={createSelectedAccount} disabled={loading}>Guardar cuenta</button>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)} disabled={loading}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
