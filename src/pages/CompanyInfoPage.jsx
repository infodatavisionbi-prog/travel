import { useEffect, useState } from 'react'
import { ArrowLeft, CircleHelp } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

function useCompanyInfo(companyId, initialValue = '') {
  const { isAdmin } = useAuth()
  const [infoText, setInfoText] = useState(initialValue)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      const { data, error } = await supabase
        .from('companies')
        .select('info_text')
        .eq('id', companyId)
        .single()

      if (!active) return

      if (error) {
        if (error.code === '42703') setError('Falta la columna info_text en companies. Ejecutá la migración SQL nueva.')
        else setError(error.message || 'No se pudo cargar la información')
        setLoading(false)
        return
      }

      setInfoText(data?.info_text || '')
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [companyId])

  const saveInfo = async () => {
    if (!isAdmin) return
    setSaving(true)
    setSaved('')
    setError('')

    const { error } = await supabase
      .from('companies')
      .update({ info_text: infoText })
      .eq('id', companyId)

    if (error) {
      if (error.code === '42703') setError('Falta la columna info_text en companies. Ejecutá la migración SQL nueva.')
      else setError(error.message || 'No se pudo guardar la información')
      setSaving(false)
      return
    }

    setSaved('Información guardada')
    setSaving(false)
  }

  return {
    isAdmin,
    infoText,
    setInfoText,
    loading,
    saving,
    error,
    saved,
    saveInfo,
  }
}

function CompanyInfoContent({ company, state }) {
  const { isAdmin, infoText, setInfoText, loading, saving, error, saved, saveInfo } = state

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="boards-section-header" style={{ marginBottom: 12 }}>
        <CircleHelp size={12} /> Información visible para {company.name}
      </div>

      {loading && <div className="table-loading"><div className="spinner" /></div>}
      {!loading && error && <div className="form-error visible" style={{ marginBottom: 12 }}>{error}</div>}
      {!loading && saved && <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12, marginBottom: 12 }}>{saved}</div>}

      {!loading && isAdmin && (
        <>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Contenido para esta empresa</label>
            <textarea
              className="form-textarea"
              value={infoText}
              onChange={e => setInfoText(e.target.value)}
              placeholder="Escribí aquí la información que verá esta empresa..."
              rows={8}
            />
          </div>
          <button className="btn btn-primary" onClick={saveInfo} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            Guardar información
          </button>
        </>
      )}

      {!loading && !isAdmin && (
        <div style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.7,
          color: 'var(--text-secondary)',
          minHeight: 96,
        }}>
          {infoText?.trim() || 'Todavía no hay información cargada para esta empresa.'}
        </div>
      )}
    </div>
  )
}

export default function CompanyInfoPage({ company, onBack, title = 'Información' }) {
  const state = useCompanyInfo(company.id, company?.info_text || '')

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button className="btn btn-ghost btn-icon" onClick={onBack} title="Volver">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <div className="page-header-title">{title}</div>
            <div className="page-header-sub">{company?.name}</div>
          </div>
        </div>
      </div>
      <CompanyInfoContent company={company} state={state} />
    </>
  )
}

export function CompanyInfoPanel({ company }) {
  const state = useCompanyInfo(company.id, company?.info_text || '')
  return <CompanyInfoContent company={company} state={state} />
}
