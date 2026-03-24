import { useState, useMemo } from 'react'
import { useMembers } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap } from '@/hooks/useScores'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, AlertTriangle, Save } from 'lucide-react'
import { cn } from '@/lib/cn'

// ─── Reward tier data (matches original HTML) ────────────────────────────────

const REWARD_TIERS = [
  { grade: '크라운', rank: '1등', ratio: 0.28, pool: 100, benefit: '부캐길드 전체면제' },
  { grade: '크라운', rank: '2등', ratio: 0.24, pool: 100, benefit: '' },
  { grade: '크라운', rank: '3등', ratio: 0.20, pool: 100, benefit: '' },
  { grade: '크라운', rank: '4등', ratio: 0.16, pool: 100, benefit: '' },
  { grade: '크라운', rank: '5등', ratio: 0.12, pool: 100, benefit: '' },
  { grade: '파르페', rank: '6등', ratio: 0.11, pool: 100, benefit: '부캐길드 전체면제' },
  { grade: '파르페', rank: '7등', ratio: 0.10, pool: 100, benefit: '' },
  { grade: '파르페', rank: '8등', ratio: 0.09, pool: 100, benefit: '' },
  { grade: '파르페', rank: '9등', ratio: 0.08, pool: 100, benefit: '' },
  { grade: '파르페', rank: '10등', ratio: 0.08, pool: 100, benefit: '' },
  { grade: '파르페', rank: '11등', ratio: 0.07, pool: 100, benefit: '' },
  { grade: '파르페', rank: '12등', ratio: 0.07, pool: 100, benefit: '' },
  { grade: '파르페', rank: '13등', ratio: 0.07, pool: 100, benefit: '' },
  { grade: '파르페', rank: '14등', ratio: 0.06, pool: 100, benefit: '' },
  { grade: '파르페', rank: '15등', ratio: 0.06, pool: 100, benefit: '' },
  { grade: '파르페', rank: '16등', ratio: 0.05, pool: 100, benefit: '' },
  { grade: '파르페', rank: '17등', ratio: 0.04, pool: 100, benefit: '' },
  { grade: '파르페', rank: '18등', ratio: 0.04, pool: 100, benefit: '' },
  { grade: '파르페', rank: '19등', ratio: 0.04, pool: 100, benefit: '' },
  { grade: '파르페', rank: '20등', ratio: 0.04, pool: 100, benefit: '' },
]

const SCORE_TIERS = [
  { grade: '티라미슈', label: 'TOP 21~51', benefit: '전체면제 + 숫돌24개 + 부캐길드면제' },
  { grade: '크로칸슈', label: '중급 길드원 (9만+)', benefit: '전체면제 + 부캐길드면제' },
  { grade: '롤케이크', label: '평길드원 (5.5만+)', benefit: '절반면제' },
  { grade: '팬케이크', label: '강등 위험조 (하위 10명)', benefit: '부캐면제 X' },
]

const GRADE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  '크라운': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-400' },
  '파르페': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-400' },
  '티라미슈': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-400' },
  '크로칸슈': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-400' },
  '롤케이크': { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-400' },
  '팬케이크': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', badge: 'bg-gray-400' },
}

const GRADE_INFO: Record<string, string> = {
  '크라운': 'TOP 5',
  '파르페': '6~20등',
  '티라미슈': '21~51등',
  '크로칸슈': '90,000+',
  '롤케이크': '55,000+',
  '팬케이크': '하위 10명',
}

/** Parse period label like "25-01-02(목) ~ 25-01-09(목)" -> { year, month, quarter } */
function parsePeriod(label: string) {
  const m = label.match(/(\d{2})-(\d{2})-(\d{2})/)
  if (!m) return null
  const year = 2000 + parseInt(m[1])
  const month = parseInt(m[2])
  const quarter = Math.ceil(month / 3)
  return { year, month, quarter, key: `${year}년 ${quarter}분기` }
}

