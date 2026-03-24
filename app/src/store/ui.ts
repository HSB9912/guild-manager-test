import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type FontSize = 'sm' | 'md' | 'lg'

interface UIState {
  darkMode: boolean
  sidebarOpen: boolean
  fontSize: FontSize
  toggleDarkMode: () => void
  setSidebarOpen: (open: boolean) => void
  setFontSize: (size: FontSize) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      darkMode: false,
      sidebarOpen: false,
      fontSize: 'md' as FontSize,
      toggleDarkMode: () =>
        set((s) => {
          const next = !s.darkMode
          document.body.classList.toggle('dark', next)
          return { darkMode: next }
        }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setFontSize: (fontSize) => {
        document.body.classList.remove('font-sm', 'font-lg')
        if (fontSize !== 'md') document.body.classList.add(`font-${fontSize}`)
        set({ fontSize })
      },
    }),
    {
      name: 'guild-ui',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.darkMode) document.body.classList.add('dark')
        if (state.fontSize !== 'md') document.body.classList.add(`font-${state.fontSize}`)
      },
    }
  )
)
