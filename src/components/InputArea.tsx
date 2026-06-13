import { type FC, type KeyboardEvent, useCallback } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  lineCount: number
  onConvert: () => void
  onPaste: () => void
}

export const InputArea: FC<Props> = ({ value, onChange, lineCount, onConvert, onPaste }) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onConvert()
      }
    },
    [onConvert],
  )

  return (
    <div
      className="rounded-2xl bg-white/30 backdrop-blur-sm border border-white/10 p-4 sm:p-5
                 hover:bg-white/40 transition-all duration-300 ease-out"
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        spellCheck={false}
        className="w-full bg-transparent text-white/90 text-sm sm:text-[15px] font-mono resize-none
                   focus:outline-none leading-relaxed placeholder:text-white/20"
        onKeyDown={handleKeyDown}
      />

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
        <span className="text-[11px] text-white/30 font-mono hidden sm:block">
          {lineCount > 0 ? `${lineCount} 行` : 'Ctrl+Enter 转换'}
        </span>
        <span className="text-[11px] text-white/30 font-mono sm:hidden">
          {lineCount > 0 ? `${lineCount} 行` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onPaste}
            className="px-4 py-2 text-[12px] sm:text-xs rounded-xl
                       bg-white/[0.06] text-white/50 hover:bg-white/10 hover:text-white/80
                       transition-colors active:scale-95"
          >
            粘贴
          </button>
          <button
            onClick={onConvert}
            disabled={!value.trim()}
            className="px-5 py-2 bg-emerald-500/90 hover:bg-emerald-500
                       disabled:bg-white/[0.06] disabled:text-white/20
                       text-white text-[12px] sm:text-xs font-medium rounded-xl
                       transition-colors active:scale-[0.97]"
          >
            转换
          </button>
        </div>
      </div>
    </div>
  )
}