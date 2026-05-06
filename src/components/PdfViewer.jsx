import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

export default function PdfViewer({ invoice, onClose }) {
  const [url, setUrl]       = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    let alive = true

    const loadSignedUrl = async () => {
      setLoading(true)
      setError('')
      setUrl('')

      const rawPath = String(invoice?.file_path || '').trim()
      if (!rawPath) {
        if (alive) {
          setError('Archivo no disponible')
          setLoading(false)
        }
        return
      }

      const decodedPath = (() => {
        try { return decodeURIComponent(rawPath) } catch { return rawPath }
      })()

      let bucketHint = ''
      let normalizedFromUrl = decodedPath

      if (/^https?:\/\//i.test(decodedPath)) {
        try {
          const parsed = new URL(decodedPath)
          const fullPath = decodeURIComponent(parsed.pathname || '')
          const objectMatch = fullPath.match(/\/object\/(?:sign|public)\/([^/]+)\/(.+)$/i)
          if (objectMatch) {
            bucketHint = objectMatch[1] || ''
            normalizedFromUrl = objectMatch[2] || ''
          } else {
            const bucketPathMatch = fullPath.match(/\/(invoices|payments)\/(.+)$/i)
            if (bucketPathMatch) {
              bucketHint = bucketPathMatch[1] || ''
              normalizedFromUrl = bucketPathMatch[2] || ''
            }
          }
        } catch {
          normalizedFromUrl = decodedPath
        }
      }

      const basePath = String(normalizedFromUrl).replace(/^\/+/, '').replace(/^invoices\//i, '')
      const candidates = [
        basePath,
        rawPath.replace(/^\/+/, '').replace(/^invoices\//i, ''),
      ]

      if (basePath.startsWith('payments/')) candidates.push(basePath.replace(/^payments\//i, ''))
      else candidates.push(`payments/${basePath}`)

      const bucketOrder = [bucketHint, 'invoices', 'payments'].filter(Boolean)
      const uniqueBuckets = [...new Set(bucketOrder)]

      let lastError = null
      for (const bucket of uniqueBuckets) {
        for (const candidate of [...new Set(candidates)].filter(Boolean)) {
          const { data, error: signError } = await supabase.storage.from(bucket).createSignedUrl(candidate, 300)
          if (!signError && data?.signedUrl) {
            if (!alive) return
            setUrl(data.signedUrl)
            setLoading(false)
            return
          }
          lastError = signError
        }
      }

      if (!alive) return
      setError(lastError?.message || 'No se pudo abrir el archivo')
      setLoading(false)
    }

    loadSignedUrl()

    return () => { alive = false }
  }, [invoice.file_path])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
          {invoice.name}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {url && (
            <a
              href={url}
              download={invoice.name}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <Download size={13} /> Descargar
            </a>
          )}
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, position: 'relative', background: '#525659' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div className="spinner" />
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14,
          }}>
            Error al cargar el PDF: {error}
          </div>
        )}
        {url && (
          <iframe
            src={url}
            title={invoice.name}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        )}
      </div>
    </div>
  )
}
