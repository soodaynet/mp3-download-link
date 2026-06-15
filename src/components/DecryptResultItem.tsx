import { type FC, useCallback } from 'react'
import type { DecryptResult, NamingFormat } from '../utils/decrypt'
import { formatFileName } from '../utils/decrypt'
import { useAudioPlayer } from '../hooks/useAudioPlayer'

interface Props {
  result: DecryptResult
  index: number
  playingIdx: number | null
  namingFormat: NamingFormat
  onTogglePlay: (idx: number | null) => void
  onDownload: (result: DecryptResult, name: string) => void
}

export const DecryptResultItem: FC<Props> = ({
  result,
  index,
  playingIdx,
  namingFormat,
  onTogglePlay,
  onDownload,
}) => {
  const handleEnded = useCallback(() => onTogglePlay(null), [onTogglePlay])
  const { isPlaying, currentTime, duration, loadError, ready } = useAudioPlayer(
    result.success ? result.buffer : null,
    playingIdx === index,
    handleEnded,
  )

  const displayName = result.success && result.title
    ? (result.artist ? `${result.artist} - ${result.title}` : result.title)
    : result.originalName

  const downloadName = formatFileName(result, namingFormat)

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      onClick={() => {
        if (result.success && ready && !loadError) {
          onTogglePlay(isPlaying ? null : index)
        }
      }}
      className={`group rounded-xl backdrop-blur-sm border transition-all duration-300 ease-out ${
        result.success
          ? 'bg-white/20 border-white/10 hover:bg-white/30 hover:border-white/20 hover:scale-[1.01] cursor-pointer'
          : 'bg-red-500/10 border-red-500/20'
      }`}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* 封面 */}
          {result.coverUrl && (
            <img
              src={result.coverUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover shrink-0 bg-white/5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-white/40 font-mono">#{index + 1}</span>
                {result.success ? (
                  <span className="text-[11px] text-emerald-400/70 font-mono">
                    {isPlaying ? '正在播放' : loadError ? '无法播放' : '解密成功'}
                  </span>
                ) : (
                  <span className="text-[11px] text-red-400/70 font-mono">解密失败</span>
                )}
              </div>
              {result.success && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDownload(result, downloadName)
                  }}
                  className="px-2.5 py-1.5 text-[11px] rounded-lg font-medium shrink-0
                             bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-200
                             transition-all"
                >
                  下载
                </button>
              )}
            </div>
            <span className="text-[13px] text-white/70 group-hover:text-white font-mono truncate block transition-all duration-300">
              {displayName}
            </span>
            {result.success && (
              <span className="text-[11px] text-white/25 block mt-0.5 truncate">
                {result.originalName} → {downloadName}
              </span>
            )}
            {!result.success && result.error && (
              <span className="text-[11px] text-red-400/60 block mt-1">{result.error}</span>
            )}
          </div>
        </div>

        {isPlaying && duration > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30 font-mono w-8 text-right">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400/60 transition-[width] duration-300 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 font-mono w-8">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}