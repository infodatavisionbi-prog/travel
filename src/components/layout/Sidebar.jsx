import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { BarChart3, Bell, BriefcaseBusiness, BusFront, LayoutDashboard, Mail, MessageSquare, Repeat2, Users, UserRound } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext.jsx'

const ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',          icon: LayoutDashboard },
  { id: 'rdstation',     label: 'RD Station',          icon: BriefcaseBusiness },
  { id: 'leads',         label: 'Leads',               icon: UserRound },
  { id: 'campanas',      label: 'Campanas',             icon: MessageSquare },
  { id: 'secuencias',    label: 'Secuencias de email', icon: Repeat2 },
  { id: 'email-cuentas', label: 'Cuentas de email',    icon: Mail },
  { id: 'whatsapp',      label: 'WhatsApp',             icon: MessageSquare },
  { id: 'viajes',        label: 'Viajes',               icon: BusFront },
  { id: 'precios',       label: 'Precios vigentes',     icon: BarChart3 },
  { id: 'equipo',        label: 'Equipo de trabajo',    icon: Users },
  { id: 'notificaciones',label: 'Notificaciones',       icon: Bell },
]

export default function Sidebar({ activeView, onSelect, isOpen, onClose }) {
  const { theme } = useTheme()
  const sidebarRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) return
    gsap.fromTo(sidebarRef.current, { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out' })
  }, [])

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside ref={sidebarRef} className={`sidebar${isOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <img src={theme === 'dark' ? './logo-dark.png' : './logo-light.png'} alt="DataVision" className="sidebar-logo-img" />
        </div>

        <div className="sidebar-nav">
          <div className="nav-section">Navegacion</div>
          {ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <item.icon size={15} />
              <span className="nav-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
