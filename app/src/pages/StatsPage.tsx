import { useState, useMemo } from 'react'
import { useMembers } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap } from '@/hooks/useScores'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { AlertCircle, CheckCircle, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const GUILD_BAR_COLORS: Record<string, string> = {
  '뚠카롱': 'bg-pink-400',
  '뚱카롱': 'bg-rose-500',
  '밤카롱': 'bg-indigo-400',
  '별카롱': 'bg-amber-400',
  '달카롱': 'bg-blue-400',
  '꿀카롱': 'bg-orange-400',
}

const LEVEL_COLORS: Record<string, string> = {
  '300': 'bg-amber-400',
  '290~299': 'bg-red-400',
  '280~289': 'bg-orange-400',
  '270~279': 'bg-pink-400',
  '250~269': 'bg-blue-400',
  '200~249': 'bg-cyan-400',
  '~199': 'bg-gray-400',
  '미설정': 'bg-gray-300',
}

const MAX_GUILD = 200

export default function StatsPage() {
  const { data: members = [], isLoading } = useMembers()
  const { data: config } = useSiteConfig()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()

  const [subTab, setSubTab] = useState<'guild' | 'sub'>('guild')

  if (isLoading) {
    return (
      <div className="fade-in flex justify-center py-20 text-gray-400 font-bold text-sm">
        로딩 중...
      </div>
    )
  }

  return (
    <div className="fade-in space-y-3">
      {/* Sub-tab selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800">현황</h3>
          <div className="flex gap-1.5 ml-4">
            <button
              onClick={() => setSubTab('guild')}
              className={cn(
                'px-3 py-1 rounded-lg text-[10px] font-bold transition-all',
                subTab === 'guild'
                  ? 'bg-indigo-500 text-white shadow'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              길드 현황
            </button>
            <button
              onClick={() => setSubTab('sub')}
              className={cn(
                'px-3 py-1 rounded-lg text-[10px] font-bold transition-all',
                subTab === 'sub'
                  ? 'bg-indigo-500 text-white shadow'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              부캐 현황
            </button>
          </div>
        </div>
      </div>

      {subTab === 'guild' ? (
        <GuildStatsView members={members} config={config} periods={periods} scores={scores} />
      ) : (
        <SubCharsView members={members} config={config} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Guild Stats View
// ═══════════════════════════════════════════════════════════════════════════════

function GuildStatsView({
  members,
  config,
  periods,
  scores,
}: {
  members: any[]
  config: any
  periods: any[]
  scores: any[]
}) {
  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const suroHeaders = useMemo(() => periods.map((p: any) => p.period_label).sort(), [periods])
  const latestH = suroHeaders.length > 0 ? suroHeaders[suroHeaders.length - 1] : null

  const stats = useMemo(() => {
    if (!members.length) return null

    const totalCount = members.length
    const mainCount = members.filter((m: any) => m.isMain).length
    const subCount = totalCount - mainCount

    // Guild distribution
    const guilds = config?.guilds || []
    const guildCounts: Record<string, number> = {}
    guilds.forEach((g: any) => {
      guildCounts[g.name] = members.filter((m: any) => m.guild === g.name).length
    })

    // Class distribution
    const classCounts: Record<string, number> = {}
    members.forEach((m: any) => {
      const cls = m.class || '미설정'
      classCounts[cls] = (classCounts[cls] || 0) + 1
    })
    const sortedClasses = Object.entries(classCounts).sort((a, b) => b[1] - a[1])
    const topClasses = sortedClasses.slice(0, 10)

    // Level ranges (matching original HTML)
    const levelBuckets: Record<string, number> = {
      '미설정': 0,
      '~199': 0,
      '200~249': 0,
      '250~269': 0,
      '270~279': 0,
      '280~289': 0,
      '290~299': 0,
      '300': 0,
    }
    members.forEach((m: any) => {
      const lv = m.level || 0
      if (lv === 0) levelBuckets['미설정']++
      else if (lv < 200) levelBuckets['~199']++
      else if (lv < 250) levelBuckets['200~249']++
      else if (lv < 270) levelBuckets['250~269']++
      else if (lv < 280) levelBuckets['270~279']++
      else if (lv < 290) levelBuckets['280~289']++
      else if (lv < 300) levelBuckets['290~299']++
      else levelBuckets['300']++
    })

    // Orphan detection
    const allNames = new Set(members.map((m: any) => m.name))
    const orphanSubs = members.filter(
      (m: any) => !m.isMain && m.mainCharName && m.mainCharName.trim() !== '' && !allNames.has(m.mainCharName)
    )
    const noMainSet = members.filter(
      (m: any) => !m.isMain && (!m.mainCharName || m.mainCharName.trim() === '')
    )
    const mainNoSubs = members.filter(
      (m: any) => m.isMain && !members.some((m2: any) => !m2.isMain && m2.mainCharName === m.name)
    )

    // Suro participation
    let suroParticipation = null
    if (latestH) {
      const mainMembers = members.filter((m: any) => m.isMain)
      const participated = mainMembers.filter((m: any) => {
        const s = scoreMap[m.id]?.[latestH] || 0
        return s > 0
      })
      suroParticipation = {
        total: mainMembers.length,
        participated: participated.length,
        rate: mainMembers.length > 0 ? ((participated.length / mainMembers.length) * 100).toFixed(1) : '0',
      }
    }

    // Role distribution
    const roleCounts: Record<string, number> = {}
    members.forEach((m: any) => {
      roleCounts[m.role] = (roleCounts[m.role] || 0) + 1
    })

    return {
      totalCount,
      mainCount,
      subCount,
      guilds,
      guildCounts,
      classCounts,
      sortedClasses,
      topClasses,
      levelBuckets,
      orphanSubs,
      noMainSet,
      mainNoSubs,
      suroParticipation,
      roleCounts,
    }
  }, [members, config, scoreMap, latestH])

  if (!stats) return null

  const maxClassCount = stats.topClasses.length > 0 ? stats.topClasses[0][1] : 1

  return (
    <div className="space-y-3 pb-20 lg:pb-0">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 lg:p-4 text-center">
          <div className="text-2xl lg:text-3xl font-black text-gray-800">{stats.totalCount}</div>
          <div className="text-[10px] lg:text-xs text-gray-400 font-bold mt-1">전체 인원</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 lg:p-4 text-center">
          <div className="text-2xl lg:text-3xl font-black text-indigo-500">{stats.mainCount}</div>
          <div className="text-[10px] lg:text-xs text-gray-400 font-bold mt-1">
            본캐 <span className="text-gray-300">{stats.subCount} 부캐</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 lg:p-4 text-center">
          <div
            className={cn(
              'text-2xl lg:text-3xl font-black',
              stats.orphanSubs.length > 0 ? 'text-red-500' : 'text-emerald-500'
            )}
          >
            {stats.orphanSubs.length}
          </div>
          <div className="text-[10px] lg:text-xs text-gray-400 font-bold mt-1">미아 부캐</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 lg:p-4 text-center">
          <div className="text-2xl lg:text-3xl font-black text-blue-500">
            {stats.suroParticipation ? stats.suroParticipation.rate + '%' : '-'}
          </div>
          <div className="text-[10px] lg:text-xs text-gray-400 font-bold mt-1">수로 참여율</div>
        </div>
      </div>

      {/* Guild capacity bars */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-3">
          길드별 인원{' '}
          <span className="text-[9px] text-gray-400 font-bold ml-1">MAX {MAX_GUILD}명</span>
        </h3>
        <div className="space-y-2.5">
          {stats.guilds.map((g: any) => {
            const cnt = stats.guildCounts[g.name] || 0
            const pct = (cnt / MAX_GUILD) * 100
            const isFull = cnt >= MAX_GUILD
            const isNearFull = cnt >= MAX_GUILD * 0.95
            const barColor = isFull ? 'bg-red-500' : GUILD_BAR_COLORS[g.name] || 'bg-indigo-300'
            return (
              <div key={g.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-600">{g.name}</span>
                  <span
                    className={cn(
                      'text-[10px] font-bold',
                      isFull ? 'text-red-500' : isNearFull ? 'text-amber-500' : 'text-gray-500'
                    )}
                  >
                    {cnt}
                    <span className="text-gray-300">/{MAX_GUILD}</span>
                  </span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full flex items-center transition-all',
                      barColor,
                      pct > 15 ? 'justify-end pr-2' : 'justify-start pl-2'
                    )}
                    style={{ width: `${Math.max(Math.min(pct, 100), 3)}%` }}
                  >
                    <span className="text-[9px] font-black text-white">{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="text-[8px] text-gray-400 mt-0.5 text-right">
                  {isFull ? '정원 초과' : `잔여 ${MAX_GUILD - cnt}자리`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Class distribution TOP 10 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3">직업 분포 TOP 10</h3>
          <div className="space-y-1.5">
            {stats.topClasses.map(([cls, cnt]: [string, number], i: number) => (
              <div key={cls} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 w-4 text-right">{i + 1}</span>
                <span className="text-[10px] font-bold text-gray-700 w-24 truncate" title={cls}>
                  {cls}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                  <div
                    className="h-full bg-purple-300 rounded-full transition-all"
                    style={{ width: `${(cnt / maxClassCount) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-gray-500 w-6 text-right">{cnt}</span>
              </div>
            ))}
            {stats.sortedClasses.length > 10 && (
              <div className="text-[9px] text-gray-400 text-center mt-1">
                외 {stats.sortedClasses.length - 10}개 직업
              </div>
            )}
          </div>
        </div>

        {/* Level distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3">레벨 분포</h3>
          <div className="space-y-1.5">
            {Object.entries(stats.levelBuckets)
              .filter(([, v]) => (v as number) > 0)
              .map(([label, cnt]) => {
                const pct = stats.totalCount > 0 ? ((cnt as number) / stats.totalCount) * 100 : 0
                const color = LEVEL_COLORS[label] || 'bg-gray-300'
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-600 w-16">{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', color)}
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 w-12 text-right">
                      {cnt as number}명 ({pct.toFixed(0)}%)
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Main character matching verification */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-3">본캐 매칭 검증</h3>

        {/* Orphan subs */}
        {stats.orphanSubs.length > 0 ? (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">
                경고 {stats.orphanSubs.length}건
              </span>
              <span className="text-[10px] text-gray-500">본캐가 길드에 없는 부캐 (탈퇴 가능성)</span>
            </div>
            <div className="space-y-1">
              {stats.orphanSubs.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-100"
                >
                  <AlertCircle size={10} className="text-red-400" />
                  <span className="text-[11px] font-bold text-gray-800">{m.name}</span>
                  <span className="text-[9px] text-gray-400">→</span>
                  <span className="text-[11px] font-bold text-red-500 line-through">
                    {m.mainCharName}
                  </span>
                  <span className="text-[9px] text-gray-400 ml-auto">{m.guild}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100 mb-4">
            <CheckCircle size={14} className="text-emerald-500" />
            <span className="text-[11px] font-bold text-emerald-700">
              모든 부캐의 본캐가 길드에 존재합니다
            </span>
          </div>
        )}

        {/* No main set */}
        {stats.noMainSet.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[9px] font-bold">
                미설정 {stats.noMainSet.length}건
              </span>
              <span className="text-[10px] text-gray-500">본캐 정보가 없는 부캐</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {stats.noMainSet.slice(0, 20).map((m: any) => (
                <span
                  key={m.id}
                  className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700"
                >
                  {m.name}
                </span>
              ))}
              {stats.noMainSet.length > 20 && (
                <span className="px-2 py-1 text-[10px] text-gray-400 font-bold">
                  외 {stats.noMainSet.length - 20}명
                </span>
              )}
            </div>
          </div>
        )}

        {/* Main with no subs */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold">
              참고 {stats.mainNoSubs.length}명
            </span>
            <span className="text-[10px] text-gray-500">부캐가 없는 본캐</span>
          </div>
          <div className="text-[10px] text-gray-400">
            {stats.mainNoSubs.length > 0
              ? stats.mainNoSubs
                  .slice(0, 15)
                  .map((m: any) => m.name)
                  .join(', ') +
                (stats.mainNoSubs.length > 15 ? ` 외 ${stats.mainNoSubs.length - 15}명` : '')
              : '없음'}
          </div>
        </div>
      </div>

      {/* Suro participation */}
      {stats.suroParticipation && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3">최근 수로 참여 현황 (본캐 기준)</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-full h-full">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeDasharray={`${stats.suroParticipation.rate}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-black text-gray-800">
                  {stats.suroParticipation.rate}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-gray-600">
                참여{' '}
                <span className="text-emerald-500">{stats.suroParticipation.participated}명</span> /
                전체 {stats.suroParticipation.total}명
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                미참여 {stats.suroParticipation.total - stats.suroParticipation.participated}명
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Role table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-gray-700 mb-3">직위별 인원</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Object.entries(stats.roleCounts)
            .sort(
              (a, b) => (config?.rolePriority[a[0]] ?? 99) - (config?.rolePriority[b[0]] ?? 99)
            )
            .map(([role, count]) => (
              <div key={role} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-gray-800">{count as number}</p>
                <p className="text-[10px] font-bold text-gray-500">{role}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-Characters View
// ═══════════════════════════════════════════════════════════════════════════════

function SubCharsView({ members, config }: { members: any[]; config: any }) {
  const guilds = config?.guilds || []
  const subGuilds = guilds.filter((g: any) => !['뚠카롱', '뚱카롱'].includes(g.name))

  const [selectedGuild, setSelectedGuild] = useState(subGuilds[0]?.name || '')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'role' | 'name' | 'subs'>('role')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const guildSummary = useMemo(() => {
    const summary: Record<string, number> = {}
    subGuilds.forEach((g: any) => {
      summary[g.name] = members.filter((m: any) => m.guild === g.name).length
    })
    return summary
  }, [members, subGuilds])

  const treeData = useMemo(() => {
    // Build main map: mainName -> { main, subs[] }
    const mainMap: Record<string, { main: any; subs: any[] }> = {}
    members
      .filter((m: any) => m.isMain)
      .forEach((m: any) => {
        mainMap[m.name] = { main: m, subs: [] }
      })
    members
      .filter((m: any) => !m.isMain && m.mainCharName)
      .forEach((m: any) => {
        if (mainMap[m.mainCharName]) mainMap[m.mainCharName].subs.push(m)
      })

    const selectedMembers = members.filter((m: any) => m.guild === selectedGuild)
    const tree: { main: any; subs: any[] }[] = []
    const processedMains = new Set<string>()

    selectedMembers.forEach((m: any) => {
      const mainName = m.isMain ? m.name : m.mainCharName || ''
      if (!mainName || processedMains.has(mainName)) return
      processedMains.add(mainName)

      const mainInfo = mainMap[mainName]
      if (mainInfo) {
        const subsInGuild = mainInfo.subs.filter((s: any) => s.guild === selectedGuild)
        const mainInThisGuild = mainInfo.main.guild === selectedGuild
        if (mainInThisGuild && !subsInGuild.some((s: any) => s.name === mainInfo.main.name)) {
          subsInGuild.unshift(mainInfo.main)
        }
        tree.push({ main: mainInfo.main, subs: subsInGuild })
      } else {
        tree.push({
          main: { name: mainName, guild: '?', role: '', class: '' },
          subs: [m],
        })
      }
    })

    return tree
  }, [members, selectedGuild])

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    const data = s
      ? treeData.filter(
          (t) =>
            t.main.name.toLowerCase().includes(s) ||
            t.subs.some((sub: any) => sub.name.toLowerCase().includes(s))
        )
      : treeData

    const rp = config?.rolePriority || {}
    const dir = sortOrder === 'asc' ? 1 : -1
    return [...data].sort((a, b) => {
      if (sortField === 'role')
        return (
          ((rp[a.main.role] ?? 99) - (rp[b.main.role] ?? 99)) * dir ||
          (a.main.name < b.main.name ? -1 : a.main.name > b.main.name ? 1 : 0)
        )
      if (sortField === 'name') return (a.main.name < b.main.name ? -1 : a.main.name > b.main.name ? 1 : 0) * dir
      if (sortField === 'subs') return (a.subs.length - b.subs.length) * dir
      return 0
    })
  }, [treeData, search, sortField, sortOrder, config])

  const maxSubs = Math.max(1, ...filtered.map((t) => t.subs.length))

  const handleSort = (field: 'role' | 'name' | 'subs') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortIcon = (f: string) =>
    sortField === f ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <div className="space-y-3 pb-20 lg:pb-0">
      {/* Guild selector cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {subGuilds.map((g: any) => {
          const cnt = guildSummary[g.name] || 0
          const isActive = g.name === selectedGuild
          return (
            <div
              key={g.name}
              onClick={() => {
                setSelectedGuild(g.name)
                setSearch('')
              }}
              className={cn(
                'cursor-pointer rounded-2xl border-2 p-3 text-center transition-all',
                isActive
                  ? 'border-indigo-400 shadow-md bg-indigo-50'
                  : 'border-gray-100 bg-white hover:border-indigo-200'
              )}
            >
              <div
                className={cn(
                  'text-[10px] font-bold',
                  isActive ? 'text-indigo-600' : 'text-gray-500'
                )}
              >
                {g.name}
              </div>
              <div
                className={cn(
                  'text-xl font-black',
                  isActive ? 'text-indigo-600' : 'text-gray-800'
                )}
              >
                {cnt}
                <span className="text-[10px] font-bold text-gray-400">명</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sub-character table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h3 className="text-xs font-bold text-gray-700">
            {selectedGuild} 부캐 명단 ({filtered.length}명)
          </h3>
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
            <Search size={10} className="text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="bg-transparent text-[10px] font-bold outline-none w-24"
            />
          </div>
        </div>
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="w-full text-[10px] lg:text-xs whitespace-nowrap border-collapse">
            <thead className="bg-gray-50 text-[9px] font-bold text-gray-500 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th
                  className="py-2 px-2 border-r border-gray-200 text-left cursor-pointer hover:bg-indigo-50 select-none"
                  onClick={() => handleSort('role')}
                >
                  비고{sortIcon('role')}
                </th>
                <th
                  className="py-2 px-2 border-r border-gray-200 text-left cursor-pointer hover:bg-indigo-50 select-none"
                  onClick={() => handleSort('name')}
                >
                  본캐{sortIcon('name')}
                </th>
                {Array.from({ length: maxSubs }, (_, i) => (
                  <th key={i} className="py-2 px-2 border-r border-gray-200 text-left">
                    부캐{i + 1}
                  </th>
                ))}
                <th
                  className="py-2 px-2 text-center cursor-pointer hover:bg-indigo-50 select-none"
                  onClick={() => handleSort('subs')}
                >
                  부캐수{sortIcon('subs')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
              {filtered.map((t) => {
                const roleDisplay = (config as any)?.roleDisplay?.[t.main.role] || {}
                const badgeStyle = roleDisplay.bgColor
                  ? {
                      background: roleDisplay.bgColor,
                      color: roleDisplay.textColor || 'white',
                    }
                  : { background: '#f3f4f6', color: '#6b7280' }

                const rowBg = roleDisplay.rowColor
                  ? (() => {
                      const c = roleDisplay.rowColor
                      const r = parseInt(c.slice(1, 3), 16)
                      const g = parseInt(c.slice(3, 5), 16)
                      const b = parseInt(c.slice(5, 7), 16)
                      return `rgba(${r},${g},${b},0.1)`
                    })()
                  : undefined

                return (
                  <tr
                    key={t.main.name}
                    className="hover:bg-gray-50/50"
                    style={rowBg ? { backgroundColor: rowBg } : undefined}
                  >
                    <td className="py-1.5 px-2 border-r border-gray-200">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold"
                        style={badgeStyle}
                      >
                        {t.main.role || '-'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 border-r border-gray-200 font-bold text-gray-800">
                      {t.main.name}
                    </td>
                    {Array.from({ length: maxSubs }, (_, i) => {
                      const s = t.subs[i]
                      if (!s)
                        return <td key={i} className="py-1.5 px-2 border-r border-gray-100" />
                      const srd = (config as any)?.roleDisplay?.[s.role] || {}
                      const sBg = srd.bgColor
                        ? {
                            background: srd.bgColor,
                            color: srd.textColor || 'white',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }
                        : undefined
                      return (
                        <td key={i} className="py-1.5 px-2 border-r border-gray-100">
                          {sBg ? <span style={sBg}>{s.name}</span> : s.name}
                        </td>
                      )
                    })}
                    <td className="py-1.5 px-2 text-center text-gray-400">{t.subs.length}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={maxSubs + 3}
                    className="p-8 text-center text-gray-300 font-bold text-xs"
                  >
                    데이터 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
