import { useState, useMemo } from 'react'
import { useMembers } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap, useUpsertScore } from '@/hooks/useScores'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import { useToast } from '@/components/ui/Toast'
import { Save, Camera, ClipboardPaste, Eraser, X } from 'lucide-react'
import { OcrModal } from '@/components/ocr/OcrModal'
import type { OcrRecord } from '@/lib/ocr'

export default function SuroInputPage() {
  const { data: members = [] } = useMembers()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()
  const { data: config } = useSiteConfig()
  const toast = useToast((s) => s.show)
  const upsertScore = useUpsertScore()

  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const suroHeaders = useMemo(() => periods.map((p) => p.period_label).sort(), [periods])

  const [selectedGuild, setSelectedGuild] = useState('뚠카롱')
  const [periodLabel, setPeriodLabel] = useState(suroHeaders[suroHeaders.length - 1] || '')
  const [localScores, setLocalScores] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteInitialText, setPasteInitialText] = useState('')

  const guildMembers = useMemo(
    () =>
      members
        .filter((m) => m.guild === selectedGuild)
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    [members, selectedGuild]
  )

  const getDbScore = (memberId: string) => {
    return scoreMap[memberId]?.[periodLabel] ?? null
  }

  const getScore = (memberId: string) => {
    if (localScores[memberId] !== undefined) return localScores[memberId]
    return String(scoreMap[memberId]?.[periodLabel] ?? '')
  }

  /* detect missing weeks between last DB week and current week */
  const missingWeeks = useMemo(() => {
    if (suroHeaders.length === 0) return []
    // Simple heuristic: check if periodLabel is the latest and if there are gaps
    // We just detect if there's a week newer than the last DB week
    const lastDbWeek = suroHeaders[suroHeaders.length - 1]
    if (!lastDbWeek) return []
    // Parse week date patterns like "25-03-20(목) ~ 25-03-27(목)"
    const match = lastDbWeek.match(/(\d{2})-(\d{2})-(\d{2})/)
    if (!match) return []
    const lastDate = new Date(2000 + parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
    const now = new Date()
    const weeks: string[] = []
    let d = new Date(lastDate)
    d.setDate(d.getDate() + 7)
    while (d < now) {
      const end = new Date(d)
      end.setDate(end.getDate() + 6)
      const dayNames = ['일', '월', '화', '수', '목', '금', '토']
      const fmt = (dt: Date) =>
        `${String(dt.getFullYear()).slice(2)}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}(${dayNames[dt.getDay()]})`
      weeks.push(`${fmt(d)} ~ ${fmt(end)}`)
      d = new Date(d)
      d.setDate(d.getDate() + 7)
    }
    return weeks
  }, [suroHeaders])

  const handleSaveAll = async () => {
    const entries = Object.entries(localScores).filter(([, v]) => v !== '')
    if (entries.length === 0) {
      toast('변경된 점수가 없습니다.', 'info')
      return
    }
    setSaving(true)
    try {
      for (const [memberId, val] of entries) {
        await upsertScore.mutateAsync({
          memberId: Number(memberId),
          periodLabel,
          score: Number(val) || 0,
        })
      }
      toast(`${entries.length}명 점수 저장 완료!`, 'success')
      setLocalScores({})
    } catch (e) {
      toast('저장 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  const guilds = config?.guilds.map((g) => g.name) || ['뚠카롱', '뚱카롱']

  const handleOcrResults = (records: OcrRecord[]) => {
    if (records.length === 0) {
      toast('인식된 결과가 없습니다.', 'error')
      return
    }
    // Convert OCR results to paste-format text and open paste modal
    const text = records.map((r) => `${r.name}\t${r.culv}`).join('\n')
    setPasteInitialText(text)
    setShowOcr(false)
    setShowPaste(true)
    toast(`OCR: ${records.length}명 인식 → 붙여넣기 모달에서 확인/수정하세요`, 'success')
  }

  const handleClearAll = () => {
    if (Object.keys(localScores).length === 0) return
    if (confirm('모든 입력값을 초기화하시겠습니까?')) {
      setLocalScores({})
      toast('입력값 초기화 완료', 'info')
    }
  }

  const changedCount = Object.keys(localScores).length

  return (
    <div className="fade-in space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-black text-gray-800">수로 입력</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowOcr(true)}
            className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 flex items-center gap-1.5"
          >
            <Camera size={14} />
            화면 캡처 OCR
          </button>
          <button
            onClick={() => setShowPaste(true)}
            className="px-4 py-2 bg-violet-500 text-white rounded-xl text-xs font-bold hover:bg-violet-600 flex items-center gap-1.5"
          >
            <ClipboardPaste size={14} />
            붙여넣기
          </button>
          <button
            onClick={handleClearAll}
            disabled={changedCount === 0}
            className="px-4 py-2 bg-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-300 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Eraser size={14} />
            초기화
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving || changedCount === 0}
            className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save size={14} />
            {saving ? '저장 중...' : `저장 (${changedCount}명)`}
          </button>
        </div>
      </div>

      {/* Missing weeks alert */}
      {missingWeeks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-bold text-amber-700">
          <span className="mr-2">미입력 주차 감지:</span>
          {missingWeeks.map((w) => (
            <button
              key={w}
              onClick={() => setPeriodLabel(w)}
              className="inline-block px-2 py-0.5 bg-amber-200 text-amber-800 rounded-lg text-[10px] mr-1 mb-1 hover:bg-amber-300"
            >
              {w}
            </button>
          ))}
        </div>
      )}

      {/* OCR Modal */}
      {showOcr && <OcrModal onApply={handleOcrResults} onClose={() => setShowOcr(false)} />}

      {/* Paste Modal */}
      {showPaste && (
        <PasteModal
          members={members}
          guildMembers={guildMembers}
          periodLabel={periodLabel}
          suroHeaders={suroHeaders}
          initialText={pasteInitialText}
          onApply={(parsed, period) => {
            setPeriodLabel(period)
            const newScores: Record<string, string> = { ...localScores }
            for (const p of parsed) {
              if (p.member) newScores[p.member.id] = String(p.score)
            }
            setLocalScores(newScores)
            toast(`${parsed.filter((p) => p.member).length}명 점수 반영`, 'success')
          }}
          onClose={() => { setShowPaste(false); setPasteInitialText('') }}
        />
      )}

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {guilds.map((g) => (
            <button
              key={g}
              onClick={() => {
                setSelectedGuild(g)
                setLocalScores({})
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
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-gray-500">주차:</label>
          <select
            value={periodLabel}
            onChange={(e) => {
              setPeriodLabel(e.target.value)
              setLocalScores({})
            }}
            className="px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-bold outline-none"
          >
            {suroHeaders.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="새 주차 라벨 (예: 25-03-20(목) ~ 25-03-27(목))"
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-bold outline-none focus:border-indigo-300"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = (e.target as HTMLInputElement).value.trim()
              if (val) {
                setPeriodLabel(val)
                ;(e.target as HTMLInputElement).value = ''
              }
            }
          }}
        />
      </div>

      {/* Input table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs stick-head">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-bold text-[10px]">
                <th className="px-3 py-2 w-8">#</th>
                <th className="px-3 py-2 text-left">닉네임</th>
                <th className="px-3 py-2 text-left">직업</th>
                <th className="px-3 py-2 text-center w-24">DB 점수</th>
                <th className="px-3 py-2 text-center w-32">입력</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {guildMembers.map((m, i) => {
                const val = getScore(m.id)
                const dbScore = getDbScore(m.id)
                const isChanged = localScores[m.id] !== undefined
                return (
                  <tr
                    key={m.id}
                    className={isChanged ? 'bg-amber-50/50' : 'hover:bg-gray-50/50'}
                  >
                    <td className="px-3 py-2 text-gray-300 font-bold text-center">{i + 1}</td>
                    <td className="px-3 py-2 font-bold text-gray-800">{m.name}</td>
                    <td className="px-3 py-2 text-gray-500">{m.class || '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-400 text-[10px] font-mono">
                      {dbScore !== null ? Number(dbScore).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="number"
                        value={val}
                        onChange={(e) =>
                          setLocalScores((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        className="w-24 px-2 py-1.5 text-center bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-indigo-300"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══ Paste Modal ═══ */
interface ParsedEntry {
  name: string
  score: number
  member: { id: string; name: string } | null
  originalLine: string
}

function PasteModal({
  members,
  guildMembers: _guildMembers,
  periodLabel,
  suroHeaders,
  initialText,
  onApply,
  onClose,
}: {
  members: { id: string; name: string }[]
  guildMembers: { id: string; name: string }[]
  periodLabel: string
  suroHeaders: string[]
  initialText?: string
  onApply: (parsed: ParsedEntry[], period: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText || '')
  const [period, setPeriod] = useState(periodLabel)
  const [parsed, setParsed] = useState<ParsedEntry[] | null>(null)
  const [skipped, setSkipped] = useState<{ line: number; text: string; reason: string }[]>([])

  // Levenshtein distance for fuzzy matching
  const levenshtein = (a: string, b: string): number => {
    const m = a.length, n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]
  }

  const findSimilarMember = (name: string) => {
    const lower = name.toLowerCase()
    let best: { id: string; name: string; dist: number } | null = null
    for (const m of members) {
      const ml = m.name.toLowerCase()
      // Exact substring match
      if (ml.includes(lower) || lower.includes(ml)) return { ...m, dist: 0 }
      const dist = levenshtein(lower, ml)
      const maxLen = Math.max(lower.length, ml.length)
      // Allow up to 30% difference
      if (dist <= Math.ceil(maxLen * 0.3) && (!best || dist < best.dist)) {
        best = { id: m.id, name: m.name, dist }
      }
    }
    return best
  }

  // Track manual overrides for unmatched entries
  const [manualMatches, setManualMatches] = useState<Record<number, string>>({})

  const handleParse = () => {
    if (!text.trim()) return
    const lines = text.split('\n').filter((l) => l.trim())
    const results: ParsedEntry[] = []
    const skip: typeof skipped = []

    lines.forEach((line, i) => {
      let parts = line.split(/\t+/)
      if (parts.length < 2) {
        const spaceMatch = line.match(/^(.+?)\s+([\d,]+)\s*$/)
        if (spaceMatch) {
          parts = [spaceMatch[1], spaceMatch[2]]
        } else {
          skip.push({ line: i + 1, text: line, reason: '형식 오류' })
          return
        }
      }
      const name = parts[0].replace(/\([^)]*\)/g, '').trim()
      const scoreStr = parts[1].replace(/,/g, '').trim()
      const score = parseInt(scoreStr)

      if (!name) { skip.push({ line: i + 1, text: line, reason: '닉네임 없음' }); return }
      if (isNaN(score)) { skip.push({ line: i + 1, text: line, reason: '점수 오류' }); return }

      const member = members.find((m) => m.name === name)
      results.push({ name, score, member: member ? { id: member.id, name: member.name } : null, originalLine: line })
    })

    setParsed(results)
    setSkipped(skip)
    setManualMatches({})
  }

  const matched = parsed?.filter((p) => p.member) || []
  const unmatched = parsed?.filter((p) => !p.member) || []

  // Build suggestions for unmatched entries
  const suggestions = useMemo(() => {
    const map: Record<number, { id: string; name: string; dist: number } | null> = {}
    unmatched.forEach((p, i) => {
      map[i] = findSimilarMember(p.name)
    })
    return map
  }, [unmatched, members])

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 max-h-[90vh] flex flex-col">
        <div className="p-5 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-base font-bold text-indigo-700">수로 점수 붙여넣기</h3>
            <p className="text-[10px] text-indigo-400 mt-1">
              닉네임(탭)점수 형식의 데이터를 붙여넣으세요. 괄호 안 내용은 무시됩니다.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-indigo-100 rounded-full">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
              저장할 주차
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs font-bold outline-none"
            >
              {suroHeaders.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
              데이터 붙여넣기
            </label>
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs font-mono outline-none resize-none focus:ring-2 focus:ring-indigo-100"
              placeholder={`닉네임\t점수\n예: 도규\t253438\nSumireUesaka\t168137`}
            />
          </div>
          <button
            onClick={handleParse}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-bold text-xs hover:bg-indigo-600 transition-all shadow-lg"
          >
            데이터 분석
          </button>

          {/* Preview */}
          {parsed && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 font-bold">
                  ✓ 매칭 {matched.length}명
                </span>
                <span className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 font-bold">
                  ? 미매칭 {unmatched.length}명
                </span>
                {skipped.length > 0 && (
                  <span className="px-3 py-1.5 bg-gray-50 text-gray-400 rounded-lg border border-gray-100 font-bold">
                    건너뜀 {skipped.length}건
                  </span>
                )}
              </div>

              {/* Matched section */}
              {matched.length > 0 && (
                <div className="border border-emerald-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 text-xs font-bold text-emerald-700 flex items-center gap-1">
                    ✓ 매칭 완료 ({matched.length}명)
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-50">
                        {matched.map((p, i) => (
                          <tr key={i} className="hover:bg-emerald-50/30">
                            <td className="px-3 py-1.5 font-bold text-gray-800">{p.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-600">
                              {p.score.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unmatched section with fuzzy suggestions */}
              {unmatched.length > 0 && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-amber-50 text-xs font-bold text-amber-700 flex items-center gap-1">
                    ⚠ 미매칭 — 닉네임 추정 ({unmatched.length}명)
                  </div>
                  <div className="divide-y divide-gray-50">
                    {unmatched.map((p, ui) => {
                      const suggestion = suggestions[ui]
                      const manualId = manualMatches[ui]
                      return (
                        <div key={ui} className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-red-500 text-xs line-through">{p.name}</span>
                              <span className="font-mono font-bold text-gray-600 text-xs">{p.score.toLocaleString()}</span>
                            </div>
                            {suggestion && !manualId && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[10px] text-amber-500 font-bold">추정:</span>
                                <button
                                  onClick={() => setManualMatches((prev) => ({ ...prev, [ui]: suggestion.id }))}
                                  className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg hover:bg-indigo-100 transition-colors"
                                >
                                  {suggestion.name} (유사도 {Math.round((1 - suggestion.dist / Math.max(p.name.length, suggestion.name.length)) * 100)}%)
                                </button>
                              </div>
                            )}
                            {manualId && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[10px] text-emerald-500 font-bold">→ {members.find((m) => m.id === manualId)?.name}</span>
                                <button
                                  onClick={() => setManualMatches((prev) => { const n = { ...prev }; delete n[ui]; return n })}
                                  className="text-[10px] text-red-400 hover:text-red-600"
                                >✕ 취소</button>
                              </div>
                            )}
                          </div>
                          {/* Manual select dropdown */}
                          {!manualId && (
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) setManualMatches((prev) => ({ ...prev, [ui]: e.target.value }))
                              }}
                              className="text-[10px] bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none w-32"
                            >
                              <option value="">직접 선택</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {skipped.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 text-[10px] text-gray-400 font-bold">
                  건너뜀: {skipped.map((s) => `${s.text} (${s.reason})`).join(', ')}
                </div>
              )}

              <button
                onClick={() => {
                  // Combine matched + manually matched unmatched entries
                  const finalResults = [...matched]
                  unmatched.forEach((p, ui) => {
                    const mid = manualMatches[ui]
                    if (mid) {
                      const m = members.find((x) => x.id === mid)
                      if (m) finalResults.push({ ...p, member: { id: m.id, name: m.name } })
                    }
                  })
                  onApply(finalResults, period)
                  onClose()
                }}
                disabled={matched.length === 0 && Object.keys(manualMatches).length === 0}
                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-lg"
              >
                {matched.length + Object.keys(manualMatches).length}명 점수 반영
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
