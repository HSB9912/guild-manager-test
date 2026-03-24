export interface MemberRow {
  id: number
  name: string
  guild: string
  role: string
  class: string | null
  level: number | null
  is_main: boolean
  main_char_name: string | null
  join_date: string | null
}

export interface Member {
  id: string
  name: string
  guild: string
  role: string
  class: string
  level: number
  isMain: boolean
  mainCharName: string
  joinDate: string
}

export interface MemberFormData {
  name: string
  guild: string
  role: string
  class: string
  level: number
  isMain: boolean
  mainCharName: string
  joinDate: string
}

export function toMember(row: MemberRow): Member {
  return {
    id: String(row.id),
    name: row.name,
    guild: row.guild,
    role: row.role,
    class: row.class || '',
    level: row.level || 0,
    isMain: row.is_main,
    mainCharName: row.main_char_name || '',
    joinDate: row.join_date || '',
  }
}

export function toInsertRow(data: MemberFormData) {
  return {
    name: data.name,
    guild: data.guild,
    role: data.role,
    class: data.class || '',
    level: data.level || 0,
    is_main: data.isMain !== false,
    main_char_name: data.mainCharName || '',
    join_date: data.joinDate || new Date().toISOString().split('T')[0],
  }
}
