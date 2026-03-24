import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { ChevronLeft, ChevronRight, Plus, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/cn'

interface CalEvent {
  id: number
  date: string
  title: string
  content: string
}

function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').order('date')
      if (error) throw error
      return (data || []).map((e: Record<string, unknown>) => ({
        id: e.id as number,
        date: ((e.date as string) || '').split('T')[0].trim(),
        title: e.title as string,
        content: (e.content as string) || '',
      })) as CalEvent[]
    },
  })
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export default function CalendarPage() {
  const { data: events = [] } = useEvents()
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null)
  const [form, setForm] = useState({ title: '', content: '' })

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    events.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    })
    return map
  }, [events])

  const prevMonth = () => {
    if (month === 0) {
      setYear(year - 1)
      setMonth(11)
    } else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 11) {
      setYear(year + 1)
      setMonth(0)
    } else setMonth(month + 1)
  }

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) || [] : []

  // Open form for new event
  const openNewForm = () => {
    setEditingEvent(null)
    setForm({ title: '', content: '' })
    setShowForm(true)
  }

  // Open form for editing existing event
  const openEditForm = (ev: CalEvent) => {
    setEditingEvent(ev)
    setForm({ title: ev.title, content: ev.content })
    setShowForm(true)
  }

  // Save event (create or update)
  const saveEvent = useMutation({
    mutationFn: async () => {
      if (editingEvent) {
        // Update existing
        const { error } = await supabase
          .from('events')
          .update({ title: form.title, content: form.content })
          .eq('id', editingEvent.id)
        if (error) throw error
      } else {
        // Create new
        const { error } = await supabase.from('events').insert({
          date: selectedDate,
          title: form.title,
          content: form.content,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast(editingEvent ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.', 'success')
      setShowForm(false)
      setEditingEvent(null)
      setForm({ title: '', content: '' })
    },
  })

  const deleteEvent = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      toast('삭제되었습니다.', 'success')
      setShowForm(false)
      setEditingEvent(null)
    },
  })

  const days: { day: number; dateStr: string; isCurrent: boolean }[] = []
  // Previous month padding
  const prevDays = getDaysInMonth(year, month - 1)
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i
    days.push({ day: d, dateStr: '', isCurrent: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ day: d, dateStr, isCurrent: true })
  }
  // Next month padding
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, dateStr: '', isCurrent: false })
    }
  }

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-black text-gray-800">캘린더</h2>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:p-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <ChevronLeft size={18} />
          </button>
          <h3 className="text-base font-black text-gray-800">
            {year}년 {month + 1}월
          </h3>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="calendar-grid mb-1">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={cn(
                'calendar-head',
                i === 0 && 'text-red-400',
                i === 4 && 'text-indigo-500',
                i === 6 && 'text-blue-400',
              )}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="calendar-grid">
          {days.map((d, i) => {
            const isToday = d.dateStr === todayStr
            const isThursday = d.isCurrent && new Date(d.dateStr).getDay() === 4
            const dayEvents = d.dateStr ? eventsByDate.get(d.dateStr) || [] : []
            const isSelected = d.dateStr === selectedDate

            return (
              <div
                key={i}
                onClick={() => d.isCurrent && setSelectedDate(d.dateStr)}
                className={cn(
                  'calendar-day',
                  !d.isCurrent && 'not-current',
                  isToday && 'today',
                  isThursday && !isToday && 'thursday',
                  isSelected && !isToday && 'border-indigo-400 bg-indigo-50/50',
                )}
              >
                <span className="text-[11px] font-bold">{d.day}</span>
                {dayEvents.length > 0 && (
                  <>
                    <div className="event-dot" />
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className="event-snippet text-[8px] leading-tight text-indigo-600 font-bold truncate w-full px-0.5"
                        title={ev.title}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-indigo-400 mt-0.5 leading-none font-bold">
                        +{dayEvents.length - 2}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-gray-800">{selectedDate}</h3>
            {isAdmin && (
              <button
                onClick={openNewForm}
                className="px-3 py-1.5 bg-indigo-500 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-600 flex items-center gap-1"
              >
                <Plus size={12} /> 일정 추가
              </button>
            )}
          </div>

          {/* Add/Edit form */}
          {showForm && (
            <div className="mb-3 p-3 bg-gray-50 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-500">
                  {editingEvent ? '일정 수정' : '새 일정'}
                </span>
                {editingEvent && (
                  <button
                    onClick={() => {
                      if (confirm('이 일정을 삭제하시겠습니까?')) deleteEvent.mutate(editingEvent.id)
                    }}
                    className="text-[10px] font-bold text-red-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="일정 제목"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300"
              />
              <textarea
                placeholder="내용 (선택)"
                value={form.content}
                rows={2}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs outline-none focus:border-indigo-300 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowForm(false)
                    setEditingEvent(null)
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold text-gray-500"
                >
                  취소
                </button>
                <button
                  onClick={() => saveEvent.mutate()}
                  disabled={!form.title.trim() || saveEvent.isPending}
                  className="px-3 py-1.5 bg-indigo-500 text-white text-[10px] font-bold rounded-lg disabled:opacity-50"
                >
                  {editingEvent ? '수정' : '추가'}
                </button>
              </div>
            </div>
          )}

          {/* Events list */}
          {selectedEvents.length === 0 && !showForm ? (
            <p className="text-xs text-gray-300 font-bold">일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-start gap-2 p-3 rounded-xl border transition-all',
                    editingEvent?.id === e.id
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-gray-50 border-gray-100 hover:bg-indigo-50/50 hover:border-indigo-100',
                  )}
                >
                  <div className="flex-1">
                    <p className="text-xs font-bold text-gray-800">{e.title}</p>
                    {e.content && <p className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap">{e.content}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEditForm(e)}
                        className="p-1 rounded-lg hover:bg-indigo-100 text-gray-400 hover:text-indigo-500"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('삭제?')) deleteEvent.mutate(e.id)
                        }}
                        className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
