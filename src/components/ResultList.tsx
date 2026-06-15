import { type FC } from 'react'
import type { ConvertResult } from '../utils/urlConverter'
import { ResultItem } from './ResultItem'

interface Props {
  results: ConvertResult[]
  copiedIdx: number | null
  copiedAll: boolean
  playingIdx: number | null
  onTogglePlay: (idx: number | null) => void
  onCopy: (url: string, idx: number) => void
  onCopyAll: () => void
}

export const ResultList: FC<Props> = ({
  results,
  copiedIdx,
  copiedAll,
  playingIdx,
  onTogglePlay,
  onCopy,
  onCopyAll,
}) => (
  <div className="mt-6 space-y-2">
    <div className="flex items-center justify-between px-1">
      <span className="text-[11px] text-white/30 font-mono">
        {results.length} 条结果
      </span>
      <button
        onClick={onCopyAll}
        className={`text-[11px] font-mono px-2.5 py-1 rounded-lg transition-colors ${
          copiedAll
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'text-white/30 hover:text-white/60'
        }`}
      >
        {copiedAll ? '已复制全部' : '复制全部'}
      </button>
    </div>

    {results.map((r, i) => (
      <div key={i} className="item-animate" style={{ animationDelay: `${i * 0.04}s` }}>
        <ResultItem
          result={r}
          index={i}
          playingIdx={playingIdx}
          copiedIdx={copiedIdx}
          onTogglePlay={onTogglePlay}
          onCopy={onCopy}
        />
      </div>
    ))}
  </div>
)