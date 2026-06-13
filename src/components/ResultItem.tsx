import { type FC, useRef, useEffect } from 'react'
import type { ConvertResult } from '../utils/urlConverter'

interface Props {
  result: ConvertResult
  index: number
  playingIdx: number | null
  copiedIdx: number | null
  onTogglePlay: (idx: number | null) => void
  onCopy: (url: string, idx: number) => void
}

export const ResultItem: FC<Props> = ({
  result,
  index,
  playingIdx,
  copiedIdx,
  onTogglePlay,
  onCopy,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const isPlaying = playingIdx === index
  const isCopied = copiedIdx === index

  useEffect(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }, [isPlaying])

  return (
    <div
      onClick={() => onTogglePlay(isPlaying ? null : index)}
      className="group rounded-xl bg-white/20 backdrop-blur-sm border border-white/10 cursor-pointer
                 hover:bg-white/40 hover:scale-[1.02] hover:border-white/20
                 transition-all duration-300 ease-out"
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-white/40 font-mono">
              #{result.songId}
            </span>
            <span
              className="text-[13px] text-white/70 group-hover:text-white
                         font-mono truncate block transition-all duration-300 mt-0.5"
            >
              {result.converted}
            </span>
          </div>

          <div
            className="flex items-center gap-1.5 shrink-0 pt-0.5
                       sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200"
          >
            <button
              onClick={(e) => { e.stopPropagation(); window.open(result.converted!, '_blank') }}
              className={`px-2.5 py-1.5 text-[11px] rounded-md font-medium transition-all ${
                isPlaying
                  ? 'bg-white/10 text-white/50'
                  : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 hover:text-sky-200'
              }`}
            >
              跳转
            </button>
            <a
              href={result.pageUrl!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2.5 py-1.5 text-[11px] rounded-md font-medium
                         bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 hover:text-rose-200
                         transition-all"
            >
              网易云
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); onCopy(result.converted!, index) }}
              className={`px-2.5 py-1.5 text-[11px] rounded-md font-medium transition-all ${
                isCopied
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-200'
              }`}
            >
              {isCopied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {isPlaying && (
          <div className="mt-2 rounded-xl bg-white/30 backdrop-blur-sm border border-white/10 p-2 audio-player">
            <audio ref={audioRef} controls className="w-full" src={result.converted!} />
          </div>
        )}
      </div>
    </div>
  )
}