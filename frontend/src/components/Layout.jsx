import { Outlet } from 'react-router-dom'
import Sidebar, { SidebarProvider } from './Sidebar'
import Topbar from './Topbar'

export default function Layout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[#F7F6F3]">
        <Sidebar />
        <div className="flex flex-col flex-1 lg:ml-60 overflow-x-hidden">
          <Topbar />
          <main className="p-4 lg:p-6 flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}