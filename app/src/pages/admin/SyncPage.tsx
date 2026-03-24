import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useMembers } from '@/hooks/useMembers'
import { useSiteConfig } from '@/hooks/useSiteConfig'
import {
  Download, Upload, FileSpreadsheet, Key, RefreshCw, UserPlus,
  UserMinus, ArrowRightLeft, Pencil, Search, Loader2,
  Check, Copy, AlertTriangle, Info, Wand2,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getNexonApiKey, setNexonApiKey, getSyncWorld, setSyncWorld,
  getGuildId, getGuildBasic, getCharInfo, guessMainChar,
  MAPLE_WORLDS, MAPLE_JOBS, delay,
} from '@/lib/nexon-api'
import type { Member } from '@/types/member'

// ── Backup / Restore constants ────────────────────────────────

const TABLES = [
  'members', 'suro_periods', 'suro_scores', 'bail_history',
  'penalty_history', 'operation_history', 'events', 'board_posts',
  'buddy_teams', 'promotion_applicants', 'promotion_history',
  'member_records', 'guide_pages', 'site_config',
]

// ── Default guild ranks (fallback) ───────────────────────────

const baseRanks = ['마카롱', '다쿠아즈']
const DEFAULT_GUILD_RANKS: Record<string, string[]> = {
  '뚠카롱': [...baseRanks, '크라운', '파르페', '티라미슈', '크로칸슈', '롤케이크', '팬케이크', '와플', '스콘', '반죽(휴면)'],
  '뚱카롱': [...baseRanks, '뚠케이크', '뚠브레드', '아인슈페너', '부팬케이크', '수플레', '뚠스콘', '부케이크', '반죽(휴면)'],
  '밤카롱': [...baseRanks, '부팬케이크', '부케이크', '아인슈페너', '반죽(휴면)'],
  '별카롱': [...baseRanks, '부팬케이크', '부케이크', '아인슈페너', '반죽(휴면)'],
  '달카롱': [...baseRanks, '부팬케이크', '부케이크', '아인슈페너', '반죽(휴면)'],
  '꿀카롱': [...baseRanks, '부팬케이크', '부케이크', '아인슈페너', '반죽(휴면)'],
}

const DEFAULT_ROLE_FOR_GUILD: Record<string, string> = {
  '뚠카롱': '팬케이크',
  '뚱카롱': '뚠케이크',
}

// ── Types ─────────────────────────────────────────────────────

interface NewMember {
  name: string
  guild: string
  selectedGuild: string
  selectedRole: string
  selectedClass: string
  selectedLevel: number
  isMain: boolean
  mainCharName: string
  guessedMain: string | null
  guessStatus: 'idle' | 'loading' | 'done' | 'error'
  promoWish: boolean
}

interface GoneMember {
  name: string
  guild: string
  id: string
  role: string
  class: string
  isMain: boolean
  mainCharName: string
  joinDate: string
  checked: boolean
}

interface MovedMember {
  name: string
  fromGuild: string
  toGuild: string
  id: string
  checked: boolean
}

interface NickChangeSuspect {
  oldName: string
  newName: string
  guild: string
  id: string
  class: string
  level: number
  checked: boolean
}

interface SyncResult {
  newMembers: NewMember[]
  goneMembers: GoneMember[]
  movedMembers: MovedMember[]
  nickChangeSuspects: NickChangeSuspect[]
  guildStats: { name: string; apiCount: number; dbCount: number }[]
  totalApiCount: number
  errors: string[]
}

interface DupGroup {
  name: string
  members: DupMember[]
  keepIndex: number
}

interface DupMember {
  id: number
  name: string
  guild: string
  role: string
  class: string
  is_main: boolean
  main_char_name: string
  join_date: string
  editName: string
  editGuild: string
  editRole: string
  editClass: string
  editIsMain: boolean
  editMainChar: string
}

interface MismatchResult {
  member: Member
  apiClass: string
  apiLevel: number
  classDiff: boolean
  levelDiff: boolean
  selectedClass: string
  selectedLevel: number
  checked: boolean
}

// ── Utilities ─────────────────────────────────────────────────

