import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { useMembers } from '@/hooks/useMembers'
import { Trash2, Undo2, Gavel } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PenaltyRecord {
  id: number
  date: string
  name: string
  points: number
  reason: string
}

interface ExpelledRecord {
  name: string
  expelled_at: string
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function usePenaltyHistory() {
  return useQuery({
    queryKey: ['penalty-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('penalty_history')
        .select('*')
        .order('date', { ascending: true })
      if (error) throw error
      return (data || []) as PenaltyRecord[]
    },
  })
}

function useExpelledList() {
  return useQuery({
    queryKey: ['penalty-expelled'],
    queryFn: async () => {
      const { data, error } = await supabase.from('penalty_expelled').select('name, expelled_at')
      if (error) throw error
      return (data || []) as ExpelledRecord[]
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PenaltyPage() {
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  const { data: penaltyHistory = [], isLoading } = usePenaltyHistory()
  const { data: expelledList = [] } = useExpelledList()
  const { data: members = [] } = useMembers()

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [target, setTarget] = useState('')
  const [points, setPoints] = useState('1')
  const [reason, setReason] = useState('')

  // Member options for the select
  const memberOptions = useMemo(
    () =>
      members
        .map((m) => ({ name: m.name, guild: m.guild }))
        .sort((a, b) => `${a.name} (${a.guild})`.localeCompare(`${b.name} (${b.guild})`, 'ko')),
    [members],
  )

  // Accumulated penalty counts per member
  const penaltyCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    penaltyHistory.forEach((h) => {
      counts[h.name] = (counts[h.name] || 0) + Number(h.points)
    })
    return counts
  }, [penaltyHistory])

  // Active penalties: members with > 0 points, sorted desc
  const activePenalties = useMemo(
    () =>
      Object.entries(penaltyCounts)
        .filter(([, pts]) => pts > 0)
        .sort((a, b) => b[1] - a[1]),
    [penaltyCounts],
  )

  // Expelled names set for quick lookup
  const expelledNames = useMemo(() => new Set(expelledList.map((e) => e.name)), [expelledList])

  // Reversed history for display (newest first)
  const reversedHistory = useMemo(() => [...penaltyHistory].reverse(), [penaltyHistory])

  /* ---- Mutations ---- */

  const savePenalty = useMutation({
    mutationFn: async (payload: {
      date: string
      name: string
      points: number
      reason: string
    }) => {
      const { error } = await supabase.from('penalty_history').insert({
        date: payload.date,
        name: payload.name,
        points: payload.points,
        reason: payload.reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penalty-history'] })
      toast('벌점이 저장되었습니다.', 'success')
      setReason('')
    },
    onError: (e) => toast('저장 실패: ' + (e as Error).message, 'error'),
  })

  const deletePenalty = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('penalty_history').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penalty-history'] })
      toast('벌점 기록이 삭제되었습니다.', 'success')
    },
    onError: (e) => toast('삭제 실패: ' + (e as Error).message, 'error'),
  })

  const markExpelled = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('penalty_expelled')
        .upsert({ name, expelled_at: new Date().toISOString() }, { onConflict: 'name' })
      if (error) throw error
      // Also log to operation_history
      await supabase.from('operation_history').insert({
        date: new Date().toISOString().split('T')[0],
        category: '추방',
        name,
        content: '벌점 10점 이상 추방완료 처리',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penalty-expelled'] })
      toast('추방완료 처리되었습니다.', 'success')
    },
    onError: (e) => toast('처리 실패: ' + (e as Error).message, 'error'),
  })

  const undoExpelled = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('penalty_expelled').delete().eq('name', name)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penalty-expelled'] })
      toast('추방완료가 취소되었습니다.', 'success')
    },
    onError: (e) => toast('취소 실패: ' + (e as Error).message, 'error'),
  })

  const handleSubmit = () => {
    if (!date || !target || !points || !reason.trim()) {
      toast('모든 항목을 입력해주세요.', 'error')
      return
    }
    if (!confirm(`${target}님에게 ${date} 일자로 벌점 ${points}점을 부여하시겠습니까?`)) return
    savePenalty.mutate({
      date,
      name: target,
      points: parseInt(points) || 0,
      reason: reason.trim(),
    })
  }

  /* ---- Helpers ---- */

  function formatDisplayDate(d: string): string {
    if (!d) return '-'
    const datePart = d.split(' ')[0]
    return datePart.length >= 2 ? datePart.substring(2) : datePart
  }

  /* ---- Render ---- */

  return (
    <div className="fade-in grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 h-full">
      {/* ---- Left: Form (admin only) ---- */}
      {isAdmin && (
        <div className="lg:col-span-1 bg-white p-5 lg:p-10 rounded-2xl lg:rounded-[3rem] border border-gray-100 shadow-sm flex flex-col lg:h-full lg:overflow-hidden">
          <div className="mb-4 lg:mb-8">
            <h3 className="text-base lg:text-xl font-bold text-gray-800 tracking-tight">
              벌점 부여
            </h3>
            <p className="text-[10px] lg:text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">
              PENALTY RECORD
            </p>
          </div>

          <div className="space-y-4 lg:space-y-6 flex-1 overflow-y-auto no-scrollbar pb-4 lg:pb-6">
            <div className="space-y-1.5 lg:space-y-2">
              <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                부여 날짜
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-inner focus:border-indigo-300"
              />
            </div>

            <div className="space-y-1.5 lg:space-y-2">
              <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                대상자
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-sm cursor-pointer"
              >
                <option value="">대상자를 선택하세요</option>
                {memberOptions.map((m) => (
                  <option key={`${m.name}-${m.guild}`} value={m.name}>
                    {m.name} ({m.guild})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:space-y-2">
              <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                벌점 (1~10점)
              </label>
              <select
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-sm cursor-pointer"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                  <option key={i} value={i}>
                    {i}점
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:space-y-2">
              <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                부여 사유
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="상세 사유를 입력하세요"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-inner resize-none focus:border-indigo-300"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={savePenalty.isPending}
              className="w-full py-4 lg:py-6 bg-indigo-600 text-white rounded-xl lg:rounded-[2rem] font-bold text-[10px] lg:text-xs shadow-xl hover:bg-indigo-700 transition-all active:scale-[0.98] mt-2 lg:mt-4 disabled:opacity-50"
            >
              {savePenalty.isPending ? '저장 중...' : '벌점 저장'}
            </button>
          </div>
        </div>
      )}

      {/* ---- Right: Summary + History ---- */}
      <div
        className={cn(
          'flex flex-col gap-4 lg:gap-6 lg:h-full lg:overflow-hidden',
          isAdmin ? 'lg:col-span-2' : 'lg:col-span-3',
        )}
      >
        {/* Active penalty badges */}
        <div className="bg-white p-5 lg:p-8 rounded-2xl lg:rounded-[3rem] border border-gray-100 shadow-sm shrink-0 min-h-[120px] lg:min-h-[160px]">
          <div className="mb-3 lg:mb-4">
            <h3 className="text-[10px] lg:text-sm font-bold text-gray-800 uppercase tracking-widest">
              현재 벌점 관리 대상자
            </h3>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 flex-wrap">
            {activePenalties.length > 0 ? (
              activePenalties.map(([name, pts]) => {
                const isExpelled = expelledNames.has(name)

                // Expelled + 10+ points => gray badge
                if (pts >= 10 && isExpelled) {
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2 bg-gray-400 text-white pl-2 pr-2 py-1.5 rounded-full shrink-0"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                        <span className="text-[10px]">V</span>
                      </div>
                      <span className="text-xs font-bold text-white line-through">{name}</span>
                      <span className="text-[8px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">
                        추방완료
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            if (confirm(`"${name}" 님의 추방완료를 취소하시겠습니까?`))
                              undoExpelled.mutate(name)
                          }}
                          className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-all ml-1"
                          title="추방완료 취소"
                        >
                          <Undo2 size={11} />
                        </button>
                      )}
                    </div>
                  )
                }

                // Active penalty badge
                return (
                  <div
                    key={name}
                    className={cn(
                      'flex items-center gap-2 pl-2 py-1.5 rounded-full shrink-0',
                      pts >= 10
                        ? 'bg-red-500 text-white pr-2'
                        : 'bg-red-50 border border-red-100 pr-4',
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-sm',
                        pts >= 10 ? 'bg-white/20 text-white' : 'bg-white text-red-500',
                      )}
                    >
                      {pts}
                    </div>
                    <span
                      className={cn(
                        'text-xs font-bold',
                        pts >= 10 ? 'text-white' : 'text-red-600',
                      )}
                    >
                      {name}
                    </span>
                    {pts >= 10 && (
                      <span className="text-[8px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">
                        추방 대상
                      </span>
                    )}
                    {pts >= 10 && isAdmin && (
                      <button
                        onClick={() => {
                          if (confirm(`"${name}" 님을 추방완료 처리하시겠습니까?`))
                            markExpelled.mutate(name)
                        }}
                        className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-all ml-1"
                        title="추방완료 처리"
                      >
                        <Gavel size={11} />
                      </button>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-gray-300 font-bold italic w-full">
                현재 벌점자가 없습니다.
              </p>
            )}
          </div>
        </div>

        {/* History table */}
        <div className="bg-white rounded-2xl lg:rounded-[3rem] border border-gray-100 shadow-sm flex flex-col flex-1 overflow-hidden h-full">
          <div className="p-4 lg:p-8 border-b border-gray-50 flex justify-between items-center shrink-0">
            <h3 className="text-[10px] lg:text-sm font-bold text-gray-800 uppercase tracking-widest">
              상세 부여 이력
            </h3>
            <span className="text-[10px] text-gray-400 font-bold italic">
              Total: {penaltyHistory.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {isLoading ? (
              <p className="p-20 text-center text-gray-400 text-xs font-bold">로딩 중...</p>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase sticky top-0">
                  <tr>
                    <th className="p-3">날짜</th>
                    <th className="p-3">대상자</th>
                    <th className="p-3">점수</th>
                    <th className="p-3">부여 사유</th>
                    {isAdmin && <th className="p-3 text-right">삭제</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reversedHistory.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 5 : 4}
                        className="p-20 text-center text-gray-300 font-bold italic"
                      >
                        벌점 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    reversedHistory.map((h) => (
                      <tr
                        key={h.id}
                        className="hover:bg-gray-50 border-b border-gray-50 h-10 transition-colors font-bold text-xs"
                      >
                        <td className="p-3 font-mono text-gray-400 text-[10px]">
                          {formatDisplayDate(h.date)}
                        </td>
                        <td className="p-3 text-gray-700">{h.name}</td>
                        <td className="p-3 text-red-500 font-bold">{Number(h.points)}점</td>
                        <td
                          className="p-3 text-gray-500 text-[11px] whitespace-normal break-words max-w-[200px]"
                          title={h.reason || ''}
                        >
                          {h.reason || ''}
                        </td>
                        {isAdmin && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                if (confirm('이 벌점 기록을 삭제하시겠습니까?'))
                                  deletePenalty.mutate(h.id)
                              }}
                              className="text-[9px] text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
