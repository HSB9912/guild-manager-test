import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { r2Upload } from '@/lib/r2'
import { useAuthStore } from '@/store/auth'
import { useToast } from '@/components/ui/Toast'
import { Plus, ArrowLeft, Heart, MessageCircle, Pin, Trash2, Pencil, Image, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

const BOARD_PER_PAGE = 10

const ALLOWED_TAGS = new Set([
  'b','i','u','s','em','strong','br','p','div','span','ul','ol','li',
  'h1','h2','h3','h4','h5','h6','blockquote','pre','code','hr','a','img',
  'table','thead','tbody','tr','th','td','sub','sup','mark','del','ins',
])
const ALLOWED_ATTRS = new Set([
  'style','href','src','alt','class','target','colspan','rowspan','width','height',
])

function sanitizeHTML(html: string): string {
  if (!html) return ''
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const sanitize = (node: Element) => {
    const children = [...node.childNodes]
    children.forEach((child) => {
      if (child.nodeType === 3) return
      if (child.nodeType === 1) {
        const el = child as Element
        if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
          while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el)
          el.parentNode!.removeChild(el)
          return
        }
        ;[...el.attributes].forEach((attr) => {
          if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) el.removeAttribute(attr.name)
        })
        if (el.tagName === 'A') el.setAttribute('target', '_blank')
        const style = el.getAttribute('style')
        if (style) el.setAttribute('style', style.replace(/expression|javascript|vbscript/gi, ''))
        sanitize(el)
      } else {
        child.parentNode!.removeChild(child)
      }
    })
  }
  sanitize(doc.body)
  return doc.body.innerHTML
}

interface Post {
  id: number
  board_type: string
  title: string
  content: string
  author: string
  author_name?: string
  author_email?: string
  is_pinned: boolean
  like_count: number
  comment_count: number
  view_count: number
  image_url: string | null
  images: string[] | null
  created_at: string
}

interface Comment {
  id: number
  post_id: number
  content: string
  author_name: string
  author_email: string
  created_at: string
}

type BoardType = 'notice' | 'free' | 'suggest'

const TAB_CONFIG: { key: BoardType; label: string }[] = [
  { key: 'notice', label: '공지' },
  { key: 'free', label: '자유' },
  { key: 'suggest', label: '건의' },
]

function usePosts(boardType: string) {
  return useQuery({
    queryKey: ['board-posts', boardType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('board_posts')
        .select('*')
        .eq('board_type', boardType)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Post[]
    },
  })
}

