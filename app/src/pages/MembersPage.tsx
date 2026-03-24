import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMembers, useAddMember, useUpdateMember, useDeleteMember } from '@/hooks/useMembers'
import { usePeriods, useScores, buildScoreMap, useUpsertScore } from '@/hooks/useScores'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { MemberTable, type BatchUpdate } from '@/components/members/MemberTable'
import { MemberFormModal } from '@/components/members/MemberFormModal'
import { Search, Plus, Filter, Edit3, Save, X, UserMinus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import type { Member, MemberFormData } from '@/types/member'

function getKSTDateStr() {
  const d = new Date()
  d.setHours(d.getHours() + 9)
  return d.toISOString().split('T')[0]
}

export default function MembersPage() {
  const { data: members = [], isLoading } = useMembers()
  const { data: periods = [] } = usePeriods()
  const { data: scores = [] } = useScores()
  const { data: config } = useSiteConfig()
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)

  const addMember = useAddMember()
  const updateMember = useUpdateMember()
  const deleteMember = useDeleteMember()
  const upsertScore = useUpsertScore()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [guildFilter, setGuildFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Batch edit mode
  const [batchMode, setBatchMode] = useState(false)
  const [batchUpdates, setBatchUpdates] = useState<Record<string, BatchUpdate>>({})

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleteType, setDeleteType] = useState<'leave' | 'kick'>('leave')
  const [deleteReason, setDeleteReason] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Score state
  const suroHeaders = useMemo(() => periods.map((p) => p.period_label).sort(), [periods])
  const scoreMap = useMemo(() => buildScoreMap(periods, scores), [periods, scores])
  const latestPeriod = suroHeaders.length > 0 ? suroHeaders[suroHeaders.length - 1] : null

  // Multi-term search: space-separated tokens matching name, mainCharName, role, class
  const filtered = useMemo(() => {
    let list = members
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/[\s,]+/).filter(t => t.length > 0)
      list = list.filter((m) => {
        const mainName = m.isMain ? m.name : (m.mainCharName || '')
        return tokens.some(token =>
          m.name.toLowerCase().includes(token) ||
          (m.class || '').toLowerCase().includes(token) ||
          (m.role || '').toLowerCase().includes(token) ||
          (m.mainCharName || '').toLowerCase().includes(token) ||
          mainName.toLowerCase().includes(token)
        )
      })
    }
    if (guildFilter !== 'all') list = list.filter((m) => m.guild === guildFilter)
    if (roleFilter !== 'all') list = list.filter((m) => m.role === roleFilter)

    list = [...list].sort((a, b) => {
      if (sortKey === 'score' && latestPeriod) {
        const av = scoreMap[a.id]?.[latestPeriod] ?? -1
        const bv = scoreMap[b.id]?.[latestPeriod] ?? -1
        return sortAsc ? av - bv : bv - av
      }
      if (sortKey === 'mainInfo') {
        const av = a.isMain ? a.name : (a.mainCharName || '')
        const bv = b.isMain ? b.name : (b.mainCharName || '')
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const av = a[sortKey as keyof Member]
      const bv = b[sortKey as keyof Member]
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return list
  }, [members, search, guildFilter, roleFilter, sortKey, sortAsc, scoreMap, latestPeriod])

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const handleAdd = async (data: MemberFormData) => {
    await addMember.mutateAsync(data)
    await supabase.from('operation_history').insert({
      date: getKSTDateStr(), category: '추가', name: data.name,
      content: `${data.guild} 길드에 추가됨`
    })
    toast('길드원이 추가되었습니다.', 'success')
    setShowAddModal(false)
  }

  const handleUpdate = async (data: MemberFormData) => {
    if (!editingMember) return
    await updateMember.mutateAsync({ id: editingMember.id, data })
    await supabase.from('operation_history').insert({
      date: getKSTDateStr(), category: '수정', name: data.name,
      content: `정보 수정됨 (${data.guild}/${data.role})`
    })
    toast('길드원 정보가 수정되었습니다.', 'success')
    setEditingMember(null)
  }

  // Open delete modal instead of confirm()
  const handleDeleteClick = (id: string) => {
    const member = members.find(m => m.id === id)
    if (!member) return
    setDeleteTarget(member)
    setDeleteType('leave')
    setDeleteReason('')
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await supabase.from('suro_scores').delete().eq('member_id', Number(deleteTarget.id))
      await deleteMember.mutateAsync(deleteTarget.id)
      if (deleteReason) {
        await supabase.from('operation_history').insert({
          date: getKSTDateStr(),
          category: deleteType === 'kick' ? '추방' : '자진탈퇴',
          name: deleteTarget.name,
          content: deleteReason
        })
      }
      toast(`${deleteTarget.name} 제거 완료.`, 'success')
    } catch {
      toast('제거 실패', 'error')
    }
    setShowDeleteModal(false)
    setDeleteTarget(null)
  }

  // Bulk kick (selected members)
  const handleBulkKick = () => {
    if (selected.size === 0) return
    setDeleteTarget(null)
    setDeleteType('kick')
    setDeleteReason('')
    setShowDeleteModal(true)
  }

  const handleConfirmBulkKick = async () => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const kickedNames = members.filter(m => ids.includes(m.id)).map(m => m.name)
    try {
      for (const id of ids) {
        await supabase.from('suro_scores').delete().eq('member_id', Number(id))
        await deleteMember.mutateAsync(id)
      }
      if (deleteReason) {
        const historyRows = kickedNames.map(name => ({
          date: getKSTDateStr(), category: '추방', name, content: deleteReason
        }))
        await supabase.from('operation_history').insert(historyRows)
      }
      toast(`${kickedNames.length}명 추방 완료.`, 'success')
      setSelected(new Set())
    } catch {
      toast('추방 처리 실패', 'error')
    }
    setShowDeleteModal(false)
  }

  const handleScoreChange = async (memberId: string, periodLabel: string, score: number) => {
    await upsertScore.mutateAsync({
      memberId: Number(memberId),
      periodLabel,
      score,
    })
  }

  // Batch edit handlers
  const handleBatchUpdate = useCallback((memberId: string, field: string, value: string) => {
    setBatchUpdates(prev => {
      const member = members.find(m => m.id === memberId)
      if (!member) return prev
      const orig = member[field as keyof Member]
      const next = { ...prev }
      if (!next[memberId]) next[memberId] = {}
      if (String(value) === String(orig || '')) {
        delete (next[memberId] as Record<string, string>)[field]
        if (Object.keys(next[memberId]).length === 0) delete next[memberId]
      } else {
        (next[memberId] as Record<string, string>)[field] = value
      }
      return next
    })
  }, [members])

  const handleSaveBatch = async () => {
    const entries = Object.entries(batchUpdates)
    if (entries.length === 0) return
    try {
      const names: string[] = []
      for (const [memberId, changes] of entries) {
        const dbChanges: Record<string, unknown> = {}
        if (changes.guild) dbChanges.guild = changes.guild
        if (changes.role) dbChanges.role = changes.role
        if (changes.class !== undefined) dbChanges.class = changes.class
        if (Object.keys(dbChanges).length > 0) {
          await supabase.from('members').update(dbChanges).eq('id', Number(memberId))
          const m = members.find(x => x.id === memberId)
          if (m) names.push(m.name)
        }
      }
      if (names.length > 0) {
        await supabase.from('operation_history').insert({
          date: getKSTDateStr(), category: '일괄수정', name: '관리자',
          content: `${names.length}명 정보 수정: ${names.join(', ').substring(0, 200)}`
        })
      }
      queryClient.invalidateQueries({ queryKey: ['members'] })
      toast(`${names.length}명 일괄 수정 완료`, 'success')
      setBatchUpdates({})
      setBatchMode(false)
    } catch {
      toast('일괄 수정 실패', 'error')
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((m) => m.id)))
  }

  const guilds = config?.guilds.map((g) => g.name) || []
  const roles = [...new Set(members.map((m) => m.role))].sort()

  if (isLoading) {
    return <div className="fade-in flex justify-center py-20 text-gray-400 font-bold text-sm">로딩 중...</div>
  }

  const batchEditCount = Object.keys(batchUpdates).length

  return (
    <div className="fade-in space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-800">길드원 관리</h2>
          <p className="text-xs text-gray-400 font-bold">
            {filtered.length}명 / 전체 {members.length}명
            {latestPeriod && ` \u00B7 수로 ${latestPeriod}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              {selected.size > 0 && !batchMode && (
                <button
                  onClick={handleBulkKick}
                  className="px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-all flex items-center gap-1.5"
                >
                  <UserMinus size={13} />
                  {selected.size}명 추방
                </button>
              )}
              {!batchMode ? (
                <button
                  onClick={() => { setBatchMode(true); setBatchUpdates({}) }}
                  className="px-3 py-2 bg-indigo-50 text-indigo-500 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1.5"
                >
                  <Edit3 size={13} />
                  일괄 수정
                </button>
              ) : (
                <>
                  {batchEditCount > 0 && (
                    <span className="text-[10px] text-orange-500 font-bold">{batchEditCount}건 수정됨</span>
                  )}
                  <button
                    onClick={handleSaveBatch}
                    disabled={batchEditCount === 0}
                    className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all disabled:opacity-40 flex items-center gap-1.5 animate-pulse"
                  >
                    <Save size={13} />
                    저장
                  </button>
                  <button
                    onClick={() => { setBatchMode(false); setBatchUpdates({}) }}
                    className="px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all flex items-center gap-1.5"
                  >
                    <X size={13} />
                    취소
                  </button>
                </>
              )}
              {!batchMode && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  추가
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Guild filter tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col gap-3">
        <div className="flex flex-wrap lg:flex-nowrap lg:overflow-x-auto w-full gap-1.5 lg:gap-2 shrink-0">
          <button
            onClick={() => setGuildFilter('all')}
            className={cn(
              'shrink-0 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-[10px] lg:text-xs font-bold transition-all flex items-center gap-1.5',
              guildFilter === 'all' ? 'bg-gray-800 text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            )}
          >
            전체
            <span className={cn(
              'inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-md text-[9px] font-black',
              guildFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200/60 text-gray-400'
            )}>{members.length}</span>
          </button>
          {guilds.map(g => {
            const gc = members.filter(m => m.guild === g).length
            const gColors: Record<string, string> = {
              '뚠카롱': 'bg-pink-500', '뚱카롱': 'bg-rose-600', '밤카롱': 'bg-indigo-500',
              '별카롱': 'bg-amber-500', '달카롱': 'bg-blue-500', '꿀카롱': 'bg-orange-500'
            }
            return (
              <button
                key={g}
                onClick={() => setGuildFilter(g === guildFilter ? 'all' : g)}
                className={cn(
                  'shrink-0 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-[10px] lg:text-xs font-bold transition-all flex items-center gap-1.5',
                  guildFilter === g ? `${gColors[g] || 'bg-pink-500'} text-white shadow-md` : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                )}
              >
                {g}
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-md text-[9px] font-black',
                  guildFilter === g ? 'bg-white/25 text-white' : 'bg-gray-200/60 text-gray-400'
                )}>{gc}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="닉네임 검색 (띄어쓰기로 다중검색)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300 transition-all"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none"
            >
              <option value="all">전체 직위</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <MemberTable
        members={filtered}
        scoreMap={scoreMap}
        latestPeriod={latestPeriod}
        sortKey={sortKey}
        sortAsc={sortAsc}
        onSort={handleSort}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onEdit={isAdmin ? setEditingMember : undefined}
        onDelete={isAdmin ? handleDeleteClick : undefined}
        onScoreChange={isAdmin ? handleScoreChange : undefined}
        batchMode={batchMode}
        batchUpdates={batchUpdates}
        onBatchUpdate={handleBatchUpdate}
        guilds={guilds}
        roles={config?.ranks || roles}
        allMembers={members}
        siteConfig={null}
      />

      {/* Add Modal */}
      {showAddModal && (
        <MemberFormModal
          title="길드원 추가"
          guilds={guilds}
          roles={config?.ranks || []}
          onSubmit={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Modal */}
      {editingMember && (
        <MemberFormModal
          title="길드원 수정"
          guilds={guilds}
          roles={config?.ranks || []}
          initial={editingMember}
          onSubmit={handleUpdate}
          onClose={() => setEditingMember(null)}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-sm">
                {deleteTarget ? `'${deleteTarget.name}'` : `'${selected.size}명'`} 삭제
              </h3>
            </div>

            <div className="p-5 space-y-4">
              {/* Leave / Kick radio */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteType('leave')}
                  className={cn(
                    'flex-1 py-3 rounded-xl font-bold text-xs transition-all',
                    deleteType === 'leave' ? 'bg-gray-800 text-white shadow-sm' : 'bg-gray-100 text-gray-400'
                  )}
                >
                  자진 탈퇴
                </button>
                <button
                  onClick={() => setDeleteType('kick')}
                  className={cn(
                    'flex-1 py-3 rounded-xl font-bold text-xs transition-all',
                    deleteType === 'kick' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'
                  )}
                >
                  추방
                </button>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">사유 (선택)</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="삭제 사유를 입력하세요..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none resize-none h-20 focus:border-indigo-300"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                취소
              </button>
              <button
                onClick={deleteTarget ? handleConfirmDelete : handleConfirmBulkKick}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-all shadow-lg"
              >
                {deleteTarget ? '삭제' : `${selected.size}명 추방`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
