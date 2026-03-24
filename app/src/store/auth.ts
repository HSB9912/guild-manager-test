import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Role = 'admin' | 'member' | 'guest'

interface AuthUser {
  email: string
  name: string
  avatar: string
  role: string
}

interface AuthState {
  user: AuthUser | null
  role: Role
  loading: boolean
  initialized: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  init: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  role: 'guest',
  loading: true,
  initialized: false,

  login: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split('?')[0].split('#')[0] },
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, role: 'guest' })
  },

  checkAuth: async () => {
    set({ loading: true })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      set({ user: null, role: 'guest', loading: false })
      return
    }

    const authUser = buildUser(session)
    const role = await resolveRole(session.user.email!)

    set({ user: { ...authUser, role: role === 'admin' ? '관리자' : '멤버' }, role, loading: false })
  },

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    get().checkAuth()

    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        set({ user: null, role: 'guest', loading: false })
        return
      }
      const authUser = buildUser(session)
      resolveRole(session.user.email!).then((role) => {
        set({ user: { ...authUser, role: role === 'admin' ? '관리자' : '멤버' }, role, loading: false })
      })
    })
  },
}))

function buildUser(session: Session): AuthUser {
  const u = session.user
  return {
    email: u.email!,
    name: u.user_metadata?.full_name || u.user_metadata?.name || u.email!,
    avatar: u.user_metadata?.avatar_url || '',
    role: '',
  }
}

async function resolveRole(email: string): Promise<Role> {
  // Check admin_whitelist
  const { data: wl } = await supabase
    .from('admin_whitelist')
    .select('email, role, status')
    .eq('email', email)
    .maybeSingle()

  if (wl && wl.status === 'approved') return 'admin'

  // Fallback: check admin_auth
  const { data: aa } = await supabase
    .from('admin_auth')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (aa) return 'admin'

  return 'member'
}
