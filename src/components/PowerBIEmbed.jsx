import { useEffect, useRef, useState } from 'react'
import { models, service, factories } from 'powerbi-client'
import { Maximize2, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { buildPublicPowerBiUrl, extractPowerBiReportIdentifiers } from '../lib/powerbiUrl.js'

const pbiService = new service.Service(
  factories.hpmFactory,
  factories.wpmpFactory,
  factories.routerFactory,
)

const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/powerbi`
const FOOTER_CLIP_PX = 34

export default function PowerBIEmbed({ dashboard, style }) {
  const containerRef    = useRef(null)
  const fullscreenRef   = useRef(null)
  const tokenRef        = useRef(null)
  const embedUrlRef     = useRef(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [isMobile, setIsMobile]         = useState(false)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const embedUrl = String(dashboard.embed_url || '')
  const isPublicViewUrl = /app\.powerbi\.com\/view\?/i.test(embedUrl)
  const { reportId: parsedReportId, groupId: parsedGroupId } = extractPowerBiReportIdentifiers(dashboard.embed_url)
  const candidateReportId = dashboard.report_id || parsedReportId
  const candidateGroupId = dashboard.group_id || parsedGroupId
  const canUseAuthenticatedEmbed = !isPublicViewUrl || isMobile
  const effectiveReportId = canUseAuthenticatedEmbed ? candidateReportId : null
  const effectiveGroupId = canUseAuthenticatedEmbed ? candidateGroupId : null

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!effectiveReportId || !effectiveGroupId) return
    if (!containerRef.current) return

    let alive = true

    const embed = async () => {
      setLoading(true)
      setError('')
      try {
        console.log('[PBI] iniciando embed para', effectiveReportId)
        const { data: { session } } = await supabase.auth.getSession()
        console.log('[PBI] session:', session ? 'ok' : 'null', session?.access_token ? 'token ok' : 'sin token')
        if (!session?.access_token) throw new Error('Sesión no activa — volvé a iniciar sesión')

        console.log('[PBI] fetching token desde', `${EDGE_FN}/token`)
        const res = await fetch(`${EDGE_FN}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            report_id: effectiveReportId,
            group_id:  effectiveGroupId,
          }),
        })
        const json = await res.json()
        console.log('[PBI] token response:', res.status, json)
        if (!res.ok) throw new Error(json.error ?? json.message ?? 'Error obteniendo token')
        if (!alive) return

        tokenRef.current  = json.token
        embedUrlRef.current = `https://app.powerbi.com/reportEmbed?reportId=${effectiveReportId}&groupId=${effectiveGroupId}`

        const mobile = window.matchMedia('(max-width: 768px)').matches

        const makeConfig = (layoutType) => ({
          type:        'report',
          tokenType:   models.TokenType.Embed,
          accessToken: json.token,
          embedUrl:    embedUrlRef.current,
          settings: {
            bars: {
              statusBar: { visible: false },
            },
            panes: {
              filters:        { visible: false },
              pageNavigation: { visible: !mobile },
            },
            background: models.BackgroundType.Transparent,
            layoutType,
          },
        })

        const report = pbiService.embed(containerRef.current, makeConfig(
          mobile ? models.LayoutType.MobilePortrait : models.LayoutType.Master
        ))

        report.on('error', (event) => {
          if (!alive) return
          const msg = event.detail?.message ?? ''
          if (mobile && (msg === 'mobileLayoutError' || msg.toLowerCase().includes('mobilelayout'))) {
            pbiService.reset(containerRef.current)
            pbiService.embed(containerRef.current, makeConfig(models.LayoutType.Master))
            return
          }
          setError(msg || 'Error al cargar el reporte de Power BI')
          setLoading(false)
        })

        setLoading(false)
      } catch (err) {
        console.error('[PBI] error:', err.message)
        if (alive) { setError(err.message); setLoading(false) }
      }
    }

    embed()
    return () => {
      alive = false
      if (containerRef.current) pbiService.reset(containerRef.current)
    }
  }, [effectiveReportId, effectiveGroupId])

  // Embed fullscreen (desktop layout, landscape orientation via CSS rotation)
  useEffect(() => {
    if (!showFullscreen || !fullscreenRef.current || !tokenRef.current) return

    pbiService.embed(fullscreenRef.current, {
      type:        'report',
      tokenType:   models.TokenType.Embed,
      accessToken: tokenRef.current,
      embedUrl:    embedUrlRef.current,
      settings: {
        bars: {
          statusBar: { visible: false },
        },
        panes: {
          filters:        { visible: false },
          pageNavigation: { visible: true },
        },
        background:  models.BackgroundType.Transparent,
        layoutType:  models.LayoutType.Master,
      },
    })

    return () => {
      if (fullscreenRef.current) pbiService.reset(fullscreenRef.current)
    }
  }, [showFullscreen])

  // Sin IDs configurados: fallback al iframe público
  if (!effectiveReportId || !effectiveGroupId) {
    const publicUrl = buildPublicPowerBiUrl(dashboard.embed_url)

    return (
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden', ...style }}>
        <iframe
          src={publicUrl}
          title={dashboard.name}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: `calc(100% + ${FOOTER_CLIP_PX}px)`,
            border: 'none',
          }}
          allowFullScreen
        />
      </div>
    )
  }

  return (
    <>
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', ...style }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-base)', zIndex: 1,
          }}>
            <div className="spinner" />
          </div>
        )}
        {error && (
          <div className="form-error visible" style={{ margin: 16 }}>{error}</div>
        )}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            width: '100%',
            height: `calc(100% + ${FOOTER_CLIP_PX}px)`,
            marginBottom: `-${FOOTER_CLIP_PX}px`,
          }}
        />

        {/* Cubre el banner "versión de prueba gratuita" de Power BI Embedded */}
        {!loading && !error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 44,
            background: 'var(--bg-surface)',
            zIndex: 4,
          }} />
        )}

        

        {/* Botón "Informe completo" — solo mobile, solo cuando cargó */}
        {isMobile && !loading && !error && (
          <button
            onClick={() => setShowFullscreen(true)}
            style={{
              position: 'absolute', bottom: 16, right: 16,
              zIndex: 5,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
            }}
          >
            <Maximize2 size={14} />
            Informe completo
          </button>
        )}
      </div>

      {/* Overlay fullscreen girado 90° — simula landscape en portrait */}
      {showFullscreen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '100vh',
            height: '100vw',
            transform: 'translate(-50%, -50%) rotate(90deg)',
          }}>
            {/* Embed container */}
            <div ref={fullscreenRef} style={{ position: 'absolute', inset: 0 }} />

            {/* Cubre el banner de prueba en vista fullscreen */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: 44,
              background: 'var(--bg-surface)',
              zIndex: 4,
            }} />

            {/* Botón cerrar — esquina superior derecha en vista landscape */}
            <button
              onClick={() => setShowFullscreen(false)}
              style={{
                position: 'absolute', top: 52, right: 8,
                zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36,
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                cursor: 'pointer',
                color: '#fff',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
