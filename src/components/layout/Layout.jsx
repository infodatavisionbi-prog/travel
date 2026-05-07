import { useState, useRef } from 'react'
import { gsap } from 'gsap'
import Topbar from './Topbar.jsx'
import Sidebar from './Sidebar.jsx'
import RdStationPage from '../../pages/RdStationPage.jsx'
import LeadsPage from '../../pages/LeadsPage.jsx'
import CampaignsPage from '../../pages/CampaignsPage.jsx'
import WhatsAppPage from '../../pages/WhatsAppPage.jsx'
import TripsPage from '../../pages/TripsPage.jsx'
import PricesPage from '../../pages/PricesPage.jsx'
import TeamPage from '../../pages/TeamPage.jsx'

export default function Layout() {
  const [activeView, setActiveView] = useState('rdstation')
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
    rdstation: 'RD Station',
    leads: 'Leads',
    campanas: 'Campanas',
    whatsapp: 'WhatsApp',
    viajes: 'Viajes',
    precios: 'Precios vigentes',
    equipo: 'Equipo de trabajo',
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onSelect={handleSelect} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <Topbar title={titleMap[activeView]} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <main ref={contentRef} className="page-content">
          {activeView === 'rdstation' && <RdStationPage />}
          {activeView === 'leads' && <LeadsPage />}
          {activeView === 'campanas' && <CampaignsPage />}
          {activeView === 'whatsapp' && <WhatsAppPage />}
          {activeView === 'viajes' && <TripsPage />}
          {activeView === 'precios' && <PricesPage />}
          {activeView === 'equipo' && <TeamPage />}
        </main>
      </div>
    </div>
  )
}
