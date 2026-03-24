import { useState } from 'react'
import { Pencil, Trash2, ChevronUp, ChevronDown, Crown } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Member } from '@/types/member'
import type { ScoreMap } from '@/types/score'

const GUILD_COLORS: Record<string, string> = {
  '뚠카롱': 'bg-indigo-50 text-indigo-600 border-indigo-200',
  '뚱카롱': 'bg-rose-50 text-rose-600 border-rose-200',
  '밤카롱': 'bg-violet-50 text-violet-600 border-violet-200',
  '별카롱': 'bg-amber-50 text-amber-600 border-amber-200',
  '달카롱': 'bg-blue-50 text-blue-600 border-blue-200',
  '꿀카롱': 'bg-orange-50 text-orange-600 border-orange-200',
}

const ROLE_STYLES: Record<string, { bg: string; text: string; emoji?: string }> = {
  '마카롱': { bg: 'bg-blue-100', text: 'text-blue-700', emoji: '👑' },
  '다쿠아즈': { bg: 'bg-pink-100', text: 'text-pink-700', emoji: '👑' },
  '크라운': { bg: 'bg-amber-100', text: 'text-amber-700', emoji: '👑' },
  '파르페': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  '티라미슈': { bg: 'bg-orange-100', text: 'text-orange-700' },
  '크로칸슈': { bg: 'bg-green-100', text: 'text-green-700' },
  '롤케이크': { bg: 'bg-rose-100', text: 'text-rose-700' },
  '팬케이크': { bg: 'bg-amber-50', text: 'text-amber-600' },
  '와플': { bg: 'bg-purple-50', text: 'text-purple-600' },
  '스콘': { bg: 'bg-gray-100', text: 'text-gray-600' },
}

export interface BatchUpdate {
  guild?: string
  role?: string
  class?: string
}

interface Props {
  members: Member[]
  scoreMap: ScoreMap
  latestPeriod: string | null
  sortKey: string
  sortAsc: boolean
  onSort: (key: string) => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onEdit?: (member: Member) => void
  onDelete?: (id: string) => void
  onScoreChange?: (memberId: string, periodLabel: string, score: number) => Promise<void>
  batchMode?: boolean
  batchUpdates?: Record<string, BatchUpdate>
  onBatchUpdate?: (memberId: string, field: string, value: string) => void
  guilds?: string[]
  roles?: string[]
  allMembers?: Member[]
  siteConfig?: { roleDisplay?: Record<string, { emoji?: string; textColor?: string; bgColor?: string; rowColor?: string }> } | null
}

function RoleIcon({ role }: { role: string }) {
  const rs = ROLE_STYLES[role]
  if (rs?.emoji) return <span className="mr-1.5 text-sm">{rs.emoji}</span>
  if (['마카롱', '다쿠아즈'].includes(role)) {
    return <Crown size={13} className={cn('mr-1.5', role === '마카롱' ? 'text-blue-500' : 'text-pink-500')} />
  }
  return <span className="w-3 h-3 rounded-full bg-gray-200 mr-1.5 inline-block shrink-0" />
}

function RoleBadge({ role, isMain, siteConfig }: { role: string; isMain: boolean; siteConfig?: Props['siteConfig'] }) {
  const configStyle = siteConfig?.roleDisplay?.[role]
  let roleText = role
  if (!isMain && !['와플', '아인슈페너', '부팬케이크', '수플레', '부케이크', '반죽(휴면)'].includes(role)) {
    roleText = role + ' \u00B7 와플'
  }
  const rs = ROLE_STYLES[role]
  const bgColor = configStyle?.bgColor || rs?.bg || 'bg-gray-100'
  const textColor = configStyle?.textColor || rs?.text || 'text-gray-600'
  return (
    <span
      className={cn('inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-tight', bgColor, textColor)}
      style={configStyle?.bgColor ? { backgroundColor: configStyle.bgColor, color: configStyle.textColor || 'white' } : undefined}
    >
      {roleText}
    </span>
  )
}

