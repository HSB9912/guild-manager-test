import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useMembers } from '@/hooks/useMembers'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import { cn } from '@/lib/cn'
import { Calendar, Pencil } from 'lucide-react'

interface GuidePage {
  id: number
  slug: string
  label?: string
  icon?: string
  content: string
}

interface RecentEvent {
  id: number
  date: string
  title: string
}

const GUILD_COLORS: Record<string, string> = {
  '뚠카롱': '#ec4899',
  '뚱카롱': '#e11d48',
  '밤카롱': '#6366f1',
  '별카롱': '#ca8a04',
  '달카롱': '#2563eb',
  '꿀카롱': '#d97706',
}

const DEFAULT_HOME_TABS = [
  { slug: 'notice1', label: '공지 1', icon: 'bullhorn' },
  { slug: 'notice2', label: '공지 2', icon: 'bullhorn' },
  { slug: 'notice3', label: '공지 3', icon: 'bullhorn' },
  { slug: 'intro', label: '길드 소개', icon: 'heart' },
  { slug: 'ranks', label: '직위 & 부캐', icon: 'medal' },
  { slug: 'links', label: '링크 모음', icon: 'link' },
]

const ALLOWED_TAGS = new Set([
  'b','i','u','s','em','strong','br','p','div','span','ul','ol','li',
  'h1','h2','h3','h4','h5','h6','blockquote','pre','code','hr','a','img',
  'table','thead','tbody','tr','th','td','sub','sup','mark','del','ins',
])
const ALLOWED_ATTRS = new Set([
  'style','href','src','alt','class','target','colspan','rowspan','width','height',
])

function sanitizeHTML(html: string): string {
  if (!html) return ''
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const sanitize = (node: Element) => {
    const children = [...node.childNodes]
    children.forEach((child) => {
      if (child.nodeType === 3) return // text
      if (child.nodeType === 1) {
        const el = child as Element
        if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
          while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el)
          el.parentNode!.removeChild(el)
          return
        }
        ;[...el.attributes].forEach((attr) => {
          if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) el.removeAttribute(attr.name)
        })
        if (el.tagName === 'A') el.setAttribute('target', '_blank')
        const style = el.getAttribute('style')
        if (style) el.setAttribute('style', style.replace(/expression|javascript|vbscript/gi, ''))
        sanitize(el)
      } else {
        child.parentNode!.removeChild(child)
      }
    })
  }
  sanitize(doc.body)
  return doc.body.innerHTML
}

function useGuidePages() {
  return useQuery({
    queryKey: ['guide-pages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('guide_pages').select('*').order('id')
      if (error) throw error
      return (data || []) as GuidePage[]
    },
    staleTime: 1000 * 60 * 5,
  })
}

function useRecentEvents() {
  return useQuery({
    queryKey: ['recent-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, date, title')
        .order('date', { ascending: false })
        .limit(5)
      if (error) throw error
      return (data || []).map((e: Record<string, unknown>) => ({
        id: e.id as number,
        date: ((e.date as string) || '').split('T')[0].trim(),
        title: e.title as string,
      })) as RecentEvent[]
    },
    staleTime: 1000 * 60 * 2,
  })
}

