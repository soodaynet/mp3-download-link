import { type FC, useState, useCallback, useRef, useEffect } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  onConvert: () => void
  onPaste: () => Promise<void>
}

export const InputArea: FC<Props> = ({ value, onChange, onConvert, onPaste }) => {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handlePaste = useCallback(async () => {
    await onPaste()
    setTimeout(() => onConvert(), 50)
  }, [onPaste, onConvert])

  const handleMouseEnter = useCallback(() => {
    clearTimeout(timerRef.current)
    setExpanded(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    timerRef.current = setTimeout(() => setExpanded(false), 400)
  }, [])

  const handleClick = useCallback(() => {
    clearTimeout(timerRef.current)
    setExpanded((prev) => !prev)
    if (!expanded) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [expanded])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (expanded) {
          handlePaste()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expanded, handlePaste])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const lineCount = value.trim() ? value.split('\n').filter((l) => l.trim()).length : 0

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={`rounded-2xl backdrop-blur-sm border border-white/10
                 transition-all duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]
                 cursor-pointer
                 ${expanded ? 'bg-white/30 hover:bg-white/40 p-4 sm:p-5' : 'bg-white/30 hover:bg-white/40 p-4 sm:p-5'}`}
    >
      {expanded ? (
        <div className="animate-[fadeIn_0.3s_ease-out]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full bg-transparent text-white/90 text-sm sm:text-[15px] font-mono resize-none
                       focus:outline-none leading-relaxed placeholder:text-white/20"
            placeholder="粘贴网易云音乐歌曲链接..."
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
            <span className="text-[11px] text-white/30 font-mono">
              {lineCount > 0 ? `${lineCount} 行` : 'Ctrl+V 粘贴'}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onConvert() }}
              disabled={!value.trim()}
              className="px-5 py-2 bg-emerald-500/90 hover:bg-emerald-500
                         disabled:bg-white/[0.06] disabled:text-white/20
                         text-white text-[12px] sm:text-xs font-medium rounded-xl
                         transition-all duration-200 active:scale-[0.97]"
            >
              转换
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between animate-[fadeIn_0.3s_ease-out]">
          <span className="text-white/30 text-sm font-mono">
            {lineCount > 0 ? `${lineCount} 行链接` : '点击输入网易云音乐链接'}
          </span>
          <span className="text-white/15 text-[11px] font-mono">点击展开</span>
        </div>
      )}
    </div>
  )
}