import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileTabBar } from './MobileTabBar'
import { Toast } from '@/components/ui/Toast'

export function AppShell() {
  return (
    <div className="bg-gray-50 text-slate-800 h-screen overflow-hidden flex font-medium">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main id="contentArea" className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
      <Toast />
    </div>
  )
}
