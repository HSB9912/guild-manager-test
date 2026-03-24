export interface PeriodRow {
  id: number
  period_label: string
  start_date: string | null
  end_date: string | null
}

export interface ScoreRow {
  id: number
  member_id: number
  period_id: number
  score: number
  date: string | null
}

/** member_id → { period_label → score } */
export type ScoreMap = Record<string, Record<string, number>>
