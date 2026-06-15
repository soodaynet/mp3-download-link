import { useState, useCallback, useRef, type DragEvent } from 'react'
import { decryptFile, formatFileName, embedCoverImage, type DecryptResult, type NamingFormat } from '../utils/decrypt'
import { DecryptResultItem } from '../components/DecryptResultItem'
import { NamingSelect } from '../components/NamingSelect'

export default function UnlockMusicPage() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<DecryptResult[]>([])
  const [processing, setProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const [namingFormat, setNamingFormat] = useState<NamingFormat>('title-artist')
  const [showNaming, setShowNaming] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)

  const startDecrypt = useCallback(async (fileList: File[]) => {
    if (processingRef.current) return
    processingRef.current = true
    setProcessing(true)
    setResults([])
    setPlayingIdx(null)

    const newResults: DecryptResult[] = []
    for (const file of fileList) {
      const result = await decryptFile(file)
      newResults.push(result)
      setResults([...newResults])
    }
    setProcessing(false)
    processingRef.current = false
  }, [])

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    setFiles(arr)
    if (arr.length > 0) startDecrypt(arr)
  }, [startDecrypt])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDownload = useCallback((result: DecryptResult, name: string) => {
    if (!result.buffer) return
    // 如果有封面数据，嵌入到音频文件中
    let finalBuffer = result.buffer
    if (result.coverData && result.coverData.length > 0) {
      const format = result.mimeType === 'audio/flac' ? 'flac' : 'mp3'
      finalBuffer = embedCoverImage(result.buffer, result.coverData, format)
    }
    const blob = new Blob([finalBuffer], { type: result.mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const handleDownloadAll = useCallback(() => {
    results
      .filter((r) => r.success && r.buffer)
      .forEach((r) => handleDownload(r, formatFileName(r, namingFormat)))
  }, [results, namingFormat, handleDownload])

  const successCount = results.filter((r) => r.success).length

  return (
    <div className="relative z-10 max-w-xl mx-auto px-4 py-10 sm:py-14 md:py-20 page-enter">
      {/* 上传区域 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-2xl backdrop-blur-sm border p-4 sm:p-5 text-center cursor-pointer
                   transition-all duration-300 ease-out ${
                     dragOver
                       ? 'border-emerald-400/60 bg-emerald-500/10'
                       : processing
                         ? 'border-emerald-400/30 bg-white/30'
                         : 'border-white/10 bg-white/30 hover:bg-white/40'
                   }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".ncm,.qmc0,.qmc3,.qmcflac,.qmcogg,.mflac,.mgg,.tkm,.kgm,.kgma,.vpr,.kwm,.xm"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {processing ? (
          <p className="text-white/50 text-sm animate-pulse">
            正在解密 {results.length}/{files.length} 个文件...
          </p>
        ) : (
          <p className="text-white/50 text-sm">
            {files.length > 0
              ? `已选择 ${files.length} 个文件，点击更换`
              : '点击选择加密音乐文件或拖拽到此处'}
          </p>
        )}
      </div>

      {/* 结果列表 */}
      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-white/30 font-mono">
              {processing
                ? `解密中 ${results.length}/${files.length}`
                : `${successCount}/${results.length} 个成功`}
            </span>
            <div className="flex items-center gap-2">
              <NamingSelect
                value={namingFormat}
                onChange={setNamingFormat}
                show={showNaming}
                onToggle={() => setShowNaming((v) => !v)}
              />
              {successCount > 0 && !processing && (
                <button
                  onClick={handleDownloadAll}
                  className="text-[11px] font-mono px-2.5 py-1 rounded-lg
                             text-emerald-400/70 hover:text-emerald-300 transition-colors"
                >
                  下载全部 ({successCount})
                </button>
              )}
            </div>
          </div>

          {results.map((r, i) => (
            <DecryptResultItem
              key={i}
              result={r}
              index={i}
              playingIdx={playingIdx}
              namingFormat={namingFormat}
              onTogglePlay={setPlayingIdx}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}
    </div>
  )
}