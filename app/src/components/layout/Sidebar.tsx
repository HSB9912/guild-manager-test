import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useUIStore } from '@/store/ui'
import { useAuthStore } from '@/store/auth'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import {
  Home, Users, BarChart3, ArrowUpDown,
  PieChart, Gift, ClipboardList, Handshake,
  Calendar, X, ChevronDown, Gem, AlertTriangle,
  History, Keyboard, Medal, FileEdit, RefreshCw, Database, Settings,
} from 'lucide-react'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: '홈' },
  { to: '/members', icon: Users, label: '길드원' },
  { to: '/analysis', icon: BarChart3, label: '수로 분석' },
  { to: '/promotion', icon: ArrowUpDown, label: '승강제' },
  { to: '/stats', icon: PieChart, label: '현황' },
  { to: '/rewards', icon: Gift, label: '수로 보상' },
  { to: '/board', icon: ClipboardList, label: '게시판' },
  { to: '/buddy', icon: Handshake, label: '뚠뚠 버디' },
  { to: '/calendar', icon: Calendar, label: '캘린더' },
  { to: '/bail', icon: Gem, label: '보석금' },
  { to: '/penalty', icon: AlertTriangle, label: '벌점' },
]

const ADMIN_ITEMS = [
  { to: '/admin/history', icon: History, label: '이력' },
  { to: '/admin/suro-input', icon: Keyboard, label: '수로 입력' },
  { to: '/admin/role-assign', icon: Medal, label: '직위 반영' },
  { to: '/admin/guide-edit', icon: FileEdit, label: '가이드 편집' },
  { to: '/admin/sync', icon: RefreshCw, label: '동기화' },
  { to: '/admin/db-sheet', icon: Database, label: 'DB 시트' },
  { to: '/admin/settings', icon: Settings, label: '설정' },
]

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const role = useAuthStore((s) => s.role)
  const { data: siteConfig } = useSiteConfig()
  const guildLogo = siteConfig?.guildLogo
  const [adminOpen, setAdminOpen] = useState(false)

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[999] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-[1000] w-64 bg-white border-r border-gray-100',
          'transform transition-transform duration-300 flex flex-col shadow-sm',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl shadow-lg shadow-indigo-100 overflow-hidden bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center text-white font-bold text-xl">
            {guildLogo ? (
              <img src={guildLogo} className="w-full h-full object-cover" alt="guild logo" />
            ) : '뚠'}
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 tracking-tight">뚠카롱 길드 현황</h1>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">
              {role === 'admin' ? 'ADMIN' : 'PUBLIC VIEW'}
            </p>
          </div>
          <button
            className="lg:hidden ml-auto text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto no-scrollbar">
          <p className="px-4 pt-2 pb-2 text-[9px] font-bold text-gray-300 uppercase tracking-widest">
            메뉴
          </p>
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'nav-item w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl',
                  'transition-all duration-200 text-gray-600 hover:bg-indigo-50 font-bold text-sm',
                  isActive && 'active'
                )
              }
            >
              <Icon size={16} className="w-5 text-center" />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* Admin section — only visible to admins */}
          {role === 'admin' && (
            <>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="w-full flex items-center justify-between px-4 pt-4 pb-2 cursor-pointer hover:bg-indigo-50/50 rounded-xl transition-all"
              >
                <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">관리자</span>
                <ChevronDown
                  size={12}
                  className={cn('text-gray-300 transition-transform', adminOpen && 'rotate-180')}
                />
              </button>
              {adminOpen && (
                <div className="space-y-0.5">
                  {ADMIN_ITEMS.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'nav-item w-full flex items-center space-x-3 px-4 py-2 rounded-xl',
                          'transition-all duration-200 text-gray-500 hover:bg-indigo-50 font-bold text-xs',
                          isActive && 'active'
                        )
                      }
                    >
                      <Icon size={14} className="w-5 text-center" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Footer: font size + status */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50 font-bold space-y-2">
          <div className="flex items-center justify-center gap-1">
            <span className="text-[9px] text-gray-400 mr-1">글씨</span>
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <button
                key={size}
                onClick={() => useUIStore.getState().setFontSize(size)}
                className={cn(
                  'px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                  useUIStore.getState().fontSize === size
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}
              >
                {size === 'sm' ? <span className="text-[8px]">가</span> : size === 'md' ? <span className="text-[10px]">가</span> : <span className="text-[12px]">가</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[8px] text-gray-300">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Supabase Connected
          </div>
          <div className="text-center text-[7px] text-gray-300">v2026.03.24</div>
        </div>
      </aside>
    </>
  )
}
