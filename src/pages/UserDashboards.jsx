import { LayoutDashboard, Maximize2, RefreshCw } from 'lucide-react'
import { useLang } from '../context/LanguageContext.jsx'
import PowerBIEmbed from '../components/PowerBIEmbed.jsx'
import { buildPublicPowerBiUrl, extractPowerBiReportIdentifiers } from '../lib/powerbiUrl.js'

const FOOTER_CLIP_PX = 34

export default function UserDashboards({ dashboards, activeDashboardId }) {
  const { t } = useLang()
  const active = dashboards.find(d => d.id === activeDashboardId)
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  const isPublicViewUrl = /app\.powerbi\.com\/view\?/i.test(String(active?.embed_url || ''))
  const { reportId: parsedReportId, groupId: parsedGroupId } = extractPowerBiReportIdentifiers(active?.embed_url)
  const canUseAuthenticatedEmbed = !isPublicViewUrl || isMobile
  const isAuthenticated = !!(
    canUseAuthenticatedEmbed &&
    (active?.report_id || parsedReportId) &&
    (active?.group_id || parsedGroupId)
  )
  const publicUrl = buildPublicPowerBiUrl(active?.embed_url)

  if (!active) {
    return (
      <div className="empty-state page-empty">
        <div className="empty-state-icon"><LayoutDashboard size={26} /></div>
        <div className="empty-state-title">{t('dash.empty_title')}</div>
        <div className="empty-state-desc">{t('dash.empty_desc')}</div>
      </div>
    )
  }

  const reloadFrame = () => {
    const frame = document.getElementById('powerbi-frame')
    if (frame) frame.src = frame.src
  }

  const openFullscreen = () => {
    const el = document.getElementById('powerbi-shell')
    if (el?.requestFullscreen) el.requestFullscreen()
    else if (!isAuthenticated) window.open(publicUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="dashboard-view">
      <div className="page-header">
        <div>
          <div className="page-header-title">{active.name}</div>
          {active.description && <div className="page-header-sub">{active.description}</div>}
        </div>
        <div className="toolbar-actions">
          {!isAuthenticated && (
            <button className="btn btn-secondary btn-sm" onClick={reloadFrame} title={t('dash.reload')}>
              <RefreshCw size={14} /> {t('dash.reload')}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={openFullscreen} title={t('dash.fullscreen')}>
            <Maximize2 size={14} /> {t('dash.fullscreen')}
          </button>
        </div>
      </div>

      <div className="powerbi-shell" id="powerbi-shell">
        {isAuthenticated ? (
          <PowerBIEmbed
            key={active.id}
            dashboard={active}
            style={{ height: '100%' }}
          />
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <iframe
              id="powerbi-frame"
              title={active.name}
              src={publicUrl}
              allowFullScreen
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: `calc(100% + ${FOOTER_CLIP_PX}px)`,
                border: 'none',
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}
