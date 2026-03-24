import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { r2Upload, R2_PUBLIC_URL } from '@/lib/r2'
import { Plus, Trash2, CheckCircle, XCircle, Clock, ArrowLeft, Camera, RotateCcw, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSiteConfig } from '@/hooks/useSiteConfig'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BuddyTeam {
  id: number
  team_name: string | null
  mentor_name: string
  mentee_name: string
  status: string
  reward_choice: string | null
  goal: string | null
  start_date: string | null
  created_at: string
}

interface BuddyMission {
  id: number
  team_id: number
  week_number: number
  mentor_score: number | null
  mentee_score: number | null
  mentor_clear: boolean
  mentee_clear: boolean
  admin_verified: boolean
  verified_by: string | null
  verified_at: string | null
  proof_images: string[]
}

interface BuddyRoulette {
  id: number
  team_id: number
  result_item: string
  result_value: string
}

// ─── Roulette items ───────────────────────────────────────────────────────────

const DEFAULT_ROULETTE_ITEMS = [
  { name: '다조 100개', prob: 23.8, value: '6.5억', color: '#94a3b8' },
  { name: '다조 160개', prob: 17.3, value: '11억', color: '#3b82f6' },
  { name: '다조 240개', prob: 13.7, value: '15.5억', color: '#10b981' },
  { name: '루컨마', prob: 11, value: '18.5억', color: '#f59e0b' },
  { name: '다조 330개', prob: 9, value: '20억', color: '#8b5cf6' },
  { name: '생명의 연마석', prob: 8, value: '26억', color: '#ec4899' },
  { name: '커포링', prob: 6.7, value: '30억', color: '#ef4444' },
  { name: '마깃안', prob: 5.5, value: '31.8억', color: '#14b8a6' },
  { name: '거대한 공포', prob: 3, value: '43억', color: '#f97316' },
  { name: '신념의 연마석', prob: 1, value: '100억', color: '#dc2626' },
  { name: '다조 3000개', prob: 0.9, value: '186억', color: '#7c3aed' },
  { name: '언더컨', prob: 0.1, value: '200억', color: '#eab308' },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useBuddyTeams() {
  return useQuery({
    queryKey: ['buddy-teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buddy_teams')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as BuddyTeam[]
    },
  })
}

function useBuddyMissions(teamId: number | null) {
  return useQuery({
    queryKey: ['buddy-missions', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const { data, error } = await supabase
        .from('buddy_missions')
        .select('*')
        .eq('team_id', teamId)
        .order('week_number')
      if (error) throw error
      return (data || []) as BuddyMission[]
    },
    enabled: !!teamId,
  })
}

function useBuddyRoulette(teamId: number | null) {
  return useQuery({
    queryKey: ['buddy-roulette', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const { data, error } = await supabase
        .from('buddy_roulette')
        .select('*')
        .eq('team_id', teamId)
      if (error) throw error
      return (data || []) as BuddyRoulette[]
    },
    enabled: !!teamId,
  })
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; label: string; icon: typeof CheckCircle }> = {
  active: { bg: 'bg-green-100 text-green-600', label: '진행 중', icon: Clock },
  completed: { bg: 'bg-blue-100 text-blue-600', label: '완료', icon: CheckCircle },
  failed: { bg: 'bg-red-100 text-red-600', label: '실패', icon: XCircle },
  cancelled: { bg: 'bg-gray-100 text-gray-500', label: '취소', icon: XCircle },
}

