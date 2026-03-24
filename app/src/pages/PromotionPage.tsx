import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMembers } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap } from '@/hooks/useScores'
import { useApplicants, usePromotionHistory, useAddApplicant, useRemoveApplicant, useExecuteTrade } from '@/hooks/usePromotion'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { Trophy, Shield, History, Plus, X, Search, ArrowLeftRight, Save, Trash2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

type SubTab = 'ranking' | 'admin_match' | 'history'

function getKSTDateStr() {
  const d = new Date()
  d.setHours(d.getHours() + 9)
  return d.toISOString().split('T')[0]
}

interface MatchResult {
  challenger: { name: string; score: number; member?: { id: string } }
  defender: { name: string; score: number }
  result: string
  reason: string
}

export default function PromotionPage() {
  const { data: members = [] } = useMembers()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()
  const { data: applicants = [] } = useApplicants()
  const { data: history = [] } = usePromotionHistory()
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)
  const addApplicant = useAddApplicant()
  const removeApplicant = useRemoveApplicant()
  const executeTrade = useExecuteTrade()
  const queryClient = useQueryClient()

  const [subTab, setSubTab] = useState<SubTab>('ranking')
  const [addName, setAddName] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [executing, setExecuting] = useState(false)

  // Period selector
  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const suroHeaders = useMemo(() => periods.map((p) => p.period_label).sort(), [periods])

  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<number | null>(null)
  const currentIdx = selectedPeriodIdx ?? (suroHeaders.length > 0 ? suroHeaders.length - 1 : 0)
  const latestPeriod = suroHeaders[currentIdx] || ''

  const getScore = (memberId: string) => scoreMap[memberId]?.[latestPeriod] ?? 0

  const getShortPeriod = (h: string) => {
    const m = h.match(/(\d{2}-\d{2}-\d{2}\([^)]+\))\s*~/)
    return m ? m[1] : h.substring(0, 15)
  }

  // 1기(뚠카롱) score ranking
  const g1Sorted = useMemo(() =>
    members.filter((m) => m.guild === '뚠카롱' && m.isMain !== false)
      .map((m) => ({ ...m, score: getScore(m.id) }))
      .sort((a, b) => b.score - a.score),
    [members, scoreMap, latestPeriod]
  )

  const g1Total = g1Sorted.length
  const cutline = g1Sorted.length > 0 ? g1Sorted[Math.min(179, g1Sorted.length - 1)]?.score ?? 0 : 0
  const bottom10 = g1Sorted.slice(-10)

  // Challengers (promotion applicants)
  const challengers = useMemo(() =>
    applicants.map((a) => {
      const m = members.find((x) => x.name === a.name)
      return { ...a, score: m ? getScore(m.id) : 0, member: m }
    }).sort((a, b) => b.score - a.score),
    [applicants, members, scoreMap, latestPeriod]
  )

  // Auto-match logic (same as original)
  const matches = useMemo((): MatchResult[] => {
    const result: MatchResult[] = []
    const usedDefenders = new Set<string>()

    for (const ch of challengers) {
      if (ch.score <= 0) continue
      let bestDf: typeof bottom10[0] | null = null
      let bestReason = ''

      // 0-score defender first
      for (const df of bottom10) {
        if (usedDefenders.has(df.name)) continue
        if (df.score === 0 && ch.score > 0) { bestDf = df; bestReason = '방어자 0점 (자동)'; break }
      }
      // 5000 point gap
      if (!bestDf) {
        for (const df of [...bottom10].reverse()) {
          if (usedDefenders.has(df.name)) continue
          if (ch.score >= df.score + 5000) { bestDf = df; bestReason = '5,000점 격차'; break }
        }
      }
      // Cutline breakthrough
      if (!bestDf && ch.score > cutline) {
        for (const df of [...bottom10].reverse()) {
          if (usedDefenders.has(df.name)) continue
          bestDf = df; bestReason = '180등 컷 돌파'; break
        }
      }

      if (bestDf) {
        usedDefenders.add(bestDf.name)
        result.push({
          challenger: { name: ch.name, score: ch.score, member: ch.member ? { id: ch.member.id } : undefined },
          defender: { name: bestDf.name, score: bestDf.score },
          result: 'promoted',
          reason: bestReason,
        })
      }
    }
    return result
  }, [challengers, bottom10, cutline])

  const waitingList = useMemo(() =>
    challengers.filter(ch => !matches.find(m => m.challenger.name === ch.name)),
    [challengers, matches]
  )

  // 2기 member autocomplete
  const g2Suggestions = useMemo(() => {
    if (!addName.trim()) return []
    const q = addName.toLowerCase()
    return members
      .filter((m) => m.guild === '뚱카롱' && m.isMain && m.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [members, addName])

  const handleAddApplicant = async (name: string) => {
    const member = members.find((m) => m.name === name)
    if (!member) { toast('존재하지 않는 멤버입니다.', 'error'); return }
    if (member.guild !== '뚱카롱') { toast(`${name}은(는) 뚱카롱 소속이 아닙니다.`, 'error'); return }
    await addApplicant.mutateAsync({ memberId: Number(member.id), name })
    toast(`${name} 승급 신청 추가!`, 'success')
    setAddName('')
    setShowAutocomplete(false)
  }

  // Save cutline
  const handleSaveCutline = async () => {
    try {
      await supabase.from('promotion_cutlines').upsert({ week_label: latestPeriod, rank_180_score: cutline })
      toast(`컷라인 저장: ${cutline.toLocaleString()}점`, 'success')
    } catch {
      toast('저장 실패', 'error')
    }
  }

  // Execute trade
  const handleExecuteTrade = async () => {
    if (matches.length === 0) { toast('승격 조건을 충족하는 매칭이 없습니다.', 'info'); return }
    if (!confirm(`승격 조건을 충족한 ${matches.length}건의 매칭을 실행하시겠습니까?`)) return
    setExecuting(true)
    try {
      const trades = matches.map(m => {
        const chApp = applicants.find(a => a.name === m.challenger.name)
        const chMem = members.find(x => x.name === m.challenger.name)
        const dfMem = members.find(x => x.name === m.defender.name)
        return {
          applicantId: chApp?.id || 0,
          challengerName: m.challenger.name,
          challengerScore: m.challenger.score,
          challengerMemberId: chMem ? Number(chMem.id) : null,
          defenderName: m.defender.name,
          defenderScore: m.defender.score,
          defenderMemberId: dfMem ? Number(dfMem.id) : null,
          reason: m.reason,
          weekLabel: latestPeriod,
        }
      })
      await executeTrade.mutateAsync(trades)

      // Log to operation_history
      const historyRows: { date: string; category: string; name: string; content: string }[] = []
      for (const t of trades) {
        historyRows.push({
          date: getKSTDateStr(), category: '승강-승격', name: t.challengerName,
          content: `뚱카롱->뚠카롱 (${t.challengerScore.toLocaleString()}점, ${t.reason}, 기준: ${latestPeriod})`
        })
        historyRows.push({
          date: getKSTDateStr(), category: '승강-강등', name: t.defenderName,
          content: `뚠카롱->뚱카롱 (${t.defenderScore.toLocaleString()}점)`
        })
      }
      if (historyRows.length > 0) {
        await supabase.from('operation_history').insert(historyRows)
      }

      toast(`승강 완료! ${trades.length}건 교체`, 'success')
    } catch {
      toast('실행 실패', 'error')
    }
    setExecuting(false)
  }

  // Delete individual history record
  const handleDeleteHistory = async (id: number) => {
    if (!confirm('이 이력을 삭제하시겠습니까?')) return
    try {
      await supabase.from('promotion_history').delete().eq('id', id)
      queryClient.invalidateQueries({ queryKey: ['promotion-history'] })
      toast('이력 삭제 완료', 'success')
    } catch {
      toast('삭제 실패', 'error')
    }
  }

  // Group history by week
  const groupedHistory = useMemo(() => {
    const map = new Map<string, typeof history>()
    history.forEach((h) => {
      if (!map.has(h.week_label)) map.set(h.week_label, [])
      map.get(h.week_label)!.push(h)
    })
    return [...map.entries()]
  }, [history])

  const subTabs: { key: SubTab; icon: typeof Trophy; label: string; adminOnly?: boolean }[] = [
    { key: 'ranking', icon: Trophy, label: '승급 대기자' },
    { key: 'admin_match', icon: ArrowLeftRight, label: '트레이드 실행', adminOnly: true },
    { key: 'history', icon: History, label: '승강 이력' },
  ]

  return (
    <div className="fade-in space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-3 text-white">
        <div className="flex items-center gap-2">
          <span className="text-xl shrink-0">{'⚔️'}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black leading-tight">뚠카롱 1기 {'<->'} 2기 승강제</h2>
            <p className="text-[9px] opacity-70 hidden sm:block">{'목요일 수로 마감 후 관리자가 점수 기입 → 승강 실행'}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[8px] opacity-70">컷라인</div>
            <div className="text-base font-black leading-tight">{cutline.toLocaleString()}점</div>
            <div className="text-[8px] opacity-60">{Math.min(180, g1Total)}등 기준</div>
          </div>
        </div>

        {/* Period selector */}
        {isAdmin && suroHeaders.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9px] opacity-70 shrink-0">주차:</span>
            <div className="relative flex-1">
              <select
                value={currentIdx}
                onChange={(e) => setSelectedPeriodIdx(Number(e.target.value))}
                className="w-full bg-white/20 border border-white/30 rounded-lg px-2 py-1 text-[10px] font-bold outline-none text-white appearance-none"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                {[...suroHeaders].reverse().map((h, i) => (
                  <option key={h} value={suroHeaders.length - 1 - i} style={{ color: '#1f2937' }}>
                    {getShortPeriod(h)}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
            </div>
          </div>
        )}
        {!isAdmin && (
          <div className="mt-1">
            <span className="text-[9px] opacity-60">기준: {getShortPeriod(latestPeriod)}</span>
          </div>
        )}
      </div>

      {/* Sub tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        {subTabs.filter(t => !t.adminOnly || isAdmin).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap border',
              subTab === key ? 'bg-indigo-500 text-white shadow border-indigo-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Ranking tab */}
      {subTab === 'ranking' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Challengers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Trophy size={14} className="text-amber-400" />
                  승급 신청자 랭킹
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-bold">{challengers.length}명</span>
                  {isAdmin && (
                    <button onClick={handleSaveCutline} className="text-[9px] text-indigo-500 font-bold hover:text-indigo-700 flex items-center gap-0.5">
                      <Save size={10} />컷라인 저장
                    </button>
                  )}
                </div>
              </div>

              {/* Add applicant */}
              {isAdmin && (
                <div className="p-3 border-b border-gray-50 relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={addName}
                        onChange={(e) => { setAddName(e.target.value); setShowAutocomplete(true) }}
                        onFocus={() => setShowAutocomplete(true)}
                        placeholder="2기 닉네임 검색..."
                        className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300"
                      />
                      {showAutocomplete && g2Suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                          {g2Suggestions.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => handleAddApplicant(m.name)}
                              className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 flex items-center gap-2"
                            >
                              <span>{m.name}</span>
                              <span className="text-[9px] text-gray-400">{m.class}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddApplicant(addName)}
                      className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-auto max-h-[400px]">
                {challengers.length === 0 ? (
                  <p className="p-6 text-center text-gray-300 text-xs font-bold">승급 신청자가 없습니다</p>
                ) : (
                  <table className="w-full text-[10px] lg:text-xs border-collapse">
                    <thead className="bg-gray-50 text-[8px] font-bold text-gray-400 uppercase sticky top-0">
                      <tr>
                        <th className="py-1.5 px-1.5 text-center w-7">#</th>
                        <th className="py-1.5 px-1.5 text-left">닉네임</th>
                        <th className="py-1.5 px-1.5 text-left hidden sm:table-cell">직업</th>
                        <th className="py-1.5 px-1.5 text-right">점수</th>
                        <th className="py-1.5 px-1.5 text-right hidden sm:table-cell">컷 대비</th>
                        <th className="py-1.5 px-1.5 text-center">상태</th>
                        {isAdmin && <th className="py-1.5 px-1.5 w-14 text-center">관리</th>}
                      </tr>
                    </thead>
                    <tbody className="font-bold text-gray-600">
                      {challengers.map((ch, i) => {
                        const rank = i + 1
                        const diff = ch.score - cutline
                        const match = matches.find(m => m.challenger.name === ch.name)
                        let badge = '대기', bc = 'bg-gray-100 text-gray-400'
                        if (match?.result === 'promoted') { badge = '승격 대상'; bc = 'bg-green-100 text-green-600' }
                        else if (rank <= 10 && diff < 0) { badge = '조건 미달'; bc = 'bg-yellow-100 text-yellow-600' }
                        return (
                          <tr key={ch.id} className="border-b border-gray-50 hover:bg-indigo-50/30">
                            <td className={cn('py-1.5 px-1.5 text-center font-black', rank <= 3 && 'text-amber-500')}>
                              {rank <= 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][rank - 1] : rank}
                            </td>
                            <td className="py-1.5 px-1.5 text-gray-800 max-w-[80px] truncate">{ch.name}</td>
                            <td className="py-1.5 px-1.5 text-gray-400 text-[9px] hidden sm:table-cell">{ch.member?.class || ''}</td>
                            <td className="py-1.5 px-1.5 text-right text-indigo-600">{ch.score.toLocaleString()}</td>
                            <td className={cn('py-1.5 px-1.5 text-right hidden sm:table-cell', diff >= 0 ? 'text-green-500' : 'text-red-400')}>
                              {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-1.5 text-center">
                              <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded-full', bc)}>{badge}</span>
                            </td>
                            {isAdmin && (
                              <td className="py-1.5 px-1 text-center">
                                <button
                                  onClick={async () => { await removeApplicant.mutateAsync(ch.id); toast('삭제 완료', 'success') }}
                                  className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                                >
                                  <X size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Bottom 10 defenders */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Shield size={14} className="text-red-400" />
                  1기 강등 방어자 (하위 10명)
                </h3>
                <p className="text-[9px] text-gray-400 mt-0.5">1기 총 {g1Sorted.length}명</p>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 gap-1.5">
                  {bottom10.map((m, i) => (
                    <div key={m.id} className="bg-red-50 rounded-xl p-2 text-center border border-red-100 hover:border-red-200 transition-all">
                      <div className="text-[8px] text-red-400 font-bold">{g1Total - 9 + i}등</div>
                      <div className="text-[10px] font-bold text-gray-800 truncate" title={m.name}>{m.name}</div>
                      <div className={cn('text-[10px] font-black', m.score === 0 ? 'text-red-500' : 'text-gray-700')}>
                        {m.score.toLocaleString()}
                      </div>
                      {m.score === 0 && <span className="text-[8px] bg-red-100 text-red-500 px-1 py-0.5 rounded-md font-bold">0점</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade execution tab (admin_match) */}
      {subTab === 'admin_match' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-800 flex items-center gap-2">
                <ArrowLeftRight size={14} className="text-indigo-500" />
                승격 매칭 ({matches.length}건)
              </h3>
              <span className="text-[9px] text-gray-400">기준: {getShortPeriod(latestPeriod)}</span>
            </div>

            {matches.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-gray-400 font-bold mb-1">승격 조건을 충족하는 도전자가 없습니다</p>
                <p className="text-[9px] text-gray-300">조건: 180등 컷라인 돌파 / 방어자 0점 / 5,000점 격차</p>
              </div>
            ) : (
              <>
                <p className="text-[9px] text-gray-400 mb-2">{'↓'} 게임에서 아래 순서대로 길드 이동하세요</p>
                <div className="space-y-2">
                  {matches.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 rounded-xl text-[10px] sm:text-xs bg-green-50 border border-green-200">
                      <span className="text-[9px] font-black text-gray-400 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[8px] text-purple-500 font-bold">2기 {'→'} 1기</div>
                        <div className="font-black text-gray-800 truncate">{m.challenger.name}</div>
                        <div className="text-indigo-600 font-bold">{m.challenger.score.toLocaleString()}점</div>
                      </div>
                      <span className="text-lg shrink-0">{'⇄'}</span>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-[8px] text-red-500 font-bold">1기 {'→'} 2기</div>
                        <div className="font-black text-gray-800 truncate">{m.defender.name}</div>
                        <div className="text-red-500 font-bold">{m.defender.score.toLocaleString()}점</div>
                      </div>
                      <div className="shrink-0">
                        <span className="text-[8px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-md font-bold">{m.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleExecuteTrade}
                  disabled={executing}
                  className="mt-4 w-full py-3 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {executing ? (
                    <>처리 중...</>
                  ) : (
                    <>
                      <ArrowLeftRight size={14} />
                      {matches.length}건 트레이드 실행
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {waitingList.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
              <h3 className="text-[10px] font-bold text-gray-500 mb-2 flex items-center gap-1">
                {'⏱'} 조건 미달 대기자 ({waitingList.length}명)
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {waitingList.map(ch => (
                  <span key={ch.id} className="text-[9px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-500">
                    {ch.name} <span className="text-gray-400">{ch.score.toLocaleString()}점</span>
                  </span>
                ))}
              </div>
              <p className="text-[8px] text-gray-400 mt-2">{'※'} 조건 미달 시 대기 유지 {'·'} 다음 주차에 재평가됩니다</p>
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {subTab === 'history' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5 mb-3">
            <History size={14} className="text-indigo-400" />
            승강 이력
          </h3>
          {groupedHistory.length === 0 ? (
            <p className="text-xs text-gray-300 py-4 text-center">이력 없음</p>
          ) : (
            <div className="space-y-3">
              {groupedHistory.map(([week, items]) => (
                <div key={week}>
                  <div className="text-[9px] font-bold text-indigo-500 px-2 py-1 bg-indigo-50 rounded-lg mb-1 flex items-center justify-between">
                    <span>{week}</span>
                    <span className="text-gray-400">{items.length}건</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 px-2 py-1.5 text-[10px] hover:bg-gray-50/50 group">
                        <span className={h.result === 'promoted' ? 'text-green-500' : 'text-red-400'}>
                          {h.result === 'promoted' ? '✅' : '❌'}
                        </span>
                        <span className="text-purple-600 font-bold truncate">{h.challenger_name}</span>
                        <span className="text-gray-400">{h.challenger_score.toLocaleString()}</span>
                        <span className="text-gray-300">{'↔'}</span>
                        <span className="text-red-500 font-bold truncate">{h.defender_name}</span>
                        <span className="text-gray-400">{h.defender_score.toLocaleString()}</span>
                        <span className="text-[8px] text-gray-400 hidden sm:inline ml-auto">{h.reason}</span>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteHistory(h.id)}
                            className="ml-auto sm:ml-1 p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
