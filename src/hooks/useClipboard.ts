import { useState, useCallback } from 'react'

export function useClipboard() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const copy = useCallback(async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1500)
  }, [])

  const copyAll = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1500)
  }, [])

  const paste = useCallback(async (): Promise<string> => {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return ''
    }
  }, [])

  return { copiedIdx, copiedAll, copy, copyAll, paste }
}