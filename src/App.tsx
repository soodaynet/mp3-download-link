import { useState, useEffect, useMemo, useCallback } from 'react'
import { batchConvert } from './utils/urlConverter'
import type { ConvertResult } from './utils/urlConverter'
import { useBackground } from './hooks/useBackground'
import { useClipboard } from './hooks/useClipboard'
import { BackgroundImage } from './components/BackgroundImage'
import { InputArea } from './components/InputArea'
import { ResultList } from './components/ResultList'

const TITLE = import.meta.env.VITE_TITLE ?? ''
const FAVICON = import.meta.env.VITE_FAVICON ?? ''
const BG = import.meta.env.VITE_BG ?? ''

export default function App() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<ConvertResult[]>([])
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const bgLoaded = useBackground(BG)
  const { copiedIdx, copiedAll, paste, copy, copyAll } = useClipboard()

  useEffect(() => {
    if (TITLE) document.title = TITLE
    if (FAVICON) {
      const link = document.querySelector('#favicon') as HTMLLinkElement | null
      if (link) {
        link.href = FAVICON
        link.type = 'image/svg+xml'
      }
    }
  }, [])

  const lineCount = useMemo(
    () => (input.trim() ? input.split('\n').filter((l) => l.trim()).length : 0),
    [input],
  )

  const handleConvert = useCallback(() => {
    if (!input.trim()) return
    setResults(batchConvert(input))
    setInput('')
    setPlayingIdx(null)
  }, [input])

  const handlePaste = useCallback(async () => {
    const text = await paste()
    if (text) setInput(text)
  }, [paste])

  const handleCopy = useCallback(
    (url: string, idx: number) => copy(url, idx),
    [copy],
  )

  const handleCopyAll = useCallback(async () => {
    await copyAll(results.map((r) => r.converted).join('\n'))
  }, [copyAll, results])

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative selection:bg-emerald-500/30">
      <BackgroundImage bgUrl={BG} loaded={bgLoaded} />

      <main className="relative z-10 max-w-xl mx-auto px-4 py-10 sm:py-14 md:py-20">
        <InputArea
          value={input}
          onChange={setInput}
          lineCount={lineCount}
          onConvert={handleConvert}
          onPaste={handlePaste}
        />

        {results.length > 0 && (
          <ResultList
            results={results}
            copiedIdx={copiedIdx}
            copiedAll={copiedAll}
            playingIdx={playingIdx}
            onTogglePlay={setPlayingIdx}
            onCopy={handleCopy}
            onCopyAll={handleCopyAll}
          />
        )}
      </main>

      <style>{`
        .audio-player audio::-webkit-media-controls-panel {
          background: transparent !important;
        }
        .audio-player audio::-webkit-media-controls-enclosure {
          background: transparent !important;
        }
        audio::-internal-media-controls-overflow-menu-list {
          background: rgba(255,255,255,0.3) !important;
          backdrop-filter: blur(4px) !important;
          -webkit-backdrop-filter: blur(4px) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 12px !important;
        }
      `}</style>
    </div>
  )
}