import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="fade-in flex flex-col items-center justify-center h-64 text-center">
      <p className="text-6xl font-black text-gray-200 mb-2">404</p>
      <p className="text-sm font-bold text-gray-500 mb-4">페이지를 찾을 수 없습니다</p>
      <Link to="/" className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center gap-1.5">
        <Home size={14} /> 홈으로
      </Link>
    </div>
  )
}
