export interface ConvertResult {
  success: boolean
  original: string
  converted: string | null
  songId: string | null
  pageUrl: string | null
  error?: string
}

const NETEASE_SONG_PATTERN = /music\.163\.com\/(?:#\/)?song(?:\/media\/outer\/url)?\?id=(\d+)/i

export function convertUrl(input: string): ConvertResult | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const match = trimmed.match(NETEASE_SONG_PATTERN)
  if (!match?.[1]) {
    return {
      success: false,
      original: trimmed,
      converted: null,
      songId: null,
      pageUrl: null,
      error: '无法识别的网易云音乐链接格式',
    }
  }

  const songId = match[1]
  return {
    success: true,
    original: trimmed,
    converted: `https://music.163.com/song/media/outer/url?id=${songId}.mp3`,
    songId,
    pageUrl: `https://music.163.com/song?id=${songId}`,
  }
}

export function batchConvert(rawInput: string): ConvertResult[] {
  return rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reduce<ConvertResult[]>((acc, line) => {
      const result = convertUrl(line)
      if (result?.success) acc.push(result)
      return acc
    }, [])
}