const STATUS_BTN_ACTIVE: Record<string, string> = {
  active: 'bg-green-500 text-white',
  completed: 'bg-blue-500 text-white',
  failed: 'bg-red-500 text-white',
  cancelled: 'bg-gray-500 text-white',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BuddyPage() {
  const { data: teams = [], isLoading } = useBuddyTeams()
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ mentor: '', mentee: '', teamName: '', goal: '', reward: '' })
  const [detailTeamId, setDetailTeamId] = useState<number | null>(null)

  const activeTeams = teams.filter((t) => t.status === 'active')
  const doneTeams = teams.filter((t) => t.status !== 'active')

  const createTeam = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('buddy_teams').insert({
        team_name: form.teamName || null,
        mentor_name: form.mentor,
        mentee_name: form.mentee,
        status: 'active',
        goal: form.goal || null,
        reward_choice: form.reward || null,
        start_date: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-teams'] })
      toast('버디팀이 생성되었습니다!', 'success')
      setShowCreate(false)
      setForm({ mentor: '', mentee: '', teamName: '', goal: '', reward: '' })
    },
    onError: (e: Error) => toast('생성 실패: ' + e.message, 'error'),
  })

  const deleteTeam = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('buddy_teams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-teams'] })
      toast('삭제 완료', 'success')
      setDetailTeamId(null)
    },
  })

  // If we're showing detail view
  if (detailTeamId) {
    const team = teams.find((t) => t.id === detailTeamId)
    if (team) {
      return (
        <BuddyDetailView
          team={team}
          isAdmin={isAdmin}
          onBack={() => setDetailTeamId(null)}
          onDelete={() => {
            if (confirm('이 버디팀을 삭제하시겠습니까? 미션/룰렛 기록도 함께 삭제됩니다.')) {
              deleteTeam.mutate(team.id)
            }
          }}
        />
      )
    }
  }

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-800">뚠뚠 버디</h2>
          <p className="text-[10px] text-gray-400 font-bold">
            진행 {activeTeams.length}팀 · 완료 {doneTeams.length}팀
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 flex items-center gap-1.5"
          >
            <Plus size={14} /> 팀 생성
          </button>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h3 className="font-bold text-sm text-gray-800">새 버디팀</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">멘토</label>
              <input
                type="text"
                value={form.mentor}
                onChange={(e) => setForm((f) => ({ ...f, mentor: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-amber-300"
                placeholder="캐릭터명 입력"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">멘티</label>
              <input
                type="text"
                value={form.mentee}
                onChange={(e) => setForm((f) => ({ ...f, mentee: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-amber-300"
                placeholder="캐릭터명 입력"
              />
            </div>
          </div>
          <input
            type="text"
            placeholder="팀 이름 (선택)"
            value={form.teamName}
            onChange={(e) => setForm((f) => ({ ...f, teamName: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-amber-300"
          />
          <input
            type="text"
            placeholder="목표 (선택)"
            value={form.goal}
            onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-amber-300"
          />
          <div>
            <label className="text-[10px] font-bold text-gray-400 mb-1 block">보상 선택</label>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="buddyReward"
                  value="A"
                  checked={form.reward === 'A'}
                  onChange={() => setForm((f) => ({ ...f, reward: 'A' }))}
                  className="hidden peer"
                />
                <div className="peer-checked:bg-emerald-500 peer-checked:text-white bg-gray-100 text-gray-600 rounded-xl p-3 text-center text-xs font-bold transition-all">
                  A보상
                  <br />
                  <span className="text-[9px] opacity-80">솔 에르다 조각 확정</span>
                </div>
              </label>
              <label className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="buddyReward"
                  value="B"
                  checked={form.reward === 'B'}
                  onChange={() => setForm((f) => ({ ...f, reward: 'B' }))}
                  className="hidden peer"
                />
                <div className="peer-checked:bg-purple-500 peer-checked:text-white bg-gray-100 text-gray-600 rounded-xl p-3 text-center text-xs font-bold transition-all">
                  B보상
                  <br />
                  <span className="text-[9px] opacity-80">칠흑 가챠 룰렛</span>
                </div>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
            >
              취소
            </button>
            <button
              onClick={() => createTeam.mutate()}
              disabled={!form.mentor || !form.mentee}
              className="px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50"
            >
              생성
            </button>
          </div>
        </div>
      )}

      {/* Active teams */}
      {isLoading ? (
        <p className="text-center text-gray-400 text-xs font-bold py-8">로딩 중...</p>
      ) : activeTeams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-300 text-xs font-bold">
          진행 중인 버디팀이 없습니다
        </div>
      ) : (
        <div className="space-y-3">
          {activeTeams.map((t) => (
            <TeamCard key={t.id} team={t} onClick={() => setDetailTeamId(t.id)} />
          ))}
        </div>
      )}

      {/* Done teams */}
      {doneTeams.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
            완료된 버디팀
          </h4>
          <div className="space-y-2">
            {doneTeams.map((t) => (
              <TeamCard key={t.id} team={t} onClick={() => setDetailTeamId(t.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Team Card ────────────────────────────────────────────────────────────────

function TeamCard({ team, onClick }: { team: BuddyTeam; onClick: () => void }) {
  const s = STATUS_STYLE[team.status] || STATUS_STYLE.cancelled
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all',
        team.status === 'active' && 'border-amber-200'
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          'p-4 flex items-center gap-3',
          team.status === 'active' ? 'bg-gradient-to-r from-yellow-50 to-amber-50' : 'bg-gray-50'
        )}
      >
        <div className="text-2xl">🤝</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-gray-800">
              {team.team_name || `${team.mentor_name} × ${team.mentee_name}`}
            </span>
            <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded-full', s.bg)}>
              {s.label}
            </span>
            {team.reward_choice && (
              <span
                className={cn(
                  'text-[8px] font-bold px-1.5 py-0.5 rounded-full',
                  team.reward_choice === 'A'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-purple-100 text-purple-600'
                )}
              >
                {team.reward_choice}보상
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            <span className="font-bold text-amber-600">멘토</span> {team.mentor_name} ·{' '}
            <span className="font-bold text-blue-600">멘티</span> {team.mentee_name}
          </div>
          {team.goal && <p className="text-[9px] text-gray-400 mt-0.5">{team.goal}</p>}
        </div>
        <ChevronRight size={14} className="text-gray-300" />
      </div>
    </div>
  )
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function BuddyDetailView({
  team,
  isAdmin,
  onBack,
  onDelete,
}: {
  team: BuddyTeam
  isAdmin: boolean
  onBack: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast((s) => s.show)
  const { data: missions = [] } = useBuddyMissions(team.id)
  const { data: roulette = [] } = useBuddyRoulette(team.id)
  const { data: siteConfig } = useSiteConfig()

  const [missionModal, setMissionModal] = useState<number | null>(null)

  const allClear =
    missions.length === 4 && missions.every((m) => m.mentor_clear && m.mentee_clear && m.admin_verified)

  const rouletteItems = (siteConfig as any)?.rouletteItems || DEFAULT_ROULETTE_ITEMS

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from('buddy_teams').update({ status }).eq('id', team.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-teams'] })
    },
  })

  const updateReward = useMutation({
    mutationFn: async (reward: string) => {
      const { error } = await supabase
        .from('buddy_teams')
        .update({ reward_choice: reward })
        .eq('id', team.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-teams'] })
    },
  })

  const resetMission = useMutation({
    mutationFn: async (week: number) => {
      const { error } = await supabase
        .from('buddy_missions')
        .delete()
        .eq('team_id', team.id)
        .eq('week_number', week)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-missions', team.id] })
      toast('초기화 완료', 'success')
    },
  })

  const deleteImage = useMutation({
    mutationFn: async ({ week, imgUrl }: { week: number; imgUrl: string }) => {
      const mission = missions.find((m) => m.week_number === week)
      if (!mission) return
      const imgs = (mission.proof_images || []).filter((u) => u !== imgUrl)
      const { error } = await supabase
        .from('buddy_missions')
        .update({ proof_images: imgs })
        .eq('id', mission.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-missions', team.id] })
      toast('사진 삭제됨', 'success')
    },
  })

  const resetRoulette = useMutation({
    mutationFn: async () => {
      await supabase.from('buddy_roulette').delete().eq('team_id', team.id)
      await supabase.from('buddy_teams').update({ status: 'active' }).eq('id', team.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buddy-roulette', team.id] })
      qc.invalidateQueries({ queryKey: ['buddy-teams'] })
      toast('룰렛 결과 취소됨', 'success')
    },
  })

  const statusBtns = ['active', 'completed', 'failed', 'cancelled'] as const
  const statusLabels: Record<string, string> = {
    active: '진행 중',
    completed: '완료',
    failed: '실패',
    cancelled: '취소',
  }

  return (
    <div className="fade-in space-y-3 pb-20 lg:pb-0">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-[10px] text-gray-400 hover:text-indigo-500 font-bold flex items-center gap-1"
      >
        <ArrowLeft size={12} /> 목록
      </button>

      {/* Team header */}
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border border-yellow-200 p-4 lg:p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-3xl">🤝</span>
          <div className="flex-1">
            <h2 className="text-lg font-black text-gray-800">
              {team.team_name || `${team.mentor_name} × ${team.mentee_name}`}
            </h2>
            <p className="text-[10px] text-gray-500">
              <span className="font-bold text-amber-600">멘토</span> {team.mentor_name} ·{' '}
              <span className="font-bold text-blue-600">멘티</span> {team.mentee_name} ·{' '}
              {team.start_date || ''}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[9px] text-gray-400 font-bold">상태:</span>
            <div className="flex gap-1">
              {statusBtns.map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus.mutate(s)}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-[8px] font-bold transition-all',
                    team.status === s
                      ? STATUS_BTN_ACTIVE[s]
                      : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                  )}
                >
                  {statusLabels[s]}
                </button>
              ))}
            </div>
            <span className="text-gray-200 mx-1">|</span>
            <span className="text-[9px] text-gray-400 font-bold">보상:</span>
            <div className="flex gap-1">
              <button
                onClick={() => updateReward.mutate('A')}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[8px] font-bold transition-all',
                  team.reward_choice === 'A'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                )}
              >
                A 조각
              </button>
              <button
                onClick={() => updateReward.mutate('B')}
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[8px] font-bold transition-all',
                  team.reward_choice === 'B'
                    ? 'bg-purple-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                )}
              >
                B 룰렛
              </button>
            </div>
            <button
              onClick={onDelete}
              className="ml-auto text-[9px] text-red-400 hover:text-red-600 font-bold flex items-center gap-0.5"
            >
              <Trash2 size={10} /> 삭제
            </button>
          </div>
        )}
      </div>

      {/* 4-week mission grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((w) => {
          const m = missions.find((x) => x.week_number === w)
          const cleared = m?.mentor_clear && m?.mentee_clear
          const verified = m?.admin_verified
          const imgs = m?.proof_images || []
          return (
            <div
              key={w}
              className={cn(
                'bg-white rounded-xl border p-3',
                verified ? 'border-green-300' : cleared ? 'border-yellow-300' : 'border-gray-100'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-500">{w}주차</span>
                <span className="text-lg">{verified ? '✅' : cleared ? '⏳' : m ? '📝' : '⬜'}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px]">
                  <span className="text-amber-600 font-bold">멘토</span>
                  <span className={m?.mentor_clear ? 'text-green-500 font-bold' : 'text-gray-400'}>
                    {m?.mentor_score ? m.mentor_score.toLocaleString() + '점' : '—'}{' '}
                    {m?.mentor_clear ? '✓' : ''}
                  </span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-blue-600 font-bold">멘티</span>
                  <span className={m?.mentee_clear ? 'text-green-500 font-bold' : 'text-gray-400'}>
                    {m?.mentee_score ? m.mentee_score.toLocaleString() + '점' : '—'}{' '}
                    {m?.mentee_clear ? '✓' : ''}
                  </span>
                </div>
              </div>

              {/* Proof images */}
              {imgs.length > 0 && (
                <div className="flex gap-1 mt-2 overflow-x-auto">
                  {imgs.map((u) => (
                    <div key={u} className="relative shrink-0">
                      <img
                        src={u}
                        className="h-12 w-12 object-cover rounded-lg border border-gray-100 cursor-pointer hover:opacity-80"
                        onClick={() => window.open(u, '_blank')}
                      />
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('이 사진을 삭제하시겠습니까?'))
                              deleteImage.mutate({ week: w, imgUrl: u })
                          }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[7px] flex items-center justify-center hover:bg-red-600"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-1 mt-2">
                {(team.status === 'active' || isAdmin) && (
                  <button
                    onClick={() => setMissionModal(w)}
                    className="flex-1 py-1.5 bg-blue-50 text-blue-500 rounded-lg text-[9px] font-bold hover:bg-blue-100 flex items-center justify-center gap-1"
                  >
                    <Camera size={10} /> 미션
                  </button>
                )}
                {isAdmin && m && (
                  <button
                    onClick={() => {
                      if (confirm(`${w}주차 미션을 초기화하시겠습니까?`)) resetMission.mutate(w)
                    }}
                    className="py-1.5 px-2 text-[8px] text-red-400 hover:text-red-600 font-bold"
                  >
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* A reward banner */}
      {allClear && team.reward_choice === 'A' && (
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl p-5 text-white text-center">
          <p className="text-xs font-bold opacity-80 mb-1">🎉 A보상 확정!</p>
          <p className="text-lg font-black">멘토·멘티 각 솔 에르다 조각 150개</p>
        </div>
      )}

      {/* B reward roulette section */}
      {team.reward_choice === 'B' && isAdmin && (
        <RouletteSection
          teamId={team.id}
          allClear={allClear}
          roulette={roulette}
          rouletteItems={rouletteItems}
          onResetRoulette={() => {
            if (confirm('룰렛 결과를 취소하시겠습니까?')) resetRoulette.mutate()
          }}
        />
      )}

      {/* Roulette result */}
      {roulette.length > 0 && (
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-5 text-white text-center relative">
          <p className="text-xs font-bold opacity-80 mb-1">🎉 B보상 룰렛 결과 (확정)</p>
          <p className="text-2xl font-black">{roulette[0].result_item}</p>
          <p className="text-sm font-bold opacity-80 mt-1">{roulette[0].result_value}</p>
          {isAdmin && (
            <button
              onClick={() => {
                if (confirm('룰렛 결과를 취소하시겠습니까?')) resetRoulette.mutate()
              }}
              className="absolute top-3 right-3 text-white/60 hover:text-white text-[10px] font-bold flex items-center gap-0.5"
            >
              <RotateCcw size={10} /> 취소
            </button>
          )}
        </div>
      )}

      {/* No reward selected warning */}
      {!team.reward_choice && allClear && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 text-center">
          <p className="text-sm font-bold text-amber-700">⚠ A/B 보상을 선택해주세요</p>
        </div>
      )}

      {/* Mission modal */}
      {missionModal !== null && (
        <MissionModal
          teamId={team.id}
          week={missionModal}
          team={team}
          mission={missions.find((m) => m.week_number === missionModal) || null}
          isAdmin={isAdmin}
          onClose={() => setMissionModal(null)}
        />
      )}
    </div>
  )
}

// ─── Mission Modal ────────────────────────────────────────────────────────────

function MissionModal({
  teamId,
  week,
  team,
  mission,
  isAdmin,
  onClose,
}: {
  teamId: number
  week: number
  team: BuddyTeam
  mission: BuddyMission | null
  isAdmin: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast((s) => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const [mentorScore, setMentorScore] = useState(mission?.mentor_score || 0)
  const [menteeScore, setMenteeScore] = useState(mission?.mentee_score || 0)
  const [mentorClear, setMentorClear] = useState(mission?.mentor_clear || false)
  const [menteeClear, setMenteeClear] = useState(mission?.mentee_clear || false)
  const [adminVerified, setAdminVerified] = useState(mission?.admin_verified || false)

  const imgs = mission?.proof_images || []

  const handleSave = async () => {
    setSaving(true)
    try {
      let imageUrls: string[] = []
      const files = fileRef.current?.files
      if (files && files.length > 0) {
        for (const file of Array.from(files).slice(0, 5)) {
          const path =
            'buddy/' +
            Date.now() +
            '_' +
            Math.random().toString(36).substring(2, 8) +
            '.' +
            (file.name.split('.').pop() || 'jpg')
          await r2Upload('board-images', path, file)
          imageUrls.push(R2_PUBLIC_URL + '/board-images/' + path)
        }
      }

      const { data: existing } = await supabase
        .from('buddy_missions')
        .select('*')
        .eq('team_id', teamId)
        .eq('week_number', week)
        .maybeSingle()

      const mData: Record<string, unknown> = { team_id: teamId, week_number: week }
      if (imageUrls.length > 0) {
        mData.proof_images = [...(existing?.proof_images || []), ...imageUrls]
      }
      if (isAdmin) {
        mData.mentor_score = mentorScore
        mData.mentee_score = menteeScore
        mData.mentor_clear = mentorClear
        mData.mentee_clear = menteeClear
        mData.admin_verified = adminVerified
        if (adminVerified) {
          mData.verified_at = new Date().toISOString()
        }
      }

      if (existing) {
        await supabase.from('buddy_missions').update(mData).eq('id', existing.id)
      } else {
        await supabase.from('buddy_missions').insert(mData)
      }

      qc.invalidateQueries({ queryKey: ['buddy-missions', teamId] })
      toast('미션 저장!', 'success')
      onClose()
    } catch (e: any) {
      toast('저장 실패: ' + (e.message || e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <Camera size={16} className="text-blue-400" /> {week}주차 미션
        </h3>

        {/* Existing proof images */}
        {imgs.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {imgs.map((u) => (
              <div key={u} className="relative">
                <img
                  src={u}
                  className="w-full h-24 object-cover rounded-xl border border-gray-100 cursor-pointer hover:opacity-80"
                  onClick={() => window.open(u, '_blank')}
                />
              </div>
            ))}
          </div>
        )}

        {/* File input */}
        <div>
          <label className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
            <Camera size={10} /> 미션 인증 사진
          </label>
          <input
            type="file"
            ref={fileRef}
            accept="image/*"
            multiple
            className="text-[10px] mt-1 w-full"
          />
        </div>

        {/* Score summary */}
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[9px] font-bold text-gray-400 mb-2">수로 점수</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center">
              <span className="text-[9px] text-amber-600 font-bold">멘토 {team.mentor_name}</span>
              <div className="text-sm font-black text-gray-800">
                {mentorScore.toLocaleString()}점
              </div>
            </div>
            <div className="text-center">
              <span className="text-[9px] text-blue-600 font-bold">멘티 {team.mentee_name}</span>
              <div className="text-sm font-black text-gray-800">
                {menteeScore.toLocaleString()}점
              </div>
            </div>
          </div>
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="bg-blue-50 rounded-xl p-3 space-y-2">
            <p className="text-[9px] font-bold text-blue-600">관리자 확인</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-bold text-gray-400">멘토 점수</label>
                <input
                  type="number"
                  value={mentorScore}
                  onChange={(e) => setMentorScore(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400">멘티 점수</label>
                <input
                  type="number"
                  value={menteeScore}
                  onChange={(e) => setMenteeScore(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-[10px] font-bold">
                <input
                  type="checkbox"
                  checked={mentorClear}
                  onChange={(e) => setMentorClear(e.target.checked)}
                />{' '}
                멘토 클리어
              </label>
              <label className="flex items-center gap-2 text-[10px] font-bold">
                <input
                  type="checkbox"
                  checked={menteeClear}
                  onChange={(e) => setMenteeClear(e.target.checked)}
                />{' '}
                멘티 클리어
              </label>
            </div>
            <label className="flex items-center gap-2 text-[10px] font-bold text-green-600">
              <input
                type="checkbox"
                checked={adminVerified}
                onChange={(e) => setAdminVerified(e.target.checked)}
              />{' '}
              ✅ 관리자 확인 완료
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold shadow hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-200 text-gray-600 rounded-xl text-xs font-bold"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Roulette Section ─────────────────────────────────────────────────────────

function RouletteSection({
  teamId,
  allClear,
  roulette,
  rouletteItems,
  onResetRoulette,
}: {
  teamId: number
  allClear: boolean
  roulette: BuddyRoulette[]
  rouletteItems: typeof DEFAULT_ROULETTE_ITEMS
  onResetRoulette: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast((s) => s.show)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [speed, setSpeed] = useState<'vfast' | 'fast' | 'normal' | 'slow'>('fast')
  const [spinning, setSpinning] = useState(false)
  const [resultText, setResultText] = useState('🎰 돌려주세요!')
  const [resultColor, setResultColor] = useState('#9ca3af')
  const [resultValue, setResultValue] = useState('')
  const angleRef = useRef(0)
  const spinningRef = useRef(false)
  const rafRef = useRef<number>(0)

  const items = rouletteItems

  const drawWheel = useCallback(
    (angle: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const r = cx - 6
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Outer ring
      ctx.beginPath()
      ctx.arc(cx, cy, r + 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#ede9fe'
      ctx.fill()

      let startAngle = angle - Math.PI / 2
      items.forEach((item) => {
        const sa = (item.prob / 100) * 2 * Math.PI
        const ea = startAngle + sa
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, startAngle, ea)
        ctx.closePath()
        ctx.fillStyle = item.color
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 2
        ctx.stroke()

        if (sa >= 0.18) {
          const ta = startAngle + sa / 2
          const tr = r * 0.6
          ctx.save()
          ctx.translate(cx + Math.cos(ta) * tr, cy + Math.sin(ta) * tr)
          let rot = ta + Math.PI / 2
          if (Math.cos(ta) < 0) rot += Math.PI
          ctx.rotate(rot)
          ctx.fillStyle = 'white'
          ctx.textAlign = 'center'
          ctx.shadowColor = 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = 3
          const fs = sa > 0.5 ? 10 : sa > 0.3 ? 9 : 8
          ctx.font = `bold ${fs}px sans-serif`
          const maxLen = sa > 0.5 ? 8 : 6
          const label = item.name.length > maxLen ? item.name.slice(0, maxLen) : item.name
          ctx.fillText(label, 0, sa > 0.25 ? -3 : 0)
          if (sa > 0.25) {
            ctx.font = 'bold 7px sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.9)'
            ctx.fillText(item.prob + '%', 0, 9)
          }
          ctx.restore()
        }
        startAngle = ea
      })

      // Center circle
      const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 16)
      grad.addColorStop(0, '#8b5cf6')
      grad.addColorStop(1, '#4c1d95')
      ctx.beginPath()
      ctx.arc(cx, cy, 15, 0, 2 * Math.PI)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    },
    [items]
  )

  useEffect(() => {
    drawWheel(angleRef.current)
  }, [drawWheel])

  const spinRoulette = async (isConfirm: boolean) => {
    if (spinningRef.current) return
    if (isConfirm && !confirm('⚠ 보상을 확정하시겠습니까? 한 번 확정하면 변경할 수 없습니다!')) return

    const rand = Math.random() * 100
    let cumulative = 0
    let result = items[0]
    for (const item of items) {
      cumulative += item.prob
      if (rand < cumulative) {
        result = item
        break
      }
    }

    let resultStartProb = 0
    for (const item of items) {
      if (item === result) break
      resultStartProb += item.prob
    }
    const resultCenterOffset = ((resultStartProb + result.prob / 2) / 100) * 2 * Math.PI

    const speedMap = {
      vfast: { r: 25, d: 2200 },
      fast: { r: 18, d: 3500 },
      normal: { r: 13, d: 5000 },
      slow: { r: 8, d: 7000 },
    }
    const spd = speedMap[speed]

    const startAngle = angleRef.current
    const restAngle = -resultCenterOffset
    const startNorm = ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const restNorm = ((restAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    let extra = restNorm - startNorm
    if (extra <= 0) extra += 2 * Math.PI
    const targetAngle = startAngle + 2 * Math.PI * spd.r + extra

    setResultText('🎰 돌리는 중...')
    setResultColor('#9ca3af')
    setResultValue('')
    setSpinning(true)
    spinningRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const startTime = performance.now()
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / spd.d, 1)
      const eased = 1 - Math.pow(1 - t, 4)
      const cur = startAngle + (targetAngle - startAngle) * eased
      angleRef.current = cur
      drawWheel(cur)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        spinningRef.current = false
        setSpinning(false)
        angleRef.current = targetAngle
        setResultText('🎉 ' + result.name + ' 🎉')
        setResultColor(result.color)
        setResultValue(result.value + (isConfirm ? ' — 확정!' : ' — 연습'))

        if (isConfirm) {
          supabase
            .from('buddy_roulette')
            .insert({ team_id: teamId, result_item: result.name, result_value: result.value })
            .then(({ error }) => {
              if (error) {
                toast('저장 실패: ' + error.message, 'error')
                return
              }
              supabase.from('buddy_teams').update({ status: 'completed' }).eq('id', teamId)
              toast('🎉 ' + result.name + ' (' + result.value + ') 확정!', 'success')
              setTimeout(() => {
                qc.invalidateQueries({ queryKey: ['buddy-roulette', teamId] })
                qc.invalidateQueries({ queryKey: ['buddy-teams'] })
              }, 2000)
            })
        }
      }
    }
    requestAnimationFrame(animate)
  }

  const speedLabels: Record<string, string> = {
    vfast: '매우빠름',
    fast: '빠름',
    normal: '보통',
    slow: '느림',
  }
  const speeds = ['vfast', 'fast', 'normal', 'slow'] as const

  const [showTable, setShowTable] = useState(false)

  return (
    <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4">
      <p className="text-sm font-bold text-purple-700 mb-3 text-center">
        🎰 B보상 칠흑 가챠 룰렛{' '}
        {!allClear && <span className="text-[9px] text-amber-500">(⚠ 미션 미완료)</span>}
      </p>

      {/* Probability table toggle */}
      <div className="mb-3">
        <button
          onClick={() => setShowTable(!showTable)}
          className="text-[10px] font-bold text-purple-500 cursor-pointer hover:text-purple-700"
        >
          {showTable ? '▼' : '▶'} 품목 확률표 보기
        </button>
        {showTable && (
          <div className="mt-2 rounded-xl overflow-hidden border border-purple-100">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-purple-100 text-purple-700">
                  <th className="py-1.5 px-3 text-left font-bold">이름</th>
                  <th className="py-1.5 px-3 text-right font-bold">크기</th>
                  <th className="py-1.5 px-3 text-right font-bold">확률</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-purple-50">
                {items.map((item) => (
                  <tr key={item.name} className="hover:bg-purple-50/50">
                    <td className="py-1 px-3 font-bold" style={{ color: item.color }}>
                      {item.name}
                    </td>
                    <td className="py-1 px-3 text-right text-gray-400 font-bold">{item.value}</td>
                    <td className="py-1 px-3 text-right font-bold text-gray-500">{item.prob}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Canvas display */}
      <div className="mb-3">
        <div className="text-center mb-2">
          <div className="text-xl font-black" style={{ color: resultColor }}>
            {resultText}
          </div>
          {resultValue && <div className="text-sm text-gray-400 mt-0.5">{resultValue}</div>}
        </div>
        <div className="relative flex justify-center items-start">
          <div
            style={{
              position: 'absolute',
              top: -2,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '20px solid #7c3aed',
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
            }}
          />
          <canvas
            ref={canvasRef}
            width={260}
            height={260}
            style={{
              display: 'block',
              borderRadius: '50%',
              boxShadow: '0 4px 20px rgba(124,58,237,0.25)',
            }}
          />
        </div>
      </div>

      {/* Speed buttons */}
      <div className="flex gap-1.5 justify-center mb-3">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all',
              s === speed
                ? 'bg-purple-500 text-white border-purple-500'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            )}
          >
            {speedLabels[s]}
          </button>
        ))}
      </div>

      {/* Spin buttons */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => spinRoulette(false)}
          disabled={spinning}
          className="px-6 py-3 bg-purple-500 text-white rounded-2xl font-bold text-sm shadow-lg hover:bg-purple-600 transition-all active:scale-95 disabled:opacity-50"
        >
          🎰 연습 돌리기
        </button>
        {roulette.length === 0 ? (
          <button
            onClick={() => spinRoulette(true)}
            disabled={spinning}
            className="px-6 py-3 bg-red-500 text-white rounded-2xl font-bold text-sm shadow-lg hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50"
          >
            🔒 보상 확정!
          </button>
        ) : (
          <>
            <span className="text-[10px] text-green-600 font-bold self-center">✅ 이미 확정됨</span>
            <button
              onClick={onResetRoulette}
              className="text-[9px] text-red-400 hover:text-red-600 font-bold self-center ml-2 flex items-center gap-0.5"
            >
              <RotateCcw size={10} /> 결과 취소
            </button>
          </>
        )}
      </div>
    </div>
  )
}
