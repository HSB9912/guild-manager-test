import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { useMembers } from '@/hooks/useMembers'
import { Trash2, Gem, Package } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BailRecord {
  id: number
  date: string
  payer: string
  receiver: string
  amount: number
  memo: string
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useBailHistory() {
  return useQuery({
    queryKey: ['bail-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bail_history')
        .select('*')
        .order('date', { ascending: true })
      if (error) throw error
      return (data || []) as BailRecord[]
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BailPage() {
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  const { data: bailHistory = [], isLoading } = useBailHistory()
  const { data: members = [] } = useMembers()

  // Form state
  const [bailType, setBailType] = useState<'deposit' | 'use'>('deposit')
  const [payer, setPayer] = useState('')
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('1')
  const [memo, setMemo] = useState('')

  // Receiver candidates: 뚠카롱 guild admins (마카롱 / 다쿠아즈 roles)
  const receivers = useMemo(
    () =>
      members
        .filter((m) => m.guild === '뚠카롱' && ['마카롱', '다쿠아즈'].includes(m.role))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [members],
  )

  // Stats: per-admin gem totals
  const adminStats = useMemo(() => {
    const stats: Record<string, number> = {}
    bailHistory.forEach((h) => {
      const a = Number(h.amount) || 0
      stats[h.receiver] = (stats[h.receiver] || 0) + a
    })
    return Object.entries(stats).sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [bailHistory])

  // Stats: totals
  const totalStats = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    bailHistory.forEach((h) => {
      const a = Number(h.amount) || 0
      if (a > 0) totalIn += a
      else totalOut += Math.abs(a)
    })
    return { totalIn, totalOut, net: totalIn - totalOut }
  }, [bailHistory])

  // Mutations
  const saveBail = useMutation({
    mutationFn: async (payload: {
      date: string
      payer: string
      receiver: string
      amount: number
      memo: string
    }) => {
      const { error } = await supabase.from('bail_history').insert({
        date: payload.date,
        payer: payload.payer,
        receiver: payload.receiver,
        amount: payload.amount,
        memo: payload.memo,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bail-history'] })
      toast('보석금이 저장되었습니다.', 'success')
      setPayer('')
      setAmount('1')
      setMemo('')
    },
    onError: (e) => toast('저장 실패: ' + (e as Error).message, 'error'),
  })

  const deleteBail = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('bail_history').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bail-history'] })
      toast('보석금 기록이 삭제되었습니다.', 'success')
    },
    onError: (e) => toast('삭제 실패: ' + (e as Error).message, 'error'),
  })

  const handleSubmit = () => {
    if (bailType === 'deposit') {
      if (!payer.trim() || !receiver || !amount) {
        toast('모든 항목을 입력하세요.', 'error')
        return
      }
      if (!confirm(`${payer} 님의 보석금 ${amount}개를 저장하시겠습니까?`)) return
      saveBail.mutate({
        date: new Date().toISOString().split('T')[0],
        payer: payer.trim(),
        receiver,
        amount: parseInt(amount) || 0,
        memo: '',
      })
    } else {
      if (!memo.trim() || !receiver || !amount) {
        toast('모든 항목을 입력하세요.', 'error')
        return
      }
      if (!confirm(`보석금 ${amount}개 사용 (${memo})을 기록하시겠습니까?`)) return
      saveBail.mutate({
        date: new Date().toISOString().split('T')[0],
        payer: memo.trim(),
        receiver,
        amount: -(parseInt(amount) || 0),
        memo: memo.trim(),
      })
    }
  }

  const reversedHistory = useMemo(() => [...bailHistory].reverse(), [bailHistory])

  return (
    <div className="fade-in grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 h-full">
      {/* ---- Left: Form (admin only) ---- */}
      {isAdmin && (
        <div className="lg:col-span-1 bg-white p-5 lg:p-10 rounded-2xl lg:rounded-[3rem] border border-gray-100 shadow-sm flex flex-col lg:h-full lg:overflow-hidden">
          <div className="mb-4 lg:mb-6">
            <h3 className="text-base lg:text-xl font-bold text-gray-800 tracking-tight">
              보석금 관리
            </h3>
            <p className="text-[10px] lg:text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">
              GEM BAIL MANAGEMENT
            </p>
          </div>

          {/* Type toggle */}
          <div className="flex gap-2 mb-4 lg:mb-6">
            <button
              onClick={() => setBailType('deposit')}
              className={cn(
                'flex-1 py-3 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-1.5',
                bailType === 'deposit'
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
              )}
            >
              <Gem size={14} /> 납부
            </button>
            <button
              onClick={() => setBailType('use')}
              className={cn(
                'flex-1 py-3 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-1.5',
                bailType === 'use'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
              )}
            >
              <Package size={14} /> 사용
            </button>
          </div>

          {/* Form fields */}
          <div className="space-y-4 lg:space-y-6 flex-1 overflow-y-auto no-scrollbar pb-4 lg:pb-6">
            {bailType === 'deposit' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                    납부자
                  </label>
                  <input
                    type="text"
                    value={payer}
                    onChange={(e) => setPayer(e.target.value)}
                    placeholder="닉네임 직접 입력"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-inner focus:border-indigo-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                    수령자
                  </label>
                  <select
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-sm cursor-pointer"
                  >
                    <option value="">수령자를 선택하세요</option>
                    {receivers.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} ({r.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                    수량
                  </label>
                  <input
                    type="number"
                    value={amount}
                    min="1"
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-inner focus:border-indigo-300"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                    사용 사유
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="예: 길드 이벤트 보상"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-inner focus:border-indigo-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                    담당자
                  </label>
                  <select
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-sm cursor-pointer"
                  >
                    <option value="">담당자를 선택하세요</option>
                    {receivers.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} ({r.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] lg:text-[10px] font-bold text-gray-400 ml-1 uppercase">
                    사용 수량
                  </label>
                  <input
                    type="number"
                    value={amount}
                    min="1"
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl lg:rounded-2xl p-3 lg:p-4 text-xs lg:text-sm font-bold outline-none shadow-inner focus:border-indigo-300"
                  />
                </div>
              </>
            )}

            <button
              onClick={handleSubmit}
              disabled={saveBail.isPending}
              className={cn(
                'w-full py-4 lg:py-6 text-white rounded-xl lg:rounded-[2rem] font-bold text-[10px] lg:text-xs shadow-xl transition-all active:scale-[0.98] disabled:opacity-50',
                bailType === 'deposit'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-blue-600 hover:bg-blue-700',
              )}
            >
              {saveBail.isPending
                ? '전송 중...'
                : bailType === 'deposit'
                  ? '납부 확인 및 저장'
                  : '사용 확인 및 저장'}
            </button>

            {/* Total stats */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100">
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-400 font-bold">총 납부</p>
                <p className="text-sm font-black text-indigo-500">+{totalStats.totalIn}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-400 font-bold">총 사용</p>
                <p className="text-sm font-black text-blue-500">-{totalStats.totalOut}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-400 font-bold">잔여</p>
                <p
                  className={cn(
                    'text-sm font-black',
                    totalStats.net >= 0 ? 'text-green-500' : 'text-red-500',
                  )}
                >
                  {totalStats.net}
                </p>
              </div>
            </div>

            {/* Per-admin stats */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h4 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">
                간부별 수령 총계
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {adminStats.length > 0 ? (
                  adminStats.map(([name, count]) => (
                    <div
                      key={name}
                      className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center border border-gray-100 hover:bg-white transition-all shadow-sm"
                    >
                      <span className="font-bold text-gray-700 text-xs">{name}</span>
                      <span
                        className={cn(
                          'font-black text-lg',
                          count >= 0 ? 'text-indigo-500' : 'text-blue-500',
                        )}
                      >
                        {count}개
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-gray-300 italic text-center">데이터 없음</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Right: History table ---- */}
      <div
        className={cn(
          'bg-white rounded-2xl lg:rounded-[3rem] border border-gray-100 shadow-sm flex flex-col lg:h-full lg:overflow-hidden',
          isAdmin ? 'lg:col-span-2' : 'lg:col-span-3',
        )}
      >
        <div className="p-4 lg:p-8 border-b border-gray-50 flex justify-between items-center shrink-0">
          <h3 className="text-[10px] lg:text-sm font-bold text-gray-800 uppercase tracking-widest">
            보석금 내역
          </h3>
          <span className="text-[10px] text-gray-400 font-bold italic">
            Total: {bailHistory.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {isLoading ? (
            <p className="p-20 text-center text-gray-400 text-xs font-bold">로딩 중...</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="p-3 lg:p-5">날짜</th>
                  <th className="p-3 lg:p-5">구분</th>
                  {isAdmin && <th className="p-3 lg:p-5">납부자/사유</th>}
                  {isAdmin && <th className="p-3 lg:p-5">수령자</th>}
                  <th className="p-3 lg:p-5 text-right">수량</th>
                  {isAdmin && <th className="p-3 lg:p-5 text-right">삭제</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reversedHistory.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 3}
                      className="p-20 text-center text-gray-300 font-bold italic"
                    >
                      내역이 존재하지 않습니다.
                    </td>
                  </tr>
                ) : (
                  reversedHistory.map((h) => {
                    const amt = Number(h.amount) || 0
                    const isUse = amt < 0
                    return (
                      <tr
                        key={h.id}
                        className="hover:bg-gray-50 border-b border-gray-50 h-12 transition-colors font-bold text-xs"
                      >
                        <td className="p-3 lg:p-4 font-mono text-gray-400 text-[10px]">
                          {h.date}
                        </td>
                        <td className="p-3 lg:p-4">
                          {isUse ? (
                            <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              사용
                            </span>
                          ) : (
                            <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              납부
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="p-3 lg:p-4 text-gray-700">
                            {h.payer}
                            {h.memo && (
                              <span className="text-[10px] text-gray-400 ml-1">({h.memo})</span>
                            )}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="p-3 lg:p-4 text-blue-500">{h.receiver}</td>
                        )}
                        <td
                          className={cn(
                            'p-3 lg:p-4 text-right',
                            isUse ? 'text-blue-500' : 'text-indigo-500',
                          )}
                        >
                          {isUse ? `${amt}개` : `+${amt}개`}
                        </td>
                        {isAdmin && (
                          <td className="p-3 lg:p-4 text-right">
                            <button
                              onClick={() => {
                                if (confirm('이 보석금 기록을 삭제하시겠습니까?'))
                                  deleteBail.mutate(h.id)
                              }}
                              className="text-[9px] text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
