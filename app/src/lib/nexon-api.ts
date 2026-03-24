/**
 * Nexon MapleStory Open API helper functions.
 * All API key / world preferences are stored in localStorage.
 */

const NEXON_API_BASE = 'https://open.api.nexon.com'

export const MAPLE_WORLDS = [
  '스카니아', '베라', '루나', '제니스', '크로아', '유니온',
  '엘리시움', '이노시스', '레드', '오로라', '아케인', '노바',
  '리부트', '리부트2',
]

export const MAPLE_JOBS = [
  '히어로', '팔라딘', '다크나이트', '아크메이지(불,독)', '아크메이지(썬,콜)',
  '비숍', '보우마스터', '신궁', '패스파인더', '나이트로드', '섀도어',
  '듀얼블레이드', '바이퍼', '캡틴', '캐논마스터', '미하일', '소울마스터',
  '플레임위자드', '윈드브레이커', '나이트워커', '스트라이커', '아란', '에반',
  '루미너스', '메르세데스', '팬텀', '은월', '데몬슬레이어', '데몬어벤져',
  '블래스터', '배틀메이지', '와일드헌터', '메카닉', '제논', '카이저', '카인',
  '카데나', '엔젤릭버스터', '라라', '호영', '아델', '일리움', '아크', '칼리',
  '제로', '키네시스', '렌',
]

// ── localStorage helpers ──────────────────────────────────────

export function getNexonApiKey(): string {
  return localStorage.getItem('nexon_api_key') || ''
}

export function setNexonApiKey(key: string) {
  localStorage.setItem('nexon_api_key', key.trim())
}

export function getSyncWorld(): string {
  return localStorage.getItem('sync_world') || '루나'
}

export function setSyncWorld(w: string) {
  localStorage.setItem('sync_world', w)
}

// ── Core fetch wrapper ────────────────────────────────────────

export async function nexonFetch<T = unknown>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const apiKey = getNexonApiKey()
  if (!apiKey) throw new Error('Nexon API Key가 설정되지 않았습니다.')
  const qs = new URLSearchParams(params).toString()
  const url = `${NEXON_API_BASE}${endpoint}${qs ? '?' + qs : ''}`
  const res = await fetch(url, { headers: { 'x-nxopen-api-key': apiKey } })
  if (!res.ok) {
    const err: { error?: { message?: string } } = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API 오류 (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ── Guild endpoints ───────────────────────────────────────────

export async function getGuildId(guildName: string, worldName: string): Promise<string> {
  const data = await nexonFetch<{ oguild_id: string }>('/maplestory/v1/guild/id', {
    guild_name: guildName,
    world_name: worldName,
  })
  return data.oguild_id
}

export async function getGuildBasic(oguildId: string) {
  return nexonFetch<{ guild_member?: string[] }>('/maplestory/v1/guild/basic', {
    oguild_id: oguildId,
  })
}

// ── Character endpoints ───────────────────────────────────────

export async function getCharOcid(characterName: string): Promise<string> {
  const data = await nexonFetch<{ ocid: string }>('/maplestory/v1/id', {
    character_name: characterName,
  })
  return data.ocid
}

export async function getCharBasic(ocid: string) {
  return nexonFetch<{
    character_name?: string
    character_class?: string
    character_level?: number
    character_guild_name?: string
    world_name?: string
    character_image?: string
  }>('/maplestory/v1/character/basic', { ocid })
}

export interface CharInfo {
  name: string
  class: string
  level: number
  guild: string
  world: string
  image: string
}

export async function getCharInfo(characterName: string): Promise<CharInfo | null> {
  try {
    const ocid = await getCharOcid(characterName)
    const basic = await getCharBasic(ocid)
    return {
      name: basic.character_name || characterName,
      class: basic.character_class || '',
      level: basic.character_level || 0,
      guild: basic.character_guild_name || '',
      world: basic.world_name || '',
      image: basic.character_image || '',
    }
  } catch {
    return null
  }
}

// ── Main character guess (union ranking) ──────────────────────

export async function guessMainChar(characterName: string): Promise<string | null> {
  try {
    const ocid = await getCharOcid(characterName)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    const rankData = await nexonFetch<{
      ranking?: { character_name: string }[]
    }>('/maplestory/v1/ranking/union', { ocid, date: dateStr })
    if (rankData?.ranking && rankData.ranking.length > 0) {
      return rankData.ranking[0].character_name
    }
    return null
  } catch {
    return null
  }
}

// ── Utility ───────────────────────────────────────────────────

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
