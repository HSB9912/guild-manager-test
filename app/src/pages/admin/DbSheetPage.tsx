import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { Plus, Trash2, Save, Undo2 } from 'lucide-react'

const TABLES = [
  'members', 'suro_periods', 'suro_scores', 'bail_history', 'penalty_history',
  'operation_history', 'events', 'board_posts', 'buddy_teams',
  'promotion_applicants', 'promotion_history', 'site_config', 'guide_pages', 'member_records',
]

type CellEdit = { rowIdx: number; col: string; original: unknown; value: string }

export default function DbSheetPage() {
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()
  const [selectedTable, setSelectedTable] = useState('members')
  const [edits, setEdits] = useState<Map<string, CellEdit>>(new Map())
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [newRows, setNewRows] = useState<Record<string, unknown>[]>([])
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['db-sheet', selectedTable],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(selectedTable)
        .select('*')
        .order('id', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data || []) as Record<string, unknown>[]
    },
  })

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  // Reset edits when table changes
  useEffect(() => {
    setEdits(new Map())
    setEditingCell(null)
    setNewRows([])
    setDeletedIds(new Set())
  }, [selectedTable])

  // Focus input when editing cell changes
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const cellKey = (rowIdx: number, col: string) => `${rowIdx}:${col}`

  const getCellValue = (rowIdx: number, col: string): string => {
    const key = cellKey(rowIdx, col)
    const edit = edits.get(key)
    if (edit) return edit.value
    const raw = rows[rowIdx]?.[col]
    if (raw === null || raw === undefined) return ''
    if (typeof raw === 'object') return JSON.stringify(raw)
    return String(raw)
  }

  const startEdit = (rowIdx: number, col: string) => {
    if (col === 'id') return // don't edit ID column
    const key = cellKey(rowIdx, col)
    if (!edits.has(key)) {
      const raw = rows[rowIdx]?.[col]
      setEdits((prev) => {
        const next = new Map(prev)
        next.set(key, {
          rowIdx,
          col,
          original: raw,
          value: raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw),
        })
        return next
      })
    }
    setEditingCell(key)
  }

  const updateEdit = (key: string, value: string) => {
    setEdits((prev) => {
      const next = new Map(prev)
      const existing = next.get(key)
      if (existing) next.set(key, { ...existing, value })
      return next
    })
  }

  const finishEdit = (key: string) => {
    setEditingCell(null)
    // If value hasn't changed from original, remove the edit
    const edit = edits.get(key)
    if (edit) {
      const origStr = edit.original === null || edit.original === undefined
        ? ''
        : typeof edit.original === 'object'
          ? JSON.stringify(edit.original)
          : String(edit.original)
      if (edit.value === origStr) {
        setEdits((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }
    }
  }

  const handleAddRow = () => {
    if (columns.length === 0) return
    const newRow: Record<string, unknown> = {}
    columns.forEach((col) => {
      newRow[col] = col === 'id' ? undefined : ''
    })
    setNewRows((prev) => [...prev, newRow])
  }

  const handleDeleteRow = (rowIdx: number) => {
    const row = rows[rowIdx]
    const id = row?.id as number
    if (!id) return
    if (!confirm(`ID ${id} 행을 삭제하시겠습니까?`)) return
    setDeletedIds((prev) => new Set([...prev, id]))
  }

  const pendingChanges = edits.size + newRows.length + deletedIds.size

  const handleSaveAll = async () => {
    if (pendingChanges === 0) return
    try {
      // Process deletes
      for (const id of deletedIds) {
        const { error } = await supabase.from(selectedTable).delete().eq('id', id)
        if (error) throw error
      }

      // Process edits - group by row
      const rowEdits = new Map<number, Record<string, unknown>>()
      for (const [, edit] of edits) {
        if (!rowEdits.has(edit.rowIdx)) rowEdits.set(edit.rowIdx, {})
        const rowUpdate = rowEdits.get(edit.rowIdx)!
        // Try to parse JSON/numbers
        let val: unknown = edit.value
        if (edit.value === '') val = null
        else if (edit.value === 'true') val = true
        else if (edit.value === 'false') val = false
        else if (!isNaN(Number(edit.value)) && edit.value.trim() !== '') val = Number(edit.value)
        else {
          try { val = JSON.parse(edit.value) } catch { val = edit.value }
        }
        rowUpdate[edit.col] = val
      }

      for (const [rowIdx, update] of rowEdits) {
        const id = rows[rowIdx]?.id
        if (id === undefined) continue
        const { error } = await supabase.from(selectedTable).update(update).eq('id', id)
        if (error) throw error
      }

      // Process new rows
      for (const newRow of newRows) {
        const insert = { ...newRow }
        delete insert.id // let DB auto-generate
        // Clean up empty strings to null
        for (const [k, v] of Object.entries(insert)) {
          if (v === '') insert[k] = null
        }
        const { error } = await supabase.from(selectedTable).insert(insert)
        if (error) throw error
      }

      toast(`저장 완료! (수정 ${edits.size}, 추가 ${newRows.length}, 삭제 ${deletedIds.size})`, 'success')
      setEdits(new Map())
      setNewRows([])
      setDeletedIds(new Set())
      qc.invalidateQueries({ queryKey: ['db-sheet', selectedTable] })
    } catch (e: any) {
      toast(`저장 실패: ${e.message || ''}`, 'error')
    }
  }

  const handleDiscard = () => {
    if (pendingChanges === 0) return
    if (!confirm('모든 변경사항을 취소하시겠습니까?')) return
    setEdits(new Map())
    setNewRows([])
    setDeletedIds(new Set())
    setEditingCell(null)
  }

  const visibleRows = rows.filter((r) => !deletedIds.has(r.id as number))

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-800">DB 시트</h2>
        <div className="flex items-center gap-2">
          {pendingChanges > 0 && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
              {pendingChanges}건 변경 대기
            </span>
          )}
          <button
            onClick={handleAddRow}
            className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-600 flex items-center gap-1"
          >
            <Plus size={12} /> 행 추가
          </button>
          <button
            onClick={handleDiscard}
            disabled={pendingChanges === 0}
            className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-xl text-[10px] font-bold hover:bg-gray-300 disabled:opacity-50 flex items-center gap-1"
          >
            <Undo2 size={12} /> 취소
          </button>
          <button
            onClick={handleSaveAll}
            disabled={pendingChanges === 0}
            className="px-3 py-1.5 bg-indigo-500 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1"
          >
            <Save size={12} /> 저장
          </button>
        </div>
      </div>

      {/* Table selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-1">
        {TABLES.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedTable(t)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all',
              selectedTable === t
                ? 'bg-indigo-500 text-white shadow'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Info */}
      <p className="text-[10px] text-gray-400 font-bold">
        {selectedTable} -- {visibleRows.length}행 -- {columns.length}열
        {edits.size > 0 && <span className="text-amber-500 ml-2">수정: {edits.size}셀</span>}
        {newRows.length > 0 && <span className="text-emerald-500 ml-2">추가: {newRows.length}행</span>}
        {deletedIds.size > 0 && <span className="text-red-500 ml-2">삭제: {deletedIds.size}행</span>}
      </p>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-[10px] stick-head whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-bold">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-2 py-2 text-left border-r border-gray-100 last:border-r-0"
                  >
                    {col}
                  </th>
                ))}
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={(columns.length || 1) + 1} className="p-8 text-center text-gray-400 font-bold">
                    로딩 중...
                  </td>
                </tr>
              ) : visibleRows.length === 0 && newRows.length === 0 ? (
                <tr>
                  <td colSpan={(columns.length || 1) + 1} className="p-8 text-center text-gray-300 font-bold">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                <>
                  {visibleRows.map((row) => {
                    // Find original index in rows array
                    const origIdx = rows.indexOf(row)
                    return (
                      <tr key={`r-${origIdx}`} className="hover:bg-gray-50/50">
                        {columns.map((col) => {
                          const key = cellKey(origIdx, col)
                          const isEditing = editingCell === key
                          const hasEdit = edits.has(key)
                          return (
                            <td
                              key={col}
                              className={cn(
                                'px-2 py-1.5 border-r border-gray-50 last:border-r-0 max-w-[200px] cursor-pointer',
                                hasEdit ? 'bg-amber-50' : '',
                                col === 'id' ? 'text-gray-400 cursor-default' : ''
                              )}
                              onClick={() => startEdit(origIdx, col)}
                            >
                              {isEditing ? (
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={getCellValue(origIdx, col)}
                                  onChange={(e) => updateEdit(key, e.target.value)}
                                  onBlur={() => finishEdit(key)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') finishEdit(key)
                                    if (e.key === 'Escape') {
                                      // Revert this edit
                                      setEdits((prev) => {
                                        const next = new Map(prev)
                                        next.delete(key)
                                        return next
                                      })
                                      setEditingCell(null)
                                    }
                                  }}
                                  className="w-full px-1 py-0.5 border border-indigo-300 rounded text-[10px] outline-none bg-white"
                                />
                              ) : (
                                <span className={cn('truncate block', hasEdit ? 'text-amber-700 font-bold' : 'text-gray-700')}>
                                  {row[col] === null ? (
                                    <span className="text-gray-300 italic">null</span>
                                  ) : typeof row[col] === 'object' ? (
                                    JSON.stringify(row[col]).slice(0, 60)
                                  ) : (
                                    String(row[col])
                                  )}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-1 py-1.5">
                          <button
                            onClick={() => handleDeleteRow(origIdx)}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {/* New rows */}
                  {newRows.map((newRow, ni) => (
                    <tr key={`new-${ni}`} className="bg-emerald-50/50">
                      {columns.map((col) => (
                        <td key={col} className="px-2 py-1.5 border-r border-gray-50 last:border-r-0">
                          {col === 'id' ? (
                            <span className="text-gray-300 italic text-[9px]">auto</span>
                          ) : (
                            <input
                              type="text"
                              value={String(newRow[col] ?? '')}
                              onChange={(e) => {
                                setNewRows((prev) => {
                                  const next = [...prev]
                                  next[ni] = { ...next[ni], [col]: e.target.value }
                                  return next
                                })
                              }}
                              className="w-full px-1 py-0.5 border border-emerald-200 rounded text-[10px] outline-none bg-white focus:border-emerald-400"
                              placeholder={col}
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-1 py-1.5">
                        <button
                          onClick={() => setNewRows((prev) => prev.filter((_, i) => i !== ni))}
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                        >
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
