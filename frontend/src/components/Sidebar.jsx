import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, createContext, useContext } from 'react'
import icon from '../assets/logo.png'
const links = [
  { to: '/',         label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { to: '/shifts',   label: 'Shifts',    icon: 'bi-clock-fill' },
  { to: '/invoices', label: 'Invoices',  icon: 'bi-receipt-cutoff' },
  { to: '/profile',  label: 'Profile',   icon: 'bi-person-fill' },
]

const SidebarContext = createContext({ open: false, toggle: () => {} })
export const useSidebar = () => useContext(SidebarContext)

export function SidebarProvider({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ open, toggle: () => setOpen(o => !o), close: () => setOpen(false) }}>
      {children}
    </SidebarContext.Provider>
  )
}

export default function Sidebar() {
  const { currentUser, logout } = useAuth()
  const { open, close } = useSidebar()

  const initials = (currentUser?.full_name || currentUser?.username || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-10 lg:hidden"
          onClick={close}
        />
      )}
      <aside className={`
        fixed top-0 left-0 bottom-0 w-60 bg-[#1A1916] flex flex-col z-20
        transition-transform duration-250
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <img src={icon} width="32" height="32" style={{borderRadius:'8px'}} />
          <span className="text-white font-semibold tracking-wide text-sm">HourTrack</span>
          <button className="ml-auto text-white/50 lg:hidden" onClick={close}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={close}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-[#2E75B6]/25 text-white'
                  : 'text-white/55 hover:bg-white/7 hover:text-white/85'}
              `}
            >
              <i className={`bi ${icon} text-sm`} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-[#2E75B6] flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-white text-sm font-medium truncate">
                {currentUser?.full_name || currentUser?.username}
              </div>
              <div className="text-white/40 text-xs">Worker</div>
            </div>
            <button
              onClick={logout}
              className="text-white/40 hover:text-white transition-colors"
              title="Sign out"
            >
              <i className="bi bi-box-arrow-right" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}