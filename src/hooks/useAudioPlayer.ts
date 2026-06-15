/**
 * Web Audio API 音频播放 hook
 * 替代 <audio> 元素，避免 blob URL range 请求错误
 */
import { useEffect, useState, useRef, useCallback } from 'react'

interface UseAudioPlayerReturn {
  isPlaying: boolean
  currentTime: number
  duration: number
  loadError: boolean
  ready: boolean
  play: () => void
  pause: () => void
  stop: () => void
}

export function useAudioPlayer(
  buffer: ArrayBuffer | null | undefined,
  active: boolean,
  onEnded: () => void,
): UseAudioPlayerReturn {
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startTimeRef = useRef(0)
  const pauseOffsetRef = useRef(0)
  const animFrameRef = useRef<number>(0)

  // 解码音频
  useEffect(() => {
    if (!buffer) return
    const ctx = new AudioContext()
    setAudioCtx(ctx)
    setAudioBuffer(null)
    setLoadError(false)
    ctx.decodeAudioData(buffer.slice(0))
      .then((ab) => {
        setAudioBuffer(ab)
        setDuration(ab.duration)
      })
      .catch((err) => {
        console.error('音频解码失败:', err)
        setLoadError(true)
      })
    return () => { ctx.close().catch(() => {}) }
  }, [buffer])

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch { /* ignore */ }
      sourceRef.current = null
    }
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  const startSource = useCallback(() => {
    if (!audioCtx || !audioBuffer) return
    stopSource()

    const source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioCtx.destination)
    sourceRef.current = source
    startTimeRef.current = audioCtx.currentTime

    const updateTime = () => {
      if (audioCtx) {
        setCurrentTime(audioCtx.currentTime - startTimeRef.current + pauseOffsetRef.current)
        animFrameRef.current = requestAnimationFrame(updateTime)
      }
    }

    source.onended = () => {
      cancelAnimationFrame(animFrameRef.current)
      setCurrentTime(0)
      pauseOffsetRef.current = 0
      onEnded()
    }

    source.start(0, pauseOffsetRef.current)
    animFrameRef.current = requestAnimationFrame(updateTime)
  }, [audioCtx, audioBuffer, stopSource, onEnded])

  // 响应 active 变化
  useEffect(() => {
    if (active) {
      if (audioBuffer) {
        if (audioCtx?.state === 'suspended') {
          audioCtx.resume().then(() => startSource())
        } else {
          startSource()
        }
      }
    } else if (sourceRef.current) {
      pauseOffsetRef.current += (audioCtx?.currentTime ?? 0) - startTimeRef.current
      stopSource()
    }
  }, [active, audioBuffer, audioCtx, startSource, stopSource])

  // 清理
  useEffect(() => () => { stopSource(); cancelAnimationFrame(animFrameRef.current) }, [stopSource])

  return {
    isPlaying: active,
    currentTime,
    duration,
    loadError,
    ready: !!audioBuffer,
    play: startSource,
    pause: () => {
      pauseOffsetRef.current += (audioCtx?.currentTime ?? 0) - startTimeRef.current
      stopSource()
    },
    stop: () => { pauseOffsetRef.current = 0; stopSource() },
  }
}