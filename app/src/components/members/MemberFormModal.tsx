import { useState } from 'react'
import { X, User, UserCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Member, MemberFormData } from '@/types/member'

interface Props {
  title: string
  guilds: string[]
  roles: string[]
  initial?: Member
  onSubmit: (data: MemberFormData) => Promise<void>
  onClose: () => void
}

export function MemberFormModal({ title, guilds, roles, initial, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<MemberFormData>({
    name: initial?.name || '',
    guild: initial?.guild || guilds[0] || '',
    role: initial?.role || roles[roles.length - 1] || '길드원',
    class: initial?.class || '',
    level: initial?.level || 0,
    isMain: initial?.isMain ?? true,
    mainCharName: initial?.mainCharName || '',
    joinDate: initial?.joinDate || new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSubmit(form)
    } finally {
      setSaving(false)
    }
  }

  const update = (key: keyof MemberFormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* isMain toggle - prominent */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update('isMain', true)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all border',
                form.isMain
                  ? 'bg-indigo-500 text-white border-indigo-500 shadow-md'
                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
              )}
            >
              <UserCheck size={15} />
              본캐릭터
            </button>
            <button
              type="button"
              onClick={() => update('isMain', false)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all border',
                !form.isMain
                  ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
              )}
            >
              <User size={15} />
              부캐릭터
            </button>
          </div>

          {/* Main char name (shown when sub-character) */}
          {!form.isMain && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <label className="block text-[10px] font-bold text-purple-600 mb-1">본캐 닉네임 *</label>
              <input
                type="text"
                value={form.mainCharName}
                onChange={(e) => update('mainCharName', e.target.value)}
                placeholder="본캐릭터 닉네임을 입력하세요"
                className="w-full px-3 py-2 bg-white border border-purple-100 rounded-xl text-sm font-bold outline-none focus:border-purple-300"
              />
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">닉네임 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300"
              required
            />
          </div>

          {/* Guild & Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">길드</label>
              <select
                value={form.guild}
                onChange={(e) => update('guild', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none"
              >
                {guilds.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">직위</label>
              <select
                value={form.role}
                onChange={(e) => update('role', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none"
              >
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Class & Level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">직업</label>
              <input
                type="text"
                value={form.class}
                onChange={(e) => update('class', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">레벨</label>
              <input
                type="number"
                value={form.level || ''}
                onChange={(e) => update('level', Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300"
              />
            </div>
          </div>

          {/* Join date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">가입일</label>
            <input
              type="date"
              value={form.joinDate}
              onChange={(e) => update('joinDate', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-indigo-500 text-white text-sm font-bold rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-50"
            >
              {saving ? '저장 중...' : initial ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
