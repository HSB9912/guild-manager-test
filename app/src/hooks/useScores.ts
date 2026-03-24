import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PeriodRow, ScoreRow, ScoreMap } from '@/types/score'

async function fetchAll<T>(table: string, orderCol: string): Promise<T[]> {
  const pageSize = 1000
  let all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderCol, { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat((data || []) as T[])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

export function usePeriods() {
  return useQuery({
    queryKey: ['suro-periods'],
    queryFn: () => fetchAll<PeriodRow>('suro_periods', 'period_label'),
  })
}

export function useScores() {
  return useQuery({
    queryKey: ['suro-scores'],
    queryFn: () => fetchAll<ScoreRow>('suro_scores', 'id'),
  })
}

/** Build a map: member_id → { period_label → score } */
export function buildScoreMap(periods: PeriodRow[], scores: ScoreRow[]): ScoreMap {
  const periodById = new Map(periods.map((p) => [p.id, p.period_label]))
  const map: ScoreMap = {}
  for (const s of scores) {
    const label = periodById.get(s.period_id)
    if (!label) continue
    const mid = String(s.member_id)
    if (!map[mid]) map[mid] = {}
    map[mid][label] = s.score
  }
  return map
}

export function useUpsertScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      memberId,
      periodLabel,
      score,
    }: {
      memberId: number
      periodLabel: string
      score: number
    }) => {
      // Find or create period
      let { data: period } = await supabase
        .from('suro_periods')
        .select('id')
        .eq('period_label', periodLabel)
        .maybeSingle()

      if (!period) {
        const { data: np, error } = await supabase
          .from('suro_periods')
          .insert({ period_label: periodLabel, start_date: '', end_date: '' })
          .select()
          .single()
        if (error) throw error
        period = np
      }

      // Delete existing then upsert
      await supabase
        .from('suro_scores')
        .delete()
        .eq('member_id', memberId)
        .eq('period_id', period!.id)

      const { error } = await supabase
        .from('suro_scores')
        .upsert(
          { member_id: memberId, period_id: period!.id, score },
          { onConflict: 'member_id,period_id' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suro-scores'] })
      qc.invalidateQueries({ queryKey: ['suro-periods'] })
    },
  })
}
