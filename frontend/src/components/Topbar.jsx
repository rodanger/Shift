import { useLocation } from 'react-router-dom'

const titles = {
  '/':         'Dashboard',
  '/shifts':   'Shifts',
  '/invoices': 'Invoices',
  '/profile':  'Profile',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const title = titles[pathname] || ''

  return (
    <header className="bg-white border-b border-[#E4E2DC] px-6 h-14 flex items-center sticky top-0 z-10">
      <div className="w-8 lg:hidden" />
      <h2 className="text-base font-semibold ml-10 lg:ml-0">{title}</h2>
    </header>
  )
}