import { useState, useRef } from 'react'
import { initOcr, processImage, type OcrRecord } from '@/lib/ocr'
import { Camera, Upload, Loader2 } from 'lucide-react'

interface Props {
  onResults: (records: OcrRecord[]) => void
}

export function OcrUploader({ onResults }: Props) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setLoading(true)
    setStatus('OCR 엔진 로딩 중...')
    try {
      await initOcr()
      setStatus('이미지 분석 중...')
      const bitmap = await createImageBitmap(file)
      const records = await processImage(bitmap)
      onResults(records)
      setStatus(records.length > 0 ? `${records.length}명 인식 완료` : '인식 결과 없음 — 수동 입력해주세요')
    } catch (e) {
      setStatus('OCR 처리 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleScreenCapture = async () => {
    setLoading(true)
    setStatus('화면 캡처 중...')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'never' } as MediaTrackConstraints })
      const track = stream.getVideoTracks()[0]
      const imageCapture = new (window as unknown as { ImageCapture: new (track: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture(track)

      // Wait for frame
      await new Promise((r) => setTimeout(r, 500))
      const bitmap = await imageCapture.grabFrame()
      track.stop()

      setStatus('OCR 엔진 로딩 중...')
      await initOcr()
      setStatus('이미지 분석 중...')
      const records = await processImage(bitmap)
      onResults(records)
      setStatus(records.length > 0 ? `${records.length}명 인식 완료` : '인식 결과 없음')
    } catch (e) {
      setStatus('캡처 취소 또는 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleScreenCapture}
        disabled={loading}
        className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
        화면 캡처 OCR
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
      >
        <Upload size={13} />
        이미지 업로드
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
      />
      {status && (
        <span className="text-[10px] font-bold text-gray-400">{status}</span>
      )}
    </div>
  )
}
