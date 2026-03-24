import { NavLink } from 'react-router-dom'
import { Home, Users, BarChart3, ClipboardList, Calendar } from 'lucide-react'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/', icon: Home, label: '홈' },
  { to: '/members', icon: Users, label: '길드원' },
  { to: '/analysis', icon: BarChart3, label: '분석' },
  { to: '/board', icon: ClipboardList, label: '게시판' },
  { to: '/calendar', icon: Calendar, label: '캘린더' },
]

export function MobileTabBar() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[500] bg-white border-t border-gray-200 safe-bottom">
      <div className="flex justify-around items-center h-14">
        {TABS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'mobile-tab flex flex-col items-center justify-center gap-0.5 py-1 px-2',
                'text-gray-400 transition-all',
                isActive && 'active text-indigo-500'
              )
            }
          >
            <Icon size={18} />
            <span className="text-[9px] font-bold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
