import { useState, useEffect } from 'react'

export function useBackground(bgUrl: string) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!bgUrl) return
    const img = new Image()
    img.onload = () => {
      document.documentElement.style.setProperty('--bg-image', `url(${bgUrl})`)
      setLoaded(true)
    }
    img.src = bgUrl
  }, [bgUrl])

  return loaded
}