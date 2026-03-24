import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'

const Lazy = (factory: () => Promise<{ default: React.ComponentType }>) => {
  const Comp = lazy(() =>
    factory().catch(() => {
      // New build deployed — old chunk no longer exists. Reload once.
      const key = 'chunk-reload'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
      }
      return factory() // fallback attempt
    })
  )
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-gray-400 font-bold text-sm">로딩 중...</div>}>
      <Comp />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: Lazy(() => import('@/pages/HomePage')) },
      { path: 'members', element: Lazy(() => import('@/pages/MembersPage')) },
      { path: 'analysis', element: Lazy(() => import('@/pages/AnalysisPage')) },
      { path: 'promotion', element: Lazy(() => import('@/pages/PromotionPage')) },
      { path: 'stats', element: Lazy(() => import('@/pages/StatsPage')) },
      { path: 'rewards', element: Lazy(() => import('@/pages/RewardsPage')) },
      { path: 'board', element: Lazy(() => import('@/pages/BoardPage')) },
      { path: 'buddy', element: Lazy(() => import('@/pages/BuddyPage')) },
      { path: 'bail', element: Lazy(() => import('@/pages/BailPage')) },
      { path: 'penalty', element: Lazy(() => import('@/pages/PenaltyPage')) },
      // Admin
      { path: 'admin/history', element: Lazy(() => import('@/pages/admin/HistoryPage')) },
      { path: 'admin/suro-input', element: Lazy(() => import('@/pages/admin/SuroInputPage')) },
      { path: 'admin/role-assign', element: Lazy(() => import('@/pages/admin/RoleAssignPage')) },
      { path: 'admin/guide-edit', element: Lazy(() => import('@/pages/admin/GuideEditPage')) },
      { path: 'admin/sync', element: Lazy(() => import('@/pages/admin/SyncPage')) },
      { path: 'admin/db-sheet', element: Lazy(() => import('@/pages/admin/DbSheetPage')) },
      { path: 'admin/settings', element: Lazy(() => import('@/pages/admin/SettingsPage')) },
      // 404
      { path: '*', element: Lazy(() => import('@/pages/NotFoundPage')) },
    ],
  },
], { basename: import.meta.env.BASE_URL })
