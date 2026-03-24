import { create } from 'zustand'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ToastState {
  message: string
  type: 'success' | 'error' | 'info'
  visible: boolean
  show: (message: string, type?: 'success' | 'error' | 'info') => void
  hide: () => void
}

export const useToast = create<ToastState>()((set) => ({
  message: '',
  type: 'info',
  visible: false,
  show: (message, type = 'info') => {
    set({ message, type, visible: true })
    setTimeout(() => set({ visible: false }), 3000)
  },
  hide: () => set({ visible: false }),
}))

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const COLORS = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-indigo-500',
}

export function Toast() {
  const { message, type, visible } = useToast()
  const Icon = ICONS[type]

  return (
    <div
      className={cn(
        'fixed bottom-20 lg:bottom-10 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2',
        'z-[200] bg-slate-900 text-white px-5 lg:px-8 py-3 lg:py-4',
        'rounded-xl lg:rounded-2xl shadow-2xl flex items-center gap-3 lg:gap-4',
        'border border-white/10 max-w-md mx-auto sm:mx-0',
        'transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
      )}
    >
      <Icon size={18} className={COLORS[type]} />
      <p className="text-sm font-bold">{message}</p>
    </div>
  )
}
