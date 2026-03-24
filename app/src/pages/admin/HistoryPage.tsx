import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import { useToast } from '@/components/ui/Toast'
import { Trash2, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ─── types ─── */
interface HistoryRow {
  id: number
  date: string
  category: string
  name: string
  content: string
}

interface RecordRow {
  id: number
  join_date: string | null
  nickname: string
  job_class: string | null
  suro_score: number | null
  join_guild: string | null
  prev_guild: string | null
  join_source: string | null
  join_category: string | null
  join_reason: string | null
  leave_category: string | null
  leave_reason: string | null
  leave_date: string | null
  referrer: string | null
  status: string
  last_verified: string | null
}

type SubTab = 'weekly' | 'operation' | 'records'

/* ─── maple week util ─── */
function getMapleWeek(offset: number) {
  const now = new Date()
  now.setDate(now.getDate() - (offset || 0) * 7)
  const day = now.getDay()
  let daysSinceThurs = day - 4
  if (daysSinceThurs < 0) daysSinceThurs += 7
  const start = new Date(now)
  start.setDate(now.getDate() - daysSinceThurs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

/* ─── classify ─── */
const CAT_META: Record<string, { label: string; color: string }> = {
  all: { label: '전체', color: 'indigo' },
  join: { label: '가입', color: 'emerald' },
  leave: { label: '탈퇴', color: 'red' },
  move: { label: '이동', color: 'blue' },
  nick: { label: '닉변', color: 'purple' },
  edit: { label: '수정', color: 'amber' },
  role: { label: '직위', color: 'orange' },
  other: { label: '기타', color: 'gray' },
}

function classifyHistory(h: HistoryRow) {
  const cat = h.category || ''
  if (cat.includes('추가') || cat.includes('가입')) return 'join'
  if (cat.includes('삭제') || cat.includes('탈퇴') || cat.includes('추방')) return 'leave'
  if (cat.includes('이동')) return 'move'
  if (cat.includes('닉변')) return 'nick'
  if (cat.includes('수정') || cat.includes('일괄수정')) return 'edit'
  if (cat.includes('직위변경') || cat.includes('직위반영')) return 'role'
  if (cat === '설정') return '_skip'
  return 'other'
}

function extractGuild(h: HistoryRow) {
  const c = (h.content || '') + ' ' + (h.name || '')
  const m = c.match(/(뚠카롱|뚱카롱|밤카롱|별카롱|달카롱|꿀카롱)/)
  return m ? m[1] : ''
}

const CAT_COLORS_HEX: Record<string, string> = {
  join: '#10b981', leave: '#ef4444', move: '#3b82f6', nick: '#a855f7',
  edit: '#f59e0b', role: '#f97316', other: '#9ca3af',
}

/* ─── component ─── */
export default function HistoryPage() {
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()
  const { data: config } = useSiteConfig()

  const [subTab, setSubTab] = useState<SubTab>('weekly')

  /* shared data */
  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['operation-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operation_history')
        .select('*')
        .order('date', { ascending: false })
        .limit(2000)
      if (error) throw error
      return (data || []) as HistoryRow[]
    },
  })

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'weekly', label: '주간 로그' },
    { key: 'operation', label: '운영 이력' },
    { key: 'records', label: '영구 기록' },
  ]

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-gray-800">이력 관리</h2>
        <div className="flex gap-1.5 ml-4">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={cn(
                'px-3 py-1 rounded-lg text-[10px] font-bold transition-all',
                subTab === t.key
                  ? 'bg-indigo-500 text-white shadow'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'weekly' && (
        <WeeklyLogTab history={history} isLoading={histLoading} />
      )}
      {subTab === 'operation' && (
        <OperationTab history={history} isLoading={histLoading} toast={toast} qc={qc} />
      )}
      {subTab === 'records' && <RecordsTab config={config} />}
    </div>
  )
}

