import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { r2Upload } from '@/lib/r2'
import { useToast } from '@/components/ui/Toast'
import {
  Save, Plus, Trash2, Shield, Palette, Users, Medal, Image,
  Check, X, Upload,
} from 'lucide-react'
import { cn } from '@/lib/cn'

/* ─── types ─── */
interface AdminUser {
  id: number
  email: string
  name: string | null
  role: string | null
  status: string
}

interface GuildConfig {
  name: string
  type?: string
  color?: string
  icon?: string
  max?: number
}

interface RoleDisplay {
  emoji?: string
  textColor?: string
  bgColor?: string
  rowColor?: string
}

/* ─── sub-tab type ─── */
type SettingsTab = 'guilds' | 'roles' | 'admin' | 'json'

export default function SettingsPage() {
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<SettingsTab>('guilds')

  /* ─── Site config ─── */
  const { data: configRow } = useQuery({
    queryKey: ['site-config-raw'],
    queryFn: async () => {
      const { data } = await supabase.from('site_config').select('config').eq('id', 1).maybeSingle()
      return (data?.config || {}) as Record<string, unknown>
    },
  })

  const [configJson, setConfigJson] = useState('')
  useEffect(() => {
    if (configRow) setConfigJson(JSON.stringify(configRow, null, 2))
  }, [configRow])

  const saveConfig = useMutation({
    mutationFn: async (cfg?: Record<string, unknown>) => {
      const parsed = cfg || JSON.parse(configJson)
      const { error } = await supabase.from('site_config').upsert({ id: 1, config: parsed })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-config'] })
      qc.invalidateQueries({ queryKey: ['site-config-raw'] })
      toast('설정 저장 완료', 'success')
    },
    onError: () => toast('저장 실패 (JSON 형식 오류?)', 'error'),
  })

  /* ─── Admin whitelist ─── */
  const { data: admins = [] } = useQuery({
    queryKey: ['admin-whitelist'],
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_whitelist').select('*').order('id')
      if (error) throw error
      return (data || []) as AdminUser[]
    },
  })

  const [newEmail, setNewEmail] = useState('')

  const addAdmin = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from('admin_whitelist')
        .insert({ email, status: 'approved' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-whitelist'] })
      toast('관리자 추가 완료', 'success')
      setNewEmail('')
    },
  })

  const removeAdmin = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('admin_whitelist').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-whitelist'] })
      toast('삭제 완료', 'success')
    },
  })

  const updateAdminStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { error } = await supabase
        .from('admin_whitelist')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-whitelist'] })
      toast('상태 변경 완료', 'success')
    },
  })

  const TABS: { key: SettingsTab; label: string; icon: typeof Users }[] = [
    { key: 'guilds', label: '길드 관리', icon: Users },
    { key: 'roles', label: '직위 디자인', icon: Medal },
    { key: 'admin', label: '관리자', icon: Shield },
    { key: 'json', label: 'JSON 편집', icon: Save },
  ]

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-black text-gray-800">설정</h2>

      {/* Tab navigation */}
      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 shrink-0',
                activeTab === t.key
                  ? 'bg-indigo-500 text-white shadow'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              <Icon size={12} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Guild management */}
      {activeTab === 'guilds' && (
        <GuildManagement configRow={configRow} saveConfig={saveConfig} toast={toast} />
      )}

      {/* Role display */}
      {activeTab === 'roles' && (
        <RoleDisplaySettings configRow={configRow} saveConfig={saveConfig} toast={toast} />
      )}

      {/* Admin whitelist */}
      {activeTab === 'admin' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5 mb-3">
              <Shield size={14} className="text-indigo-500" />
              관리자 허용 목록
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                type="email"
                placeholder="이메일 주소"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300"
              />
              <button
                onClick={() => {
                  if (newEmail.trim()) addAdmin.mutate(newEmail.trim())
                }}
                className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center gap-1"
              >
                <Plus size={13} /> 추가
              </button>
            </div>
            <div className="space-y-1">
              {admins.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl"
                >
                  <span className="text-xs font-bold text-gray-800 flex-1">{a.email}</span>
                  <span className="text-[9px] font-bold text-gray-400">{a.name || ''}</span>
                  <span
                    className={cn(
                      'text-[8px] font-bold px-1.5 py-0.5 rounded-md',
                      a.status === 'approved'
                        ? 'bg-green-50 text-green-600'
                        : a.status === 'pending'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-red-50 text-red-600'
                    )}
                  >
                    {a.status}
                  </span>
                  {/* Approve / Reject for pending */}
                  {a.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateAdminStatus.mutate({ id: a.id, status: 'approved' })}
                        className="p-1 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-500"
                        title="승인"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => updateAdminStatus.mutate({ id: a.id, status: 'rejected' })}
                        className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                        title="거절"
                      >
                        <X size={13} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('삭제?')) removeAdmin.mutate(a.id)
                    }}
                    className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* JSON editor */}
      {activeTab === 'json' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-gray-700">사이트 설정 (JSON)</h3>
            <button
              onClick={() => saveConfig.mutate(undefined)}
              className="px-3 py-1.5 bg-indigo-500 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-600 flex items-center gap-1"
            >
              <Save size={12} /> 저장
            </button>
          </div>
          <textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            rows={20}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-mono outline-none focus:border-indigo-300 resize-none"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}

/* ═══ Guild Management Sub-section ═══ */
function GuildManagement({
  configRow,
  saveConfig,
  toast,
}: {
  configRow: Record<string, unknown> | undefined
  saveConfig: { mutate: (cfg?: Record<string, unknown>) => void }
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const cfg = configRow || {}
  const [guilds, setGuilds] = useState<GuildConfig[]>([])
  const [piecePriceStr, setPiecePriceStr] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (cfg.guilds) setGuilds(cfg.guilds as GuildConfig[])
    if (cfg.piecePrice !== undefined) setPiecePriceStr(String(cfg.piecePrice))
    if (cfg.guildLogo) setLogoUrl(cfg.guildLogo as string)
  }, [configRow])

  const iconOptions = [
    '👑','❤️','🌙','⭐','☀️','🌰','🍯','🐉','🌸','💎','🔥','⚡','🛡️','🎮','🍀','🌊',
    '⛰️','🦋','🐝','🌈','🍰','🧁','🍩','🍪','🎂','🍭','🍬','☕','🧇','🥐','🍞',
  ]

  const addGuild = () => {
    setGuilds((prev) => [
      ...prev,
      { name: '새길드', type: '신규', color: '#9ca3af', icon: '⭐', max: 200 },
    ])
  }

  const removeGuild = (idx: number) => {
    if (!confirm('이 길드를 삭제하시겠습니까?')) return
    setGuilds((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateGuild = (idx: number, field: keyof GuildConfig, value: string | number) => {
    setGuilds((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, [field]: value } : g))
    )
  }

  const handleLogoUpload = async (file: File) => {
    setUploading(true)
    try {
      const safeName = `guild-logo-${Date.now()}.${file.name.split('.').pop()}`
      const url = await r2Upload('guild-assets', safeName, file)
      setLogoUrl(url)
      toast('로고 업로드 완료', 'success')
    } catch {
      toast('업로드 실패', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = () => {
    const newCfg = {
      ...cfg,
      guilds,
      piecePrice: piecePriceStr ? Number(piecePriceStr) : undefined,
      guildLogo: logoUrl || null,
    }
    saveConfig.mutate(newCfg)
  }

  return (
    <div className="space-y-4">
      {/* Logo */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5 mb-3">
          <Image size={14} className="text-indigo-500" />
          길드 로고
        </h3>
        <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="w-16 h-16 rounded-2xl shadow-md overflow-hidden bg-gradient-to-tr from-indigo-400 to-purple-400 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {logoUrl ? (
              <img src={logoUrl} className="w-full h-full object-cover" alt="logo" />
            ) : (
              '뚠'
            )}
          </div>
          <div className="flex-1">
            <p className="text-[9px] text-gray-500 mb-2">PNG/JPG 이미지 업로드 (권장 200x200)</p>
            <div className="flex gap-2">
              <label className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-600 flex items-center gap-1">
                <Upload size={10} />
                {uploading ? '업로드 중...' : '이미지 선택'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleLogoUpload(e.target.files[0])
                  }}
                />
              </label>
              <button
                onClick={() => setLogoUrl('')}
                className="px-3 py-1.5 bg-gray-200 text-gray-500 rounded-lg text-[10px] font-bold hover:bg-gray-300"
              >
                제거
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Piece price */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-gray-700 mb-3">조각 가격 설정</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={piecePriceStr}
            onChange={(e) => setPiecePriceStr(e.target.value)}
            placeholder="조각 가격 (메소)"
            className="w-48 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300"
          />
          <span className="text-[10px] text-gray-400 font-bold">메소 / 조각</span>
        </div>
      </div>

      {/* Guild cards */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
            <Users size={14} className="text-indigo-500" />
            길드 목록
          </h3>
          <button
            onClick={addGuild}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1"
          >
            <Plus size={12} /> 길드 추가
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {guilds.map((g, gi) => (
            <div
              key={gi}
              className="bg-gray-50 rounded-xl p-3 border border-gray-100"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-sm"
                  style={{ background: (g.color || '#9ca3af') + '15' }}
                >
                  {g.icon || '⭐'}
                </div>
                <span className="font-bold text-gray-800 text-xs">{g.name}</span>
                <button
                  onClick={() => removeGuild(gi)}
                  className="ml-auto text-gray-300 hover:text-red-400 text-[10px]"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-[10px]">
                <div>
                  <label className="text-[8px] text-gray-400 block">이름</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                    value={g.name}
                    onChange={(e) => updateGuild(gi, 'name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[8px] text-gray-400 block">타입</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                    value={g.type || ''}
                    onChange={(e) => updateGuild(gi, 'type', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[8px] text-gray-400 block">색상</label>
                  <input
                    type="color"
                    className="w-6 h-6 rounded border-0 cursor-pointer"
                    value={g.color || '#9ca3af'}
                    onChange={(e) => updateGuild(gi, 'color', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[8px] text-gray-400 block">아이콘</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="w-10 text-center bg-white border border-gray-200 rounded-lg py-1 text-sm outline-none"
                      value={g.icon || ''}
                      onChange={(e) => updateGuild(gi, 'icon', e.target.value)}
                    />
                    <details className="relative">
                      <summary className="text-[8px] text-gray-400 cursor-pointer hover:text-indigo-500">
                        선택
                      </summary>
                      <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 flex flex-wrap gap-0.5 w-48 mt-1 max-h-[120px] overflow-y-auto">
                        {iconOptions.map((ic) => (
                          <span
                            key={ic}
                            onClick={() => updateGuild(gi, 'icon', ic)}
                            className="cursor-pointer text-base p-0.5 hover:bg-gray-100 rounded select-none"
                          >
                            {ic}
                          </span>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
                <div>
                  <label className="text-[8px] text-gray-400 block">인원</label>
                  <input
                    type="number"
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                    value={g.max || 200}
                    onChange={(e) => updateGuild(gi, 'max', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-indigo-600 flex items-center gap-1.5"
      >
        <Save size={14} /> 길드 설정 저장
      </button>
    </div>
  )
}

/* ═══ Role Display Settings ═══ */
function RoleDisplaySettings({
  configRow,
  saveConfig,
  toast,
}: {
  configRow: Record<string, unknown> | undefined
  saveConfig: { mutate: (cfg?: Record<string, unknown>) => void }
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const cfg = configRow || {}
  const ranks = (cfg.ranks as Record<string, string[]>) || {}
  const rolePriority = (cfg.rolePriority as Record<string, number>) || {}
  const existingDisplay = (cfg.roleDisplay as Record<string, RoleDisplay>) || {}

  const allRoleNames = [...new Set(Object.values(ranks).flat())]
  const sortedRoleNames = [...allRoleNames].sort((a, b) => {
    const pa = rolePriority[a] !== undefined ? rolePriority[a] : 999 + allRoleNames.indexOf(a)
    const pb = rolePriority[b] !== undefined ? rolePriority[b] : 999 + allRoleNames.indexOf(b)
    return pa - pb
  })

  const [roleDisplay, setRoleDisplay] = useState<Record<string, RoleDisplay>>({})
  const [newRoleName, setNewRoleName] = useState('')

  useEffect(() => {
    setRoleDisplay(existingDisplay)
  }, [configRow])

  const updateRole = (roleName: string, field: keyof RoleDisplay, value: string) => {
    setRoleDisplay((prev) => ({
      ...prev,
      [roleName]: { ...prev[roleName], [field]: value },
    }))
  }

  const handleSave = () => {
    const newCfg = { ...cfg, roleDisplay }
    saveConfig.mutate(newCfg)
  }

  const addNewRole = () => {
    if (!newRoleName.trim()) return
    setRoleDisplay((prev) => ({
      ...prev,
      [newRoleName.trim()]: { emoji: '', textColor: '#374151', bgColor: '#f3f4f6' },
    }))
    // Also add to ranks if not present
    setNewRoleName('')
    toast(`"${newRoleName.trim()}" 직위 추가됨 (저장 필요)`, 'info')
  }

  const removeRole = (roleName: string) => {
    if (!confirm(`"${roleName}" 직위를 삭제하시겠습니까?`)) return
    setRoleDisplay((prev) => {
      const next = { ...prev }
      delete next[roleName]
      return next
    })
  }

  const displayRoles = [...new Set([...sortedRoleNames, ...Object.keys(roleDisplay)])]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5 mb-1">
          <Palette size={14} className="text-indigo-500" />
          직위 이모지 / 색상
        </h3>
        <p className="text-[8px] text-gray-400 mb-3">각 직위별 이모지, 뱃지 색상, 행 배경색을 설정합니다</p>

        <div className="space-y-1.5">
          {displayRoles.map((rName) => {
            const rd = roleDisplay[rName] || {}
            const tc = rd.textColor || '#374151'
            const bc = rd.bgColor || '#f3f4f6'
            return (
              <div
                key={rName}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100"
              >
                <input
                  className="w-9 text-center bg-white border border-gray-200 rounded-lg px-1 py-1 text-sm outline-none"
                  value={rd.emoji || ''}
                  onChange={(e) => updateRole(rName, 'emoji', e.target.value)}
                  placeholder="🎯"
                />
                <span
                  className="text-sm font-bold min-w-[70px]"
                  style={{
                    color: tc,
                    background: bc !== '#f3f4f6' ? bc : undefined,
                    padding: bc !== '#f3f4f6' ? '2px 10px' : undefined,
                    borderRadius: bc !== '#f3f4f6' ? '6px' : undefined,
                  }}
                >
                  {rName}
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[9px] text-gray-400 font-bold">글자</span>
                  <input
                    type="color"
                    className="w-6 h-6 border border-gray-200 rounded cursor-pointer p-0"
                    value={tc}
                    onChange={(e) => updateRole(rName, 'textColor', e.target.value)}
                  />
                  <span className="text-[9px] text-gray-400 font-bold">배경</span>
                  <input
                    type="color"
                    className="w-6 h-6 border border-gray-200 rounded cursor-pointer p-0"
                    value={bc}
                    onChange={(e) => updateRole(rName, 'bgColor', e.target.value)}
                  />
                  <span className="text-[9px] text-gray-400 font-bold">행</span>
                  <input
                    type="color"
                    className="w-6 h-6 border border-gray-200 rounded cursor-pointer p-0"
                    value={rd.rowColor || '#ffffff'}
                    onChange={(e) => updateRole(rName, 'rowColor', e.target.value)}
                  />
                  <button
                    onClick={() => removeRole(rName)}
                    className="text-gray-200 hover:text-red-400 text-[10px] ml-2"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add new role */}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            placeholder="새 직위명"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addNewRole() }}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-300 w-40"
          />
          <button
            onClick={addNewRole}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1"
          >
            <Plus size={12} /> 직위 추가
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-indigo-600 flex items-center gap-1.5"
      >
        <Save size={14} /> 디자인 설정 저장
      </button>
    </div>
  )
}
