import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { r2Upload, r2List, R2_PUBLIC_URL } from '@/lib/r2'
import { useToast } from '@/components/ui/Toast'
import {
  Plus, Trash2, Save, Image, GripVertical, Eye, EyeOff,
  Bold, Italic, Underline, Link, ImagePlus, X, Code2,
  ChevronDown, Type, List, ListOrdered, Quote, Minus,
  LayoutGrid, Hash, FileCode, Palette,
} from 'lucide-react'
import { cn } from '@/lib/cn'

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface GuidePage {
  id: number
  slug: string
  title: string
  content: string
  sort_order: number
  is_published: boolean
  label?: string
  icon?: string
}

interface R2Image {
  name: string
  size: number
  created_at: string
}

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_HOME_TABS = [
  { slug: 'notice1', label: '공지 1', icon: 'bullhorn' },
  { slug: 'notice2', label: '공지 2', icon: 'bullhorn' },
  { slug: 'notice3', label: '공지 3', icon: 'bullhorn' },
  { slug: 'intro', label: '길드 소개', icon: 'heart' },
  { slug: 'ranks', label: '직위 & 부캐', icon: 'medal' },
  { slug: 'links', label: '링크 모음', icon: 'link' },
]

const GUIDE_BLOCKS = [
  { id: 'card_red', icon: '\u2764\uFE0F', label: '카드 (빨강)', html: `<div class="bg-white rounded-2xl border border-gray-100 overflow-hidden" style="margin-bottom:12px"><div style="padding:12px 20px;background:linear-gradient(to right,#fef2f2,#fff1f2);border-bottom:1px solid #fecdd3;display:flex;align-items:center;gap:8px"><span style="font-size:14px">\u2764\uFE0F</span><h4 style="font-size:12px;font-weight:900;color:#dc2626;margin:0">제목을 입력하세요</h4></div><div style="padding:20px;font-size:12px;color:#4b5563;line-height:1.8"><p>내용을 입력하세요</p></div></div>` },
  { id: 'card_blue', icon: '\uD83D\uDC8E', label: '카드 (파랑)', html: `<div class="bg-white rounded-2xl border border-gray-100 overflow-hidden" style="margin-bottom:12px"><div style="padding:12px 20px;background:linear-gradient(to right,#eff6ff,#eef2ff);border-bottom:1px solid #bfdbfe;display:flex;align-items:center;gap:8px"><span style="font-size:14px">\uD83D\uDC8E</span><h4 style="font-size:12px;font-weight:900;color:#2563eb;margin:0">제목을 입력하세요</h4></div><div style="padding:20px;font-size:12px;color:#4b5563;line-height:1.8"><p>내용을 입력하세요</p></div></div>` },
  { id: 'card_amber', icon: '\uD83C\uDF53', label: '카드 (주황)', html: `<div class="bg-white rounded-2xl border border-gray-100 overflow-hidden" style="margin-bottom:12px"><div style="padding:12px 20px;background:linear-gradient(to right,#fffbeb,#fff7ed);border-bottom:1px solid #fde68a;display:flex;align-items:center;gap:8px"><span style="font-size:14px">\uD83C\uDF53</span><h4 style="font-size:12px;font-weight:900;color:#b45309;margin:0">제목을 입력하세요</h4></div><div style="padding:20px;font-size:12px;color:#4b5563;line-height:1.8"><p>내용을 입력하세요</p></div></div>` },
  { id: 'card_green', icon: '\u2615', label: '카드 (초록)', html: `<div class="bg-white rounded-2xl border border-gray-100 overflow-hidden" style="margin-bottom:12px"><div style="padding:12px 20px;background:linear-gradient(to right,#f0fdf4,#ecfdf5);border-bottom:1px solid #bbf7d0;display:flex;align-items:center;gap:8px"><span style="font-size:14px">\u2615</span><h4 style="font-size:12px;font-weight:900;color:#15803d;margin:0">제목을 입력하세요</h4></div><div style="padding:20px;font-size:12px;color:#4b5563;line-height:1.8"><p>내용을 입력하세요</p></div></div>` },
  { id: 'highlight_pink', icon: '\uD83C\uDF38', label: '강조 박스 (핑크)', html: `<div style="background:linear-gradient(135deg,#fdf2f8,#fff1f2);padding:24px;border-radius:16px;border:1px solid #fbcfe8;margin-bottom:12px"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:28px">\uD83C\uDF53</span><div><h3 style="font-size:18px;font-weight:900;color:#1f2937;margin:0">제목</h3><p style="font-size:12px;color:#ec4899;font-weight:700;margin:4px 0 0 0">부제목</p></div></div><p style="font-size:13px;color:#6b7280">내용을 입력하세요</p></div>` },
  { id: 'count_grid', icon: '\uD83D\uDCCA', label: '인원수 카드', html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px"><div style="background:white;padding:16px;border-radius:16px;border:1px solid #f3f4f6;text-align:center"><p style="font-size:24px;font-weight:900;color:#ec4899;margin:0">{{뚠카롱_count}}</p><p style="font-size:10px;color:#9ca3af;font-weight:700;margin:4px 0 0 0">\uD83C\uDF53 뚠카롱</p></div><div style="background:white;padding:16px;border-radius:16px;border:1px solid #f3f4f6;text-align:center"><p style="font-size:24px;font-weight:900;color:#f43f5e;margin:0">{{뚱카롱_count}}</p><p style="font-size:10px;color:#9ca3af;font-weight:700;margin:4px 0 0 0">\uD83C\uDF70 뚱카롱</p></div><div style="background:white;padding:16px;border-radius:16px;border:1px solid #f3f4f6;text-align:center"><p style="font-size:24px;font-weight:900;color:#6366f1;margin:0">{{부캐_count}}</p><p style="font-size:10px;color:#9ca3af;font-weight:700;margin:4px 0 0 0">\uD83C\uDF19 부캐 합산</p></div><div style="background:white;padding:16px;border-radius:16px;border:1px solid #f3f4f6;text-align:center"><p style="font-size:24px;font-weight:900;color:#374151;margin:0">{{전체_count}}</p><p style="font-size:10px;color:#9ca3af;font-weight:700;margin:4px 0 0 0">\uD83D\uDC65 전체</p></div></div>` },
  { id: 'table_simple', icon: '\uD83D\uDCCB', label: '표 (4열)', html: `<div style="background:white;border-radius:16px;border:1px solid #f3f4f6;overflow:hidden;margin-bottom:12px"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="font-size:10px;color:#9ca3af;border-bottom:1px solid #f3f4f6"><th style="padding:10px;text-align:left">항목1</th><th style="padding:10px;text-align:left">항목2</th><th style="padding:10px;text-align:center">항목3</th><th style="padding:10px;text-align:left">항목4</th></tr></thead><tbody style="font-weight:700;color:#374151"><tr style="background:rgba(254,249,195,0.3);border-bottom:1px solid #fafafa"><td style="padding:10px">데이터1</td><td style="padding:10px">데이터2</td><td style="padding:10px;text-align:center;color:#22c55e">O</td><td style="padding:10px;font-size:11px">데이터4</td></tr><tr style="border-bottom:1px solid #fafafa"><td style="padding:10px">데이터1</td><td style="padding:10px">데이터2</td><td style="padding:10px;text-align:center;color:#ef4444">X</td><td style="padding:10px;font-size:11px">데이터4</td></tr></tbody></table></div>` },
  { id: 'link_card', icon: '\uD83D\uDD17', label: '링크 카드', html: `<a href="https://example.com" target="_blank" style="display:block;background:white;border-radius:16px;border:1px solid #f3f4f6;padding:16px;margin-bottom:12px;text-decoration:none;color:inherit"><div style="display:flex;align-items:center;gap:12px"><div style="width:40px;height:40px;background:#fdf2f8;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">\uD83D\uDD17</div><div><p style="font-weight:700;font-size:14px;color:#1f2937;margin:0">링크 제목</p><p style="font-size:10px;color:#9ca3af;margin:4px 0 0 0">설명을 입력하세요</p></div></div></a>` },
  { id: 'notice_box', icon: '\u26A0\uFE0F', label: '경고/안내 박스', html: `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px 16px;margin-bottom:12px;font-size:11px;color:#dc2626;font-weight:700">\u26A0 안내 내용을 입력하세요</div>` },
  { id: 'info_box', icon: '\uD83D\uDCA1', label: '팁 박스', html: `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 16px;margin-bottom:12px;font-size:11px;color:#2563eb;font-weight:700">\uD83D\uDCA1 팁 내용을 입력하세요</div>` },
  { id: 'color_badge', icon: '\uD83C\uDFF7\uFE0F', label: '뱃지 그룹', html: `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"><span style="background:#f0fdf4;color:#16a34a;padding:4px 12px;border-radius:8px;font-weight:700;font-size:12px">뱃지1</span><span style="background:#fef2f2;color:#ef4444;padding:4px 12px;border-radius:8px;font-weight:700;font-size:12px">뱃지2</span><span style="background:#ecfdf5;color:#059669;padding:4px 12px;border-radius:8px;font-weight:700;font-size:12px">뱃지3</span></div>` },
  { id: 'guild_info', icon: '\uD83C\uDFAE', label: '길드 정보 카드', html: `<div style="background:white;border-radius:16px;border:1px solid #f3f4f6;padding:16px;margin-bottom:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">\uD83C\uDF70</span><h4 style="font-weight:900;color:#1f2937;font-size:14px;margin:0">길드명</h4><span style="font-size:10px;background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:999px;font-weight:700">설명</span></div><span style="font-size:12px;font-weight:700;color:#9ca3af">49p</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px"><div style="background:#f9fafb;padding:8px 12px;border-radius:8px"><span style="color:#9ca3af">노블 조건:</span> <b>수로 필참</b></div><div style="background:#f9fafb;padding:8px 12px;border-radius:8px"><span style="color:#9ca3af">캐릭 제한:</span> <b>없음</b></div></div></div>` },
  { id: 'spacer', icon: '\u2796', label: '여백', html: `<div style="height:16px"></div>` },
  { id: 'nav_button', icon: '\uD83D\uDD00', label: '페이지 이동 버튼', html: `<div style="margin-bottom:12px"><a href="/rewards" style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#fef3c7,#fde68a);border:2px solid #f59e0b;border-radius:16px;padding:16px 20px;text-decoration:none;color:inherit;cursor:pointer"><span style="font-size:24px">\uD83C\uDF81</span><div><p style="font-weight:900;font-size:14px;color:#92400e;margin:0">수로 보상 확인하기</p><p style="font-size:11px;color:#b45309;margin:4px 0 0 0;font-weight:600">내 순위와 예상 보상 확인 \u2192</p></div></a></div>` },
  { id: 'image_card', icon: '\uD83D\uDDBC\uFE0F', label: '이미지 카드', html: `<div style="background:white;border-radius:16px;border:1px solid #f3f4f6;overflow:hidden;margin-bottom:12px"><img src="이미지URL" style="width:100%;max-height:300px;object-fit:cover" alt="이미지"><div style="padding:12px 16px;font-size:12px;font-weight:700;color:#374151">이미지 설명을 입력하세요</div></div>` },
]

const SLASH_COMMANDS = [
  { id: 'h2', label: '제목1', desc: '큰 제목', icon: Type, html: '<h2>제목</h2>' },
  { id: 'h3', label: '제목2', desc: '중간 제목', icon: Type, html: '<h3>제목</h3>' },
  { id: 'h4', label: '제목3', desc: '작은 제목', icon: Type, html: '<h4>제목</h4>' },
  { id: 'ul', label: '글머리기호 목록', desc: '순서 없는 목록', icon: List, html: '<ul><li>항목</li></ul>' },
  { id: 'ol', label: '번호 목록', desc: '순서 있는 목록', icon: ListOrdered, html: '<ol><li>항목</li></ol>' },
  { id: 'quote', label: '인용', desc: '인용문 블록', icon: Quote, html: '<blockquote style="border-left:3px solid #d1d5db;padding-left:12px;color:#6b7280;margin:8px 0">인용문</blockquote>' },
  { id: 'hr', label: '구분선', desc: '수평 구분선', icon: Minus, html: '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />' },
  { id: 'img', label: '이미지', desc: '이미지 삽입', icon: Image, html: '<img src="이미지URL" style="max-width:100%;border-radius:12px;margin:8px 0" alt="" />' },
  { id: 'code', label: '코드블록', desc: '코드 영역', icon: FileCode, html: '<pre style="background:#1f2937;color:#e5e7eb;padding:16px;border-radius:12px;font-size:12px;overflow-x:auto;margin:8px 0"><code>코드를 입력하세요</code></pre>' },
  { id: 'callout', label: '콜아웃 (팁)', desc: '팁/안내 상자', icon: Palette, html: '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 16px;margin:8px 0;font-size:11px;color:#2563eb;font-weight:700">\uD83D\uDCA1 팁 내용을 입력하세요</div>' },
]

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */

export default function GuideEditPage() {
  const toast = useToast((s) => s.show)
  const qc = useQueryClient()

  /* ─── data ─── */
  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['guide-pages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('guide_pages').select('*').order('id')
      if (error) throw error
      return (data || []) as GuidePage[]
    },
  })

  /* ─── state ─── */
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ title: '', slug: '', content: '', is_published: true })
  const [previewMode, setPreviewMode] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Slash command state
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 })

  // Tab management state
  const [tabLabel, setTabLabel] = useState('')
  const [tabHomeVisible, setTabHomeVisible] = useState(true)

  const editorRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const blockMenuRef = useRef<HTMLDivElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ─── filtered slash commands ─── */
  const filteredSlashCommands = useMemo(() => {
    if (!slashFilter) return SLASH_COMMANDS
    const q = slashFilter.toLowerCase()
    return SLASH_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.includes(q) || c.desc.toLowerCase().includes(q)
    )
  }, [slashFilter])

  /* ─── close menus on outside click ─── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (blockMenuRef.current && !blockMenuRef.current.contains(e.target as Node)) {
        setShowBlockMenu(false)
      }
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ─── mutations ─── */
  const savePage = useMutation({
    mutationFn: async ({
      id,
      title,
      slug,
      content,
      is_published,
    }: {
      id?: number
      title: string
      slug: string
      content: string
      is_published: boolean
    }) => {
      if (id) {
        const { error } = await supabase
          .from('guide_pages')
          .update({ title, slug, content, is_published })
          .eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('guide_pages').insert({
          title,
          slug,
          content,
          sort_order: pages.length,
          is_published,
        })
        if (error) throw error
      }

      // Save tab config if slug has matching tab
      const matchingTab = DEFAULT_HOME_TABS.find((t) => t.slug === slug)
      if (matchingTab) {
        try {
          const { data: cfgRow } = await supabase
            .from('site_config')
            .select('config')
            .eq('id', 1)
            .maybeSingle()
          const cfg = (cfgRow?.config as Record<string, unknown>) || {}
          const guideTabs = (cfg.guideTabs as Record<string, string>) || {}
          const guideHomeVisible = (cfg.guideHomeVisible as Record<string, boolean>) || {}
          if (tabLabel) guideTabs[slug] = tabLabel
          guideHomeVisible[slug] = tabHomeVisible
          await supabase
            .from('site_config')
            .update({ config: { ...cfg, guideTabs, guideHomeVisible } })
            .eq('id', 1)
        } catch {
          // non-critical
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guide-pages'] })
      qc.invalidateQueries({ queryKey: ['site-config'] })
      toast('저장 완료', 'success')
      setEditingId(null)
      setForm({ title: '', slug: '', content: '', is_published: true })
      setPreviewMode(false)
      setSourceMode(false)
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

  /* ─── sync helpers ─── */
  const syncContent = useCallback(() => {
    if (editorRef.current) {
      setForm((f) => ({ ...f, content: editorRef.current!.innerHTML }))
    }
  }, [])

  const syncFromSource = useCallback((html: string) => {
    setForm((f) => ({ ...f, content: html }))
    if (editorRef.current) {
      editorRef.current.innerHTML = html
    }
  }, [])

  /* ─── insert HTML at cursor ─── */
  const insertHTMLAtCursor = useCallback((html: string) => {
    if (sourceMode) {
      // Insert into source textarea
      if (sourceRef.current) {
        const ta = sourceRef.current
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const before = ta.value.substring(0, start)
        const after = ta.value.substring(end)
        const newVal = before + html + after
        setForm((f) => ({ ...f, content: newVal }))
        // Restore cursor after React re-render
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + html.length
          ta.focus()
        })
      }
      return
    }

    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const frag = document.createRange().createContextualFragment(html)
      range.insertNode(frag)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      // Fallback: append
      if (editorRef.current) {
        editorRef.current.innerHTML += html
      }
    }
    syncContent()
  }, [sourceMode, syncContent])

  /* ─── block insertion ─── */
  const handleInsertBlock = useCallback((block: typeof GUIDE_BLOCKS[number]) => {
    insertHTMLAtCursor(block.html)
    setShowBlockMenu(false)
    toast(`${block.label} 삽입 완료`, 'success')
  }, [insertHTMLAtCursor, toast])

  /* ─── slash command insertion ─── */
  const handleSlashSelect = useCallback((cmd: typeof SLASH_COMMANDS[number]) => {
    // Remove the slash trigger text
    if (editorRef.current) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const textNode = range.startContainer
        if (textNode.nodeType === Node.TEXT_NODE) {
          const text = textNode.textContent || ''
          const cursorPos = range.startOffset
          // Find the slash position
          const slashPos = text.lastIndexOf('/', cursorPos)
          if (slashPos >= 0) {
            const beforeSlash = text.substring(0, slashPos)
            const afterCursor = text.substring(cursorPos)
            textNode.textContent = beforeSlash + afterCursor
            // Set cursor
            const newRange = document.createRange()
            newRange.setStart(textNode, slashPos)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
          }
        }
      }
    }
    insertHTMLAtCursor(cmd.html)
    setSlashMenuOpen(false)
    setSlashFilter('')
  }, [insertHTMLAtCursor])

  /* ─── markdown auto-conversion on Enter ─── */
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Slash menu navigation
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => Math.min(prev + 1, filteredSlashCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredSlashCommands[slashIndex]) {
          handleSlashSelect(filteredSlashCommands[slashIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashMenuOpen(false)
        setSlashFilter('')
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      const range = sel.getRangeAt(0)
      const textNode = range.startContainer
      if (textNode.nodeType !== Node.TEXT_NODE) return

      const text = (textNode.textContent || '').trimEnd()

      // Check markdown patterns
      let replacement: string | null = null

      if (/^###\s+(.+)$/.test(text)) {
        const match = text.match(/^###\s+(.+)$/)
        replacement = `<h4>${match![1]}</h4>`
      } else if (/^##\s+(.+)$/.test(text)) {
        const match = text.match(/^##\s+(.+)$/)
        replacement = `<h3>${match![1]}</h3>`
      } else if (/^#\s+(.+)$/.test(text)) {
        const match = text.match(/^#\s+(.+)$/)
        replacement = `<h2>${match![1]}</h2>`
      } else if (/^[-*]\s+(.+)$/.test(text)) {
        const match = text.match(/^[-*]\s+(.+)$/)
        replacement = `<ul><li>${match![1]}</li></ul>`
      } else if (/^1\.\s+(.+)$/.test(text)) {
        const match = text.match(/^1\.\s+(.+)$/)
        replacement = `<ol><li>${match![1]}</li></ol>`
      } else if (/^>\s+(.+)$/.test(text)) {
        const match = text.match(/^>\s+(.+)$/)
        replacement = `<blockquote style="border-left:3px solid #d1d5db;padding-left:12px;color:#6b7280;margin:8px 0">${match![1]}</blockquote>`
      } else if (/^(-{3,}|\*{3,})$/.test(text)) {
        replacement = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />`
      }

      if (replacement) {
        e.preventDefault()
        // Find the parent block element
        let blockParent = textNode.parentElement
        while (blockParent && blockParent !== editorRef.current && !['DIV', 'P', 'SPAN'].includes(blockParent.tagName)) {
          blockParent = blockParent.parentElement
        }
        if (blockParent && blockParent !== editorRef.current) {
          blockParent.outerHTML = replacement
        } else {
          // Replace the text node
          const temp = document.createElement('div')
          temp.innerHTML = replacement
          textNode.parentNode?.replaceChild(temp.firstElementChild!, textNode)
        }
        syncContent()
      }
    }
  }, [slashMenuOpen, slashIndex, filteredSlashCommands, handleSlashSelect, syncContent])

  /* ─── editor input handler (slash detection) ─── */
  const handleEditorInput = useCallback(() => {
    syncContent()

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) return

    const text = textNode.textContent || ''
    const cursorPos = range.startOffset
    const textBefore = text.substring(0, cursorPos)

    // Check for slash at start of line or after whitespace
    const slashMatch = textBefore.match(/(?:^|\s)\/([\w\uAC00-\uD7A3]*)$/)
    if (slashMatch) {
      setSlashFilter(slashMatch[1])
      setSlashIndex(0)
      setSlashMenuOpen(true)

      // Position the menu near the cursor
      const rect = range.getBoundingClientRect()
      const editorRect = editorRef.current?.getBoundingClientRect()
      if (editorRect) {
        setSlashPosition({
          top: rect.bottom - editorRect.top + 8,
          left: rect.left - editorRect.left,
        })
      }
    } else {
      setSlashMenuOpen(false)
      setSlashFilter('')
    }
  }, [syncContent])

  /* ─── image upload ─── */
  const handleImageUpload = async (file: File) => {
    try {
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const url = await r2Upload('guide-images', safeName, file)
      const imgHtml = `<div style="text-align:center;margin:12px 0"><img src="${url}" style="max-width:100%;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1)" alt="" /></div>`
      insertHTMLAtCursor(imgHtml)
      toast('이미지 업로드 완료', 'success')
    } catch {
      toast('이미지 업로드 실패', 'error')
    }
  }

  /* ─── drag & drop ─── */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    for (const file of imageFiles) {
      await handleImageUpload(file)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertHTMLAtCursor, toast])

  /* ─── start editing ─── */
  const startEditing = useCallback((page?: GuidePage) => {
    if (page) {
      setEditingId(page.id)
      setForm({ title: page.title, slug: page.slug || '', content: page.content, is_published: page.is_published })
      setTabLabel(page.label || '')
      setTabHomeVisible(true) // Default; will be loaded from config
    } else {
      setEditingId(-1)
      setForm({ title: '', slug: '', content: '', is_published: true })
      setTabLabel('')
      setTabHomeVisible(true)
    }
    setPreviewMode(false)
    setSourceMode(false)
  }, [])

  /* ─── available slugs ─── */
  const availableSlugs = useMemo(() => {
    const usedSlugs = new Set(pages.filter((p) => p.id !== editingId).map((p) => p.slug))
    return DEFAULT_HOME_TABS.filter((t) => !usedSlugs.has(t.slug))
  }, [pages, editingId])

  const currentTab = useMemo(() => {
    return DEFAULT_HOME_TABS.find((t) => t.slug === form.slug)
  }, [form.slug])

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-800">가이드 편집</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">홈 탭에 표시되는 가이드 페이지를 관리합니다</p>
        </div>
        <button
          onClick={() => startEditing()}
          className="px-4 py-2.5 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-colors flex items-center gap-1.5 shadow-sm shadow-indigo-200"
        >
          <Plus size={14} /> 새 페이지
        </button>
      </div>

      {/* ═══ Editor Panel ═══ */}
      {editingId !== null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Editor Header */}
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-800">
                {editingId === -1 ? '새 페이지' : '페이지 수정'}
              </h3>
              <div className="flex items-center gap-2">
                {/* Published toggle */}
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded accent-indigo-500"
                  />
                  공개
                </label>

                {/* Source toggle */}
                <button
                  onClick={() => {
                    if (sourceMode && editorRef.current) {
                      editorRef.current.innerHTML = form.content
                    }
                    setSourceMode(!sourceMode)
                    setPreviewMode(false)
                  }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors',
                    sourceMode
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  )}
                >
                  <Code2 size={12} />
                  {sourceMode ? 'WYSIWYG' : 'HTML'}
                </button>

                {/* Preview toggle */}
                <button
                  onClick={() => {
                    if (!previewMode && editorRef.current) {
                      syncContent()
                    }
                    setPreviewMode(!previewMode)
                    setSourceMode(false)
                  }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors',
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
          </div>

          {/* Meta Fields */}
          <div className="px-5 pt-4 space-y-3">
            {/* Title */}
            <input
              type="text"
              placeholder="페이지 제목"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-300 transition-colors"
            />

            {/* Slug + Tab Config */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-1">슬러그 (탭 식별자)</label>
                <select
                  value={form.slug}
                  onChange={(e) => {
                    const slug = e.target.value
                    setForm((f) => ({ ...f, slug }))
                    const tab = DEFAULT_HOME_TABS.find((t) => t.slug === slug)
                    if (tab) setTabLabel(tab.label)
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300"
                >
                  <option value="">슬러그 선택...</option>
                  {form.slug && !availableSlugs.find((s) => s.slug === form.slug) && (
                    <option value={form.slug}>{form.slug} (현재)</option>
                  )}
                  {availableSlugs.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.slug} ({t.label})
                    </option>
                  ))}
                </select>
              </div>

              {currentTab && (
                <>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">탭 라벨</label>
                    <input
                      type="text"
                      value={tabLabel}
                      onChange={(e) => setTabLabel(e.target.value)}
                      placeholder={currentTab.label}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-300"
                    />
                  </div>
                  <div className="pt-4">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={tabHomeVisible}
                        onChange={(e) => setTabHomeVisible(e.target.checked)}
                        className="w-3.5 h-3.5 rounded accent-emerald-500"
                      />
                      홈 표시
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="px-5 py-4">
            {previewMode ? (
              /* ─── Preview ─── */
              <div
                className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-xl text-sm min-h-[400px] prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: form.content }}
              />
            ) : sourceMode ? (
              /* ─── HTML Source View ─── */
              <textarea
                ref={sourceRef}
                value={form.content}
                onChange={(e) => syncFromSource(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 text-green-400 border border-gray-700 rounded-xl text-xs min-h-[400px] outline-none focus:border-indigo-500 transition-colors resize-y"
                style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", lineHeight: '1.7' }}
                spellCheck={false}
                placeholder="HTML 소스를 입력하세요..."
              />
            ) : (
              /* ─── WYSIWYG Editor ─── */
              <>
                {/* Toolbar */}
                <div className="flex items-center gap-0.5 border border-gray-100 rounded-t-xl p-1.5 bg-gray-50 flex-wrap">
                  {/* Text formatting */}
                  <ToolbarButton onClick={handleBold} title="Bold (Ctrl+B)" icon={<Bold size={14} />} />
                  <ToolbarButton onClick={handleItalic} title="Italic (Ctrl+I)" icon={<Italic size={14} />} />
                  <ToolbarButton onClick={handleUnderline} title="Underline (Ctrl+U)" icon={<Underline size={14} />} />

                  <ToolbarDivider />

                  {/* Headings */}
                  <ToolbarButton onClick={() => execCmd('formatBlock', 'h2')} title="제목1" icon={<span className="text-[10px] font-black">H2</span>} />
                  <ToolbarButton onClick={() => execCmd('formatBlock', 'h3')} title="제목2" icon={<span className="text-[10px] font-black">H3</span>} />
                  <ToolbarButton onClick={() => execCmd('formatBlock', 'h4')} title="제목3" icon={<span className="text-[10px] font-black">H4</span>} />

                  <ToolbarDivider />

                  {/* Lists */}
                  <ToolbarButton onClick={() => execCmd('insertUnorderedList')} title="글머리기호" icon={<List size={14} />} />
                  <ToolbarButton onClick={() => execCmd('insertOrderedList')} title="번호목록" icon={<ListOrdered size={14} />} />

                  <ToolbarDivider />

                  {/* Link & Images */}
                  <ToolbarButton onClick={handleLink} title="링크" icon={<Link size={14} />} />
                  <label className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 cursor-pointer transition-colors flex items-center justify-center" title="이미지 업로드">
                    <ImagePlus size={14} />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleImageUpload(e.target.files[0])
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <ToolbarButton onClick={() => setShowGallery(true)} title="이미지 갤러리" icon={<Image size={14} />} />

                  <ToolbarDivider />

                  {/* Block insertion */}
                  <div className="relative" ref={blockMenuRef}>
                    <button
                      onClick={() => setShowBlockMenu(!showBlockMenu)}
                      className={cn(
                        'px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors',
                        showBlockMenu
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-200'
                      )}
                    >
                      <LayoutGrid size={12} />
                      블록 삽입
                      <ChevronDown size={10} className={cn('transition-transform', showBlockMenu && 'rotate-180')} />
                    </button>

                    {/* Block Menu Popup */}
                    {showBlockMenu && (
                      <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-gray-50">
                          <p className="text-[10px] font-bold text-gray-400 px-2">블록 템플릿 (15개)</p>
                        </div>
                        <div className="max-h-80 overflow-y-auto p-1.5">
                          {GUIDE_BLOCKS.map((block) => (
                            <button
                              key={block.id}
                              onClick={() => handleInsertBlock(block)}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-indigo-50 transition-colors group"
                            >
                              <span className="text-base w-6 text-center flex-shrink-0">{block.icon}</span>
                              <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">
                                {block.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Slash hint */}
                  <div className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 select-none">
                    <Hash size={10} />
                    <span className="font-medium">/ 입력으로 빠른 삽입</span>
                  </div>
                </div>

                {/* ContentEditable Area */}
                <div
                  className="relative"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div
                    ref={editorRef}
                    contentEditable
                    className={cn(
                      'w-full px-4 py-4 bg-white border border-gray-100 border-t-0 rounded-b-xl text-sm min-h-[400px] outline-none focus:border-indigo-300 prose prose-sm max-w-none transition-all',
                      isDragging && 'border-2 border-dashed border-indigo-400 bg-indigo-50/30'
                    )}
                    dangerouslySetInnerHTML={{ __html: form.content }}
                    onInput={handleEditorInput}
                    onBlur={syncContent}
                    onKeyDown={handleEditorKeyDown}
                    suppressContentEditableWarning
                  />

                  {/* Drag overlay */}
                  {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-b-xl">
                      <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border-2 border-dashed border-indigo-400 flex items-center gap-3">
                        <ImagePlus size={24} className="text-indigo-500" />
                        <div>
                          <p className="font-bold text-sm text-gray-800">이미지를 놓으세요</p>
                          <p className="text-[10px] text-gray-400">자동으로 업로드됩니다</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slash Command Menu */}
                  {slashMenuOpen && filteredSlashCommands.length > 0 && (
                    <div
                      ref={slashMenuRef}
                      className="absolute z-50 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden"
                      style={{
                        top: slashPosition.top,
                        left: Math.min(slashPosition.left, 300),
                      }}
                    >
                      <div className="p-1.5 border-b border-gray-50">
                        <p className="text-[10px] font-bold text-gray-400 px-2">
                          빠른 삽입 {slashFilter && <span className="text-indigo-500">/ {slashFilter}</span>}
                        </p>
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {filteredSlashCommands.map((cmd, idx) => {
                          const Icon = cmd.icon
                          return (
                            <button
                              key={cmd.id}
                              onClick={() => handleSlashSelect(cmd)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                                idx === slashIndex
                                  ? 'bg-indigo-50 text-indigo-600'
                                  : 'hover:bg-gray-50 text-gray-700'
                              )}
                            >
                              <div className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                                idx === slashIndex ? 'bg-indigo-100' : 'bg-gray-100'
                              )}>
                                <Icon size={13} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold">{cmd.label}</p>
                                <p className="text-[10px] text-gray-400 truncate">{cmd.desc}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-5 pb-4 flex items-center gap-2">
            <div className="flex-1 text-[10px] text-gray-300 font-medium">
              {form.content.length > 0 && `${form.content.length.toLocaleString()}자`}
            </div>
            <button
              onClick={() => {
                setEditingId(null)
                setPreviewMode(false)
                setSourceMode(false)
              }}
              className="px-3.5 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              onClick={() =>
                savePage.mutate({
                  id: editingId === -1 ? undefined : editingId,
                  title: form.title,
                  slug: form.slug,
                  content: form.content,
                  is_published: form.is_published,
                })
              }
              disabled={!form.title.trim() || savePage.isPending}
              className="px-4 py-2 bg-indigo-500 text-white text-xs font-bold rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm shadow-indigo-200"
            >
              <Save size={13} />
              {savePage.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Image Gallery Modal ═══ */}
      {showGallery && (
        <ImageGallery
          onSelect={(url) => {
            const imgHtml = `<div style="text-align:center;margin:12px 0"><img src="${url}" style="max-width:100%;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1)" alt="" /></div>`
            insertHTMLAtCursor(imgHtml)
            setShowGallery(false)
          }}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* ═══ Pages List ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
          <p className="text-xs font-bold text-gray-500">
            전체 페이지 <span className="text-indigo-500">{pages.length}</span>
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <p className="p-8 text-center text-gray-400 text-xs font-bold">로딩 중...</p>
          ) : pages.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FileCode size={20} className="text-gray-300" />
              </div>
              <p className="text-gray-400 text-xs font-bold">가이드 페이지가 없습니다</p>
              <p className="text-gray-300 text-[10px] mt-1">상단의 "새 페이지" 버튼으로 추가하세요</p>
            </div>
          ) : (
            pages.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors',
                  editingId === p.id && 'bg-indigo-50/30'
                )}
              >
                <GripVertical size={14} className="text-gray-300 shrink-0 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-gray-800">{p.title}</p>
                    {p.slug && (
                      <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded text-[8px] font-bold">
                        {p.slug}
                      </span>
                    )}
                    {!p.is_published && (
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded text-[8px] font-bold">
                        비공개
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">
                    {p.content.replace(/<[^>]*>/g, '').slice(0, 100)}
                  </p>
                </div>
                <button
                  onClick={() => togglePublished.mutate({ id: p.id, is_published: !p.is_published })}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
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
                  className="px-2.5 py-1.5 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-indigo-50 hover:text-indigo-500 transition-colors"
                >
                  편집
                </button>
                <button
                  onClick={() => {
                    if (confirm('이 페이지를 삭제하시겠습니까?')) deletePage.mutate(p.id)
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Toolbar Helpers
   ═══════════════════════════════════════════════════════════════ */

function ToolbarButton({
  onClick,
  title,
  icon,
}: {
  onClick: () => void
  title: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors flex items-center justify-center min-w-[28px] h-[28px]"
      title={title}
    >
      {icon}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />
}

/* ═══════════════════════════════════════════════════════════════
   Image Gallery Modal
   ═══════════════════════════════════════════════════════════════ */

function ImageGallery({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const toast = useToast((s) => s.show)
  const [uploading, setUploading] = useState(false)

  const { data: images = [], isLoading, refetch } = useQuery({
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

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const url = await r2Upload('guide-images', safeName, file)
      toast('업로드 완료', 'success')
      refetch()
      onSelect(url)
    } catch {
      toast('업로드 실패', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Image size={16} className="text-indigo-500" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-800">이미지 갤러리</h3>
              <p className="text-[10px] text-gray-400">{images.length}개 이미지</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className={cn(
              'px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-600 transition-colors flex items-center gap-1',
              uploading && 'opacity-50 pointer-events-none'
            )}>
              <ImagePlus size={12} />
              {uploading ? '업로드 중...' : '업로드'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleUpload(e.target.files[0])
                }}
              />
            </label>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-center text-gray-400 text-xs font-bold p-8">로딩 중...</p>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Image size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-400 text-xs font-bold">업로드된 이미지가 없습니다</p>
              <p className="text-gray-300 text-[10px] mt-1">상단의 업로드 버튼을 사용하세요</p>
            </div>
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
                      <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-bold bg-black/50 px-2 py-1 rounded-lg transition-opacity">
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
