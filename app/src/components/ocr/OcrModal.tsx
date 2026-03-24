import { useState, useRef } from 'react'
import { initOcr, processImage, terminateOcr, type OcrRecord } from '@/lib/ocr'
import { X, Camera, Image, Users, Loader2 } from 'lucide-react'

interface Props {
  onApply: (records: OcrRecord[]) => void
  onClose: () => void
}

export function OcrModal({ onApply, onClose }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'capturing' | 'processing'>('idle')
  const [statusText, setStatusText] = useState('')
  const [records, setRecords] = useState<OcrRecord[]>([])
  const [stream, setStream] = useState<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize OCR engine on mount
  const ensureReady = async () => {
    if (status === 'ready' || status === 'capturing') return
    setStatus('loading')
    setStatusText('OCR 엔진 로딩 중...')
    try {
      await initOcr()
      setStatus('ready')
      setStatusText('OCR 엔진 준비 완료!')
    } catch {
      setStatusText('OCR 엔진 로딩 실패')
      setStatus('idle')
    }
  }

  // Auto-init on open
  useState(() => { ensureReady() })

  const handleStartCapture = async () => {
    await ensureReady()
    setStatusText('화면 선택 중...')
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' } as MediaTrackConstraints,
        audio: false,
      })
      setStream(mediaStream)
      setStatus('capturing')
      setStatusText('캡처 중... 길드 컨텐츠 창을 스크롤하세요')

      const video = document.createElement('video')
      video.srcObject = mediaStream
      video.autoplay = true
      video.muted = true

      mediaStream.getVideoTracks()[0].onended = () => stopCapture(mediaStream)

      // Process frames every 1.5s
      let processing = false
      intervalRef.current = setInterval(async () => {
        if (processing || video.readyState < 2) return
        processing = true
        try {
          const bitmap = await createImageBitmap(video)
          const results = await processImage(bitmap)
          if (results.length > 0) {
            setRecords((prev) => {
              const map = new Map(prev.map((r) => [r.name, r]))
              results.forEach((r) => map.set(r.name, r))
              return Array.from(map.values())
            })
          }
        } catch { /* ignore */ }
        processing = false
      }, 1500)
    } catch {
      setStatusText('캡처 취소됨')
      setStatus('ready')
    }
  }

  const stopCapture = (s?: MediaStream) => {
    const target = s || stream
    if (target) {
      target.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setStatus('ready')
    setStatusText(records.length > 0 ? `캡처 완료 — ${records.length}명 인식` : '캡처 완료')
  }

  const handleImageFile = async (file: File) => {
    await ensureReady()
    setStatus('processing')
    setStatusText('이미지 분석 중...')
    try {
      const bitmap = await createImageBitmap(file)
      const results = await processImage(bitmap)
      if (results.length > 0) {
        setRecords((prev) => {
          const map = new Map(prev.map((r) => [r.name, r]))
          results.forEach((r) => map.set(r.name, r))
          return Array.from(map.values())
        })
      }
      setStatusText(results.length > 0 ? `${results.length}명 인식 완료` : '인식 결과 없음')
    } catch {
      setStatusText('이미지 분석 실패')
    }
    setStatus('ready')
  }

  const handleClose = () => {
    stopCapture()
    terminateOcr()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Camera size={18} className="text-emerald-500" />
              화면 캡처 OCR
            </h3>
            <p className="text-[10px] text-gray-400 font-bold mt-0.5">
              메이플스토리 길드 컨텐츠 창을 띄운 화면에서 캡처하세요.
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Status */}
          <div className="flex items-center gap-2">
            {(status === 'loading' || status === 'processing') && (
              <Loader2 size={14} className="text-emerald-500 animate-spin" />
            )}
            {status === 'ready' && (
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            )}
            {status === 'capturing' && (
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            )}
            <span className="text-xs font-bold text-gray-600">{statusText || '초기화 중...'}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {status === 'capturing' ? (
              <button onClick={() => stopCapture()}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 flex items-center justify-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                캡처 중지
              </button>
            ) : (
              <button onClick={handleStartCapture}
                disabled={status === 'loading' || status === 'processing'}
                className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2">
                <Camera size={14} />
                ▶ 화면 캡처 시작
              </button>
            )}
            <button onClick={() => fileRef.current?.click()}
              disabled={status === 'loading' || status === 'capturing'}
              className="px-5 py-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2">
              <Image size={14} />
              이미지 파일
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]) }} />
          </div>

          {/* Instructions */}
          <div className="bg-emerald-50 rounded-xl p-3 text-[10px] text-emerald-700 font-bold space-y-1">
            <p className="flex items-center gap-1"><span className="text-emerald-500">ℹ</span> 사용법:</p>
            <p className="pl-4">1. "화면 캡처 시작" → 메이플스토리 화면 선택</p>
            <p className="pl-4">2. 길드 컨텐츠 창에서 천천히 스크롤하면 자동 인식</p>
            <p className="pl-4">3. 인식 완료 후 "수로 점수 적용하기" 클릭</p>
          </div>

          {/* Results */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500">인식 결과</span>
              <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-1">
                <Users size={12} /> {records.length}명
              </span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-400">닉네임</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-bold text-gray-400">지하수로 점수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.length === 0 ? (
                    <tr><td colSpan={2} className="px-3 py-4 text-center text-gray-300 text-[10px] font-bold">
                      캡처를 시작하면 결과가 표시됩니다
                    </td></tr>
                  ) : records.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 font-bold text-gray-700">{r.name}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-600">
                        {r.culv.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Apply button */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => { onApply(records); handleClose() }}
            disabled={records.length === 0}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl text-sm font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            → 수로 점수 적용하기
          </button>
        </div>
      </div>
    </div>
  )
}
