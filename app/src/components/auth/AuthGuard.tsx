import { useAuthStore } from '@/store/auth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuthStore()

  if (loading) {
    return <LoadingOverlay />
  }

  return <>{children}</>
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-white z-[10000] flex flex-col justify-center items-center">
      <div className="text-center w-72">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-200 text-2xl mx-auto mb-6">
          뚠
        </div>
        <p className="text-gray-800 font-black text-lg tracking-tight mb-1">
          뚠카롱 길드 관리
        </p>
        <p className="text-gray-400 font-bold text-xs mb-6">서버 연결 중...</p>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full animate-pulse w-1/2" />
        </div>
      </div>
    </div>
  )
}