function useComments(postId: number | null) {
  return useQuery({
    queryKey: ['board-comments', postId],
    queryFn: async () => {
      if (!postId) return []
      const { data, error } = await supabase
        .from('board_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as Comment[]
    },
    enabled: !!postId,
  })
}

function useLikeStatus(postId: number | null, userEmail: string | null) {
  return useQuery({
    queryKey: ['board-like', postId, userEmail],
    queryFn: async () => {
      if (!postId || !userEmail) return false
      const { data } = await supabase
        .from('board_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_email', userEmail)
        .maybeSingle()
      return !!data
    },
    enabled: !!postId && !!userEmail,
  })
}

export default function BoardPage() {
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  const user = useAuthStore((s) => s.user)
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  const [tab, setTab] = useState<BoardType>('notice')
  const [viewPost, setViewPost] = useState<Post | null>(null)
  const [editing, setEditing] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [form, setForm] = useState({ title: '', content: '', imageFile: null as File | null, boardType: 'free' as string, isPinned: false })
  const [page, setPage] = useState(1)
  const [commentText, setCommentText] = useState('')

  const { data: allPosts = [], isLoading } = usePosts(tab)
  const { data: comments = [] } = useComments(viewPost?.id ?? null)
  const { data: liked = false } = useLikeStatus(viewPost?.id ?? null, user?.email ?? null)

  // Pagination
  const totalPages = Math.max(1, Math.ceil(allPosts.length / BOARD_PER_PAGE))
  const paginatedPosts = allPosts.slice((page - 1) * BOARD_PER_PAGE, page * BOARD_PER_PAGE)

  const resetPage = useCallback(() => setPage(1), [])

  const switchTab = (t: BoardType) => {
    setTab(t)
    setViewPost(null)
    setEditing(false)
    resetPage()
  }

  // Increment view count
  const openPost = useCallback(async (post: Post) => {
    setViewPost(post)
    try {
      await supabase.rpc('increment_view_count', { post_id_input: post.id })
    } catch {
      // ignore - RPC may not exist
    }
  }, [])

  // Save post
  const savePost = useMutation({
    mutationFn: async (data: {
      id?: number
      title: string
      content: string
      imageFile: File | null
      boardType: string
      isPinned: boolean
    }) => {
      let imageUrl: string | null = null
      if (data.imageFile) {
        const safeName = `${Date.now()}-${data.imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        imageUrl = await r2Upload('board-images', safeName, data.imageFile)
      }

      const authorName = user?.name || user?.email?.split('@')[0] || ''
      const authorEmail = user?.email || 'anonymous'

      if (data.id) {
        const update: Record<string, unknown> = {
          title: data.title,
          content: data.content,
          board_type: data.boardType,
          is_pinned: data.isPinned,
          updated_at: new Date().toISOString(),
        }
        if (imageUrl) update.image_url = imageUrl
        const { error } = await supabase.from('board_posts').update(update).eq('id', data.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('board_posts').insert({
          board_type: data.boardType,
          title: data.title,
          content: data.content,
          author: authorName,
          author_name: authorName,
          author_email: authorEmail,
          image_url: imageUrl,
          is_pinned: data.isPinned,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-posts'] })
      toast('저장되었습니다.', 'success')
      setEditing(false)
      setEditingPost(null)
      setForm({ title: '', content: '', imageFile: null, boardType: tab, isPinned: false })
      setViewPost(null)
    },
  })

  // Delete post
  const deletePost = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('board_posts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-posts'] })
      toast('삭제되었습니다.', 'success')
      setViewPost(null)
    },
  })

  // Toggle pin
  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: number; pinned: boolean }) => {
      const { error } = await supabase.from('board_posts').update({ is_pinned: !pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-posts'] })
      toast('고정 상태가 변경되었습니다.', 'success')
    },
  })

  // Toggle like
  const toggleLike = useMutation({
    mutationFn: async (postId: number) => {
      if (!user?.email) throw new Error('로그인이 필요합니다.')
      const { data: existing } = await supabase
        .from('board_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_email', user.email)
        .maybeSingle()

      if (existing) {
        await supabase.from('board_likes').delete().eq('id', existing.id)
        await supabase
          .from('board_posts')
          .update({ like_count: Math.max(0, (viewPost?.like_count || 1) - 1) })
          .eq('id', postId)
      } else {
        await supabase.from('board_likes').insert({ post_id: postId, user_email: user.email })
        await supabase
          .from('board_posts')
          .update({ like_count: (viewPost?.like_count || 0) + 1 })
          .eq('id', postId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-posts'] })
      qc.invalidateQueries({ queryKey: ['board-like'] })
      // Refresh the post detail
      if (viewPost) {
        supabase
          .from('board_posts')
          .select('*')
          .eq('id', viewPost.id)
          .single()
          .then(({ data }) => {
            if (data) setViewPost(data as Post)
          })
      }
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  // Add comment
  const addComment = useMutation({
    mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
      const authorName = user?.name || user?.email?.split('@')[0] || '익명'
      const authorEmail = user?.email || 'anonymous'
      await supabase.from('board_comments').insert({
        post_id: postId,
        content,
        author_email: authorEmail,
        author_name: authorName,
      })
      // Update comment count
      const { data: post } = await supabase.from('board_posts').select('comment_count').eq('id', postId).single()
      await supabase
        .from('board_posts')
        .update({ comment_count: (post?.comment_count || 0) + 1 })
        .eq('id', postId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-comments'] })
      qc.invalidateQueries({ queryKey: ['board-posts'] })
      setCommentText('')
      // Refresh post
      if (viewPost) {
        supabase
          .from('board_posts')
          .select('*')
          .eq('id', viewPost.id)
          .single()
          .then(({ data }) => {
            if (data) setViewPost(data as Post)
          })
      }
    },
  })

  // Delete comment
  const deleteComment = useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: number; postId: number }) => {
      await supabase.from('board_comments').delete().eq('id', commentId)
      const { count } = await supabase
        .from('board_comments')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId)
      await supabase.from('board_posts').update({ comment_count: count || 0 }).eq('id', postId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-comments'] })
      qc.invalidateQueries({ queryKey: ['board-posts'] })
      if (viewPost) {
        supabase
          .from('board_posts')
          .select('*')
          .eq('id', viewPost.id)
          .single()
          .then(({ data }) => {
            if (data) setViewPost(data as Post)
          })
      }
    },
  })

  // Editor view
  if (editing) {
    return (
      <div className="fade-in space-y-4 max-w-2xl mx-auto">
        <button
          onClick={() => { setEditing(false); setEditingPost(null) }}
          className="flex items-center gap-1 text-xs text-gray-400 font-bold hover:text-indigo-500"
        >
          <ArrowLeft size={14} /> 뒤로
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-gray-800">{editingPost ? '글 수정' : '글 작성'}</h3>

          <div className="flex items-center gap-2">
            <select
              value={form.boardType}
              onChange={(e) => setForm((f) => ({ ...f, boardType: e.target.value }))}
              className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-[11px] font-bold outline-none"
            >
              {isAdmin && <option value="notice">공지</option>}
              <option value="free">자유</option>
              <option value="suggest">건의사항</option>
            </select>
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
                />
                상단 고정
              </label>
            )}
          </div>

          <input
            type="text"
            placeholder="제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300"
          />
          <textarea
            placeholder="내용을 입력하세요..."
            value={form.content}
            rows={10}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-indigo-300 resize-y"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-500 cursor-pointer hover:bg-gray-100">
              <Image size={14} />
              {form.imageFile ? form.imageFile.name : '이미지 첨부'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.files?.[0] || null }))}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setEditingPost(null) }}
              className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
            >
              취소
            </button>
            <button
              onClick={() =>
                savePost.mutate({
                  id: editingPost?.id,
                  title: form.title,
                  content: form.content,
                  imageFile: form.imageFile,
                  boardType: form.boardType,
                  isPinned: form.isPinned,
                })
              }
              disabled={!form.title.trim() || savePost.isPending}
              className="px-4 py-2 bg-indigo-500 text-white text-sm font-bold rounded-xl hover:bg-indigo-600 disabled:opacity-50"
            >
              {savePost.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Detail view
  if (viewPost) {
    const postImages = viewPost.images || (viewPost.image_url ? [viewPost.image_url] : [])
    const dateObj = new Date(viewPost.created_at)
    const dateStr = `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`
    const authorName = viewPost.author_name || viewPost.author || '익명'

    return (
      <div className="fade-in space-y-4 max-w-2xl mx-auto">
        <button
          onClick={() => setViewPost(null)}
          className="flex items-center gap-1 text-xs text-gray-400 font-bold hover:text-indigo-500"
        >
          <ArrowLeft size={14} /> 목록
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {/* Header */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-start justify-between mb-2">
              <div>
                {viewPost.is_pinned && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-md font-bold mr-2">
                    고정
                  </span>
                )}
                <h3 className="text-lg font-black text-gray-800 inline">{viewPost.title}</h3>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <button
                    onClick={() => togglePin.mutate({ id: viewPost.id, pinned: viewPost.is_pinned })}
                    className={cn(
                      'p-1.5 rounded-lg hover:bg-indigo-50',
                      viewPost.is_pinned ? 'text-indigo-500' : 'text-gray-400 hover:text-indigo-500',
                    )}
                    title={viewPost.is_pinned ? '고정 해제' : '고정'}
                  >
                    <Pin size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingPost(viewPost)
                      setForm({
                        title: viewPost.title,
                        content: viewPost.content,
                        imageFile: null,
                        boardType: viewPost.board_type,
                        isPinned: viewPost.is_pinned,
                      })
                      setEditing(true)
                    }}
                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-500"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('삭제하시겠습니까?')) deletePost.mutate(viewPost.id)
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold">
              <span>{authorName}</span>
              <span>·</span>
              <span>{dateStr}</span>
              <span className="flex items-center gap-0.5">
                <Eye size={10} /> {(viewPost.view_count || 0) + 1}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart size={10} /> {viewPost.like_count}
              </span>
            </div>
          </div>

          {/* Content */}
          <div
            className="p-5 text-sm text-gray-700 leading-relaxed break-words board-content"
            dangerouslySetInnerHTML={{ __html: sanitizeHTML(viewPost.content) }}
          />

          {/* Images */}
          {postImages.length > 0 && (
            <div className="px-5 pb-4 flex flex-wrap gap-2">
              {postImages.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="rounded-xl border border-gray-100 max-h-60 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => window.open(url, '_blank')}
                />
              ))}
            </div>
          )}

          {/* Like button */}
          <div className="px-5 pb-4 flex items-center gap-2">
            <button
              onClick={() => {
                if (!user) {
                  toast('로그인이 필요합니다.', 'error')
                  return
                }
                toggleLike.mutate(viewPost.id)
              }}
              className={cn(
                'px-4 py-2 rounded-xl border text-[11px] font-bold transition-all',
                liked
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-500'
                  : 'border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-400',
              )}
            >
              <Heart size={12} className="inline mr-1" />
              추천 {viewPost.like_count}
            </button>
          </div>

          {/* Comments section */}
          <div className="border-t border-gray-100 p-5">
            <h4 className="text-[11px] font-bold text-gray-600 mb-3 flex items-center gap-1">
              <MessageCircle size={12} className="text-indigo-400" />
              댓글 {comments.length}개
            </h4>
            <div className="space-y-2 mb-4">
              {comments.map((c) => {
                const cd = new Date(c.created_at)
                const cds = `${cd.getMonth() + 1}/${cd.getDate()} ${String(cd.getHours()).padStart(2, '0')}:${String(cd.getMinutes()).padStart(2, '0')}`
                const canDelete = isAdmin || (user && user.email === c.author_email)
                return (
                  <div key={c.id} className="flex gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-700">{c.author_name || '익명'}</span>
                        <span className="text-[9px] text-gray-400">{cds}</span>
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (confirm('댓글을 삭제하시겠습니까?'))
                                deleteComment.mutate({ commentId: c.id, postId: viewPost.id })
                            }}
                            className="text-[9px] text-red-400 hover:text-red-600 ml-auto"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 mt-1 whitespace-pre-wrap break-words">{c.content}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Add comment */}
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    addComment.mutate({ postId: viewPost.id, content: commentText.trim() })
                  }
                }}
                placeholder="댓글을 입력하세요..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={() => {
                  if (commentText.trim()) addComment.mutate({ postId: viewPost.id, content: commentText.trim() })
                }}
                disabled={!commentText.trim() || addComment.isPending}
                className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-bold shadow hover:bg-indigo-600 transition-all shrink-0 disabled:opacity-50"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-gray-800">게시판</h2>
        <button
          onClick={() => {
            setEditingPost(null)
            setForm({ title: '', content: '', imageFile: null, boardType: tab, isPinned: false })
            setEditing(true)
          }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 flex items-center gap-1.5"
        >
          <Plus size={14} /> 글쓰기
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 shadow-sm w-fit">
        {TAB_CONFIG.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-bold transition-all',
              tab === key ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:bg-gray-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <p className="p-8 text-center text-gray-400 text-xs font-bold">로딩 중...</p>
          ) : paginatedPosts.length === 0 ? (
            <p className="p-8 text-center text-gray-300 text-xs font-bold">게시글이 없습니다</p>
          ) : (
            paginatedPosts.map((post) => {
              const date = new Date(post.created_at)
              const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
              const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
              return (
                <div
                  key={post.id}
                  onClick={() => openPost(post)}
                  className="px-4 py-3 hover:bg-gray-50/50 cursor-pointer transition-all flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {post.is_pinned && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-indigo-500 text-white text-[8px] font-black rounded">
                          고정
                        </span>
                      )}
                      <span className="font-bold text-sm text-gray-800 truncate">{post.title}</span>
                      {post.comment_count > 0 && (
                        <span className="text-[9px] font-bold text-indigo-500">[{post.comment_count}]</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-bold">
                      <span>{post.author_name || post.author || '익명'}</span>
                      <span>
                        {dateStr} {timeStr}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Eye size={9} /> {post.view_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400 shrink-0">
                    {post.like_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Heart size={11} /> {post.like_count}
                      </span>
                    )}
                    {post.comment_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        <MessageCircle size={11} /> {post.comment_count}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-gray-100 flex justify-center items-center gap-4 bg-gray-50/50">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:bg-indigo-50 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:bg-indigo-50 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