/* ═══ Weekly Log Sub-tab ═══ */
function WeeklyLogTab({
  history,
  isLoading,
}: {
  history: HistoryRow[]
  isLoading: boolean
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [filter, setFilter] = useState('all')
  const [guild, setGuild] = useState('')

  const week = useMemo(() => getMapleWeek(weekOffset), [weekOffset])
  const startStr = fmtDate(week.start)
  const endStr = fmtDate(week.end)

  const classified = useMemo(() => {
    return history
      .filter((h) => {
        const d = new Date(h.date)
        return d >= week.start && d <= week.end
      })
      .map((h) => {
        const type = classifyHistory(h)
        if (type === '_skip') return null
        return { ...h, _type: type, _guild: extractGuild(h) }
      })
      .filter(Boolean) as (HistoryRow & { _type: string; _guild: string })[]
  }, [history, week])

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    Object.keys(CAT_META).forEach((k) => (counts[k] = 0))
    classified.forEach((h) => {
      counts[h._type] = (counts[h._type] || 0) + 1
      counts.all++
    })
    return counts
  }, [classified])

  const guildList = useMemo(() => {
    const s = new Set<string>()
    classified.forEach((h) => { if (h._guild) s.add(h._guild) })
    return [...s].sort()
  }, [classified])

  const filtered = useMemo(() => {
    let list = classified
    if (filter !== 'all') list = list.filter((h) => h._type === filter)
    if (guild) list = list.filter((h) => h._guild === guild)
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [classified, filter, guild])

  const offsetLabel = weekOffset === 0 ? '이번 주' : weekOffset === 1 ? '지난 주' : `${weekOffset}주 전`

  return (
    <div className="flex flex-col gap-2">
      {/* Week navigator */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2 flex items-center gap-2">
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-indigo-100 text-gray-500"
        >
          <ChevronLeft size={12} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-xs font-black text-gray-800">
            {startStr}({DAY_NAMES[week.start.getDay()]}) ~ {endStr}({DAY_NAMES[week.end.getDay()]})
          </span>
          <span className="text-[9px] text-gray-400 font-bold ml-2">{offsetLabel}</span>
        </div>
        <button
          onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-lg',
            weekOffset > 0 ? 'bg-gray-100 hover:bg-indigo-100 text-gray-500' : 'bg-gray-50 text-gray-200'
          )}
          disabled={weekOffset === 0}
        >
          <ChevronRight size={12} />
        </button>
        {weekOffset > 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="px-2 py-1 bg-indigo-500 text-white rounded-lg text-[8px] font-bold"
          >
            오늘
          </button>
        )}
      </div>

      {/* Category + guild filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {Object.entries(CAT_META).map(([k, m]) => {
          const cnt = catCounts[k] || 0
          const isActive = filter === k
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'px-2 py-0.5 rounded text-[8px] font-bold transition-all',
                isActive
                  ? `bg-${m.color}-500 text-white shadow`
                  : cnt > 0
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-300'
              )}
              style={isActive ? { backgroundColor: k === 'all' ? '#6366f1' : CAT_COLORS_HEX[k] || '#6366f1', color: 'white' } : undefined}
            >
              {m.label}
              {cnt > 0 ? ` ${cnt}` : ''}
            </button>
          )
        })}
        <span className="mx-0.5 text-gray-200">|</span>
        <button
          onClick={() => setGuild('')}
          className={cn(
            'px-2 py-0.5 rounded text-[8px] font-bold',
            !guild ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500'
          )}
        >
          전체
        </button>
        {guildList.map((g) => (
          <button
            key={g}
            onClick={() => setGuild(g)}
            className={cn(
              'px-2 py-0.5 rounded text-[8px] font-bold',
              guild === g ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500'
            )}
          >
            {g.replace('카롱', '')}
          </button>
        ))}
        <span className="text-[8px] text-gray-400 ml-auto">{filtered.length}건</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex-1 min-h-0">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-xs font-bold">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-300 text-xs font-bold">이력 없음</div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-[10px] border-collapse stick-head">
              <thead className="bg-gray-50 text-[8px] font-bold text-gray-400 uppercase">
                <tr>
                  <th className="py-1 px-1.5 text-left border-r border-gray-100 w-[52px]">날짜</th>
                  <th className="py-1 px-1.5 text-left border-r border-gray-100 w-[44px]">구분</th>
                  <th className="py-1 px-1.5 text-left border-r border-gray-100 w-[32px]">길드</th>
                  <th className="py-1 px-1.5 text-left border-r border-gray-100 w-[70px]">닉네임</th>
                  <th className="py-1 px-1.5 text-left">상세</th>
                </tr>
              </thead>
              <tbody className="font-bold text-gray-600">
                {filtered.map((h) => {
                  const d = new Date(h.date)
                  const ds = `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`
                  const cc = CAT_COLORS_HEX[h._type] || '#9ca3af'
                  const gl = h._guild ? h._guild.replace('카롱', '') : ''
                  return (
                    <tr
                      key={h.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50"
                      style={{ borderLeft: `3px solid ${cc}` }}
                    >
                      <td className="py-0.5 px-1.5 text-gray-400 border-r border-gray-50">{ds}</td>
                      <td className="py-0.5 px-1.5 border-r border-gray-50">
                        <span className="text-[8px] font-bold" style={{ color: cc }}>
                          {h.category.replace('동기화-', '')}
                        </span>
                      </td>
                      <td className="py-0.5 px-1.5 text-gray-400 border-r border-gray-50">{gl}</td>
                      <td className="py-0.5 px-1.5 text-gray-800 border-r border-gray-50">{h.name}</td>
                      <td className="py-0.5 px-1.5 text-gray-400 text-[8px]">{h.content || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══ Operation History Sub-tab ═══ */
function OperationTab({
  history,
  isLoading,
  toast,
  qc,
}: {
  history: HistoryRow[]
  isLoading: boolean
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  qc: ReturnType<typeof useQueryClient>
}) {
  const deleteRow = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('operation_history').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operation-history'] })
      toast('삭제 완료', 'success')
    },
  })

  const CATEGORY_COLORS: Record<string, string> = {
    '추가': 'bg-green-50 text-green-600',
    '수정': 'bg-blue-50 text-blue-600',
    '삭제': 'bg-red-50 text-red-600',
    '일괄수정': 'bg-amber-50 text-amber-600',
    '승강-승격': 'bg-purple-50 text-purple-600',
    '승강-강등': 'bg-red-50 text-red-500',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-xs stick-head">
          <thead>
            <tr className="bg-gray-50 text-gray-500 font-bold text-[10px]">
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-left">분류</th>
              <th className="px-3 py-2 text-left">대상</th>
              <th className="px-3 py-2 text-left">내용</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold">로딩 중...</td></tr>
            ) : history.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-300 font-bold">이력이 없습니다</td></tr>
            ) : history.map((h) => (
              <tr key={h.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{h.date}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${CATEGORY_COLORS[h.category] || 'bg-gray-50 text-gray-600'}`}>
                    {h.category}
                  </span>
                </td>
                <td className="px-3 py-2 font-bold text-gray-800">{h.name}</td>
                <td className="px-3 py-2 text-gray-600 max-w-[300px] truncate">{h.content}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => { if (confirm('삭제?')) deleteRow.mutate(h.id) }}
                    className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══ Records Sub-tab ═══ */
function RecordsTab({
  config,
}: {
  config: ReturnType<typeof useSiteConfig>['data']
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [guildFilter, setGuildFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['member-records'],
    queryFn: async () => {
      let allRec: RecordRow[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('member_records')
          .select('*')
          .order('join_date', { ascending: false })
          .range(from, from + 999)
        if (error) throw error
        allRec = allRec.concat((data || []) as RecordRow[])
        if (!data || data.length < 1000) break
        from += 1000
      }
      return allRec
    },
  })

  const guilds = config?.guilds.map((g) => g.name) || ['뚠카롱', '뚱카롱', '밤카롱', '별카롱', '달카롱', '꿀카롱']

  const filtered = useMemo(() => {
    let list = records
    if (search) list = list.filter((r) => r.nickname.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter)
    if (guildFilter !== 'all') list = list.filter((r) => r.join_guild === guildFilter)
    return list
  }, [records, search, statusFilter, guildFilter])

  const statusBadge = (s: string) => {
    if (s === 'active') return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-bold">재직</span>
    if (s === 'left') return <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-lg text-[9px] font-bold">탈퇴</span>
    return <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-[9px] font-bold">추방</span>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-gray-800">
            영구 기록
            <span className="text-gray-400 font-mono text-[10px] ml-1">{records.length}건</span>
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="닉네임 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs w-40 focus:ring-2 focus:ring-indigo-300 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
          >
            <option value="all">전체 상태</option>
            <option value="active">재직</option>
            <option value="left">탈퇴</option>
            <option value="kicked">추방</option>
          </select>
          <select
            value={guildFilter}
            onChange={(e) => setGuildFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
          >
            <option value="all">전체 길드</option>
            {guilds.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Records table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-2 border-b border-gray-100 text-[10px] text-gray-400 font-bold px-4">
          검색결과 {filtered.length}건
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-gray-50 text-[9px] font-bold text-gray-500 uppercase sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">가입일</th>
                <th className="px-3 py-2">닉네임</th>
                <th className="px-3 py-2">직업</th>
                <th className="px-3 py-2">가입길드</th>
                <th className="px-3 py-2">이전길드</th>
                <th className="px-3 py-2">가입경로</th>
                <th className="px-3 py-2">가입 카테고리</th>
                <th className="px-3 py-2 max-w-[200px]">가입사유</th>
                <th className="px-3 py-2">탈퇴 카테고리</th>
                <th className="px-3 py-2 max-w-[200px]">탈퇴사유</th>
                <th className="px-3 py-2">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={12} className="p-12 text-center text-gray-300 font-bold">로딩 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="p-12 text-center text-gray-300 font-bold">데이터 없음</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors text-[11px] font-bold">
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{r.join_date || '-'}</td>
                  <td className="px-3 py-2 text-gray-800">{r.nickname}</td>
                  <td className="px-3 py-2 text-gray-500">{r.job_class || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-md text-[9px]',
                      r.join_guild === '뚠카롱' ? 'bg-pink-100 text-pink-600' : 'bg-rose-100 text-rose-600'
                    )}>
                      {r.join_guild || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400">{r.prev_guild || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.join_source || '-'}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px]">
                      {r.join_category || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={r.join_reason || ''}>
                    {r.join_reason || '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[9px]">
                      {r.leave_category || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={r.leave_reason || ''}>
                    {r.leave_reason || '-'}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-[10px]">{r.referrer || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
