import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { r2Upload, r2List } from '@/lib/r2'
import { useToast } from '@/components/ui/Toast'
import {
  Save, Plus, Trash2, Shield, Palette, Users, Medal, Image,
  Check, X, Upload, Target, ShieldOff, Code, ChevronUp, ChevronDown,
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

interface AutoRankRule {
  topN?: number | ''
  bottomN?: number | ''
  min?: number | ''
  rank: string
  note?: string
}

/* ─── sub-tab type ─── */
type SettingsTab = 'guilds' | 'roles' | 'autorules' | 'exempt' | 'admin' | 'json'

/* ─── shared styles ─── */
const cardClass = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-6'
const inputClass = 'bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300 transition-colors'
const btnPrimary = 'bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-600 transition-colors flex items-center gap-1.5'
const btnSecondary = 'text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1 transition-colors'

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
    { key: 'autorules', label: '자동 직위 규칙', icon: Target },
    { key: 'exempt', label: '수로 면제', icon: ShieldOff },
    { key: 'admin', label: '관리자', icon: Shield },
    { key: 'json', label: 'JSON 편집', icon: Code },
  ]

  return (
    <div className="fade-in space-y-5">
      <h2 className="text-xl font-black text-gray-800 tracking-tight">설정</h2>

      {/* Tab navigation */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0',
                activeTab === t.key
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              <Icon size={14} />
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

      {/* Auto-Rank Rules */}
      {activeTab === 'autorules' && (
        <AutoRankRulesSettings configRow={configRow} saveConfig={saveConfig} toast={toast} />
      )}

      {/* Suro Exempt */}
      {activeTab === 'exempt' && (
        <SuroExemptSettings configRow={configRow} saveConfig={saveConfig} toast={toast} />
      )}

      {/* Admin whitelist */}
      {activeTab === 'admin' && (
        <div className="space-y-4">
          <div className={cardClass}>
            <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5 mb-4">
              <Shield size={14} className="text-indigo-500" />
              관리자 허용 목록
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="email"
                placeholder="이메일 주소"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newEmail.trim()) addAdmin.mutate(newEmail.trim())
                }}
                className={cn(inputClass, 'flex-1 px-3 py-2')}
              />
              <button
                onClick={() => {
                  if (newEmail.trim()) addAdmin.mutate(newEmail.trim())
                }}
                className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} /> 추가
              </button>
            </div>
            <div className="space-y-1.5">
              {admins.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100"
                >
                  <span className="text-sm font-bold text-gray-800 flex-1">{a.email}</span>
                  <span className="text-xs font-bold text-gray-400">{a.name || ''}</span>
                  <span
                    className={cn(
                      'text-xs font-bold px-1.5 py-0.5 rounded-md',
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
                        className="p-1 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors"
                        title="승인"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => updateAdminStatus.mutate({ id: a.id, status: 'rejected' })}
                        className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
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
                    className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {admins.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">등록된 관리자가 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* JSON editor */}
      {activeTab === 'json' && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5">
              <Code size={14} className="text-indigo-500" />
              사이트 설정 (JSON)
            </h3>
            <button
              onClick={() => saveConfig.mutate(undefined)}
              className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
            >
              <Save size={14} /> 저장
            </button>
          </div>
          <textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            rows={24}
            className={cn(inputClass, 'w-full px-4 py-3 text-sm font-mono resize-none leading-relaxed')}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Guild Management Sub-section
   ═══════════════════════════════════════════════════════════════════ */
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

  const [showLogoGallery, setShowLogoGallery] = useState(false)

  const saveLogoToConfig = (url: string) => {
    const newCfg = { ...cfg, guilds, piecePrice: piecePriceStr ? Number(piecePriceStr) : undefined, guildLogo: url || null }
    saveConfig.mutate(newCfg)
  }

  const handleLogoUpload = async (file: File) => {
    setUploading(true)
    try {
      const safeName = `guild-logo-${Date.now()}.${file.name.split('.').pop()}`
      const url = await r2Upload('guild-assets', safeName, file)
      setLogoUrl(url)
      saveLogoToConfig(url)
      toast('로고 업로드 및 저장 완료', 'success')
    } catch {
      toast('업로드 실패', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleLogoSelect = (url: string) => {
    setLogoUrl(url)
    saveLogoToConfig(url)
    setShowLogoGallery(false)
    toast('로고 변경 및 저장 완료', 'success')
  }

  const handleLogoRemove = () => {
    setLogoUrl('')
    saveLogoToConfig('')
    toast('로고 제거 완료', 'success')
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
      <div className={cardClass}>
        <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5 mb-3">
          <Image size={14} className="text-indigo-500" />
          길드 로고
        </h3>
        <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="w-16 h-16 rounded-2xl shadow-md overflow-hidden bg-gradient-to-tr from-indigo-400 to-purple-400 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {logoUrl ? (
              <img src={logoUrl} className="w-full h-full object-cover" alt="logo" />
            ) : (
              '뚠'
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-2">PNG/JPG 이미지 업로드 (권장 200x200)</p>
            <div className="flex gap-2 flex-wrap">
              <label className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-indigo-600 transition-colors flex items-center gap-1">
                <Upload size={10} />
                {uploading ? '업로드 중...' : '새 이미지 업로드'}
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
                onClick={() => setShowLogoGallery(true)}
                className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-bold hover:bg-purple-600 transition-colors flex items-center gap-1"
              >
                <Image size={10} />
                R2 갤러리에서 선택
              </button>
              <button
                onClick={handleLogoRemove}
                className="px-3 py-1.5 bg-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-300 transition-colors"
              >
                제거
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Logo Gallery Modal */}
      {showLogoGallery && (
        <LogoGalleryModal
          onSelect={handleLogoSelect}
          onClose={() => setShowLogoGallery(false)}
        />
      )}

      {/* Piece price */}
      <div className={cardClass}>
        <h3 className="font-bold text-base text-gray-700 mb-3">조각 가격 설정</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={piecePriceStr}
            onChange={(e) => setPiecePriceStr(e.target.value)}
            placeholder="조각 가격 (메소)"
            className={cn(inputClass, 'w-48 px-3 py-2')}
          />
          <span className="text-xs text-gray-400 font-bold">메소 / 조각</span>
        </div>
      </div>

      {/* Guild cards */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5">
            <Users size={14} className="text-indigo-500" />
            길드 목록
          </h3>
          <button onClick={addGuild} className={cn(btnSecondary, 'text-xs')}>
            <Plus size={12} /> 길드 추가
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {guilds.map((g, gi) => (
            <div
              key={gi}
              className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shadow-sm"
                  style={{ background: (g.color || '#9ca3af') + '20' }}
                >
                  {g.icon || '⭐'}
                </div>
                <span className="font-bold text-gray-800 text-xs">{g.name}</span>
                <button
                  onClick={() => removeGuild(gi)}
                  className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2 text-sm">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">이름</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-300 transition-colors"
                    value={g.name}
                    onChange={(e) => updateGuild(gi, 'name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">타입</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-300 transition-colors"
                    value={g.type || ''}
                    onChange={(e) => updateGuild(gi, 'type', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">색상</label>
                  <input
                    type="color"
                    className="w-7 h-7 rounded border-0 cursor-pointer"
                    value={g.color || '#9ca3af'}
                    onChange={(e) => updateGuild(gi, 'color', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">아이콘</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="w-10 text-center bg-white border border-gray-200 rounded-lg py-1 text-sm outline-none"
                      value={g.icon || ''}
                      onChange={(e) => updateGuild(gi, 'icon', e.target.value)}
                    />
                    <details className="relative">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-indigo-500 transition-colors">
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
                  <label className="text-xs text-gray-400 block mb-0.5">인원</label>
                  <input
                    type="number"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-300 transition-colors"
                    value={g.max || 200}
                    onChange={(e) => updateGuild(gi, 'max', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        {guilds.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">길드를 추가해주세요</p>
        )}
      </div>

      <button onClick={handleSave} className={cn(btnPrimary, 'px-6 py-3')}>
        <Save size={14} /> 길드 설정 저장
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Role Display Settings (enhanced with priority)
   ═══════════════════════════════════════════════════════════════════ */
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
  const existingDisplay = (cfg.roleDisplay as Record<string, RoleDisplay>) || {}
  const existingPriority = (cfg.rolePriority as Record<string, number>) || {}

  const allRoleNames = [...new Set(Object.values(ranks).flat())]

  const [roleDisplay, setRoleDisplay] = useState<Record<string, RoleDisplay>>({})
  const [rolePriority, setRolePriority] = useState<Record<string, number>>({})
  const [newRoleName, setNewRoleName] = useState('')

  useEffect(() => {
    setRoleDisplay(existingDisplay)
    setRolePriority(existingPriority)
  }, [configRow])

  const getSortedRoles = () => {
    const all = [...new Set([...allRoleNames, ...Object.keys(roleDisplay)])]
    return all.sort((a, b) => {
      const pa = rolePriority[a] !== undefined ? rolePriority[a] : 999 + all.indexOf(a)
      const pb = rolePriority[b] !== undefined ? rolePriority[b] : 999 + all.indexOf(b)
      return pa - pb
    })
  }

  const displayRoles = getSortedRoles()

  const updateRole = (roleName: string, field: keyof RoleDisplay, value: string) => {
    setRoleDisplay((prev) => ({
      ...prev,
      [roleName]: { ...prev[roleName], [field]: value },
    }))
  }

  const moveRole = (roleName: string, direction: 'up' | 'down') => {
    const sorted = getSortedRoles()
    const idx = sorted.indexOf(roleName)
    if (direction === 'up' && idx <= 0) return
    if (direction === 'down' && idx >= sorted.length - 1) return

    const newPriority: Record<string, number> = {}
    const reordered = [...sorted]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

    reordered.forEach((name, i) => {
      newPriority[name] = i
    })
    setRolePriority(newPriority)
  }

  const handleSave = () => {
    const newCfg = { ...cfg, roleDisplay, rolePriority }
    saveConfig.mutate(newCfg)
  }

  const addNewRole = () => {
    if (!newRoleName.trim()) return
    setRoleDisplay((prev) => ({
      ...prev,
      [newRoleName.trim()]: { emoji: '', textColor: '#374151', bgColor: '#f3f4f6' },
    }))
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
    setRolePriority((prev) => {
      const next = { ...prev }
      delete next[roleName]
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Role styling */}
      <div className={cardClass}>
        <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5 mb-1">
          <Palette size={14} className="text-indigo-500" />
          직위 이모지 / 색상
        </h3>
        <p className="text-xs text-gray-400 mb-4">각 직위별 이모지, 뱃지 색상, 행 배경색을 설정합니다. 화살표로 우선순위를 조정할 수 있습니다.</p>

        <div className="space-y-2.5">
          {displayRoles.map((rName, rIdx) => {
            const rd = roleDisplay[rName] || {}
            const tc = rd.textColor || '#374151'
            const bc = rd.bgColor || '#f3f4f6'
            return (
              <div
                key={rName}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100 hover:border-gray-200 transition-colors group"
              >
                {/* Priority controls */}
                <div className="flex flex-col gap-0 shrink-0">
                  <button
                    onClick={() => moveRole(rName, 'up')}
                    disabled={rIdx === 0}
                    className={cn(
                      'p-0.5 rounded transition-colors',
                      rIdx === 0
                        ? 'text-gray-200 cursor-not-allowed'
                        : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'
                    )}
                  >
                    <ChevronUp size={11} />
                  </button>
                  <button
                    onClick={() => moveRole(rName, 'down')}
                    disabled={rIdx === displayRoles.length - 1}
                    className={cn(
                      'p-0.5 rounded transition-colors',
                      rIdx === displayRoles.length - 1
                        ? 'text-gray-200 cursor-not-allowed'
                        : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'
                    )}
                  >
                    <ChevronDown size={11} />
                  </button>
                </div>

                {/* Priority number */}
                <span className="text-xs text-gray-300 font-mono w-4 text-center shrink-0">{rIdx + 1}</span>

                {/* Emoji input */}
                <input
                  className="w-9 text-center bg-white border border-gray-200 rounded-lg px-1 py-1 text-sm outline-none focus:border-indigo-300 transition-colors"
                  value={rd.emoji || ''}
                  onChange={(e) => updateRole(rName, 'emoji', e.target.value)}
                  placeholder="🎯"
                />

                {/* Role name + badge preview */}
                <div className="min-w-[90px] flex items-center gap-1.5">
                  <span
                    className="text-sm font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1"
                    style={{
                      color: tc,
                      background: bc,
                    }}
                  >
                    {rd.emoji && <span>{rd.emoji}</span>}
                    {rName}
                  </span>
                </div>

                {/* Color controls */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-gray-400 font-bold">글자</span>
                  <input
                    type="color"
                    className="w-7 h-7 border border-gray-200 rounded cursor-pointer p-0"
                    value={tc}
                    onChange={(e) => updateRole(rName, 'textColor', e.target.value)}
                  />
                  <span className="text-xs text-gray-400 font-bold">배경</span>
                  <input
                    type="color"
                    className="w-7 h-7 border border-gray-200 rounded cursor-pointer p-0"
                    value={bc}
                    onChange={(e) => updateRole(rName, 'bgColor', e.target.value)}
                  />
                  <span className="text-xs text-gray-400 font-bold">행</span>
                  <input
                    type="color"
                    className="w-7 h-7 border border-gray-200 rounded cursor-pointer p-0"
                    value={rd.rowColor || '#ffffff'}
                    onChange={(e) => updateRole(rName, 'rowColor', e.target.value)}
                  />
                  <button
                    onClick={() => removeRole(rName)}
                    className="text-gray-200 hover:text-red-400 transition-colors ml-2"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add new role */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          <input
            type="text"
            placeholder="새 직위명"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addNewRole() }}
            className={cn(inputClass, 'px-3 py-1.5 w-40')}
          />
          <button onClick={addNewRole} className={cn(btnSecondary, 'text-xs')}>
            <Plus size={12} /> 직위 추가
          </button>
        </div>
      </div>

      <button onClick={handleSave} className={cn(btnPrimary, 'px-6 py-3')}>
        <Save size={14} /> 디자인 설정 저장
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Auto-Rank Rules Settings
   ═══════════════════════════════════════════════════════════════════ */
function AutoRankRulesSettings({
  configRow,
  saveConfig,
  toast: _toast,
}: {
  configRow: Record<string, unknown> | undefined
  saveConfig: { mutate: (cfg?: Record<string, unknown>) => void }
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const cfg = configRow || {}
  const guilds = (cfg.guilds as GuildConfig[]) || []
  const existingRules = (cfg.autoRankRules as Record<string, AutoRankRule[]>) || {}
  const existingExempt = (cfg.autoRankExemptRoles as Record<string, string[]>) || {}
  const allRanks = (cfg.ranks as Record<string, string[]>) || {}
  const allRoleNames = [...new Set(Object.values(allRanks).flat())]

  const [selectedGuild, setSelectedGuild] = useState<string>('')
  const [rules, setRules] = useState<Record<string, AutoRankRule[]>>({})
  const [exemptRoles, setExemptRoles] = useState<Record<string, string[]>>({})

  useEffect(() => {
    setRules(existingRules)
    setExemptRoles(existingExempt)
    if (!selectedGuild && guilds.length > 0) {
      setSelectedGuild(guilds[0].name)
    }
  }, [configRow])

  // Keep selectedGuild in sync if guilds change
  useEffect(() => {
    if (guilds.length > 0 && !selectedGuild) {
      setSelectedGuild(guilds[0].name)
    }
  }, [guilds, selectedGuild])

  const currentRules = rules[selectedGuild] || []

  const setCurrentRules = (newRules: AutoRankRule[]) => {
    setRules((prev) => ({ ...prev, [selectedGuild]: newRules }))
  }

  const addRule = () => {
    setCurrentRules([...currentRules, { topN: '', bottomN: '', min: '', rank: '', note: '' }])
  }

  const removeRule = (idx: number) => {
    setCurrentRules(currentRules.filter((_, i) => i !== idx))
  }

  const updateRule = (idx: number, field: keyof AutoRankRule, value: string | number) => {
    setCurrentRules(
      currentRules.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    )
  }

  const handleSave = () => {
    // Clean up empty number fields before saving
    const cleaned: Record<string, AutoRankRule[]> = {}
    for (const [guild, guildRules] of Object.entries(rules)) {
      cleaned[guild] = guildRules.map((r) => ({
        ...r,
        topN: r.topN !== '' && r.topN !== undefined ? Number(r.topN) : undefined,
        bottomN: r.bottomN !== '' && r.bottomN !== undefined ? Number(r.bottomN) : undefined,
        min: r.min !== '' && r.min !== undefined ? Number(r.min) : undefined,
      })).filter((r) => r.rank.trim() !== '') as AutoRankRule[]
    }
    const newCfg = { ...cfg, autoRankRules: cleaned, autoRankExemptRoles: exemptRoles }
    saveConfig.mutate(newCfg)
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5 mb-1">
          <Target size={14} className="text-indigo-500" />
          자동 직위 규칙
        </h3>
        <p className="text-xs text-gray-400 mb-4">수로 점수 기반으로 자동 직위를 부여하는 규칙을 길드별로 설정합니다</p>

        {/* Guild selector */}
        {guilds.length > 0 ? (
          <>
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-0.5">
              {guilds.map((g) => (
                <button
                  key={g.name}
                  onClick={() => setSelectedGuild(g.name)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0',
                    selectedGuild === g.name
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-transparent'
                  )}
                >
                  <span>{g.icon || '⭐'}</span>
                  {g.name}
                </button>
              ))}
            </div>

            {/* Rules - Card layout */}
            <div className="space-y-3">
              {currentRules.map((rule, ri) => (
                <div
                  key={ri}
                  className="bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:border-indigo-200 transition-colors relative group"
                >
                  {/* Delete button */}
                  <button
                    onClick={() => removeRule(ri)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-50 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>

                  {/* Top row: rank name + badge */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-sm">
                      {ri + 1}
                    </div>
                    <input
                      type="text"
                      placeholder="직위명을 입력하세요"
                      value={rule.rank}
                      onChange={(e) => updateRule(ri, 'rank', e.target.value)}
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-base font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>

                  {/* Condition fields - 3 column grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 font-bold mb-1.5 block">Top N (상위 N명)</label>
                      <input
                        type="number"
                        placeholder="미사용"
                        value={rule.topN ?? ''}
                        onChange={(e) => updateRule(ri, 'topN', e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-bold mb-1.5 block">Bottom N (하위 N명)</label>
                      <input
                        type="number"
                        placeholder="미사용"
                        value={rule.bottomN ?? ''}
                        onChange={(e) => updateRule(ri, 'bottomN', e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-bold mb-1.5 block">최소 점수</label>
                      <input
                        type="number"
                        placeholder="미사용"
                        value={rule.min ?? ''}
                        onChange={(e) => updateRule(ri, 'min', e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                  </div>

                  {/* Note field */}
                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="메모 (선택사항)"
                      value={rule.note || ''}
                      onChange={(e) => updateRule(ri, 'note', e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>

            {currentRules.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-6">규칙이 없습니다. 아래 버튼으로 추가하세요.</p>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <button onClick={addRule} className={cn(btnSecondary, 'text-xs')}>
                <Plus size={12} /> 규칙 추가
              </button>
            </div>

            {/* Exempt roles per guild */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h4 className="font-bold text-sm text-gray-700 mb-2 flex items-center gap-1.5">
                <ShieldOff size={14} className="text-amber-500" />
                자동산정 면제 직위 ({selectedGuild})
              </h4>
              <p className="text-xs text-gray-400 mb-3">체크된 직위는 자동 직위 산정에서 제외됩니다 (간부 등)</p>
              <div className="flex flex-wrap gap-2">
                {allRoleNames.length > 0 ? allRoleNames.map((rn) => {
                  const checked = (exemptRoles[selectedGuild] || []).includes(rn)
                  return (
                    <label
                      key={rn}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-bold',
                        checked
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const current = exemptRoles[selectedGuild] || []
                          const next = e.target.checked
                            ? [...current, rn]
                            : current.filter((r) => r !== rn)
                          setExemptRoles((prev) => ({ ...prev, [selectedGuild]: next }))
                        }}
                        className="w-4 h-4 rounded accent-amber-500"
                      />
                      {rn}
                    </label>
                  )
                }) : (
                  <p className="text-xs text-gray-300">직위 데이터가 없습니다</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-center text-xs text-gray-400 py-8">길드를 먼저 등록해주세요 (길드 관리 탭)</p>
        )}
      </div>

      {guilds.length > 0 && (
        <button onClick={handleSave} className={cn(btnPrimary, 'px-6 py-3')}>
          <Save size={14} /> 자동 직위 규칙 저장
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Suro Exempt Settings
   ═══════════════════════════════════════════════════════════════════ */
function SuroExemptSettings({
  configRow,
  saveConfig,
  toast: _toast,
}: {
  configRow: Record<string, unknown> | undefined
  saveConfig: { mutate: (cfg?: Record<string, unknown>) => void }
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const cfg = configRow || {}
  const ranks = (cfg.ranks as Record<string, string[]>) || {}
  const existingExempt = (cfg.suroExempt as string[]) || []

  const allRoleNames = [...new Set(Object.values(ranks).flat())]

  const [exempt, setExempt] = useState<string[]>([])

  useEffect(() => {
    setExempt(existingExempt)
  }, [configRow])

  const toggleExempt = (roleName: string) => {
    setExempt((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    )
  }

  const handleSave = () => {
    const newCfg = { ...cfg, suroExempt: exempt }
    saveConfig.mutate(newCfg)
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h3 className="font-bold text-base text-gray-700 flex items-center gap-1.5 mb-1">
          <ShieldOff size={14} className="text-indigo-500" />
          수로 면제 직위
        </h3>
        <p className="text-xs text-gray-400 mb-4">수로 미참여 시에도 불이익이 없는 직위를 선택합니다</p>

        {allRoleNames.length > 0 ? (
          <div className="space-y-1.5">
            {allRoleNames.map((roleName) => {
              const isExempt = exempt.includes(roleName)
              const roleDisplay = (cfg.roleDisplay as Record<string, RoleDisplay>) || {}
              const rd = roleDisplay[roleName] || {}
              return (
                <label
                  key={roleName}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all',
                    isExempt
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isExempt}
                    onChange={() => toggleExempt(roleName)}
                    className="w-4 h-4 rounded-md border-gray-300 text-indigo-500 focus:ring-indigo-400 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    {rd.emoji && <span className="text-sm">{rd.emoji}</span>}
                    <span
                      className="text-xs font-bold"
                      style={{ color: rd.textColor || '#374151' }}
                    >
                      {roleName}
                    </span>
                  </span>
                  {isExempt && (
                    <span className="ml-auto text-xs font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-md">
                      면제
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        ) : (
          <p className="text-center text-xs text-gray-400 py-8">직위 데이터가 없습니다. 직위 디자인 탭에서 직위를 추가하세요.</p>
        )}
      </div>

      {allRoleNames.length > 0 && (
        <button onClick={handleSave} className={cn(btnPrimary, 'px-6 py-3')}>
          <Save size={14} /> 수로 면제 설정 저장
        </button>
      )}
    </div>
  )
}

/* ═══ Logo Gallery Modal ═══ */
function LogoGalleryModal({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const [bucket, setBucket] = useState<'guide-images' | 'guild-assets'>('guide-images')

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['r2-logo-gallery', bucket],
    queryFn: async () => {
      try {
        return (await r2List(bucket)) as { name: string; size: number; created_at: string }[]
      } catch {
        return []
      }
    },
  })

  const R2_PUBLIC_URL =
    import.meta.env.VITE_R2_PUBLIC_URL ?? 'https://pub-ee3a7d1dfe0a442b96336f0c81289a46.r2.dev'

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm text-gray-800">R2 이미지 갤러리</h3>
            <div className="flex gap-1">
              {(['guide-images', 'guild-assets'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBucket(b)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                    bucket === b
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-center text-gray-400 text-xs font-bold p-8">로딩 중...</p>
          ) : images.length === 0 ? (
            <p className="text-center text-gray-300 text-xs font-bold p-8">
              업로드된 이미지가 없습니다
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.map((img) => {
                const url = `${R2_PUBLIC_URL}/${bucket}/${img.name}`
                return (
                  <button
                    key={img.name}
                    onClick={() => onSelect(url)}
                    className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden hover:ring-2 hover:ring-indigo-400 transition-all group"
                  >
                    <img
                      src={url}
                      alt={img.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold bg-black/50 px-2 py-1 rounded-lg">
                        선택
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
