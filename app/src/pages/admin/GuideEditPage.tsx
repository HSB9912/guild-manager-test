import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { r2Upload, r2List } from '@/lib/r2'
import { useToast } from '@/components/ui/Toast'
import {
  Plus, Trash2, Save, Image, GripVertical, Eye, EyeOff,
  Bold, Italic, Underline, Link, ImagePlus, X,
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface GuidePage {
  id: number
  title: string
  content: string
  sort_order: number
  is_published: boolean
}

interface R2Image {
  name: string
  size: number
  created_at: string
}

export default function GuideEditPage() {
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['guide-pages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('guide_pages').select('*').order('sort_order')
      if (error) throw error
      return (data || []) as GuidePage[]
    },
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ title: '', content: '', is_published: true })
  const [previewMode, setPreviewMode] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  /* ─── mutations ─── */
  const savePage = useMutation({
    mutationFn: async ({
      id,
      title,
      content,
      is_published,
    }: {
      id?: number
      title: string
      content: string
      is_published: boolean
    }) => {
      if (id) {
        const { error } = await supabase
          .from('guide_pages')
          .update({ title, content, is_published })
          .eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('guide_pages').insert({
          title,
          content,
          sort_order: pages.length,
          is_published,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guide-pages'] })
      toast('저장 완료', 'success')
      setEditingId(null)
      setForm({ title: '', content: '', is_published: true })
      setPreviewMode(false)
    },
  })

  const deletePage = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('guide_pages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guide-pages'] })
      toast('삭제 완료', 'success')
    },
  })

  const togglePublished = useMutation({
    mutationFn: async ({ id, is_published }: { id: number; is_published: boolean }) => {
      const { error } = await supabase
        .from('guide_pages')
        .update({ is_published })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guide-pages'] })
      toast('상태 변경 완료', 'success')
    },
  })

  /* ─── rich text commands ─── */
  const execCmd = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }, [])

  const handleBold = () => execCmd('bold')
  const handleItalic = () => execCmd('italic')
  const handleUnderline = () => execCmd('underline')
  const handleLink = () => {
    const url = prompt('링크 URL을 입력하세요:', 'https://')
    if (url) execCmd('createLink', url)
  }
  const handleInsertImage = (url: string) => {
    execCmd('insertImage', url)
  }

  /* ─── image upload ─── */
  const handleImageUpload = async (file: File) => {
    try {
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const url = await r2Upload('guide-images', safeName, file)
      if (editorRef.current && editingId !== null && !previewMode) {
        handleInsertImage(url)
        syncContent()
      } else {
        setForm((f) => ({ ...f, content: f.content + `\n<img src="${url}" />` }))
      }
      toast('이미지 업로드 완료', 'success')
    } catch {
      toast('이미지 업로드 실패', 'error')
    }
  }

  const syncContent = () => {
    if (editorRef.current) {
      setForm((f) => ({ ...f, content: editorRef.current!.innerHTML }))
    }
  }

  const startEditing = (page?: GuidePage) => {
    if (page) {
      setEditingId(page.id)
      setForm({ title: page.title, content: page.content, is_published: page.is_published })
    } else {
      setEditingId(-1)
      setForm({ title: '', content: '', is_published: true })
    }
    setPreviewMode(false)
  }

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-800">가이드 편집</h2>
        <button
          onClick={() => startEditing()}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center gap-1.5"
        >
          <Plus size={14} /> 페이지 추가
        </button>
      </div>

      {/* Editor */}
      {editingId !== null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-gray-800">
              {editingId === -1 ? '새 페이지' : '페이지 수정'}
            </h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded accent-indigo-500"
                />
                공개
              </label>
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1',
                  previewMode
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}
              >
                {previewMode ? <EyeOff size={12} /> : <Eye size={12} />}
                {previewMode ? '편집' : '미리보기'}
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="페이지 제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300"
          />

          {previewMode ? (
            /* Preview */
            <div
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm min-h-[200px] prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: form.content }}
            />
          ) : (
            /* Rich text editor */
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-1 border border-gray-100 rounded-xl p-1.5 bg-gray-50">
                <button onClick={handleBold} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600" title="Bold">
                  <Bold size={14} />
                </button>
                <button onClick={handleItalic} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600" title="Italic">
                  <Italic size={14} />
                </button>
                <button onClick={handleUnderline} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600" title="Underline">
                  <Underline size={14} />
                </button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <button onClick={handleLink} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600" title="Link">
                  <Link size={14} />
                </button>
                <label className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 cursor-pointer" title="Image upload">
                  <ImagePlus size={14} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleImageUpload(e.target.files[0])
                    }}
                  />
                </label>
                <button
                  onClick={() => setShowGallery(true)}
                  className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600"
                  title="Image gallery"
                >
                  <Image size={14} />
                </button>
              </div>

              {/* ContentEditable */}
              <div
                ref={editorRef}
                contentEditable
                className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl text-sm min-h-[200px] outline-none focus:border-indigo-300 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: form.content }}
                onInput={syncContent}
                onBlur={syncContent}
              />
            </>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1" />
            <button
              onClick={() => {
                setEditingId(null)
                setPreviewMode(false)
              }}
              className="px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
            >
              취소
            </button>
            <button
              onClick={() =>
                savePage.mutate({
                  id: editingId === -1 ? undefined : editingId,
                  title: form.title,
                  content: form.content,
                  is_published: form.is_published,
                })
              }
              disabled={!form.title.trim()}
              className="px-4 py-2 bg-indigo-500 text-white text-xs font-bold rounded-xl hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1"
            >
              <Save size={13} /> 저장
            </button>
          </div>
        </div>
      )}

      {/* Image gallery modal */}
      {showGallery && (
        <ImageGallery
          onSelect={(url) => {
            if (editorRef.current && editingId !== null && !previewMode) {
              handleInsertImage(url)
              syncContent()
            } else {
              setForm((f) => ({ ...f, content: f.content + `\n<img src="${url}" />` }))
            }
            setShowGallery(false)
          }}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* Pages list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {isLoading ? (
          <p className="p-8 text-center text-gray-400 text-xs font-bold">로딩 중...</p>
        ) : pages.length === 0 ? (
          <p className="p-8 text-center text-gray-300 text-xs font-bold">
            가이드 페이지가 없습니다
          </p>
        ) : (
          pages.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50"
            >
              <GripVertical size={14} className="text-gray-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-gray-800">{p.title}</p>
                  {!p.is_published && (
                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded text-[8px] font-bold">
                      비공개
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 truncate">
                  {p.content.replace(/<[^>]*>/g, '').slice(0, 80)}
                </p>
              </div>
              <button
                onClick={() => togglePublished.mutate({ id: p.id, is_published: !p.is_published })}
                className={cn(
                  'p-1.5 rounded-lg text-[10px] font-bold',
                  p.is_published
                    ? 'text-emerald-500 hover:bg-emerald-50'
                    : 'text-gray-400 hover:bg-gray-100'
                )}
                title={p.is_published ? '비공개로 전환' : '공개로 전환'}
              >
                {p.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={() => startEditing(p)}
                className="px-2.5 py-1.5 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-indigo-50 hover:text-indigo-500"
              >
                편집
              </button>
              <button
                onClick={() => {
                  if (confirm('삭제?')) deletePage.mutate(p.id)
                }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ═══ Image Gallery Modal ═══ */
function ImageGallery({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const { data: images = [], isLoading } = useQuery({
    queryKey: ['r2-gallery'],
    queryFn: async () => {
      try {
        const list = await r2List('guide-images')
        return list as R2Image[]
      } catch {
        return []
      }
    },
  })

  const R2_PUBLIC_URL =
    import.meta.env.VITE_R2_PUBLIC_URL ?? 'https://pub-ee3a7d1dfe0a442b96336f0c81289a46.r2.dev'

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm text-gray-800">이미지 갤러리</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-center text-gray-400 text-xs font-bold p-8">로딩 중...</p>
          ) : images.length === 0 ? (
            <p className="text-center text-gray-300 text-xs font-bold p-8">
              업로드된 이미지가 없습니다
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((img) => {
                const url = `${R2_PUBLIC_URL}/guide-images/${img.name}`
                return (
                  <button
                    key={img.name}
                    onClick={() => onSelect(url)}
                    className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden hover:ring-2 hover:ring-indigo-400 transition-all group"
                  >
                    <img
                      src={url}
                      alt={img.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-bold bg-black/50 px-2 py-1 rounded-lg">
                        선택
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
