import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Applicant {
  id: number
  member_id: number
  name: string
  status: string
  applied_at: string | null
  promoted_at: string | null
}

export interface PromotionHistory {
  id: number
  week_label: string
  challenger_name: string
  challenger_score: number
  defender_name: string
  defender_score: number
  result: string
  reason: string
  executed_at: string
}

export function useApplicants() {
  return useQuery({
    queryKey: ['promotion-applicants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotion_applicants')
        .select('*')
        .eq('status', 'waiting')
        .order('applied_at')
      if (error) throw error
      return (data || []) as Applicant[]
    },
  })
}

export function usePromotionHistory() {
  return useQuery({
    queryKey: ['promotion-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotion_history')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data || []) as PromotionHistory[]
    },
  })
}

export function useAddApplicant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ memberId, name }: { memberId: number; name: string }) => {
      const { error } = await supabase
        .from('promotion_applicants')
        .upsert(
          { member_id: memberId, name, status: 'waiting', promoted_at: null },
          { onConflict: 'member_id' }
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotion-applicants'] }),
  })
}

export function useRemoveApplicant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('promotion_applicants').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotion-applicants'] }),
  })
}

export function useExecuteTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (trades: {
      applicantId: number
      challengerName: string
      challengerScore: number
      challengerMemberId: number | null
      defenderName: string
      defenderScore: number
      defenderMemberId: number | null
      reason: string
      weekLabel: string
    }[]) => {
      for (const t of trades) {
        await supabase.from('promotion_history').insert({
          week_label: t.weekLabel,
          challenger_name: t.challengerName,
          challenger_score: t.challengerScore,
          defender_name: t.defenderName,
          defender_score: t.defenderScore,
          result: 'promoted',
          reason: t.reason,
        })
        if (t.challengerMemberId) {
          await supabase.from('members').update({ guild: '뚠카롱' }).eq('id', t.challengerMemberId)
        }
        if (t.defenderMemberId) {
          await supabase.from('members').update({ guild: '뚱카롱' }).eq('id', t.defenderMemberId)
        }
        await supabase.from('promotion_applicants')
          .update({ status: 'promoted', promoted_at: new Date().toISOString() })
          .eq('id', t.applicantId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotion-applicants'] })
      qc.invalidateQueries({ queryKey: ['promotion-history'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}