function getKSTDateStr(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

async function fetchAllRows(table: string) {
  const pageSize = 1000
  let all: unknown[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toCsv(data: unknown[]): string {
  if (data.length === 0) return ''
  const headers = Object.keys(data[0] as Record<string, unknown>)
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = data.map((row) =>
    headers.map((h) => escape((row as Record<string, unknown>)[h])).join(','),
  )
  return [headers.join(','), ...rows].join('\n')
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function SyncPage() {
  const toast = useToast((s) => s.show)
  const queryClient = useQueryClient()
  const { data: members = [] } = useMembers()
  const { data: siteConfig } = useSiteConfig()

  // ── Tabs ─────
  const [activeTab, setActiveTab] = useState<'backup' | 'sync'>('sync')

  // ── Backup state ─────
  const [backupLoading, setBackupLoading] = useState(false)
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set(TABLES))

  // ── Nexon API state ─────
  const [apiKeyInput, setApiKeyInput] = useState(getNexonApiKey())
  const [worldSelect, setWorldSelect] = useState(getSyncWorld())
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncProgress, setSyncProgress] = useState('')

  // ── New members state (for editable rows) ─────
  const [newMembers, setNewMembers] = useState<NewMember[]>([])
  const [newMembersSelectAll, setNewMembersSelectAll] = useState(true)
  const [newChecked, setNewChecked] = useState<Set<number>>(new Set())
  const [fetchInfoProgress, setFetchInfoProgress] = useState('')
  const [fetchInfoLoading, setFetchInfoLoading] = useState(false)
  const [guessLoading, setGuessLoading] = useState(false)
  const [guessProgress, setGuessProgress] = useState('')

  // ── Gone members ─────
  const [goneMembers, setGoneMembers] = useState<GoneMember[]>([])
  const [goneLoading, setGoneLoading] = useState(false)

  // ── Moved members ─────
  const [movedMembers, setMovedMembers] = useState<MovedMember[]>([])
  const [movedLoading, setMovedLoading] = useState(false)

  // ── Nick change suspects ─────
  const [nickSuspects, setNickSuspects] = useState<NickChangeSuspect[]>([])
  const [nickLoading, setNickLoading] = useState(false)

  // ── Duplicate check ─────
  const [dupLoading, setDupLoading] = useState(false)
  const [dupGroups, setDupGroups] = useState<DupGroup[] | null>(null)
  const [dupNoResult, setDupNoResult] = useState(false)

  // ── Mismatch check ─────
  const [mmGuild, setMmGuild] = useState('')
  const [mmLoading, setMmLoading] = useState(false)
  const [mmResults, setMmResults] = useState<MismatchResult[] | null>(null)
  const [mmProgress, setMmProgress] = useState('')
  const [mmApplyLoading, setMmApplyLoading] = useState(false)

  // ── Sync add/remove loading ─────
  const [addNewLoading, setAddNewLoading] = useState(false)

  // track if mismatch UI should show after dup check
  const [showMismatchAfterDup, setShowMismatchAfterDup] = useState(false)

  const guilds = siteConfig?.guilds.map((g) => g.name) || ['뚠카롱', '뚱카롱', '밤카롱', '별카롱', '달카롱', '꿀카롱']

  // load guild ranks from site_config raw
  const getGuildRanks = useCallback((guildName: string): string[] => {
    // Try to get from site config
    const ranks = (siteConfig as unknown as { ranks?: Record<string, string[]> })?.ranks
    if (ranks && ranks[guildName]) return ranks[guildName]
    return DEFAULT_GUILD_RANKS[guildName] || DEFAULT_GUILD_RANKS['뚠카롱'] || []
  }, [siteConfig])

  const getDefaultRole = (guildName: string): string => {
    return DEFAULT_ROLE_FOR_GUILD[guildName] || '부팬케이크'
  }

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: ['members'] })

  // ═══════════════════════════════════════════════════════════
  // BACKUP HANDLERS
  // ═══════════════════════════════════════════════════════════

  const toggleTable = (table: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(table)) next.delete(table)
      else next.add(table)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedTables.size === TABLES.length) setSelectedTables(new Set())
    else setSelectedTables(new Set(TABLES))
  }

  const handleExportJson = async () => {
    setBackupLoading(true)
    try {
      const tables = TABLES.filter((t) => selectedTables.has(t))
      const backup: Record<string, unknown[]> = {}
      for (const t of tables) {
        try { backup[t] = await fetchAllRows(t) } catch { backup[t] = [] }
      }
      downloadFile(JSON.stringify(backup, null, 2), `guild-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
      toast(`백업 완료! ${tables.length}개 테이블 (JSON)`, 'success')
    } catch { toast('백업 실패', 'error') } finally { setBackupLoading(false) }
  }

  const handleExportCsv = async () => {
    setBackupLoading(true)
    try {
      const tables = TABLES.filter((t) => selectedTables.has(t))
      for (const t of tables) {
        try {
          const data = await fetchAllRows(t)
          if (data.length > 0) downloadFile('\uFEFF' + toCsv(data), `${t}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')
        } catch { /* skip */ }
      }
      toast(`CSV 내보내기 완료! ${tables.length}개 테이블`, 'success')
    } catch { toast('CSV 내보내기 실패', 'error') } finally { setBackupLoading(false) }
  }

  const handleImport = async (file: File) => {
    if (!confirm('기존 데이터를 덮어씁니다. 계속하시겠습니까?')) return
    setBackupLoading(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Record<string, unknown[]>
      let count = 0
      for (const [table, rows] of Object.entries(data)) {
        if (!TABLES.includes(table) || !Array.isArray(rows) || rows.length === 0) continue
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500)
          const { error } = await supabase.from(table).upsert(batch as Record<string, unknown>[])
          if (error) console.warn(`${table} upsert error:`, error.message)
        }
        count++
      }
      toast(`복원 완료! ${count}개 테이블`, 'success')
    } catch { toast('복원 실패', 'error') } finally { setBackupLoading(false) }
  }

  // ═══════════════════════════════════════════════════════════
  // NEXON API SYNC - MAIN SYNC FUNCTION
  // ═══════════════════════════════════════════════════════════

  const runSync = async () => {
    const apiKey = getNexonApiKey()
    if (!apiKey) { toast('Nexon API Key를 먼저 입력해주세요.', 'error'); return }

    const worldName = worldSelect
    setSyncLoading(true)
    setSyncResult(null)
    setSyncProgress('Nexon API에서 길드원 정보를 불러오는 중...')

    try {
      const allApiMembers: Record<string, string[] | null> = {}
      const errors: string[] = []

      for (const g of guilds) {
        try {
          setSyncProgress(`${g} 길드 조회 중...`)
          const oguildId = await getGuildId(g, worldName)
          const basic = await getGuildBasic(oguildId)
          allApiMembers[g] = basic.guild_member || []
        } catch (e) {
          errors.push(`${g}: ${(e as Error).message}`)
          allApiMembers[g] = null
        }
      }

      const dbMembers = members
      const dbNameSet = new Set(dbMembers.map((m) => m.name))
      const dbByGuild: Record<string, Set<string>> = {}
      dbMembers.forEach((m) => {
        if (!dbByGuild[m.guild]) dbByGuild[m.guild] = new Set()
        dbByGuild[m.guild].add(m.name)
      })

      const allApiNameSet = new Set<string>()
      Object.values(allApiMembers).forEach((arr) => {
        if (arr) arr.forEach((name) => allApiNameSet.add(name))
      })

      // New members
      const rawNew: { name: string; guild: string }[] = []
      for (const [gName, apiMembers] of Object.entries(allApiMembers)) {
        if (!apiMembers) continue
        apiMembers.forEach((name) => {
          if (!dbNameSet.has(name)) rawNew.push({ name, guild: gName })
        })
      }

      // Gone members
      const rawGone: GoneMember[] = []
      dbMembers.forEach((m) => {
        const apiList = allApiMembers[m.guild]
        if (apiList && !apiList.includes(m.name) && !allApiNameSet.has(m.name)) {
          rawGone.push({
            name: m.name, guild: m.guild, id: m.id,
            role: m.role, class: m.class, isMain: m.isMain,
            mainCharName: m.mainCharName, joinDate: m.joinDate,
            checked: true,
          })
        }
      })

      // Moved members
      const rawMoved: MovedMember[] = []
      dbMembers.forEach((m) => {
        for (const [gName, apiMembers] of Object.entries(allApiMembers)) {
          if (!apiMembers) continue
          if (gName !== m.guild && apiMembers.includes(m.name)) {
            rawMoved.push({ name: m.name, fromGuild: m.guild, toGuild: gName, id: m.id, checked: true })
          }
        }
      })

      // Nick change detection
      const rawNickSuspects: NickChangeSuspect[] = []
      const filteredNew = [...rawNew]
      const filteredGone = [...rawGone]

      if (rawGone.length > 0 && rawNew.length > 0) {
        setSyncProgress('닉네임 변경 감지 중...')
        const newMemberInfos: { name: string; guild: string; apiClass: string; apiLevel: number }[] = []
        for (const nm of rawNew) {
          try {
            const info = await getCharInfo(nm.name)
            newMemberInfos.push({ ...nm, apiClass: info?.class || '', apiLevel: info?.level || 0 })
          } catch {
            newMemberInfos.push({ ...nm, apiClass: '', apiLevel: 0 })
          }
          await delay(80)
        }

        const usedGone = new Set<string>()
        const usedNew = new Set<number>()
        for (const gm of rawGone) {
          const dbInfo = dbMembers.find((d) => d.id === gm.id)
          if (!dbInfo || !dbInfo.class) continue
          for (let ni = 0; ni < newMemberInfos.length; ni++) {
            if (usedNew.has(ni)) continue
            const nm = newMemberInfos[ni]
            if (nm.guild === gm.guild && nm.apiClass && nm.apiClass === dbInfo.class) {
              rawNickSuspects.push({
                oldName: gm.name, newName: nm.name, guild: gm.guild,
                id: gm.id, class: dbInfo.class, level: nm.apiLevel, checked: true,
              })
              usedGone.add(gm.id)
              usedNew.add(ni)
              break
            }
          }
        }

        if (rawNickSuspects.length > 0) {
          const goneIds = new Set(rawNickSuspects.map((s) => s.id))
          const newNames = new Set(rawNickSuspects.map((s) => s.newName))
          filteredGone.splice(0, filteredGone.length, ...filteredGone.filter((g) => !goneIds.has(g.id)))
          filteredNew.splice(0, filteredNew.length, ...filteredNew.filter((n) => !newNames.has(n.name)))
        }
      }

      // Build NewMember rows
      const newMemberRows: NewMember[] = filteredNew.map((m) => ({
        name: m.name,
        guild: m.guild,
        selectedGuild: m.guild,
        selectedRole: getDefaultRole(m.guild),
        selectedClass: '',
        selectedLevel: 0,
        isMain: true,
        mainCharName: '',
        guessedMain: null,
        guessStatus: 'idle' as const,
        promoWish: false,
      }))

      // Build guild stats
      const guildStats = Object.entries(allApiMembers)
        .filter(([, v]) => v !== null)
        .map(([gn, arr]) => ({
          name: gn,
          apiCount: arr!.length,
          dbCount: (dbByGuild[gn] || new Set()).size,
        }))

      const totalApiCount = guildStats.reduce((sum, g) => sum + g.apiCount, 0)

      const result: SyncResult = {
        newMembers: newMemberRows,
        goneMembers: filteredGone,
        movedMembers: rawMoved,
        nickChangeSuspects: rawNickSuspects,
        guildStats,
        totalApiCount,
        errors,
      }

      setSyncResult(result)
      setNewMembers(newMemberRows)
      setNewChecked(new Set(newMemberRows.map((_, i) => i)))
      setNewMembersSelectAll(true)
      setGoneMembers(filteredGone)
      setMovedMembers(rawMoved)
      setNickSuspects(rawNickSuspects)

      // Auto-fetch char info for new members
      if (newMemberRows.length > 0) {
        setTimeout(() => fetchAllCharInfo(newMemberRows), 300)
      }
    } catch (e) {
      toast(`동기화 실패: ${(e as Error).message}`, 'error')
    } finally {
      setSyncLoading(false)
      setSyncProgress('')
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FETCH ALL CHAR INFO (level/class for new members)
  // ═══════════════════════════════════════════════════════════

  const fetchAllCharInfo = async (memberList?: NewMember[]) => {
    const list = memberList || newMembers
    if (list.length === 0) return
    setFetchInfoLoading(true)
    let done = 0
    let fail = 0
    const updated = [...list]

    for (let i = 0; i < updated.length; i++) {
      setFetchInfoProgress(`${i + 1}/${updated.length} 조회 중...`)
      try {
        const info = await getCharInfo(updated[i].name)
        if (info) {
          updated[i] = { ...updated[i], selectedClass: info.class, selectedLevel: info.level }
        } else { fail++ }
      } catch { fail++ }
      if (i < updated.length - 1) await delay(100)
    }
    done = updated.length - fail
    setFetchInfoProgress(`완료! ${done}명 성공, ${fail}명 실패`)
    setNewMembers(updated)
    setFetchInfoLoading(false)
  }

  // ═══════════════════════════════════════════════════════════
  // GUESS ALL MAINS (union ranking)
  // ═══════════════════════════════════════════════════════════

  const guessAllMains = async () => {
    const apiKey = getNexonApiKey()
    if (!apiKey) { toast('Nexon API Key를 먼저 입력해주세요.', 'error'); return }
    setGuessLoading(true)
    const updated = [...newMembers]
    let done = 0

    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], guessStatus: 'loading' }
      setNewMembers([...updated])
      setGuessProgress(`${done + 1}/${updated.length}`)
      try {
        const mainName = await guessMainChar(updated[i].name)
        updated[i] = { ...updated[i], guessedMain: mainName, guessStatus: 'done' }
      } catch {
        updated[i] = { ...updated[i], guessStatus: 'error' }
      }
      done++
      setNewMembers([...updated])
    }
    setGuessLoading(false)
    setGuessProgress('')
  }

  const applyGuess = (idx: number, mainName: string) => {
    setNewMembers((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], isMain: false, mainCharName: mainName }
      return next
    })
  }

  // ═══════════════════════════════════════════════════════════
  // APPLY NICK CHANGES
  // ═══════════════════════════════════════════════════════════

  const applyNickChanges = async () => {
    const selected = nickSuspects.filter((s) => s.checked)
    if (selected.length === 0) { toast('적용할 항목을 선택해주세요.', 'error'); return }
    const lines = selected.map((s) => `${s.oldName} -> ${s.newName} (${s.guild}/${s.class})`)
    if (!confirm(`닉네임 변경을 적용하시겠습니까?\n기존 수로 데이터가 모두 유지됩니다.\n\n${lines.join('\n')}`)) return

    setNickLoading(true)
    try {
      let ok = 0
      for (const s of selected) {
        const updateObj: Record<string, unknown> = { name: s.newName }
        if (s.level) updateObj.level = s.level
        const { error } = await supabase.from('members').update(updateObj).eq('id', Number(s.id))
        if (!error) {
          ok++
          await supabase.from('operation_history').insert({
            date: getKSTDateStr(), category: '닉변',
            name: s.newName, content: `닉네임 변경: ${s.oldName} -> ${s.newName} (${s.guild}/${s.class}) -- 동기화 감지`,
          })
        }
      }
      toast(`${ok}명의 닉네임이 변경되었습니다!`, 'success')
      await invalidateMembers()
      runSync()
    } catch (e) {
      toast('닉변 적용 실패: ' + (e as Error).message, 'error')
    } finally {
      setNickLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ADD NEW MEMBERS
  // ═══════════════════════════════════════════════════════════

  const syncAddNew = async () => {
    const toAdd = newMembers
      .map((m, i) => ({ ...m, idx: i }))
      .filter((m) => newChecked.has(m.idx))

    if (toAdd.length === 0) { toast('추가할 멤버를 선택해주세요.', 'error'); return }
    setAddNewLoading(true)

    try {
      const inserts = toAdd.map((m) => ({
        name: m.name,
        guild: m.selectedGuild,
        role: m.selectedRole,
        class: m.selectedClass || '',
        level: m.selectedLevel || 0,
        is_main: m.isMain !== false,
        main_char_name: m.mainCharName || '',
        join_date: getKSTDateStr(),
      }))

      const { error } = await supabase.from('members').insert(inserts)
      if (error) throw error

      await supabase.from('operation_history').insert(
        inserts.map((m) => ({
          date: getKSTDateStr(), category: '동기화-추가', name: m.name,
          content: `${m.guild} 길드에 추가됨 (${m.role}/${m.class || '미설정'}) -- API 동기화`,
        })),
      )

      toast(`${toAdd.length}명이 DB에 추가되었습니다!`, 'success')

      // Promotion applicants for 뚱카롱 promo wish
      const promoNames = toAdd.filter((m) => m.promoWish && m.selectedGuild === '뚱카롱').map((m) => m.name)
      if (promoNames.length > 0) {
        // need to re-fetch to get IDs
        await invalidateMembers()
        const { data: freshMembers } = await supabase.from('members').select('id, name, guild').in('name', promoNames)
        const promoInserts = (freshMembers || [])
          .filter((fm: { guild: string }) => fm.guild === '뚱카롱')
          .map((fm: { id: number; name: string }) => ({ member_id: fm.id, name: fm.name }))
        if (promoInserts.length > 0) {
          try {
            await supabase.from('promotion_applicants').insert(promoInserts)
            toast(`승강 희망 ${promoInserts.length}명 자동 등록!`, 'success')
          } catch { /* ignore */ }
        }
      }

      await invalidateMembers()
      runSync()
    } catch (e) {
      toast('추가 실패: ' + (e as Error).message, 'error')
    } finally {
      setAddNewLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // REMOVE GONE MEMBERS
  // ═══════════════════════════════════════════════════════════

  const syncRemoveGone = async () => {
    const selected = goneMembers.filter((m) => m.checked)
    if (selected.length === 0) { toast('삭제할 멤버를 선택해주세요.', 'error'); return }
    const detailLines = selected.map((m) => `${m.name} (${m.guild} / ${m.role || '-'} / ${m.class || '-'})`)
    if (!confirm(`정말 ${selected.length}명을 DB에서 삭제하시겠습니까?\n\n${detailLines.join('\n')}`)) return

    setGoneLoading(true)
    try {
      const ids = selected.map((m) => Number(m.id))
      const { error } = await supabase.from('members').delete().in('id', ids)
      if (error) throw error

      await supabase.from('operation_history').insert(
        selected.map((m) => ({
          date: getKSTDateStr(), category: '동기화-삭제', name: m.name,
          content: `${m.guild}/${m.role || '-'}/${m.class || '-'} -- API에서 미발견 (삭제)`,
        })),
      )

      toast(`${selected.length}명이 DB에서 삭제되었습니다.`, 'success')
      await invalidateMembers()
      runSync()
    } catch (e) {
      toast('삭제 실패: ' + (e as Error).message, 'error')
    } finally {
      setGoneLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE MOVED MEMBERS
  // ═══════════════════════════════════════════════════════════

  const syncUpdateMoved = async () => {
    const selected = movedMembers.filter((m) => m.checked)
    if (selected.length === 0) { toast('변경할 멤버를 선택해주세요.', 'error'); return }

    setMovedLoading(true)
    try {
      for (const m of selected) {
        const { error } = await supabase.from('members').update({ guild: m.toGuild }).eq('id', Number(m.id))
        if (error) throw error
      }

      await supabase.from('operation_history').insert(
        selected.map((m) => ({
          date: getKSTDateStr(), category: '동기화-이동', name: m.name,
          content: `${m.fromGuild} -> ${m.toGuild} 소속 변경 (API 동기화)`,
        })),
      )

      toast(`${selected.length}명의 소속이 변경되었습니다.`, 'success')
      await invalidateMembers()
      runSync()
    } catch (e) {
      toast('변경 실패: ' + (e as Error).message, 'error')
    } finally {
      setMovedLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // DUPLICATE CHECK
  // ═══════════════════════════════════════════════════════════

  const runDupCheck = async () => {
    setDupLoading(true)
    setDupGroups(null)
    setDupNoResult(false)
    setShowMismatchAfterDup(false)
    setMmResults(null)

    try {
      let allMembers: Record<string, unknown>[] = []
      let page = 0
      const pageSize = 1000
      while (true) {
        const { data: batch, error } = await supabase.from('members').select('*').order('id').range(page * pageSize, (page + 1) * pageSize - 1)
        if (error) throw error
        allMembers = allMembers.concat(batch || [])
        if (!batch || batch.length < pageSize) break
        page++
      }

      const nameMap: Record<string, Record<string, unknown>[]> = {}
      allMembers.forEach((m) => {
        const name = m.name as string
        if (!nameMap[name]) nameMap[name] = []
        nameMap[name].push(m)
      })

      const duplicates = Object.entries(nameMap).filter(([, arr]) => arr.length > 1)

      if (duplicates.length === 0) {
        setDupNoResult(true)
        setShowMismatchAfterDup(true)
      } else {
        const groups: DupGroup[] = duplicates.map(([name, mems]) => ({
          name,
          keepIndex: 0,
          members: mems.map((m) => ({
            id: m.id as number,
            name: m.name as string,
            guild: m.guild as string,
            role: m.role as string,
            class: (m.class as string) || '',
            is_main: m.is_main !== false,
            main_char_name: (m.main_char_name as string) || '',
            join_date: (m.join_date as string) || '',
            editName: m.name as string,
            editGuild: m.guild as string,
            editRole: m.role as string,
            editClass: (m.class as string) || '',
            editIsMain: m.is_main !== false,
            editMainChar: (m.main_char_name as string) || '',
          })),
        }))
        setDupGroups(groups)
      }
    } catch (e) {
      toast('검사 실패: ' + (e as Error).message, 'error')
    } finally {
      setDupLoading(false)
    }
  }

  const dupSaveEdits = async (gi: number) => {
    if (!dupGroups) return
    const group = dupGroups[gi]
    let updated = 0
    try {
      for (const m of group.members) {
        const changes: Record<string, unknown> = {}
        if (m.editName !== m.name) changes.name = m.editName
        if (m.editGuild !== m.guild) changes.guild = m.editGuild
        if (m.editRole !== m.role) changes.role = m.editRole
        if (m.editClass !== m.class) changes.class = m.editClass
        if (m.editIsMain !== m.is_main) changes.is_main = m.editIsMain
        if (m.editMainChar !== m.main_char_name) changes.main_char_name = m.editMainChar
        if (Object.keys(changes).length > 0) {
          const { error } = await supabase.from('members').update(changes).eq('id', m.id)
          if (error) throw error
          await supabase.from('operation_history').insert({
            date: getKSTDateStr(), category: '수정',
            name: m.editName, content: `DB 편집 (#${m.id}) ${Object.entries(changes).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
          })
          updated++
        }
      }
      if (updated > 0) {
        toast(`${updated}건 수정 완료!`, 'success')
        await invalidateMembers()
        runDupCheck()
      } else {
        toast('변경사항이 없습니다.', 'info')
      }
    } catch (e) {
      toast('수정 실패: ' + (e as Error).message, 'error')
    }
  }

  const dupDeleteUnchecked = async (gi: number) => {
    if (!dupGroups) return
    const group = dupGroups[gi]
    const keepMember = group.members[group.keepIndex]
    const toDelete = group.members.filter((_, i) => i !== group.keepIndex)
    if (toDelete.length === 0) return

    const detail = toDelete.map((m) => `  #${m.id} (${m.guild}/${m.role || '-'}/${m.class || '-'})`).join('\n')
    if (!confirm(`"${group.name}" 중복 정리\n\n유지: #${keepMember.id} (${keepMember.guild}/${keepMember.role || '-'})\n\n삭제 (${toDelete.length}건):\n${detail}`)) return

    try {
      const ids = toDelete.map((m) => m.id)
      const { error } = await supabase.from('members').delete().in('id', ids)
      if (error) throw error

      await supabase.from('operation_history').insert(
        toDelete.map((m) => ({
          date: getKSTDateStr(), category: '중복삭제', name: m.name,
          content: `중복 제거 (#${m.id}, ${m.guild}/${m.role || '-'}) -- 유지: #${keepMember.id}`,
        })),
      )

      toast(`"${group.name}" 중복 ${toDelete.length}건 삭제 완료!`, 'success')
      await invalidateMembers()
      runDupCheck()
    } catch (e) {
      toast('삭제 실패: ' + (e as Error).message, 'error')
    }
  }

  const dupDeleteAllUnchecked = async () => {
    if (!dupGroups || dupGroups.length === 0) return
    const allToDelete: { id: number; name: string; guild: string; role: string; keepId: number }[] = []
    dupGroups.forEach((g) => {
      const keepMember = g.members[g.keepIndex]
      g.members.forEach((m, i) => {
        if (i !== g.keepIndex) allToDelete.push({ ...m, keepId: keepMember.id })
      })
    })
    if (allToDelete.length === 0) { toast('삭제할 중복 데이터가 없습니다.', 'error'); return }
    if (!confirm(`총 ${allToDelete.length}건의 중복 데이터를 삭제하시겠습니까?\n\n각 그룹에서 선택한 데이터만 유지됩니다.`)) return

    try {
      const ids = allToDelete.map((m) => m.id)
      const { error } = await supabase.from('members').delete().in('id', ids)
      if (error) throw error
      await supabase.from('operation_history').insert(
        allToDelete.map((m) => ({
          date: getKSTDateStr(), category: '중복삭제', name: m.name,
          content: `일괄 중복 제거 (#${m.id}, ${m.guild}/${m.role || '-'}) -- 유지: #${m.keepId}`,
        })),
      )
      toast(`총 ${allToDelete.length}건의 중복 데이터가 삭제되었습니다!`, 'success')
      await invalidateMembers()
      runDupCheck()
    } catch (e) {
      toast('일괄 삭제 실패: ' + (e as Error).message, 'error')
    }
  }

  const dupSaveAllEdits = async () => {
    if (!dupGroups) return
    let totalUpdated = 0
    try {
      for (const group of dupGroups) {
        for (const m of group.members) {
          const changes: Record<string, unknown> = {}
          if (m.editName !== m.name) changes.name = m.editName
          if (m.editGuild !== m.guild) changes.guild = m.editGuild
          if (m.editRole !== m.role) changes.role = m.editRole
          if (m.editClass !== m.class) changes.class = m.editClass
          if (m.editIsMain !== m.is_main) changes.is_main = m.editIsMain
          if (m.editMainChar !== m.main_char_name) changes.main_char_name = m.editMainChar
          if (Object.keys(changes).length > 0) {
            const { error } = await supabase.from('members').update(changes).eq('id', m.id)
            if (error) throw error
            await supabase.from('operation_history').insert({
              date: getKSTDateStr(), category: '수정',
              name: m.editName, content: `일괄 DB 편집 (#${m.id}) ${Object.entries(changes).map(([k, v]) => `${k}:${v}`).join(', ')}`,
            })
            totalUpdated++
          }
        }
      }
      if (totalUpdated > 0) {
        toast(`총 ${totalUpdated}건 수정 완료!`, 'success')
        await invalidateMembers()
        runDupCheck()
      } else {
        toast('변경사항이 없습니다.', 'info')
      }
    } catch (e) {
      toast('일괄 수정 실패: ' + (e as Error).message, 'error')
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MISMATCH CHECK
  // ═══════════════════════════════════════════════════════════

  const runMismatchCheck = async () => {
    const guildName = mmGuild || guilds[0]
    const apiKey = getNexonApiKey()
    if (!apiKey) { toast('Nexon API Key를 먼저 설정해주세요.', 'error'); return }

    setMmLoading(true)
    setMmResults(null)
    const guildMembers = members.filter((m) => m.guild === guildName)
    const results: MismatchResult[] = []

    for (let i = 0; i < guildMembers.length; i++) {
      const m = guildMembers[i]
      setMmProgress(`${i + 1}/${guildMembers.length} (${m.name})`)
      try {
        const info = await getCharInfo(m.name)
        if (info) {
          results.push({
            member: m,
            apiClass: info.class || '', apiLevel: info.level || 0,
            classDiff: !!(info.class && m.class !== info.class),
            levelDiff: !!(info.level && (m.level || 0) !== info.level),
            selectedClass: info.class || m.class || '',
            selectedLevel: info.level || m.level || 0,
            checked: !!(info.class && m.class !== info.class) || !!(info.level && (m.level || 0) !== info.level),
          })
        } else {
          results.push({
            member: m, apiClass: '', apiLevel: 0,
            classDiff: false, levelDiff: false,
            selectedClass: m.class || '', selectedLevel: m.level || 0, checked: false,
          })
        }
      } catch {
        results.push({
          member: m, apiClass: '', apiLevel: 0,
          classDiff: false, levelDiff: false,
          selectedClass: m.class || '', selectedLevel: m.level || 0, checked: false,
        })
      }
      if (i < guildMembers.length - 1) await delay(80)
    }
    setMmProgress(`완료! ${guildMembers.length}명 조회`)
    setMmResults(results)
    setMmLoading(false)
  }

  const applyMismatchFixes = async () => {
    if (!mmResults) return
    setMmApplyLoading(true)
    try {
      let updated = 0
      for (const r of mmResults) {
        if (!r.checked && !r.classDiff && !r.levelDiff) continue
        const updateObj: Record<string, unknown> = {}
        if (r.selectedClass !== (r.member.class || '')) updateObj.class = r.selectedClass
        if (r.selectedLevel !== (r.member.level || 0)) updateObj.level = r.selectedLevel
        if (Object.keys(updateObj).length > 0) {
          const { error } = await supabase.from('members').update(updateObj).eq('id', Number(r.member.id))
          if (!error) updated++
        }
      }
      toast(updated + '명 업데이트 완료!', 'success')
      await invalidateMembers()
    } catch (e) {
      toast('저장 실패: ' + (e as Error).message, 'error')
    } finally {
      setMmApplyLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  const tabs = [
    { key: 'sync' as const, label: '넥슨 API 동기화', icon: <RefreshCw size={14} /> },
    { key: 'backup' as const, label: '백업 / 복원', icon: <Download size={14} /> },
  ]

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-black text-gray-800">동기화 / 백업</h2>

      {/* Tab bar */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
              activeTab === t.key
                ? 'bg-pink-500 text-white shadow-lg'
                : 'bg-white border border-gray-100 text-gray-500 hover:bg-gray-50',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ SYNC TAB ══════════════ */}
      {activeTab === 'sync' && (
        <div className="space-y-4">

          {/* API Key / World Settings */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Key size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Nexon Open API 설정</h3>
                <p className="text-[10px] text-gray-400 font-bold">길드원 동기화를 위해 Nexon Open API Key가 필요합니다</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Nexon Open API Key를 입력하세요"
                    className="flex-1 border border-gray-100 bg-gray-50 rounded-xl p-3 text-xs font-mono outline-none focus:ring-4 focus:ring-blue-50 shadow-inner"
                  />
                  <button
                    onClick={() => { setNexonApiKey(apiKeyInput); toast('API Key가 저장되었습니다!', 'success') }}
                    className="px-5 bg-gray-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shrink-0"
                  >
                    저장
                  </button>
                </div>
                <p className="text-[9px] text-gray-300 ml-1 mt-1">
                  Key는 브라우저에만 저장되며 서버로 전송되지 않습니다 &middot;{' '}
                  <a href="https://openapi.nexon.com/ko/my-application/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    API Key 발급받기
                  </a>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">서버 (월드)</label>
                <select
                  value={worldSelect}
                  onChange={(e) => { setWorldSelect(e.target.value); setSyncWorld(e.target.value) }}
                  className="w-full border border-gray-100 bg-gray-50 rounded-xl p-3 text-xs font-bold outline-none shadow-inner cursor-pointer"
                >
                  {MAPLE_WORLDS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Sync Execute */}
          <div className="bg-white p-5 rounded-2xl border border-pink-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-pink-400 to-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                  <RefreshCw size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">길드원 동기화</h3>
                  <p className="text-[10px] text-gray-400 font-bold">Nexon API의 실제 길드원 목록과 DB를 비교합니다</p>
                </div>
              </div>
              <button
                onClick={runSync}
                disabled={syncLoading}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl text-xs font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {syncLoading ? <><Loader2 size={12} className="inline animate-spin mr-2" />동기화 중...</> : <><RefreshCw size={12} className="inline mr-2" />동기화 실행</>}
              </button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100">
              <p className="text-[10px] text-gray-500 leading-relaxed font-bold">
                <Info size={10} className="inline text-pink-400 mr-1" />
                등록된 모든 길드({guilds.join(', ')})를 <strong>{worldSelect}</strong> 서버에서 조회합니다.<br />
                <span className="ml-3 text-green-500">신규 멤버</span>: API에 있지만 DB에 없는 멤버<br />
                <span className="ml-3 text-red-500">탈퇴 의심</span>: DB에 있지만 API에 없는 멤버<br />
                <span className="ml-3 text-purple-500">길드 이동</span>: DB와 API의 소속 길드가 다른 멤버
              </p>
            </div>

            {/* Sync progress */}
            {syncLoading && (
              <div className="text-center py-12 text-gray-400 font-bold">
                <Loader2 size={24} className="animate-spin mx-auto mb-3" />
                <p className="text-xs">{syncProgress}</p>
              </div>
            )}

            {/* Sync results */}
            {syncResult && !syncLoading && (
              <div className="space-y-4">
                {/* Errors */}
                {syncResult.errors.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <p className="text-xs font-bold text-amber-600 mb-2"><AlertTriangle size={12} className="inline mr-1" />일부 길드 조회 실패</p>
                    {syncResult.errors.map((e, i) => (
                      <p key={i} className="text-[10px] text-amber-500">{e}</p>
                    ))}
                  </div>
                )}

                {/* Summary */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">동기화 요약</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-center">
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                      <p className="text-lg font-bold text-blue-600">{syncResult.totalApiCount}</p>
                      <p className="text-[9px] text-blue-400 font-bold">API 길드원 수</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                      <p className="text-lg font-bold text-green-600">{syncResult.newMembers.length}</p>
                      <p className="text-[9px] text-green-400 font-bold">신규 멤버</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                      <p className="text-lg font-bold text-red-600">{syncResult.goneMembers.length}</p>
                      <p className="text-[9px] text-red-400 font-bold">탈퇴 의심</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                      <p className="text-lg font-bold text-purple-600">{syncResult.movedMembers.length}</p>
                      <p className="text-[9px] text-purple-400 font-bold">길드 이동</p>
                    </div>
                    <div className="bg-cyan-50 rounded-xl p-3 border border-cyan-100">
                      <p className="text-lg font-bold text-cyan-600">{syncResult.nickChangeSuspects.length}</p>
                      <p className="text-[9px] text-cyan-400 font-bold">닉변 의심</p>
                    </div>
                  </div>
                </div>

                {/* Guild stats */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">길드별 현황</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {syncResult.guildStats.map((g) => (
                      <div key={g.name} className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-700">{g.name}</span>
                        <span className="text-[10px] font-bold text-gray-400">API {g.apiCount}명 / DB {g.dbCount}명</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nick Change Suspects */}
                {nickSuspects.length > 0 && (
                  <div className="bg-white rounded-2xl border border-cyan-200 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-cyan-600 mb-1">
                      <Pencil size={14} className="inline mr-2" />닉네임 변경 의심 ({nickSuspects.length}명)
                    </h4>
                    <p className="text-[10px] text-gray-400 mb-4">
                      탈퇴 멤버와 신규 멤버의 직업/길드가 일치하여 닉변으로 추정됩니다. 확인 후 닉네임을 변경하면 수로 데이터가 유지됩니다.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[9px] font-bold text-gray-400 uppercase border-b border-gray-200">
                            <th className="p-2 w-8 text-center">
                              <input
                                type="checkbox"
                                checked={nickSuspects.every((s) => s.checked)}
                                onChange={(e) => setNickSuspects((prev) => prev.map((s) => ({ ...s, checked: e.target.checked })))}
                              />
                            </th>
                            <th className="p-2 text-left">기존 닉네임</th>
                            <th className="p-2 text-center">-&gt;</th>
                            <th className="p-2 text-left">새 닉네임</th>
                            <th className="p-2 text-left">소속</th>
                            <th className="p-2 text-left">직업</th>
                            <th className="p-2 text-center">레벨</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nickSuspects.map((s, i) => (
                            <tr key={i} className="border-b border-gray-50 hover:bg-cyan-50/30 transition-colors">
                              <td className="p-1.5 text-center">
                                <input type="checkbox" checked={s.checked} onChange={(e) => {
                                  setNickSuspects((prev) => { const next = [...prev]; next[i] = { ...next[i], checked: e.target.checked }; return next })
                                }} className="w-4 h-4" />
                              </td>
                              <td className="p-1.5"><span className="text-red-500 line-through font-bold">{s.oldName}</span></td>
                              <td className="p-1.5 text-center text-gray-300">&rarr;</td>
                              <td className="p-1.5"><span className="text-cyan-600 font-bold">{s.newName}</span></td>
                              <td className="p-1.5 text-gray-500">{s.guild}</td>
                              <td className="p-1.5 text-gray-500">{s.class}</td>
                              <td className="p-1.5 text-center text-gray-500">{s.level || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={applyNickChanges}
                        disabled={nickLoading}
                        className="px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-cyan-600 disabled:opacity-50"
                      >
                        {nickLoading ? <><Loader2 size={12} className="inline animate-spin mr-2" />적용 중...</> : <><Pencil size={12} className="inline mr-2" />선택한 닉네임 변경 적용</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* New Members */}
                {newMembers.length > 0 && (
                  <div className="bg-white rounded-2xl border border-green-200 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-green-600 mb-1">
                      <UserPlus size={14} className="inline mr-2" />신규 멤버 발견 ({newMembers.length}명)
                    </h4>
                    <p className="text-[10px] text-gray-400 mb-2">API에 존재하지만 DB에 등록되지 않은 멤버입니다. 정보를 입력 후 일괄 추가하세요.</p>
                    <div className="mb-3 flex flex-wrap gap-2 items-center">
                      <button
                        onClick={() => fetchAllCharInfo()}
                        disabled={fetchInfoLoading}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-bold text-[10px] shadow-sm hover:bg-indigo-600 disabled:opacity-50"
                      >
                        {fetchInfoLoading ? <><Loader2 size={10} className="inline animate-spin mr-1" />조회 중...</> : <><Download size={10} className="inline mr-1" />API에서 직업/레벨 일괄 조회</>}
                      </button>
                      <button
                        onClick={guessAllMains}
                        disabled={guessLoading}
                        className="px-4 py-2 bg-purple-500 text-white rounded-xl font-bold text-[10px] shadow-sm hover:bg-purple-600 disabled:opacity-50"
                      >
                        {guessLoading ? <><Loader2 size={10} className="inline animate-spin mr-1" />{guessProgress}</> : <><Wand2 size={10} className="inline mr-1" />본캐 자동 추론</>}
                      </button>
                      {fetchInfoProgress && <span className="text-[10px] text-gray-400">{fetchInfoProgress}</span>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[9px] font-bold text-gray-400 uppercase border-b border-gray-200">
                            <th className="p-2 w-8 text-center">
                              <input
                                type="checkbox"
                                checked={newMembersSelectAll}
                                onChange={(e) => {
                                  setNewMembersSelectAll(e.target.checked)
                                  setNewChecked(e.target.checked ? new Set(newMembers.map((_, i) => i)) : new Set())
                                }}
                              />
                            </th>
                            <th className="p-2 text-left" style={{ minWidth: 120 }}>닉네임</th>
                            <th className="p-2 text-left" style={{ minWidth: 80 }}>소속</th>
                            <th className="p-2 text-left" style={{ minWidth: 90 }}>직위</th>
                            <th className="p-2 text-left" style={{ minWidth: 110 }}>직업</th>
                            <th className="p-2 text-center" style={{ minWidth: 50 }}>레벨</th>
                            <th className="p-2 text-center" style={{ minWidth: 40 }}>본캐</th>
                            <th className="p-2 text-left" style={{ minWidth: 100 }}>본캐닉</th>
                            <th className="p-2 text-left" style={{ minWidth: 100 }}>추론 본캐</th>
                            <th className="p-2 text-center" style={{ minWidth: 40 }}>승강</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newMembers.map((m, i) => {
                            const guildRoles = getGuildRanks(m.selectedGuild)
                            return (
                              <tr key={i} className={cn('border-b border-gray-50 hover:bg-green-50/30 transition-colors', m.selectedClass ? 'bg-green-50/50' : '')}>
                                <td className="p-1 text-center">
                                  <input type="checkbox" checked={newChecked.has(i)} onChange={(e) => {
                                    setNewChecked((prev) => { const next = new Set(prev); e.target.checked ? next.add(i) : next.delete(i); return next })
                                  }} className="w-4 h-4" />
                                </td>
                                <td className="p-1">
                                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs font-bold text-green-700 whitespace-nowrap">{m.name}</div>
                                </td>
                                <td className="p-1">
                                  <select
                                    value={m.selectedGuild}
                                    onChange={(e) => {
                                      const gName = e.target.value
                                      setNewMembers((prev) => {
                                        const next = [...prev]
                                        next[i] = { ...next[i], selectedGuild: gName, selectedRole: getDefaultRole(gName) }
                                        return next
                                      })
                                    }}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-1 py-1.5 text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    {guilds.map((g) => <option key={g} value={g}>{g}</option>)}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <select
                                    value={m.selectedRole}
                                    onChange={(e) => setNewMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], selectedRole: e.target.value }; return next })}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-1 py-1.5 text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    {guildRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <select
                                    value={m.selectedClass}
                                    onChange={(e) => setNewMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], selectedClass: e.target.value }; return next })}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-1 py-1.5 text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    <option value="">-</option>
                                    {MAPLE_JOBS.map((j) => <option key={j} value={j}>{j}</option>)}
                                    {m.selectedClass && !MAPLE_JOBS.includes(m.selectedClass) && (
                                      <option value={m.selectedClass}>{m.selectedClass}</option>
                                    )}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <input
                                    type="number"
                                    value={m.selectedLevel}
                                    onChange={(e) => setNewMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], selectedLevel: parseInt(e.target.value) || 0 }; return next })}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none text-center"
                                    min={0} max={300}
                                  />
                                </td>
                                <td className="p-1 text-center">
                                  <input
                                    type="checkbox"
                                    checked={m.isMain}
                                    onChange={(e) => setNewMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], isMain: e.target.checked }; return next })}
                                    className="w-4 h-4 text-pink-500 rounded cursor-pointer"
                                  />
                                </td>
                                <td className="p-1">
                                  {!m.isMain && (
                                    <input
                                      type="text"
                                      value={m.mainCharName}
                                      onChange={(e) => setNewMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], mainCharName: e.target.value }; return next })}
                                      className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none"
                                      placeholder="본캐닉"
                                    />
                                  )}
                                </td>
                                <td className="p-1">
                                  {m.guessStatus === 'loading' && <Loader2 size={10} className="animate-spin text-gray-400" />}
                                  {m.guessStatus === 'done' && m.guessedMain && (
                                    <button
                                      onClick={() => applyGuess(i, m.guessedMain!)}
                                      className={cn(
                                        'text-[10px] font-bold px-2 py-1 rounded-lg hover:opacity-80 transition-all',
                                        m.guessedMain === m.name ? 'text-amber-600 bg-amber-50' : 'text-purple-600 bg-purple-50',
                                      )}
                                      title={m.guessedMain === m.name ? '유니온 대표 = 자기자신 (이 캐릭이 계정 최고레벨)' : '클릭하면 본캐닉에 적용'}
                                    >
                                      {m.guessedMain}
                                    </button>
                                  )}
                                  {m.guessStatus === 'done' && !m.guessedMain && <span className="text-[9px] text-gray-300">미확인</span>}
                                  {m.guessStatus === 'error' && <span className="text-[9px] text-red-300">실패</span>}
                                  {m.guessStatus === 'idle' && <span className="text-[9px] text-gray-300">-</span>}
                                </td>
                                <td className="p-1 text-center">
                                  {m.selectedGuild === '뚱카롱' ? (
                                    <input
                                      type="checkbox"
                                      checked={m.promoWish}
                                      onChange={(e) => setNewMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], promoWish: e.target.checked }; return next })}
                                      className="w-4 h-4 text-indigo-500 rounded cursor-pointer"
                                      title="승강 희망"
                                    />
                                  ) : <span className="text-[9px] text-gray-200">-</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={syncAddNew}
                        disabled={addNewLoading}
                        className="px-6 py-3 bg-green-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-green-600 disabled:opacity-50"
                      >
                        {addNewLoading ? <><Loader2 size={12} className="inline animate-spin mr-2" />추가 중...</> : <><UserPlus size={12} className="inline mr-2" />선택한 멤버 DB에 추가</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Gone Members */}
                {goneMembers.length > 0 && (
                  <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-red-600 mb-1">
                      <UserMinus size={14} className="inline mr-2" />탈퇴 의심 멤버 ({goneMembers.length}명)
                    </h4>
                    <p className="text-[10px] text-gray-400 mb-4">DB에 등록되어 있지만 어떤 길드에서도 찾을 수 없는 멤버입니다. 확인 후 삭제하세요.</p>
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={goneMembers.every((m) => m.checked)}
                        onChange={(e) => setGoneMembers((prev) => prev.map((m) => ({ ...m, checked: e.target.checked })))}
                      />
                      <label className="text-[10px] font-bold text-gray-500 cursor-pointer">전체 선택</label>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[9px] font-bold text-gray-400 uppercase border-b border-gray-200">
                            <th className="p-2 w-8 text-center">V</th>
                            <th className="p-2 text-left">닉네임</th>
                            <th className="p-2 text-left">소속</th>
                            <th className="p-2 text-left">직위</th>
                            <th className="p-2 text-left">직업</th>
                            <th className="p-2 text-center">본캐</th>
                            <th className="p-2 text-left">본캐닉</th>
                            <th className="p-2 text-left">가입일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {goneMembers.map((m, i) => (
                            <tr key={i} className="border-b border-gray-50 hover:bg-red-50/30 transition-colors">
                              <td className="p-1 text-center">
                                <input type="checkbox" checked={m.checked} onChange={(e) => {
                                  setGoneMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], checked: e.target.checked }; return next })
                                }} className="w-4 h-4" />
                              </td>
                              <td className="p-1"><span className="text-xs font-bold text-red-600">{m.name}</span></td>
                              <td className="p-1"><span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{m.guild}</span></td>
                              <td className="p-1"><span className="text-[10px] font-bold text-gray-500">{m.role || '-'}</span></td>
                              <td className="p-1"><span className="text-[10px] font-bold text-gray-500">{m.class || '-'}</span></td>
                              <td className="p-1 text-center"><span className="text-[10px] text-gray-400">{m.isMain !== false ? 'O' : 'X'}</span></td>
                              <td className="p-1"><span className="text-[10px] text-gray-400">{m.mainCharName || '-'}</span></td>
                              <td className="p-1"><span className="text-[10px] text-gray-400">{m.joinDate || '-'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={syncRemoveGone}
                        disabled={goneLoading}
                        className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-red-600 disabled:opacity-50"
                      >
                        {goneLoading ? <><Loader2 size={12} className="inline animate-spin mr-2" />삭제 중...</> : <><UserMinus size={12} className="inline mr-2" />선택한 멤버 DB에서 삭제</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Moved Members */}
                {movedMembers.length > 0 && (
                  <div className="bg-white rounded-2xl border border-purple-200 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-purple-600 mb-1">
                      <ArrowRightLeft size={14} className="inline mr-2" />길드 이동 감지 ({movedMembers.length}명)
                    </h4>
                    <p className="text-[10px] text-gray-400 mb-4">DB의 소속 길드와 API의 실제 길드가 다른 멤버입니다.</p>
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={movedMembers.every((m) => m.checked)}
                        onChange={(e) => setMovedMembers((prev) => prev.map((m) => ({ ...m, checked: e.target.checked })))}
                      />
                      <label className="text-[10px] font-bold text-gray-500 cursor-pointer">전체 선택</label>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1 mb-4">
                      {movedMembers.map((m, i) => (
                        <label key={i} className="flex items-center gap-3 bg-purple-50/50 hover:bg-purple-50 rounded-xl px-3 py-2 border border-purple-100/50 cursor-pointer transition-all">
                          <input
                            type="checkbox"
                            checked={m.checked}
                            onChange={(e) => setMovedMembers((prev) => { const next = [...prev]; next[i] = { ...next[i], checked: e.target.checked }; return next })}
                          />
                          <span className="text-xs font-bold text-gray-700 flex-1">{m.name}</span>
                          <span className="text-[9px] font-bold text-gray-400">{m.fromGuild}</span>
                          <ArrowRightLeft size={8} className="text-purple-400" />
                          <span className="text-[9px] font-bold text-purple-600">{m.toGuild}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={syncUpdateMoved}
                      disabled={movedLoading}
                      className="w-full py-3 bg-purple-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-purple-600 disabled:opacity-50"
                    >
                      {movedLoading ? <><Loader2 size={12} className="inline animate-spin mr-2" />변경 중...</> : <><ArrowRightLeft size={12} className="inline mr-2" />선택한 멤버 소속 변경</>}
                    </button>
                  </div>
                )}

                {/* All synced */}
                {syncResult.newMembers.length === 0 && syncResult.goneMembers.length === 0 && syncResult.movedMembers.length === 0 && syncResult.nickChangeSuspects.length === 0 && syncResult.errors.length === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                    <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Check size={20} className="text-green-500" /></div>
                    <p className="text-sm font-bold text-green-600">모든 길드원이 DB와 일치합니다!</p>
                    <p className="text-[10px] text-green-400 mt-1">변경 사항이 없습니다.</p>
                  </div>
                )}
              </div>
            )}

            {/* Placeholder when no result yet */}
            {!syncResult && !syncLoading && (
              <div className="text-center py-12 text-gray-300">
                <RefreshCw size={32} className="mx-auto mb-3" />
                <p className="text-xs font-bold">위 버튼을 눌러 동기화를 시작하세요</p>
              </div>
            )}
          </div>

          {/* Duplicate Check */}
          <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                  <Copy size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">닉네임 중복 검사</h3>
                  <p className="text-[10px] text-gray-400 font-bold">DB에 동일한 닉네임으로 등록된 중복 데이터를 찾아 정리합니다</p>
                </div>
              </div>
              <button
                onClick={runDupCheck}
                disabled={dupLoading}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {dupLoading ? <><Loader2 size={12} className="inline animate-spin mr-2" />검사 중...</> : <><Search size={12} className="inline mr-2" />중복 검사</>}
              </button>
            </div>

            {/* Dup no result */}
            {dupNoResult && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                  <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Check size={20} className="text-green-500" /></div>
                  <p className="text-sm font-bold text-green-600">중복 닉네임이 없습니다!</p>
                  <p className="text-[10px] text-green-400 mt-1">모두 고유한 닉네임입니다.</p>
                </div>

                {/* Mismatch Check UI shows after dup check succeeds */}
                {showMismatchAfterDup && (
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <select
                        value={mmGuild || guilds[0]}
                        onChange={(e) => setMmGuild(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none"
                      >
                        {guilds.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <button
                        onClick={runMismatchCheck}
                        disabled={mmLoading}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg hover:shadow-xl disabled:opacity-50"
                      >
                        {mmLoading ? <><Loader2 size={10} className="inline animate-spin mr-1" />조회 중...</> : <><Search size={10} className="inline mr-1" />직업/레벨 조회</>}
                      </button>
                      {mmProgress && <span className="text-[10px] text-gray-400">{mmProgress}</span>}
                    </div>
                    {renderMismatchResults()}
                  </div>
                )}
              </div>
            )}

            {/* Dup groups */}
            {dupGroups && dupGroups.length > 0 && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-xs font-bold text-amber-600">
                    <AlertTriangle size={12} className="inline mr-1" />
                    {dupGroups.length}개의 중복 닉네임 발견 (총 {dupGroups.reduce((s, g) => s + g.members.length, 0)}건)
                  </p>
                  <p className="text-[10px] text-amber-500 mt-1">닉네임이 틀린 경우 직접 수정 가능합니다. 유지할 데이터를 선택 후 나머지를 삭제하세요.</p>
                </div>

                {dupGroups.map((group, gi) => (
                  <div key={gi} className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{group.name}</span>
                        <span className="text-[9px] text-gray-400">{group.members.length}건 중복</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => dupSaveEdits(gi)} className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-[10px] font-bold hover:bg-blue-600">
                          수정 저장
                        </button>
                        <button onClick={() => dupDeleteUnchecked(gi)} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-bold hover:bg-red-600">
                          미체크 삭제
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[8px] font-bold text-gray-400 uppercase border-b border-gray-200">
                            <th className="p-1.5 w-8 text-center">유지</th>
                            <th className="p-1.5 text-left">ID</th>
                            <th className="p-1.5 text-left" style={{ minWidth: 100 }}>닉네임</th>
                            <th className="p-1.5 text-left">소속</th>
                            <th className="p-1.5 text-left">직위</th>
                            <th className="p-1.5 text-left">직업</th>
                            <th className="p-1.5 text-center">본캐</th>
                            <th className="p-1.5 text-left">본캐닉</th>
                            <th className="p-1.5 text-left">가입일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.members.map((m, mi) => {
                            const guildRoles = getGuildRanks(m.editGuild)
                            return (
                              <tr key={mi} className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
                                <td className="p-1 text-center">
                                  <input
                                    type="radio"
                                    name={`dupKeep_${gi}`}
                                    checked={group.keepIndex === mi}
                                    onChange={() => setDupGroups((prev) => {
                                      if (!prev) return prev
                                      const next = [...prev]
                                      next[gi] = { ...next[gi], keepIndex: mi }
                                      return next
                                    })}
                                    className="w-4 h-4 text-green-500 cursor-pointer"
                                  />
                                </td>
                                <td className="p-1"><span className="text-[9px] text-gray-300 font-mono">#{m.id}</span></td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    value={m.editName}
                                    onChange={(e) => {
                                      setDupGroups((prev) => {
                                        if (!prev) return prev
                                        const next = [...prev]
                                        const members = [...next[gi].members]
                                        members[mi] = { ...members[mi], editName: e.target.value }
                                        next[gi] = { ...next[gi], members }
                                        return next
                                      })
                                    }}
                                    className="w-full bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                                  />
                                </td>
                                <td className="p-1">
                                  <select
                                    value={m.editGuild}
                                    onChange={(e) => {
                                      setDupGroups((prev) => {
                                        if (!prev) return prev
                                        const next = [...prev]
                                        const members = [...next[gi].members]
                                        members[mi] = { ...members[mi], editGuild: e.target.value }
                                        next[gi] = { ...next[gi], members }
                                        return next
                                      })
                                    }}
                                    className="bg-gray-50 border border-gray-100 rounded-lg px-1 py-1 text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    {guilds.map((g) => <option key={g} value={g}>{g}</option>)}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <select
                                    value={m.editRole}
                                    onChange={(e) => {
                                      setDupGroups((prev) => {
                                        if (!prev) return prev
                                        const next = [...prev]
                                        const members = [...next[gi].members]
                                        members[mi] = { ...members[mi], editRole: e.target.value }
                                        next[gi] = { ...next[gi], members }
                                        return next
                                      })
                                    }}
                                    className="bg-gray-50 border border-gray-100 rounded-lg px-1 py-1 text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    {guildRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <select
                                    value={m.editClass}
                                    onChange={(e) => {
                                      setDupGroups((prev) => {
                                        if (!prev) return prev
                                        const next = [...prev]
                                        const members = [...next[gi].members]
                                        members[mi] = { ...members[mi], editClass: e.target.value }
                                        next[gi] = { ...next[gi], members }
                                        return next
                                      })
                                    }}
                                    className="bg-gray-50 border border-gray-100 rounded-lg px-1 py-1 text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    <option value="">-</option>
                                    {MAPLE_JOBS.map((j) => <option key={j} value={j}>{j}</option>)}
                                  </select>
                                </td>
                                <td className="p-1 text-center">
                                  <input
                                    type="checkbox"
                                    checked={m.editIsMain}
                                    onChange={(e) => {
                                      setDupGroups((prev) => {
                                        if (!prev) return prev
                                        const next = [...prev]
                                        const members = [...next[gi].members]
                                        members[mi] = { ...members[mi], editIsMain: e.target.checked }
                                        next[gi] = { ...next[gi], members }
                                        return next
                                      })
                                    }}
                                    className="w-4 h-4 text-pink-500 rounded cursor-pointer"
                                  />
                                </td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    value={m.editMainChar}
                                    onChange={(e) => {
                                      setDupGroups((prev) => {
                                        if (!prev) return prev
                                        const next = [...prev]
                                        const members = [...next[gi].members]
                                        members[mi] = { ...members[mi], editMainChar: e.target.value }
                                        next[gi] = { ...next[gi], members }
                                        return next
                                      })
                                    }}
                                    className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none w-full"
                                    placeholder="-"
                                  />
                                </td>
                                <td className="p-1"><span className="text-[10px] text-gray-400">{m.join_date || '-'}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={dupSaveAllEdits} className="px-6 py-3 bg-blue-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-blue-600">
                    전체 수정 저장
                  </button>
                  <button onClick={dupDeleteAllUnchecked} className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-red-600">
                    전체 중복 일괄 정리
                  </button>
                </div>
              </div>
            )}

            {/* Default placeholder */}
            {!dupGroups && !dupNoResult && !dupLoading && (
              <div className="text-center py-12 text-gray-300">
                <Copy size={32} className="mx-auto mb-3" />
                <p className="text-xs font-bold">위 버튼을 눌러 중복 검사를 시작하세요</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ BACKUP TAB ══════════════ */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          {/* Table selection */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">테이블 선택</h3>
              <button onClick={toggleAll} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700">
                {selectedTables.size === TABLES.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TABLES.map((t) => (
                <label
                  key={t}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-bold cursor-pointer transition-all border',
                    selectedTables.has(t) ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-gray-50 border-gray-100 text-gray-400',
                  )}
                >
                  <input type="checkbox" checked={selectedTables.has(t)} onChange={() => toggleTable(t)} className="w-3 h-3 rounded accent-indigo-500" />
                  {t}
                </label>
              ))}
            </div>
            <p className="text-[9px] text-gray-400 mt-2 font-bold">선택: {selectedTables.size}/{TABLES.length}개 테이블</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Export JSON */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-4"><Download size={24} /></div>
              <h3 className="font-bold text-gray-800 mb-1">JSON 백업</h3>
              <p className="text-[10px] text-gray-400 font-bold mb-4">선택된 테이블을 JSON으로 내보냅니다</p>
              <button onClick={handleExportJson} disabled={backupLoading || selectedTables.size === 0} className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50">
                {backupLoading ? '처리 중...' : 'JSON 다운로드'}
              </button>
            </div>

            {/* Export CSV */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4"><FileSpreadsheet size={24} /></div>
              <h3 className="font-bold text-gray-800 mb-1">CSV 내보내기</h3>
              <p className="text-[10px] text-gray-400 font-bold mb-4">각 테이블을 개별 CSV 파일로 내보냅니다</p>
              <button onClick={handleExportCsv} disabled={backupLoading || selectedTables.size === 0} className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 disabled:opacity-50">
                {backupLoading ? '처리 중...' : 'CSV 다운로드'}
              </button>
            </div>

            {/* Import */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4"><Upload size={24} /></div>
              <h3 className="font-bold text-gray-800 mb-1">데이터 복원</h3>
              <p className="text-[10px] text-gray-400 font-bold mb-4">백업 JSON 파일에서 복원합니다</p>
              <label className="inline-block px-6 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 cursor-pointer">
                파일 선택 & 복원
                <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImport(e.target.files[0]) }} />
              </label>
              <p className="text-[9px] text-red-400 font-bold mt-3">주의: 기존 데이터를 덮어씁니다</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ─── Mismatch results sub-render ────────────────────────────

  function renderMismatchResults() {
    if (!mmResults) return null
    const guildName = mmGuild || guilds[0]
    const diffCount = mmResults.filter((r) => r.classDiff || r.levelDiff).length

    return (
      <div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-3">
          <p className="text-[10px] font-bold text-indigo-600">
            <Info size={10} className="inline mr-1" />
            {guildName} {mmResults.length}명 조회 완료 -- 불일치 {diffCount}명 -- 변경할 항목을 직접 수정 후 일괄 저장하세요
          </p>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-[8px] font-bold text-gray-400 uppercase border-b border-gray-200">
                <th className="p-1.5 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={mmResults.every((r) => r.checked || (!r.classDiff && !r.levelDiff))}
                    onChange={(e) => setMmResults((prev) => prev?.map((r) => (r.classDiff || r.levelDiff) ? { ...r, checked: e.target.checked } : r) || null)}
                  />
                </th>
                <th className="p-1.5 text-left">닉네임</th>
                <th className="p-1.5 text-left">DB 직업</th>
                <th className="p-1.5 text-left">API 직업</th>
                <th className="p-1.5 text-center">DB Lv</th>
                <th className="p-1.5 text-center">API Lv</th>
              </tr>
            </thead>
            <tbody>
              {mmResults.map((r, i) => (
                <tr key={i} className={cn('border-b border-gray-50', (r.classDiff || r.levelDiff) && 'bg-amber-50/50')}>
                  <td className="p-1 text-center">
                    {(r.classDiff || r.levelDiff) ? (
                      <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={(e) => setMmResults((prev) => {
                          if (!prev) return prev
                          const next = [...prev]
                          next[i] = { ...next[i], checked: e.target.checked }
                          return next
                        })}
                        className="w-4 h-4"
                      />
                    ) : <span className="text-gray-300 text-[9px]">-</span>}
                  </td>
                  <td className="p-1.5 font-bold">
                    {r.member.name}
                    {r.member.level > 0 && <span className="text-[8px] text-gray-400 ml-1">Lv.{r.member.level}</span>}
                  </td>
                  <td className={cn('p-1.5', r.classDiff ? 'text-red-500' : 'text-gray-400')}>{r.member.class || '(미설정)'}</td>
                  <td className="p-1.5">
                    <select
                      value={r.selectedClass}
                      onChange={(e) => setMmResults((prev) => {
                        if (!prev) return prev
                        const next = [...prev]
                        next[i] = { ...next[i], selectedClass: e.target.value }
                        return next
                      })}
                      className={cn('bg-gray-50 border rounded px-1 py-0.5 text-[10px] font-bold outline-none', r.classDiff ? 'border-amber-300 bg-amber-50' : 'border-gray-100')}
                    >
                      <option value="">-</option>
                      {MAPLE_JOBS.map((j) => <option key={j} value={j}>{j}</option>)}
                      {r.apiClass && !MAPLE_JOBS.includes(r.apiClass) && <option value={r.apiClass}>{r.apiClass}</option>}
                    </select>
                  </td>
                  <td className={cn('p-1.5 text-center', r.levelDiff ? 'text-red-500' : 'text-gray-400')}>{r.member.level || 0}</td>
                  <td className="p-1.5 text-center">
                    <input
                      type="number"
                      value={r.selectedLevel}
                      onChange={(e) => setMmResults((prev) => {
                        if (!prev) return prev
                        const next = [...prev]
                        next[i] = { ...next[i], selectedLevel: parseInt(e.target.value) || 0 }
                        return next
                      })}
                      className={cn('bg-gray-50 border rounded px-1 py-0.5 text-[10px] font-bold outline-none w-16 text-center', r.levelDiff ? 'border-amber-300 bg-amber-50' : 'border-gray-100')}
                      min={0} max={300}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-between items-center">
          <p className="text-[9px] text-gray-400">체크된 불일치 항목 + 수동 수정 모두 저장됩니다</p>
          <button
            onClick={applyMismatchFixes}
            disabled={mmApplyLoading}
            className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg hover:bg-indigo-600 disabled:opacity-50"
          >
            {mmApplyLoading ? <><Loader2 size={10} className="inline animate-spin mr-1" />저장 중...</> : '변경사항 일괄 저장'}
          </button>
        </div>
      </div>
    )
  }
}