export default function HomePage() {
  const { user, role } = useAuthStore()
  const isAdmin = role === 'admin'
  const { data: members = [] } = useMembers()
  const { data: siteConfig } = useSiteConfig()
  const { data: guidePages = [] } = useGuidePages()
  const { data: recentEvents = [] } = useRecentEvents()

  const guilds = siteConfig?.guilds || [
    { name: '뚠카롱' }, { name: '뚱카롱' }, { name: '밤카롱' },
    { name: '별카롱' }, { name: '달카롱' }, { name: '꿀카롱' },
  ]

  // Build guide data map with placeholder replacements
  const guideDataMap = useMemo(() => {
    const map: Record<string, string> = {}
    guidePages.forEach((p) => {
      let html = p.content || ''
      html = html.replace(/\{\{뚠카롱_count\}\}/g, String(members.filter((m) => m.guild === '뚠카롱').length))
      html = html.replace(/\{\{뚱카롱_count\}\}/g, String(members.filter((m) => m.guild === '뚱카롱').length))
      html = html.replace(
        /\{\{부캐_count\}\}/g,
        String(members.filter((m) => ['밤카롱', '별카롱', '달카롱', '꿀카롱'].includes(m.guild)).length),
      )
      html = html.replace(/\{\{전체_count\}\}/g, String(members.length))
      map[p.slug] = html
    })
    return map
  }, [guidePages, members])

  // Filter visible tabs
  const visibleTabs = useMemo(() => {
    return DEFAULT_HOME_TABS.filter((t) => guideDataMap[t.slug])
  }, [guideDataMap])

  const [activeTab, setActiveTab] = useState<string | null>(null)
  const currentTab = activeTab || visibleTabs[0]?.slug || ''

  // Guild stats
  const guildStats = useMemo(() => {
    return guilds.map((g) => ({
      name: g.name,
      count: members.filter((m) => m.guild === g.name).length,
      color: GUILD_COLORS[g.name] || '#888',
      shortName: g.name.replace('카롱', ''),
    }))
  }, [guilds, members])

  return (
    <div className="fade-in space-y-4">
      {/* Welcome Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-indigo-100">
            뚠
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-800">뚠카롱 길드에 오신 걸 환영합니다!</h2>
            {user && (
              <p className="text-sm text-gray-500 font-bold">
                {user.name} · {role === 'admin' ? '관리자' : 'Public View'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Guide Tabs */}
      {visibleTabs.length > 0 && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
          <div className="flex items-center gap-1 p-3 border-b border-gray-100 overflow-x-auto">
            {visibleTabs.map((t) => (
              <button
                key={t.slug}
                onClick={() => setActiveTab(t.slug)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shrink-0 hover:opacity-90',
                  currentTab === t.slug
                    ? 'bg-indigo-500 text-white shadow'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                )}
              >
                {t.label}
              </button>
            ))}
            {isAdmin && (
              <a
                href="/admin/guide-edit"
                className="ml-auto shrink-0 text-[9px] font-bold text-indigo-400 hover:text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg transition-all flex items-center gap-1"
              >
                <Pencil size={10} />
                편집
              </a>
            )}
          </div>
          {visibleTabs.map((t) => (
            <div
              key={t.slug}
              className={cn('p-5', currentTab !== t.slug && 'hidden')}
            >
              <div
                className="home-guide-content prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(guideDataMap[t.slug] || '') }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats - Per-guild member counts */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {guildStats.map((g) => (
          <div
            key={g.name}
            className="bg-white border border-gray-100 rounded-2xl p-3 text-center shadow-sm"
          >
            <div className="text-xl font-black" style={{ color: g.color }}>
              {g.count}
            </div>
            <div className="text-[9px] font-bold text-gray-400 mt-0.5 tracking-wider">
              {g.shortName}카롱
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '길드원', desc: '멤버 관리', color: 'from-indigo-500 to-blue-500', href: '/members' },
          { label: '수로 분석', desc: '점수 통계', color: 'from-blue-400 to-indigo-400', href: '/analysis' },
          { label: '승강제', desc: '승급/강등', color: 'from-amber-400 to-orange-400', href: '/promotion' },
          { label: '게시판', desc: '공지/글', color: 'from-emerald-400 to-green-400', href: '/board' },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all group"
          >
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${item.color} flex items-center justify-center text-white font-bold text-sm mb-3`}
            >
              {item.label[0]}
            </div>
            <p className="font-bold text-gray-800 text-sm">{item.label}</p>
            <p className="text-[10px] text-gray-400 font-bold">{item.desc}</p>
          </a>
        ))}
      </div>

      {/* Recent Events */}
      {recentEvents.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h4 className="text-sm font-black text-gray-800 mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-indigo-400" />
            최근 일정
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="min-w-[150px] p-3 bg-gray-50 rounded-xl border border-gray-100 flex-shrink-0"
              >
                <div className="text-[10px] font-bold text-indigo-500">{ev.date}</div>
                <div className="text-xs font-bold text-gray-700 mt-0.5">{ev.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