export default function RewardsPage() {
  const { data: members = [] } = useMembers()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)

  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const suroHeaders = useMemo(() => periods.map((p) => p.period_label).sort(), [periods])

  // Get piecePrice from raw site_config
  const [piecePriceInput, setPiecePriceInput] = useState<string>('')
  const [piecePriceLoaded, setPiecePriceLoaded] = useState(false)

  // We need to fetch the raw config to get piecePrice
  const [piecePrice, setPiecePrice] = useState(0)
  const [savingPrice, setSavingPrice] = useState(false)

  // Fetch raw piecePrice from site_config on mount
  useMemo(() => {
    if (piecePriceLoaded) return
    supabase
      .from('site_config')
      .select('config')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        const cfg = (data?.config as any) || {}
        const price = cfg?.suroReward?.piecePrice || 0
        setPiecePrice(price)
        setPiecePriceInput(String(price))
        setPiecePriceLoaded(true)
      })
  }, [piecePriceLoaded])

  const savePiecePrice = async () => {
    setSavingPrice(true)
    try {
      const price = parseInt(piecePriceInput) || 0
      const { data: cfgRow } = await supabase.from('site_config').select('config').eq('id', 1).maybeSingle()
      const cfg = (cfgRow?.config as any) || {}
      if (!cfg.suroReward) cfg.suroReward = {}
      cfg.suroReward.piecePrice = price
      const { error } = await supabase.from('site_config').update({ config: cfg }).eq('id', 1)
      if (error) throw error
      setPiecePrice(price)
      toast('조각 시세가 저장되었습니다: ' + price.toLocaleString() + '만원', 'success')
    } catch (e: any) {
      toast('저장 실패: ' + e.message, 'error')
    } finally {
      setSavingPrice(false)
    }
  }

  // Group periods by quarter
  const quarters = useMemo(() => {
    const map = new Map<string, string[]>()
    suroHeaders.forEach((h) => {
      const p = parsePeriod(h)
      if (!p) return
      if (!map.has(p.key)) map.set(p.key, [])
      map.get(p.key)!.push(h)
    })
    return [...map.entries()].sort((a, b) => b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0)
  }, [suroHeaders])

  const [selectedQuarterIdx, setSelectedQuarterIdx] = useState(0)
  const currentQuarter = quarters[selectedQuarterIdx]
  const quarterLabel = currentQuarter?.[0] || ''
  const quarterPeriods = currentQuarter?.[1] || []

  // Compute ranking with newbie adjustment (matches original HTML logic)
  const results = useMemo(() => {
    const g1 = members.filter((m) => m.guild === '뚠카롱')
    const ranked = g1
      .map((m) => {
        const memberScores = scoreMap[m.id] || {}
        const periodScores = quarterPeriods.map((p) => memberScores[p] ?? 0)

        // Find first participation (>0) -- consecutive 0s before = not yet joined
        let startIdx = 0
        while (startIdx < periodScores.length && periodScores[startIdx] === 0) startIdx++
        const activeWeeks = periodScores.length - startIdx
        const activeScores = periodScores.slice(startIdx)
        const total = activeScores.reduce((s, v) => s + v, 0)
        const participated = activeScores.filter((v) => v > 0).length
        const avg = activeWeeks > 0 ? Math.round(total / activeWeeks) : 0
        const isNewbie = startIdx > 0 && startIdx < periodScores.length

        return {
          ...m,
          totalScore: total,
          avgScore: avg,
          participated,
          weekCount: quarterPeriods.length,
          activeWeeks,
          isNewbie,
        }
      })
      .sort((a, b) => b.avgScore - a.avgScore)

    const bottom10 = ranked.slice(-10).map((m) => m.name)

    return ranked.map((m, i) => {
      const rank = i + 1
      let grade = ''
      let reward = ''
      let benefit = ''
      let rewardNote = ''
      const ratio = m.isNewbie ? m.activeWeeks / m.weekCount : 1

      if (rank <= 20) {
        const tier = REWARD_TIERS[i]
        grade = tier.grade
        if (piecePrice > 0) {
          const poolBil = tier.pool * 100000000
          let pieces = Math.round((poolBil * tier.ratio) / (piecePrice * 10000))
          if (m.isNewbie) {
            const original = pieces
            pieces = Math.round(pieces * ratio)
            rewardNote = `(${original}→${pieces}, ${Math.round(ratio * 100)}%)`
          }
          reward = '솔 에르다 조각 ' + pieces.toLocaleString() + '개'
        } else {
          reward = `비율 ${(tier.ratio * 100).toFixed(0)}%`
        }
        benefit = tier.benefit || REWARD_TIERS.find((t) => t.grade === grade && t.benefit)?.benefit || ''
      } else if (rank <= 51) {
        grade = '티라미슈'
        if (m.isNewbie) {
          const adj = Math.round(24 * ratio)
          reward = `숫돌 ${adj}개`
          rewardNote = `(24→${adj}, ${Math.round(ratio * 100)}%)`
        } else {
          reward = '숫돌 24개'
        }
        benefit = '전체면제 + 숫돌24개 + 부캐길드면제'
      } else if (m.avgScore >= 90000) {
        grade = '크로칸슈'
        reward = '-'
        benefit = '전체면제 + 부캐길드면제'
      } else if (m.avgScore >= 55000) {
        grade = '롤케이크'
        reward = '-'
        benefit = '절반면제'
      } else {
        grade = '팬케이크'
        reward = '-'
        benefit = bottom10.includes(m.name) ? '부캐면제 X' : ''
      }

      return { ...m, rank, grade, reward, benefit, rewardNote }
    })
  }, [members, scoreMap, quarterPeriods, piecePrice])

  if (quarters.length === 0) {
    return (
      <div className="fade-in flex justify-center py-20 text-gray-400 font-bold text-sm">
        수로 데이터가 없습니다
      </div>
    )
  }

  const gc = (grade: string) => GRADE_COLORS[grade] || GRADE_COLORS['팬케이크']

  return (
    <div className="fade-in space-y-4">
      {/* Header with quarter selector and piece price */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 lg:p-4 flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-gray-800">수로 보상체계</h2>
        <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl px-1 py-1">
          <button
            onClick={() => setSelectedQuarterIdx(Math.min(quarters.length - 1, selectedQuarterIdx + 1))}
            disabled={selectedQuarterIdx >= quarters.length - 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-bold text-gray-700 px-2 min-w-[90px] text-center">
            {quarterLabel}
          </span>
          <button
            onClick={() => setSelectedQuarterIdx(Math.max(0, selectedQuarterIdx - 1))}
            disabled={selectedQuarterIdx <= 0}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Piece price display / warning */}
        {piecePrice > 0 ? (
          <span className="text-[10px] text-gray-400 font-bold ml-auto">
            솔 에르다 조각 시세: {piecePrice.toLocaleString()}만원
          </span>
        ) : (
          <span className="text-[10px] text-red-400 font-bold ml-auto flex items-center gap-1">
            <AlertTriangle size={10} /> {'솔 에르다 조각 시세 미설정 (설정 → 관리자)'}
          </span>
        )}
      </div>

      {/* Admin: Piece price input */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <label className="text-[10px] font-bold text-gray-500">솔 에르다 조각 시세 (만원):</label>
          <input
            type="number"
            value={piecePriceInput}
            onChange={(e) => setPiecePriceInput(e.target.value)}
            className="w-28 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
            placeholder="650"
          />
          <button
            onClick={savePiecePrice}
            disabled={savingPrice}
            className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1"
          >
            <Save size={10} /> 저장
          </button>
        </div>
      )}

      {/* Grade summary cards */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
        <h4 className="text-xs font-bold text-gray-700 mb-3">보상 체계 요약</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {['크라운', '파르페', '티라미슈', '크로칸슈', '롤케이크', '팬케이크'].map((g) => {
            const c = gc(g)
            const cnt = results.filter((r) => r.grade === g).length
            return (
              <div key={g} className={cn(c.bg, c.border, 'border rounded-xl p-2 text-center')}>
                <div className={cn('text-[10px] font-black', c.text)}>{g}</div>
                <div className={cn('text-lg font-black', c.text)}>{cnt}</div>
                <div className="text-[8px] text-gray-400">{GRADE_INFO[g]}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tier description */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-gray-700 mb-3">보상 등급표</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {SCORE_TIERS.map((t) => {
            const c = gc(t.grade)
            return (
              <div key={t.grade} className={cn('rounded-xl border p-3', c.bg, c.border)}>
                <p className={cn('font-black text-sm', c.text)}>{t.grade}</p>
                <p className="text-[10px] font-bold opacity-70">{t.label}</p>
                <p className="text-[9px] mt-1 font-bold opacity-60">{t.benefit}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Full ranking table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold text-sm text-gray-700">
            보상 대상 랭킹 · {quarterLabel}{' '}
            <span className="text-[10px] text-gray-400 font-bold ml-2">
              뚠카롱 {results.length}명 · {quarterPeriods.length}주차 합산
            </span>
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-[10px] lg:text-xs whitespace-nowrap">
            <thead className="bg-gray-50 text-[9px] lg:text-[10px] font-bold text-gray-500 border-b border-gray-100 sticky top-0 z-10">
              <tr>
                <th className="py-2 px-2 text-center w-10">#</th>
                <th className="py-2 px-2 text-left">등급</th>
                <th className="py-2 px-2 text-left">닉네임</th>
                <th className="py-2 px-2 text-right">분기평균</th>
                <th className="py-2 px-2 text-right hidden sm:table-cell">참여</th>
                <th className="py-2 px-2 text-right">보상</th>
                <th className="py-2 px-2 text-left hidden lg:table-cell">혜택</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-600 font-bold">
              {results.map((r, idx) => {
                const c = gc(r.grade)
                const prevGrade = idx > 0 ? results[idx - 1].grade : ''
                const isNewGrade = r.grade !== prevGrade
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      r.avgScore === 0 ? 'opacity-40' : 'hover:bg-gray-50/50',
                      isNewGrade && idx > 0 ? 'border-t-2 border-gray-200' : ''
                    )}
                  >
                    <td className="py-2 px-2 text-center font-black">
                      {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={cn(
                          'inline-block px-2 py-0.5 rounded text-[9px] font-bold text-white',
                          c.badge
                        )}
                      >
                        {r.grade}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-bold text-gray-800">
                      {r.name}
                      {!r.isMain && (
                        <span className="text-[8px] text-gray-400 ml-1">
                          (부캐: {r.mainCharName || '?'})
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">{r.avgScore.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-gray-400 hidden sm:table-cell">
                      {r.participated}/{r.activeWeeks}주
                      {r.isNewbie && (
                        <span className="text-[8px] text-blue-500 bg-blue-50 px-1 rounded ml-1">
                          신규
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={r.reward !== '-' ? 'font-bold text-amber-600' : 'text-gray-400'}>
                        {r.reward}
                      </span>
                      {r.rewardNote && (
                        <>
                          <br />
                          <span className="text-[8px] text-gray-400 font-normal">{r.rewardNote}</span>
                        </>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[9px] text-gray-400 hidden lg:table-cell">
                      {r.benefit}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
        <div className="text-[10px] text-gray-500 font-bold space-y-1">
          <p>⚠ 점수 기준은 분기 평균 점수로 산정합니다.</p>
          <p>⚠ 신규 가입자는 전체 주차 기준 평균 (미참여 주차 = 0점 처리)</p>
          <p>⚠ 수로 미참여 시 해당 주차 0점 반영 → 등급 하락 가능</p>
        </div>
      </div>
    </div>
  )
}
