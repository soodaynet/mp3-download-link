import { lazy, Suspense, useState, useEffect } from 'react'
import { batchConvert } from './utils/urlConverter'
import type { ConvertResult } from './utils/urlConverter'
import { useBackground } from './hooks/useBackground'
import { useClipboard } from './hooks/useClipboard'
import { BackgroundImage } from './components/BackgroundImage'
import { NavigationBar, type Page } from './components/NavigationBar'
import { InputArea } from './components/InputArea'
import { ResultList } from './components/ResultList'

// 页面级代码分割：格式转换页按需加载
const UnlockMusicPage = lazy(() => import('./pages/UnlockMusic'))

/** 页面切换时的加载占位 */
function PageFallback() {
  return (
    <div className="relative z-10 max-w-xl mx-auto px-4 py-10 sm:py-14 md:py-20">
      <div className="rounded-2xl backdrop-blur-sm border border-white/10 bg-white/20 p-5">
        <div className="skeleton h-4 rounded-lg bg-white/10 w-2/3 mb-3" />
        <div className="skeleton h-3 rounded-lg bg-white/5 w-full" />
      </div>
    </div>
  )
}

// ---------- 环境变量 ----------

const TITLE = import.meta.env.VITE_TITLE ?? ''
const FAVICON = import.meta.env.VITE_FAVICON ?? ''
const BG = import.meta.env.VITE_BG ?? ''

// ---------- 链接转换页面 ----------

function DownloadPage() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<ConvertResult[]>([])
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const { copiedIdx, copiedAll, paste, copy, copyAll } = useClipboard()

  const handleConvert = () => {
    if (!input.trim()) return
    setResults(batchConvert(input))
    setInput('')
    setPlayingIdx(null)
  }

  const handlePaste = async () => {
    const text = await paste()
    if (text) setInput(text)
  }

  const handleCopy = (url: string, idx: number) => copy(url, idx)

  const handleCopyAll = () => {
    copyAll(results.map((r) => r.converted).join('\n'))
  }

  return (
    <main className="relative z-10 max-w-xl mx-auto px-4 py-10 sm:py-14 md:py-20 page-enter">
      <InputArea
        value={input}
        onChange={setInput}
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
  )
}

// ---------- 根组件 ----------

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('download')
  const bgLoaded = useBackground(BG)

  useEffect(() => {
    if (TITLE) document.title = TITLE
    if (FAVICON) {
      const link = document.querySelector('#favicon') as HTMLLinkElement | null
      if (link) link.href = FAVICON
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative selection:bg-emerald-500/30">
      <BackgroundImage bgUrl={BG} loaded={bgLoaded} />

      <NavigationBar current={currentPage} onChange={setCurrentPage} />

      {currentPage === 'download' ? (
        <DownloadPage />
      ) : (
        <Suspense fallback={<PageFallback />}>
          <UnlockMusicPage />
        </Suspense>
      )}
    </div>
  )
}