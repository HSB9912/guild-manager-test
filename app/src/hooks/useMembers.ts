import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toMember, toInsertRow, type Member, type MemberRow, type MemberFormData } from '@/types/member'

async function fetchAllMembers(): Promise<Member[]> {
  const pageSize = 1000
  let allData: MemberRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    allData = allData.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return allData.map(toMember)
}

export function useMembers() {
  return useQuery({
    queryKey: ['members'],
    queryFn: fetchAllMembers,
  })
}

export function useAddMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: MemberFormData) => {
      const { error } = await supabase.from('members').insert(toInsertRow(data))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MemberFormData> }) => {
      const update: Record<string, unknown> = {}
      if (data.name !== undefined) update.name = data.name
      if (data.guild !== undefined) update.guild = data.guild
      if (data.role !== undefined) update.role = data.role
      if (data.class !== undefined) update.class = data.class
      if (data.level !== undefined) update.level = data.level
      if (data.isMain !== undefined) update.is_main = data.isMain
      if (data.mainCharName !== undefined) update.main_char_name = data.mainCharName
      if (data.joinDate !== undefined) update.join_date = data.joinDate
      const { error } = await supabase.from('members').update(update).eq('id', Number(id))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('members').delete().eq('id', Number(id))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })
}
