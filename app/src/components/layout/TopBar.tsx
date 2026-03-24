import { useEffect, useState } from 'react'
import { useUIStore } from '@/store/ui'
import { useAuthStore } from '@/store/auth'
import { useMembers } from '@/hooks/useMembers'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import { supabase } from '@/lib/supabase'
import { Menu, Moon, Sun, LogOut, LogIn, RefreshCw } from 'lucide-react'

const GUILD_BADGE_STYLES: Record<string, string> = {
  '뚠카롱': 'bg-indigo-50 text-indigo-600 border-indigo-200',
  '뚱카롱': 'bg-rose-50 text-rose-600 border-rose-200',
  '밤카롱': 'bg-violet-50 text-violet-600 border-violet-200',
  '별카롱': 'bg-amber-50 text-amber-600 border-amber-200',
  '달카롱': 'bg-blue-50 text-blue-600 border-blue-200',
  '꿀카롱': 'bg-orange-50 text-orange-600 border-orange-200',
}

const GUILD_ALIAS: Record<string, string> = {
  '뚠카롱': '뚠', '뚱카롱': '뚱', '밤카롱': '밤', '별카롱': '별', '달카롱': '달', '꿀카롱': '꿀',
}

export function TopBar() {
  const { darkMode, toggleDarkMode, setSidebarOpen } = useUIStore()
  const { user, role, login, logout } = useAuthStore()
  const { data: members = [] } = useMembers()
  const { data: config } = useSiteConfig()
  const [anniversary, setAnniversary] = useState('')
  const [visitCount, setVisitCount] = useState(0)

  // Anniversary calculation
  useEffect(() => {
    if (config?.guildStartDate) {
      const start = new Date(config.guildStartDate)
      const diff = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24))
      setAnniversary(`뚠카롱 ${diff}일`)
    }
  }, [config])

  // Visit tracking
  useEffect(() => {
    supabase.rpc('increment_daily_visit').then(({ data }) => {
      if (typeof data === 'number') setVisitCount(data)
    })
  }, [])

  // Guild member counts
  const guildCounts: Record<string, number> = {}
  members.forEach((m) => { guildCounts[m.guild] = (guildCounts[m.guild] || 0) + 1 })

  return (
    <header className="bg-white border-b border-gray-100 px-4 lg:px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div className="lg:hidden w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
          뚠
        </div>

        {/* Guild member count badges */}
        <div className="hidden sm:flex items-center gap-1 flex-wrap">
          {config?.guilds.map((g) => (
            <span
              key={g.name}
              className={`inline-block px-1.5 py-0.5 rounded-md text-[9px] font-black border ${GUILD_BADGE_STYLES[g.name] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
            >
              {GUILD_ALIAS[g.name] || g.name[0]} {guildCounts[g.name] || 0}
            </span>
          ))}
        </div>

        {/* Anniversary */}
        {anniversary && (
          <span className="hidden lg:inline text-[9px] text-gray-400 font-bold">{anniversary}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Visit count */}
        {visitCount > 0 && (
          <span className="hidden sm:inline text-[9px] bg-gray-100 text-gray-500 px-2 py-1 rounded-lg font-bold">
            👀 {visitCount}
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          className="hidden sm:flex w-8 h-8 items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-all border border-gray-100 shadow-sm"
          title="새로고침"
        >
          <RefreshCw size={13} />
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-all border border-gray-100 shadow-sm"
          title={darkMode ? '라이트 모드' : '다크 모드'}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Auth */}
        {user ? (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-700 truncate max-w-[120px]">
                {user.name}
              </p>
              <p className="text-[9px] text-gray-400 font-bold">
                {role === 'admin' ? '관리자' : 'Public'}
              </p>
            </div>
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-8 h-8 rounded-xl border border-gray-100" />
            )}
            <button
              onClick={logout}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-all border border-gray-100 shadow-sm"
              title="로그아웃"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="px-3 py-1.5 bg-indigo-500 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-600 transition-all shadow-sm flex items-center gap-1"
          >
            <LogIn size={12} />
            <span>관리자</span>
          </button>
        )}
      </div>
    </header>
  )
}
