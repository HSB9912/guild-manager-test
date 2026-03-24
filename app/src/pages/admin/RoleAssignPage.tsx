import { useState, useMemo } from 'react'
import { useMembers, useUpdateMember } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap } from '@/hooks/useScores'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import { useToast } from '@/components/ui/Toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Save, Wand2, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface RoleChange {
  id: string
  name: string
  from: string
  to: string
  score: number
  checked: boolean
}

export default function RoleAssignPage() {
  const { data: members = [] } = useMembers()
  const { data: config } = useSiteConfig()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()
  const toast = useToast((s) => s.show)
  const updateMember = useUpdateMember()
  const qc = useQueryClient()

  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const suroHeaders = useMemo(() => periods.map((p) => p.period_label).sort(), [periods])

  const [selectedGuild, setSelectedGuild] = useState('뚠카롱')
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [autoChanges, setAutoChanges] = useState<RoleChange[] | null>(null)
  const [executing, setExecuting] = useState(false)

  const guildMembers = useMemo(
    () =>
      members
        .filter((m) => m.guild === selectedGuild)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members, selectedGuild]
  )

  const guilds = config?.guilds.map((g) => g.name) || ['뚠카롱']
  const ranks = config?.ranks || ['마스터', '부마스터', '길드원']
  const changedCount = Object.keys(changes).length

  /* ─── Manual save ─── */
  const logOperation = useMutation({
    mutationFn: async (rows: { date: string; category: string; name: string; content: string }[]) => {
      if (rows.length === 0) return
      const { error } = await supabase.from('operation_history').insert(rows)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operation-history'] }),
  })

  const handleSave = async () => {
    if (changedCount === 0) return
    setSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const logRows: { date: string; category: string; name: string; content: string }[] = []
      for (const [id, role] of Object.entries(changes)) {
        const member = members.find((m) => m.id === id)
        const oldRole = member?.role || '?'
        await updateMember.mutateAsync({ id, data: { role } })
        logRows.push({
          date: today,
          category: '직위반영',
          name: member?.name || id,
          content: `${oldRole} -> ${role}`,
        })
      }
      await logOperation.mutateAsync(logRows)
      toast(`${changedCount}명 직위 반영 완료!`, 'success')
      setChanges({})
    } catch {
      toast('저장 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Auto role assignment ─── */
  const handleAutoAssign = () => {
    const excludeRoles = selectedGuild === '뚠카롱'
      ? ['마카롱', '다쿠아즈']
      : ['마카롱', '다쿠아즈', '아인슈페너', '부팬케이크', '부케이크', '수플레', '반죽(휴면)']

    const targets = members.filter(
      (m) => m.guild === selectedGuild && !excludeRoles.includes(m.role) && m.isMain !== false
    )

    if (targets.length === 0) {
      toast('부여 대상이 없습니다.', 'error')
      return
    }

    const latestHeader = suroHeaders.length > 0 ? suroHeaders[suroHeaders.length - 1] : null
    if (!latestHeader) {
      toast('수로 데이터가 없습니다.', 'error')
      return
    }

    const scored = targets
      .map((m) => ({
        ...m,
        latestScore: Math.round(Number(scoreMap[m.id]?.[latestHeader] ?? 0)),
      }))
      .sort((a, b) => b.latestScore - a.latestScore)

    const mainOnly = scored.filter((m) => m.isMain !== false)
    const mainRankMap = new Map<string, number>()
    mainOnly.forEach((m, idx) => mainRankMap.set(m.name, idx))

    // Get rules from config or use defaults
    const rawConfig = (config as any) || {}
    const autoRankRules = (rawConfig as any).autoRankRules?.[selectedGuild] || [
      { min: 130000, rank: '파르페' },
      { min: 95000, rank: '티라미슈' },
      { min: 72000, rank: '크로칸슈' },
      { min: 50000, rank: '롤케이크' },
      { min: 38000, rank: '팬케이크' },
      { min: 0, rank: '스콘' },
    ]

    const topNRules = autoRankRules
      .filter((r: any) => r.topN > 0)
      .sort((a: any, b: any) => a.topN - b.topN)
    const bottomNRules = autoRankRules.filter((r: any) => r.bottomN > 0)
    const scoreRules = autoRankRules
      .filter((r: any) => !r.topN && !r.bottomN)
      .sort((a: any, b: any) => b.min - a.min)
    const totalMain = mainOnly.length

    const getRoleForMember = (m: (typeof scored)[0]) => {
      const score = m.latestScore
      if (m.isMain !== false) {
        const idx = mainRankMap.get(m.name)
        if (idx !== undefined) {
          for (const r of bottomNRules) {
            if (idx >= totalMain - (r.bottomN || 0)) return r.rank
          }
          let cumTop = 0
          for (const r of topNRules) {
            cumTop += r.topN || 0
            if (idx < cumTop && score > 0) return r.rank
          }
        }
      }
      for (const r of scoreRules) {
        if (score >= (r.min || 0)) return r.rank
      }
      return scoreRules.length > 0 ? scoreRules[scoreRules.length - 1].rank : '스콘'
    }

    const result: RoleChange[] = []
    scored.forEach((m) => {
      const newRole = getRoleForMember(m)
      if (m.role !== newRole) {
        result.push({
          id: m.id,
          name: m.name,
          from: m.role,
          to: newRole,
          score: m.latestScore,
          checked: true,
        })
      }
    })

    if (result.length === 0) {
      toast('변경할 직위가 없습니다. 모두 이미 올바른 직위입니다.', 'info')
      return
    }

    setAutoChanges(result)
  }

  /* ─── Execute auto changes ─── */
  const handleExecuteAutoChanges = async () => {
    if (!autoChanges) return
    const checked = autoChanges.filter((c) => c.checked)
    if (checked.length === 0) {
      toast('선택된 변경이 없습니다.', 'info')
      return
    }
    setExecuting(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const logRows: { date: string; category: string; name: string; content: string }[] = []
      for (const c of checked) {
        await updateMember.mutateAsync({ id: c.id, data: { role: c.to } })
        logRows.push({
          date: today,
          category: '직위반영',
          name: c.name,
          content: `${c.from} -> ${c.to} (자동)`,
        })
      }
      await logOperation.mutateAsync(logRows)
      toast(`${checked.length}명 직위 변경 완료!`, 'success')
      setAutoChanges(null)
    } catch {
      toast('실행 실패', 'error')
    } finally {
      setExecuting(false)
    }
  }

  const latestHeader = suroHeaders.length > 0 ? suroHeaders[suroHeaders.length - 1] : null

  const roleColors: Record<string, string> = {
    '크라운': 'text-amber-500',
    '파르페': 'text-pink-500',
    '티라미슈': 'text-orange-500',
    '크로칸슈': 'text-yellow-600',
    '롤케이크': 'text-rose-400',
    '팬케이크': 'text-amber-400',
    '스콘': 'text-gray-500',
    '와플': 'text-purple-400',
  }

  return (
    <div className="fade-in space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-black text-gray-800">직위 반영</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAutoAssign}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow"
          >
            <Wand2 size={14} />
            {selectedGuild} 직위 자동 산정
          </button>
          <button
            onClick={handleSave}
            disabled={saving || changedCount === 0}
            className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save size={14} />
            {saving ? '저장 중...' : `반영 (${changedCount}명)`}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-bold text-amber-700">
        관리자 전용 -- 수로 점수 기반 직위 자동 반영. 직위 산정 후 드롭다운으로 수동 수정 가능.
      </div>

      {/* Guild tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex gap-1">
        {guilds.map((g) => (
          <button
            key={g}
            onClick={() => {
              setSelectedGuild(g)
              setChanges({})
            }}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
              selectedGuild === g
                ? 'bg-indigo-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {g.replace('카롱', '')}
          </button>
        ))}
      </div>

      {/* Manual role table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs stick-head">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-bold text-[10px]">
                <th className="px-3 py-2 text-left">닉네임</th>
                <th className="px-3 py-2 text-left">현재 직위</th>
                <th className="px-3 py-2 text-left w-40">변경</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {guildMembers.map((m) => {
                const changed = changes[m.id]
                return (
                  <tr
                    key={m.id}
                    className={cn(changed ? 'bg-amber-50/50' : 'hover:bg-gray-50/50')}
                  >
                    <td className="px-3 py-2 font-bold text-gray-800">{m.name}</td>
                    <td className="px-3 py-2 text-gray-600">{m.role}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={changed ?? m.role}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === m.role) {
                            setChanges((p) => {
                              const n = { ...p }
                              delete n[m.id]
                              return n
                            })
                          } else {
                            setChanges((p) => ({ ...p, [m.id]: val }))
                          }
                        }}
                        className={cn(
                          'px-2 py-1.5 border rounded-lg text-xs font-bold outline-none',
                          changed
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-gray-100 bg-gray-50'
                        )}
                      >
                        {ranks.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto role assignment modal */}
      {autoChanges && (
        <div
          className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setAutoChanges(null) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 bg-amber-50 border-b border-amber-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-amber-700 flex items-center gap-2">
                  <Wand2 size={16} /> 직위 자동 부여
                </h3>
                <p className="text-[10px] text-amber-500 mt-1">
                  기준: {latestHeader} -- 변경 대상{' '}
                  <span className="font-black">{autoChanges.filter((c) => c.checked).length}명</span>
                </p>
              </div>
              <button
                onClick={() => setAutoChanges(null)}
                className="w-8 h-8 rounded-full bg-amber-100 hover:bg-amber-200 flex items-center justify-center text-amber-500"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100">
                    <th className="py-2 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={autoChanges.every((c) => c.checked)}
                        onChange={(e) =>
                          setAutoChanges((prev) =>
                            prev!.map((c) => ({ ...c, checked: e.target.checked }))
                          )
                        }
                        className="w-4 h-4 rounded cursor-pointer accent-amber-500"
                      />
                    </th>
                    <th className="py-2 px-2 text-left">닉네임</th>
                    <th className="py-2 px-2 text-left">현재</th>
                    <th className="py-2 px-1"></th>
                    <th className="py-2 px-2 text-left">변경</th>
                    <th className="py-2 px-2 text-right">점수</th>
                  </tr>
                </thead>
                <tbody>
                  {autoChanges.map((c, i) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={c.checked}
                          onChange={(e) =>
                            setAutoChanges((prev) =>
                              prev!.map((item, j) =>
                                j === i ? { ...item, checked: e.target.checked } : item
                              )
                            )
                          }
                          className="w-4 h-4 rounded cursor-pointer accent-amber-500"
                        />
                      </td>
                      <td className="py-2 px-2 text-xs font-bold text-gray-800">{c.name}</td>
                      <td className={cn('py-2 px-2 text-xs font-bold', roleColors[c.from] || 'text-gray-500')}>
                        {c.from}
                      </td>
                      <td className="py-2 px-1 text-gray-300 text-xs">{'->'}</td>
                      <td className={cn('py-2 px-2 text-xs font-black', roleColors[c.to] || 'text-gray-500')}>
                        {c.to}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-400 text-right font-mono">
                        {c.score.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => setAutoChanges(null)}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleExecuteAutoChanges}
                disabled={executing || autoChanges.filter((c) => c.checked).length === 0}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all shadow-lg"
              >
                {executing ? '처리 중...' : `${autoChanges.filter((c) => c.checked).length}명 직위 변경`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