function ScoreCell({
  value,
  editable,
  onSave,
}: {
  value: number | undefined
  editable: boolean
  onSave: (score: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  const score = value ?? 0
  const isZero = score === 0

  if (editing && editable) {
    return (
      <input
        type="number"
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={async () => {
          const num = Number(input) || 0
          if (num !== score) await onSave(num)
          setEditing(false)
        }}
        onKeyDown={async (e) => {
          if (e.key === 'Enter') {
            const num = Number(input) || 0
            if (num !== score) await onSave(num)
            setEditing(false)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-16 px-1 py-0.5 text-center text-xs font-bold border border-indigo-300 rounded-lg outline-none bg-white"
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-block min-w-[2.5rem] text-center px-1.5 py-0.5 rounded-lg text-xs font-bold',
        isZero ? 'score-zero' : 'text-gray-700',
        editable && 'cursor-pointer hover:bg-indigo-50 transition-colors'
      )}
      onClick={() => {
        if (!editable) return
        setInput(String(score))
        setEditing(true)
      }}
    >
      {value !== undefined ? score.toLocaleString() : '-'}
    </span>
  )
}

export function MemberTable({
  members, scoreMap, latestPeriod,
  sortKey, sortAsc, onSort,
  selected, onToggleSelect, onToggleSelectAll,
  onEdit, onDelete, onScoreChange,
  batchMode, batchUpdates, onBatchUpdate,
  guilds, roles, allMembers, siteConfig,
}: Props) {
  const hasActions = onEdit || onDelete

  const SortIcon = ({ col }: { col: string }) =>
    sortKey === col ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs stick-head">
          <thead>
            <tr className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
              {hasActions && (
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === members.length && members.length > 0}
                    onChange={onToggleSelectAll}
                    className="custom-checkbox w-4 h-4"
                  />
                </th>
              )}
              <th className="px-3 py-3 sortable text-left" onClick={() => onSort('name')}>
                <span className="inline-flex items-center gap-1">닉네임 <SortIcon col="name" /></span>
              </th>
              <th className="px-3 py-3 sortable text-left hidden sm:table-cell" onClick={() => onSort('mainInfo')}>
                <span className="inline-flex items-center gap-1">본캐 <SortIcon col="mainInfo" /></span>
              </th>
              <th className="px-3 py-3 sortable text-left" onClick={() => onSort('guild')}>
                <span className="inline-flex items-center gap-1">길드 <SortIcon col="guild" /></span>
              </th>
              <th className="px-3 py-3 sortable text-left hidden sm:table-cell" onClick={() => onSort('role')}>
                <span className="inline-flex items-center gap-1">직위 <SortIcon col="role" /></span>
              </th>
              <th className="px-3 py-3 sortable text-left hidden md:table-cell" onClick={() => onSort('class')}>
                <span className="inline-flex items-center gap-1">직업 <SortIcon col="class" /></span>
              </th>
              <th className="px-3 py-3 sortable text-right" onClick={() => onSort('level')}>
                <span className="inline-flex items-center gap-1">Lv <SortIcon col="level" /></span>
              </th>
              {latestPeriod && (
                <th
                  className="px-2 py-3 sortable text-center whitespace-nowrap"
                  onClick={() => onSort('score')}
                >
                  <span className="inline-flex items-center gap-0.5">
                    수로 <SortIcon col="score" />
                  </span>
                </th>
              )}
              {hasActions && <th className="px-3 py-3 w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.length === 0 ? (
              <tr>
                <td colSpan={99} className="text-center py-12 text-gray-400 font-bold">
                  길드원이 없습니다
                </td>
              </tr>
            ) : (
              members.map((m, idx) => {
                const memberScores = scoreMap[m.id] || {}
                const pending = batchUpdates?.[m.id]
                const currentGuild = pending?.guild || m.guild
                const currentRole = pending?.role || m.role
                const currentClass = pending?.class || m.class

                // Main character info
                const mainName = m.isMain ? m.name : (m.mainCharName || '-')
                const mainMember = allMembers?.find(x => x.name === mainName)

                return (
                  <tr
                    key={m.id}
                    className={cn(
                      'hover:bg-gray-50/50 transition-colors group',
                      selected.has(m.id) && 'bg-indigo-50/30',
                      pending && 'bg-orange-50/50',
                      idx > 0 && idx % 17 === 0 && 'border-t-2 border-dashed border-indigo-200'
                    )}
                  >
                    {hasActions && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => onToggleSelect(m.id)}
                          className="custom-checkbox w-4 h-4"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center leading-none">
                        <RoleIcon role={m.role} />
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-gray-800 text-sm tracking-tight truncate">
                            {m.name}
                            {m.level > 0 && <span className="text-[8px] text-gray-400 font-mono ml-1">Lv.{m.level}</span>}
                          </span>
                          <span className="text-[9px] text-gray-400 font-medium truncate">{m.class || ''}</span>
                        </div>
                      </div>
                    </td>

                    {/* Main character column */}
                    <td className="px-3 py-2.5 leading-tight hidden sm:table-cell">
                      <span className="block text-[11px] font-bold text-gray-700">{mainName}</span>
                      {mainMember && (
                        <span className="text-[9px] font-medium text-gray-400">
                          <RoleBadge role={mainMember.role} isMain={mainMember.isMain} siteConfig={siteConfig} />
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      {batchMode && guilds && onBatchUpdate ? (
                        <select
                          value={currentGuild}
                          onChange={(e) => onBatchUpdate(m.id, 'guild', e.target.value)}
                          className="bg-white border rounded px-1 text-[10px] font-bold outline-none"
                        >
                          {guilds.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      ) : (
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border',
                          GUILD_COLORS[m.guild] || 'bg-gray-50 text-gray-600 border-gray-200'
                        )}>
                          {m.guild}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      {batchMode && roles && onBatchUpdate ? (
                        <select
                          value={currentRole}
                          onChange={(e) => onBatchUpdate(m.id, 'role', e.target.value)}
                          className="bg-white border rounded px-1 text-[10px] font-bold outline-none"
                        >
                          {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <RoleBadge role={m.role} isMain={m.isMain} siteConfig={siteConfig} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {batchMode && onBatchUpdate ? (
                        <input
                          type="text"
                          value={currentClass}
                          onChange={(e) => onBatchUpdate(m.id, 'class', e.target.value)}
                          className="bg-white border rounded px-1 text-[10px] font-bold w-24 outline-none"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">{m.class || '-'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-700">{m.level || '-'}</td>
                    {latestPeriod && (
                      <td className="px-1 py-2.5 text-center score-cell">
                        <ScoreCell
                          value={memberScores[latestPeriod]}
                          editable={!!onScoreChange}
                          onSave={(score) => onScoreChange!(m.id, latestPeriod, score)}
                        />
                      </td>
                    )}
                    {hasActions && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onEdit && !batchMode && (
                            <button
                              onClick={() => onEdit(m)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-all"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {onDelete && !batchMode && (
                            <button
                              onClick={() => onDelete(m.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="py-2 text-center text-[9px] text-gray-300 font-bold">
        총 {members.length}명
      </div>
    </div>
  )
}
