import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useMembers } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap } from '@/hooks/useScores'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { TrendingUp, Users, Award, BarChart3, Search, ChevronLeft, ChevronRight, Star, Flame, Percent, Zap, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

interface MvpEntry { name: string; val: number; role: string }

export default function AnalysisPage() {
  const { data: members = [] } = useMembers()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()

  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const suroHeaders = useMemo(() => periods.map((p) => p.period_label).sort(), [periods])

  // Guild filter
  const [guildFilter, setGuildFilter] = useState<string>('뚠카롱')
  // Period navigation index (from the end, 0 = latest)
  const [periodOffset, setPeriodOffset] = useState(0)
  // Search with debounce
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchInput = useCallback((val: string) => {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(val), 300)
  }, [])
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const [selectedMember, setSelectedMember] = useState<string>('')

  const currentPeriodIdx = Math.max(0, suroHeaders.length - 1 - periodOffset)
  const latestPeriod = suroHeaders[currentPeriodIdx] || ''

  const guildMembers = useMemo(() => members.filter(m => m.guild === guildFilter), [members, guildFilter])

  const getWedStr = (h: string) => {
    if (!h) return ''
    const p = h.split('~')
    return p.length > 1 ? p[1].replace('수로 점수', '').trim() : h.trim()
  }

  // Search filtering
  const displayTargets = useMemo(() => {
    const tokens = search.trim().length > 0
      ? search.trim().toLowerCase().split(/[\s,]+/).filter(t => t.length > 0)
      : []
    if (tokens.length === 0) return guildMembers
    return guildMembers.filter(m => {
      const mainName = m.isMain ? m.name : (m.mainCharName || '')
      return tokens.some(token =>
        m.name.toLowerCase().includes(token) ||
        mainName.toLowerCase().includes(token) ||
        (m.mainCharName || '').toLowerCase().includes(token) ||
        (m.class || '').toLowerCase().includes(token)
      )
    })
  }, [guildMembers, search])

  // Latest week stats
  const latestStats = useMemo(() => {
    if (!latestPeriod) return null
    const all = guildMembers.map((m) => ({ ...m, score: scoreMap[m.id]?.[latestPeriod] ?? 0 }))
    const participated = all.filter((m) => m.score > 0)
    const sorted = [...all].sort((a, b) => b.score - a.score)
    const total = all.reduce((s, m) => s + m.score, 0)
    const zeroCount = all.filter(m => m.score === 0).length
    const lowest = sorted.length > 0 ? sorted[sorted.length - 1] : null
    return {
      total: all.length,
      participated: participated.length,
      rate: all.length ? Math.round((participated.length / all.length) * 100) : 0,
      avg: participated.length ? Math.round(total / participated.length) : 0,
      top5: sorted.slice(0, 5),
      totalScore: total,
      zeroCount,
      lowest,
    }
  }, [guildMembers, scoreMap, latestPeriod])

  // MVP sections
  const mvpData = useMemo(() => {
    if (suroHeaders.length < 1 || !latestPeriod) return { high: [], score: [], pct: [], avg: [] }

    const prevHeader = currentPeriodIdx > 0 ? suroHeaders[currentPeriodIdx - 1] : null
    const topScores: MvpEntry[] = []
    const scoreIncreases: MvpEntry[] = []
    const pctIncreases: MvpEntry[] = []
    const avgIncreases: MvpEntry[] = []

    guildMembers.forEach(m => {
      const currScore = scoreMap[m.id]?.[latestPeriod] ?? 0
      const prevScore = prevHeader ? (scoreMap[m.id]?.[prevHeader] ?? 0) : 0

      const pastScores = suroHeaders.slice(0, currentPeriodIdx).map(h => scoreMap[m.id]?.[h] ?? 0).filter(s => s > 0)
      const pastAvg = pastScores.length > 0 ? Math.round(pastScores.reduce((a, b) => a + b, 0) / pastScores.length) : 0

      if (currScore > 0) topScores.push({ name: m.name, val: currScore, role: m.role })
      if (prevScore > 0 && currScore > prevScore) {
        scoreIncreases.push({ name: m.name, val: currScore - prevScore, role: m.role })
        pctIncreases.push({ name: m.name, val: ((currScore - prevScore) / prevScore) * 100, role: m.role })
      }
      if (pastAvg > 0 && currScore > pastAvg) {
        avgIncreases.push({ name: m.name, val: currScore - pastAvg, role: m.role })
      }
    })

    topScores.sort((a, b) => b.val - a.val)
    scoreIncreases.sort((a, b) => b.val - a.val)
    pctIncreases.sort((a, b) => b.val - a.val)
    avgIncreases.sort((a, b) => b.val - a.val)

    return {
      high: topScores.slice(0, 5),
      score: scoreIncreases.slice(0, 5),
      pct: pctIncreases.slice(0, 5),
      avg: avgIncreases.slice(0, 5),
    }
  }, [guildMembers, scoreMap, suroHeaders, latestPeriod, currentPeriodIdx])

  // Recent 3 weeks for ranking table
  const recent3 = useMemo(() => {
    const end = currentPeriodIdx + 1
    const start = Math.max(0, end - 3)
    return suroHeaders.slice(start, end)
  }, [suroHeaders, currentPeriodIdx])

  // Processed list for table
  const processedList = useMemo(() => {
    return displayTargets.map(m => {
      const recentScores = suroHeaders.map(h => scoreMap[m.id]?.[h] ?? 0)
      const validScores = recentScores.filter(s => s > 0)
      const avg = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0
      const currentScore = scoreMap[m.id]?.[latestPeriod] ?? 0
      return { ...m, avg, currentScore, recentScores }
    }).sort((a, b) => b.currentScore - a.currentScore)
  }, [displayTargets, scoreMap, suroHeaders, latestPeriod])

  // Per-member trend chart data
  const trendData = useMemo(() => {
    if (!selectedMember) return null
    const recent = suroHeaders.slice(-8)
    const memberScores = scoreMap[selectedMember] || {}
    return {
      labels: recent.map((h) => getWedStr(h).length > 10 ? getWedStr(h).slice(-8) : getWedStr(h)),
      datasets: [{
        label: members.find((m) => m.id === selectedMember)?.name || '',
        data: recent.map((h) => memberScores[h] ?? 0),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#6366f1',
      }],
    }
  }, [selectedMember, scoreMap, suroHeaders, members])

  // Participation rate over time
  const participationData = useMemo(() => {
    const recent = suroHeaders.slice(-8)
    return {
      labels: recent.map((h) => getWedStr(h).length > 10 ? getWedStr(h).slice(-8) : getWedStr(h)),
      datasets: [{
        label: '참여율 %',
        data: recent.map((h) => {
          const total = guildMembers.length
          const participated = guildMembers.filter((m) => (scoreMap[m.id]?.[h] ?? 0) > 0).length
          return total ? Math.round((participated / total) * 100) : 0
        }),
        backgroundColor: '#818cf8',
        borderRadius: 6,
      }],
    }
  }, [suroHeaders, guildMembers, scoreMap])

  const MvpCard = ({ title, icon: Icon, entries, type, gradientFrom, gradientTo, borderColor, iconColor }: {
    title: string; icon: typeof Star; entries: MvpEntry[]; type: string
    gradientFrom: string; gradientTo: string; borderColor: string; iconColor: string
  }) => {
    const formatVal = (m: MvpEntry) => {
      if (type === 'high') return Math.round(m.val).toLocaleString()
      if (type === 'score') return '+' + Math.round(m.val).toLocaleString()
      if (type === 'pct') return '\u25B2' + m.val.toFixed(1) + '%'
      return '+' + Math.round(m.val).toLocaleString()
    }
    return (
      <div className={cn('p-2.5 lg:p-3.5 rounded-xl lg:rounded-2xl border shadow-sm flex flex-col relative overflow-hidden min-h-[85px] lg:min-h-[100px]', gradientFrom, gradientTo, borderColor)}>
        <div className="flex justify-between items-center z-10">
          <p className={cn('text-[8px] lg:text-[9px] font-bold uppercase tracking-widest flex items-center gap-1', iconColor)}>
            <Icon size={10} /> {title}
          </p>
        </div>
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full pb-2">
            <span className="text-[10px] text-gray-400 font-bold">데이터 부족</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 z-10 w-full mt-2">
            {entries.map((m, idx) => (
              <div key={m.name} className="flex justify-between items-center text-[10px] leading-none bg-white/40 rounded px-1.5 py-1">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className={cn('font-black inline-block w-2.5 text-center', iconColor)}>{idx + 1}</span>
                  <span className="font-bold text-gray-800 truncate" style={{ maxWidth: 80 }}>{m.name}</span>
                </div>
                <span className={cn('font-black shrink-0', iconColor)}>{formatVal(m)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (suroHeaders.length === 0) {
    return <div className="fade-in flex justify-center py-20 text-gray-400 font-bold text-sm">수로 데이터가 없습니다</div>
  }

  return (
    <div className="fade-in space-y-4">
      {/* Header with guild tabs and search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex gap-2 overflow-x-auto shrink-0 w-full sm:w-auto items-center">
          {['뚠카롱', '뚱카롱'].map(g => (
            <button
              key={g}
              onClick={() => { setGuildFilter(g); setPeriodOffset(0) }}
              className={cn(
                'px-6 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0',
                g === guildFilter ? 'bg-indigo-500 text-white shadow-lg' : 'bg-white text-gray-500 border border-gray-100'
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="닉네임/본캐/직업 검색 (다중검색)"
            className="w-full pl-8 pr-3 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-indigo-50 transition-all"
          />
        </div>
      </div>

      {/* Summary Cards */}
      {latestStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 rounded-xl text-indigo-500 bg-indigo-50 flex items-center justify-center mb-2">
              <Users size={18} />
            </div>
            <p className="text-lg font-black text-gray-800">{latestStats.rate}%</p>
            <p className="text-[10px] font-bold text-gray-400">참여율 {latestStats.participated}/{latestStats.total}명</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 rounded-xl text-blue-500 bg-blue-50 flex items-center justify-center mb-2">
              <TrendingUp size={18} />
            </div>
            <p className="text-lg font-black text-gray-800">{latestStats.avg.toLocaleString()}</p>
            <p className="text-[10px] font-bold text-gray-400">참여자 평균 점</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 rounded-xl text-amber-500 bg-amber-50 flex items-center justify-center mb-2">
              <Award size={18} />
            </div>
            <p className="text-lg font-black text-gray-800 truncate">{latestStats.top5[0]?.name || '-'}</p>
            <p className="text-[10px] font-bold text-gray-400">MVP {latestStats.top5[0] ? `${latestStats.top5[0].score.toLocaleString()}점` : ''}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 rounded-xl text-emerald-500 bg-emerald-50 flex items-center justify-center mb-2">
              <BarChart3 size={18} />
            </div>
            <p className="text-lg font-black text-gray-800">{latestStats.totalScore.toLocaleString()}</p>
            <p className="text-[10px] font-bold text-gray-400">총 점수</p>
          </div>
          <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm p-4">
            <div className="w-9 h-9 rounded-xl text-red-500 bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle size={18} />
            </div>
            <p className="text-lg font-black text-red-600">{latestStats.zeroCount}명</p>
            <p className="text-[10px] font-bold text-red-400">미참여 (최저: {latestStats.lowest?.name || '-'})</p>
          </div>
        </div>
      )}

      {/* MVP Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MvpCard title="고득점" icon={Star} entries={mvpData.high} type="high"
          gradientFrom="bg-gradient-to-br" gradientTo="from-blue-50 to-cyan-50" borderColor="border-blue-100" iconColor="text-blue-600" />
        <MvpCard title="점수 떡상" icon={Flame} entries={mvpData.score} type="score"
          gradientFrom="bg-gradient-to-br" gradientTo="from-yellow-50 to-orange-50" borderColor="border-orange-100" iconColor="text-orange-600" />
        <MvpCard title="상승률" icon={Percent} entries={mvpData.pct} type="pct"
          gradientFrom="bg-gradient-to-br" gradientTo="from-emerald-50 to-teal-50" borderColor="border-emerald-100" iconColor="text-emerald-600" />
        <MvpCard title="평균대비 떡상" icon={Zap} entries={mvpData.avg} type="avg"
          gradientFrom="bg-gradient-to-br" gradientTo="from-purple-50 to-fuchsia-50" borderColor="border-purple-100" iconColor="text-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Member trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-sm text-gray-700 mb-3">개인별 점수 추이</h3>
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none mb-3"
          >
            <option value="">길드원 선택...</option>
            {guildMembers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.guild})</option>)}
          </select>
          <div className="h-[220px]">
            {trendData ? (
              <Line
                data={trendData}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 9 } } } },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 text-xs font-bold">
                길드원을 선택하세요
              </div>
            )}
          </div>
        </div>

        {/* Participation rate */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-sm text-gray-700 mb-3">주차별 참여율</h3>
          <div className="h-[280px]">
            <Bar
              data={participationData}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 10 } } },
                  x: { ticks: { font: { size: 9 } } },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Ranking table with period navigation and multiple week columns */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-sm text-gray-700">전체 데이터 (누적)</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPeriodOffset(Math.min(periodOffset + 1, suroHeaders.length - 1))}
              disabled={periodOffset >= suroHeaders.length - 1}
              className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] font-bold text-indigo-600 min-w-[80px] text-center">
              {getWedStr(latestPeriod)}
            </span>
            <button
              onClick={() => setPeriodOffset(Math.max(periodOffset - 1, 0))}
              disabled={periodOffset <= 0}
              className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs stick-head">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-bold text-[10px]">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2 text-left">닉네임</th>
                <th className="px-3 py-2 text-center bg-pink-50 text-pink-600">평균 (참여)</th>
                {recent3.map(h => (
                  <th key={h} className="px-3 py-2 text-right min-w-[100px]">{getWedStr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {processedList.map((m, i) => (
                <tr key={m.id} className={cn(m.currentScore === 0 ? 'score-zero' : 'hover:bg-gray-50/50')}>
                  <td className="px-3 py-2 font-black text-gray-300 text-center">
                    {i < 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][i] : i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-gray-800 truncate">
                        {m.name}
                        {m.level > 0 && <span className="text-[8px] text-gray-400 font-mono ml-1">Lv.{m.level}</span>}
                      </span>
                      <span className="text-[9px] text-gray-400 font-medium truncate">{m.class || ''}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-pink-600 bg-pink-50/30 font-bold">
                    {m.avg.toLocaleString()}
                  </td>
                  {recent3.map((h, scoreIdx) => {
                    const s = scoreMap[m.id]?.[h] ?? 0
                    const hIdx = suroHeaders.indexOf(h)
                    const prevH = hIdx > 0 ? suroHeaders[hIdx - 1] : null
                    const prevScore = prevH ? (scoreMap[m.id]?.[prevH] ?? 0) : 0

                    let diffHtml: React.ReactNode = null
                    if (prevScore > 0 && s > 0) {
                      const diffPct = ((s - prevScore) / prevScore * 100)
                      if (s > prevScore) {
                        diffHtml = <span className="text-[9px] text-red-500 font-bold block mt-0.5">{'\u25B2'} {diffPct.toFixed(1)}%</span>
                      } else if (s < prevScore) {
                        diffHtml = <span className="text-[9px] text-blue-500 font-bold block mt-0.5">{'\u25BC'} {Math.abs(diffPct).toFixed(1)}%</span>
                      }
                    } else if (s > 0 && prevScore === 0 && scoreIdx > 0) {
                      diffHtml = <span className="text-[9px] text-red-500 font-bold block mt-0.5">{'\u25B2'} NEW</span>
                    }

                    return (
                      <td key={h} className={cn(
                        'px-3 py-2 text-right font-mono',
                        s === 0 ? 'bg-red-50/20 text-red-400' : 'text-gray-700'
                      )}>
                        <div className="flex flex-col items-end leading-tight">
                          <span>{s > 0 ? s.toLocaleString() : '0'}</span>
                          {diffHtml}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
