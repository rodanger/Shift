import { useLocation } from 'react-router-dom'
import { useSidebar } from './Sidebar'

const titles = {
  '/':         'Dashboard',
  '/shifts':   'Shifts',
  '/invoices': 'Invoices',
  '/profile':  'Profile',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const title = titles[pathname] || ''
  const { toggle } = useSidebar()

  return (
    <header className="bg-white border-b border-[#E4E2DC] px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
      <button onClick={toggle} className="lg:hidden p-1.5 rounded hover:bg-gray-100">
        <i className="bi bi-list text-xl" />
      </button>
      <h2 className="text-base font-semibold">{title}</h2>
    </header>
  )
}