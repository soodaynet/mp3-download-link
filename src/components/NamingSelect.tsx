import { type FC, useEffect, useRef, useCallback } from 'react'
import type { NamingFormat } from '../utils/decrypt'

interface Props {
  value: NamingFormat
  onChange: (format: NamingFormat) => void
  show: boolean
  onToggle: () => void
}

const NAMING_OPTIONS: { key: NamingFormat; label: string }[] = [
  { key: 'artist-title', label: '歌手 - 歌名' },
  { key: 'title-artist', label: '歌名 - 歌手' },
  { key: 'title', label: '歌名' },
  { key: 'original', label: '原始文件名' },
]

export const NamingSelect: FC<Props> = ({ value, onChange, show, onToggle }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggle()
      }
    },
    [onToggle],
  )

  useEffect(() => {
    if (show) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [show, handleClickOutside])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={onToggle}
        className="text-[11px] font-mono px-2 py-1 rounded-lg
                   text-white/30 hover:text-white/60 transition-colors"
      >
        命名: {NAMING_OPTIONS.find((o) => o.key === value)?.label}
      </button>
      {show && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl bg-white/10 backdrop-blur-md
                     border border-white/10 p-1 z-30 min-w-[130px]"
        >
          {NAMING_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); onToggle() }}
              className={`block w-full text-left px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                value === opt.key
                  ? 'text-white bg-white/10'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}