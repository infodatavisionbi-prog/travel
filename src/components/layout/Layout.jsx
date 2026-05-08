import { useState, useRef } from 'react'
import { gsap } from 'gsap'
import Topbar from './Topbar.jsx'
import Sidebar from './Sidebar.jsx'
import DashboardPage from '../../pages/DashboardPage.jsx'
import RdStationPage from '../../pages/RdStationPage.jsx'
import LeadsPage from '../../pages/LeadsPage.jsx'
import CampaignsPage from '../../pages/CampaignsPage.jsx'
import WhatsAppPage from '../../pages/WhatsAppPage.jsx'
import TripsPage from '../../pages/TripsPage.jsx'
import PricesPage from '../../pages/PricesPage.jsx'
import TeamPage from '../../pages/TeamPage.jsx'
import NotificationsPage from '../../pages/NotificationsPage.jsx'

export default function Layout() {
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const contentRef = useRef(null)

  const animate = () => gsap.fromTo(contentRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' })

  const handleSelect = (view) => {
    if (view === activeView) return
    animate()
    setActiveView(view)
    setSidebarOpen(false)
  }

  const titleMap = {
    dashboard:      'Dashboard',
    rdstation:      'RD Station',
    leads:          'Leads',
    campanas:       'Campañas WhatsApp',
    whatsapp:       'WhatsApp',
    viajes:         'Viajes y grupos',
    precios:        'Precios vigentes',
    equipo:         'Equipo de trabajo',
    notificaciones: 'Notificaciones',
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onSelect={handleSelect} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <Topbar title={titleMap[activeView]} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <main ref={contentRef} className="page-content">
          {activeView === 'dashboard'      && <DashboardPage />}
          {activeView === 'rdstation'      && <RdStationPage />}
          {activeView === 'leads'          && <LeadsPage />}
          {activeView === 'campanas'       && <CampaignsPage />}
          {activeView === 'whatsapp'       && <WhatsAppPage />}
          {activeView === 'viajes'         && <TripsPage />}
          {activeView === 'precios'        && <PricesPage />}
          {activeView === 'equipo'         && <TeamPage />}
          {activeView === 'notificaciones' && <NotificationsPage />}
        </main>
      </div>
    </div>
  )
}
