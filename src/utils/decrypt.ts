// ============================================================
// 音乐文件解密工具
// 支持 NCM / QMC / KGM / KWM / XM 等加密格式
// 基于 unlock-music (https://github.com/ipid/unlock-music) 算法
// 所有解密在浏览器本地完成，文件不会上传到服务器
// ============================================================

import CryptoJS from 'crypto-js'

// ==================== 通用工具函数 ====================

function wordArrayToUint8Array(wa: CryptoJS.lib.WordArray): Uint8Array {
  const words = wa.words
  const sigBytes = wa.sigBytes
  const result = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) {
    result[i] = (words[Math.floor(i / 4)]! >>> (24 - (i % 4) * 8)) & 0xff
  }
  return result
}

function aesEcbDecrypt(data: Uint8Array, key: CryptoJS.lib.WordArray, stripPadding = true): Uint8Array {
  const wordArray = CryptoJS.lib.WordArray.create(data)
  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: wordArray })
  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
    mode: CryptoJS.mode.ECB,
    padding: stripPadding ? CryptoJS.pad.Pkcs7 : CryptoJS.pad.NoPadding,
  })
  return wordArrayToUint8Array(decrypted)
}

function readU32LE(view: Uint8Array, offset: number): number {
  return view[offset]! | (view[offset + 1]! << 8) | (view[offset + 2]! << 16) | (view[offset + 3]! << 24)
}

function concatUint8(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/** 通过文件头部魔数判断解密后的音频格式 */
function sniffAudioExt(data: Uint8Array, fallbackExt?: string): string {
  if (data.length >= 4) {
    if (data[0] === 0x66 && data[1] === 0x4C && data[2] === 0x61 && data[3] === 0x43) return 'flac'
    if (data[0] === 0x4F && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) return 'ogg'
    if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) return 'mp3'
    if (data[0] === 0xFF && (data[1] & 0xE0) === 0xE0) return 'mp3'
  }
  if (data.length >= 2 && data[0] === 0xFF && (data[1] & 0xF0) === 0xF0) return 'aac'
  if (data.length >= 12 &&
    data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) return 'm4a'
  if (data.length >= 12 &&
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'wav'
  return fallbackExt || 'mp3'
}

function bytesHasPrefix(data: Uint8Array, prefix: number[]): boolean {
  if (data.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (data[i] !== prefix[i]) return false
  }
  return true
}

const audioMimeType: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
}

// ==================== 类型定义 ====================

export type NamingFormat = 'artist-title' | 'title-artist' | 'title' | 'original'

export interface DecryptResult {
  success: boolean
  buffer: ArrayBuffer | null
  fileName: string
  originalName: string
  mimeType: string
  title?: string
  artist?: string
  album?: string
  coverUrl?: string
  coverData?: Uint8Array
  error?: string
}

// ==================== 封面嵌入 ====================

function detectCoverMime(data: Uint8Array): string {
  const isPng = data.length >= 8 &&
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47
  return isPng ? 'image/png' : 'image/jpeg'
}

function writeSynchsafeInt(value: number): Uint8Array {
  const result = new Uint8Array(4)
  result[0] = (value >> 21) & 0x7f
  result[1] = (value >> 14) & 0x7f
  result[2] = (value >> 7) & 0x7f
  result[3] = value & 0x7f
  return result
}

function writeBE32(value: number): Uint8Array {
  const result = new Uint8Array(4)
  result[0] = (value >> 24) & 0xff
  result[1] = (value >> 16) & 0xff
  result[2] = (value >> 8) & 0xff
  result[3] = value & 0xff
  return result
}

export function embedCoverImage(audioBuf: ArrayBuffer, coverData: Uint8Array, format: string): ArrayBuffer {
  if (format === 'flac') return embedFlacPicture(audioBuf, coverData)
  return embedMp3Apic(audioBuf, coverData)
}

function embedMp3Apic(audioBuf: ArrayBuffer, coverData: Uint8Array): ArrayBuffer {
  const mime = detectCoverMime(coverData)
  const mimeBytes = new TextEncoder().encode(mime)
  const enc = new TextEncoder()

  const apicBody = concatUint8(
    new Uint8Array([0x00]),
    mimeBytes,
    new Uint8Array([0x00]),
    new Uint8Array([0x03]),
    enc.encode(''),
    new Uint8Array([0x00]),
    coverData,
  )

  const apicFrame = concatUint8(
    enc.encode('APIC'),
    writeSynchsafeInt(apicBody.length),
    new Uint8Array([0x00, 0x00]),
    apicBody,
  )

  const tagSize = apicFrame.length
  const id3Header = concatUint8(
    enc.encode('ID3'),
    new Uint8Array([0x03, 0x00]),
    new Uint8Array([0x00]),
    writeSynchsafeInt(tagSize),
  )

  const audio = new Uint8Array(audioBuf)
  let audioOffset = 0
  if (audio.length >= 10 &&
      audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
    const existingSize = ((audio[6]! & 0x7f) << 21) |
                         ((audio[7]! & 0x7f) << 14) |
                         ((audio[8]! & 0x7f) << 7) |
                         (audio[9]! & 0x7f)
    audioOffset = 10 + existingSize
  }

  return concatUint8(id3Header, apicFrame, audio.slice(audioOffset)).buffer as ArrayBuffer
}

function embedFlacPicture(audioBuf: ArrayBuffer, coverData: Uint8Array): ArrayBuffer {
  const audio = new Uint8Array(audioBuf)
  const mime = detectCoverMime(coverData)
  const enc = new TextEncoder()
  const mimeBytes = enc.encode(mime)

  const picBody = concatUint8(
    writeBE32(3),
    writeBE32(mimeBytes.length),
    mimeBytes,
    writeBE32(0),
    writeBE32(0),
    writeBE32(0),
    writeBE32(0),
    writeBE32(0),
    writeBE32(coverData.length),
    coverData,
  )

  if (audio.length < 4 ||
      audio[0] !== 0x66 || audio[1] !== 0x4C || audio[2] !== 0x61 || audio[3] !== 0x43) {
    return audioBuf
  }

  let pos = 4
  let firstBlockDone = false
  const blocks: Uint8Array[] = []

  while (pos < audio.length) {
    const header = audio[pos]!
    const isLast = (header & 0x80) !== 0
    const blockLen = (audio[pos + 1]! << 16) | (audio[pos + 2]! << 8) | audio[pos + 3]!
    const blockEnd = pos + 4 + blockLen

    if (!firstBlockDone) {
      firstBlockDone = true
      const newHeader = new Uint8Array([header & 0x7f])
      const blockData = audio.slice(pos + 1, blockEnd)
      blocks.push(concatUint8(newHeader, blockData))

      const picHeader = new Uint8Array([0x06])
      const picLen = new Uint8Array(3)
      picLen[0] = (picBody.length >> 16) & 0xff
      picLen[1] = (picBody.length >> 8) & 0xff
      picLen[2] = picBody.length & 0xff
      blocks.push(concatUint8(picHeader, picLen, picBody))
    } else {
      blocks.push(audio.slice(pos, blockEnd))
    }

    if (isLast) { pos = blockEnd; break }
    pos = blockEnd
  }

  if (blocks.length > 0) {
    const lastBlock = new Uint8Array(blocks[blocks.length - 1]!)
    lastBlock[0] |= 0x80
    blocks[blocks.length - 1] = lastBlock
  }

  return concatUint8(...blocks).buffer as ArrayBuffer
}

// ==================== 命名格式化 ====================

export function formatFileName(result: DecryptResult, format: NamingFormat): string {
  const ext = result.fileName.includes('.') ? result.fileName.slice(result.fileName.lastIndexOf('.')) : '.mp3'

  switch (format) {
    case 'artist-title':
      if (result.artist && result.title) return `${result.artist} - ${result.title}${ext}`
      if (result.title) return `${result.title}${ext}`
      return result.originalName.replace(/\.[^.]+$/, ext)
    case 'title-artist':
      if (result.title && result.artist) return `${result.title} - ${result.artist}${ext}`
      if (result.title) return `${result.title}${ext}`
      return result.originalName.replace(/\.[^.]+$/, ext)
    case 'title':
      if (result.title) return `${result.title}${ext}`
      return result.originalName.replace(/\.[^.]+$/, ext)
    case 'original':
      return result.originalName.replace(/\.[^.]+$/, ext)
  }
}

// ==================== NCM 解密 (网易云音乐) ====================

const NCM_CORE_KEY = CryptoJS.enc.Utf8.parse('hzHRAmso5kInbaxW')
const NCM_META_KEY = CryptoJS.enc.Utf8.parse("#14ljk_!\\]&0U<'(")
const NCM_MAGIC = new Uint8Array([0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d])

function ncmRc4Decrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i
  let lastByte = 0
  let keyOffset = 0
  for (let i = 0; i < 256; i++) {
    const swap = S[i]!
    const c = (swap + lastByte + key[keyOffset++]!) & 0xff
    if (keyOffset >= key.length) keyOffset = 0
    S[i] = S[c]!
    S[c] = swap
    lastByte = c
  }

  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const j = (i + 1) & 0xff
    result[i] = data[i]! ^ S[(S[j]! + S[(S[j]! + j) & 0xff]!) & 0xff]!
  }
  return result
}

async function decryptNcm(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  const view = new Uint8Array(fileBuffer)

  for (let i = 0; i < 8; i++) {
    if (view[i] !== NCM_MAGIC[i]) {
      return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: '不是有效的 NCM 文件' }
    }
  }

  let offset = 10

  const keyLen = readU32LE(view, offset)
  offset += 4
  const keyDataEnc = new Uint8Array(view.slice(offset, offset + keyLen))
  offset += keyLen

  for (let i = 0; i < keyDataEnc.length; i++) keyDataEnc[i] ^= 0x64
  const keyData = aesEcbDecrypt(keyDataEnc, NCM_CORE_KEY)
  const rc4Key = keyData.slice(17)

  const metaLen = readU32LE(view, offset)
  offset += 4
  const metaEnc = new Uint8Array(view.slice(offset, offset + metaLen))
  offset += metaLen

  for (let i = 0; i < metaEnc.length; i++) metaEnc[i] ^= 0x63

  const rawStr = new TextDecoder().decode(metaEnc.slice(22))
  const b64Encoded = rawStr.replace(/\0.*$/, '')

  let metaDec: Uint8Array
  try {
    const binaryStr = atob(b64Encoded)
    const b64Decoded = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) b64Decoded[i] = binaryStr.charCodeAt(i)
    metaDec = aesEcbDecrypt(b64Decoded, NCM_META_KEY, false)
    const padLen = metaDec[metaDec.length - 1]!
    if (padLen > 0 && padLen <= 16) metaDec = metaDec.slice(0, metaDec.length - padLen)
  } catch {
    metaDec = aesEcbDecrypt(metaEnc.slice(22), NCM_META_KEY, false)
    const padLen = metaDec[metaDec.length - 1]!
    if (padLen > 0 && padLen <= 16) metaDec = metaDec.slice(0, metaDec.length - padLen)
  }

  const metaRaw = new TextDecoder().decode(metaDec)
  const metaJsonStr = metaRaw.replace(/^music:/, '')

  let metaJson: Record<string, unknown> = {}
  try { metaJson = JSON.parse(metaJsonStr) } catch { /* 忽略 */ }

  offset += 5
  const coverFrameLen = readU32LE(view, offset)
  offset += 4
  const imgDataSize = readU32LE(view, offset)
  offset += 4

  let coverUrl: string | undefined
  let coverData: Uint8Array | undefined
  if (imgDataSize > 0 && offset + imgDataSize <= view.length) {
    const imgData = view.slice(offset, offset + imgDataSize)
    coverData = new Uint8Array(imgData)
    const isPng = imgDataSize >= 8 &&
      imgData[0] === 0x89 && imgData[1] === 0x50 && imgData[2] === 0x4E && imgData[3] === 0x47
    coverUrl = URL.createObjectURL(new Blob([imgData], { type: isPng ? 'image/png' : 'image/jpeg' }))
  }
  offset += imgDataSize
  offset += coverFrameLen - imgDataSize

  const audioData = view.slice(offset)
  const decrypted = ncmRc4Decrypt(audioData, rc4Key)

  const musicName = String(metaJson['musicName'] || metaJson['title'] || '')
  const rawArtist = metaJson['artist']
  const artist = Array.isArray(rawArtist)
    ? (rawArtist as unknown[][]).map((a) => (Array.isArray(a) ? String(a[0] ?? '') : String(a))).filter(Boolean).join(', ')
    : String(rawArtist || '')
  const album = String(metaJson['album'] || '')
  const format = String(metaJson['format'] || 'mp3')

  const mimeType = format === 'flac' ? 'audio/flac' : 'audio/mpeg'
  const ext = format === 'flac' ? '.flac' : '.mp3'
  const outName = (artist && musicName) ? `${artist} - ${musicName}${ext}` : fileName.replace(/\.ncm$/i, ext)

  return {
    success: true,
    buffer: decrypted.buffer as ArrayBuffer,
    fileName: outName,
    originalName: fileName,
    mimeType,
    title: musicName,
    artist,
    album,
    coverUrl,
    coverData,
  }
}

// ==================== TEA Cipher（用于 QMC 密钥派生）====================

class TeaCipher {
  static readonly delta = 0x9e3779b9
  static readonly numRounds = 64

  private k0: number; private k1: number; private k2: number; private k3: number
  private rounds: number

  constructor(key: Uint8Array, rounds = TeaCipher.numRounds) {
    if (key.length !== 16) throw Error('incorrect key size')
    if ((rounds & 1) !== 0) throw Error('odd number of rounds')
    const k = new DataView(key.buffer, key.byteOffset, key.byteLength)
    this.k0 = k.getUint32(0, false)
    this.k1 = k.getUint32(4, false)
    this.k2 = k.getUint32(8, false)
    this.k3 = k.getUint32(12, false)
    this.rounds = rounds
  }

  decrypt(dst: DataView, src: DataView) {
    let v0 = src.getUint32(0, false)
    let v1 = src.getUint32(4, false)
    let sum = (TeaCipher.delta * this.rounds) / 2
    for (let i = 0; i < this.rounds / 2; i++) {
      v1 -= ((v0 << 4) + this.k2) ^ (v0 + sum) ^ ((v0 >>> 5) + this.k3)
      v0 -= ((v1 << 4) + this.k0) ^ (v1 + sum) ^ ((v1 >>> 5) + this.k1)
      sum -= TeaCipher.delta
    }
    dst.setUint32(0, v0, false)
    dst.setUint32(4, v1, false)
  }
}

// ==================== QMC 密钥派生 (QQ音乐) ====================

const mixKey1 = new Uint8Array([0x33, 0x38, 0x36, 0x5A, 0x4A, 0x59, 0x21, 0x40, 0x23, 0x2A, 0x24, 0x25, 0x5E, 0x26, 0x29, 0x28])
const mixKey2 = new Uint8Array([0x2A, 0x2A, 0x23, 0x21, 0x28, 0x23, 0x24, 0x25, 0x26, 0x5E, 0x61, 0x31, 0x63, 0x5A, 0x2C, 0x54])

function decryptTencentTea(inBuf: Uint8Array, key: Uint8Array): Uint8Array {
  if (inBuf.length % 8 !== 0) throw Error('inBuf size not a multiple of the block size')
  if (inBuf.length < 16) throw Error('inBuf size too small')

  const blk = new TeaCipher(key, 32)
  const tmpBuf = new Uint8Array(8)
  const tmpView = new DataView(tmpBuf.buffer)

  blk.decrypt(tmpView, new DataView(inBuf.buffer, inBuf.byteOffset, 8))
  const nPadLen = tmpBuf[0]! & 0x7

  const outLen = inBuf.length - 1 - nPadLen - 2 - 7
  const outBuf = new Uint8Array(outLen)

  let ivPrev = new Uint8Array(8)
  let ivCur = inBuf.slice(0, 8)
  let inBufPos = 8
  let tmpIdx = 1 + nPadLen

  const cryptBlock = () => {
    ivPrev = ivCur
    ivCur = inBuf.slice(inBufPos, inBufPos + 8)
    for (let j = 0; j < 8; j++) tmpBuf[j] ^= ivCur[j]!
    blk.decrypt(tmpView, tmpView)
    inBufPos += 8
    tmpIdx = 0
  }

  // 跳过 Salt (2 bytes)
  for (let i = 1; i <= 2;) {
    if (tmpIdx < 8) { tmpIdx++; i++ }
    else cryptBlock()
  }

  // 还原明文
  let outBufPos = 0
  while (outBufPos < outLen) {
    if (tmpIdx < 8) {
      outBuf[outBufPos] = tmpBuf[tmpIdx]! ^ ivPrev[tmpIdx]!
      outBufPos++; tmpIdx++
    } else {
      cryptBlock()
    }
  }

  // 校验 Zero (7 bytes)
  for (let i = 1; i <= 7; i++) {
    if (tmpBuf[tmpIdx] !== ivPrev[tmpIdx]) throw Error('zero check failed')
  }
  return outBuf
}

function decryptV2Key(key: Uint8Array): Uint8Array {
  const textEnc = new TextDecoder()
  if (key.length < 18 || textEnc.decode(key.slice(0, 18)) !== 'QQMusic EncV2,Key:') return key
  let out = decryptTencentTea(key.slice(18), mixKey1)
  out = decryptTencentTea(out, mixKey2)
  const keyDec = new Uint8Array(
    Array.from(atob(new TextDecoder().decode(out)), (c) => c.charCodeAt(0)),
  )
  if (keyDec.length < 16) throw Error('EncV2 key decode failed')
  return keyDec
}

function simpleMakeKey(salt: number, length: number): number[] {
  const keyBuf: number[] = []
  for (let i = 0; i < length; i++) {
    const tmp = Math.tan(salt + i * 0.1)
    keyBuf[i] = 0xff & (Math.abs(tmp) * 100.0)
  }
  return keyBuf
}

function qmcDeriveKey(raw: Uint8Array): Uint8Array {
  let rawDec = new Uint8Array(
    Array.from(atob(new TextDecoder().decode(raw)), (c) => c.charCodeAt(0)),
  )
  if (rawDec.length < 16) throw Error('key length is too short')

  rawDec = new Uint8Array(decryptV2Key(rawDec))

  const simpleKey = simpleMakeKey(106, 8)
  const teaKey = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    teaKey[i << 1] = simpleKey[i]!
    teaKey[(i << 1) + 1] = rawDec[i]!
  }

  const sub = decryptTencentTea(rawDec.subarray(8), teaKey)
  rawDec.set(sub, 8)
  return rawDec.subarray(0, 8 + sub.length)
}

// ==================== QMC Cipher 类 ====================

interface QmcStreamCipher {
  decrypt(buf: Uint8Array, offset: number): void
}

// 静态密钥表（与 unlock-music 完全一致）
const QMC_STATIC_BOX = new Uint8Array([
  0x77, 0x48, 0x32, 0x73, 0xDE, 0xF2, 0xC0, 0xC8,
  0x95, 0xEC, 0x30, 0xB2, 0x51, 0xC3, 0xE1, 0xA0,
  0x9E, 0xE6, 0x9D, 0xCF, 0xFA, 0x7F, 0x14, 0xD1,
  0xCE, 0xB8, 0xDC, 0xC3, 0x4A, 0x67, 0x93, 0xD6,
  0x28, 0xC2, 0x91, 0x70, 0xCA, 0x8D, 0xA2, 0xA4,
  0xF0, 0x08, 0x61, 0x90, 0x7E, 0x6F, 0xA2, 0xE0,
  0xEB, 0xAE, 0x3E, 0xB6, 0x67, 0xC7, 0x92, 0xF4,
  0x91, 0xB5, 0xF6, 0x6C, 0x5E, 0x84, 0x40, 0xF7,
  0xF3, 0x1B, 0x02, 0x7F, 0xD5, 0xAB, 0x41, 0x89,
  0x28, 0xF4, 0x25, 0xCC, 0x52, 0x11, 0xAD, 0x43,
  0x68, 0xA6, 0x41, 0x8B, 0x84, 0xB5, 0xFF, 0x2C,
  0x92, 0x4A, 0x26, 0xD8, 0x47, 0x6A, 0x7C, 0x95,
  0x61, 0xCC, 0xE6, 0xCB, 0xBB, 0x3F, 0x47, 0x58,
  0x89, 0x75, 0xC3, 0x75, 0xA1, 0xD9, 0xAF, 0xCC,
  0x08, 0x73, 0x17, 0xDC, 0xAA, 0x9A, 0xA2, 0x16,
  0x41, 0xD8, 0xA2, 0x06, 0xC6, 0x8B, 0xFC, 0x66,
  0x34, 0x9F, 0xCF, 0x18, 0x23, 0xA0, 0x0A, 0x74,
  0xE7, 0x2B, 0x27, 0x70, 0x92, 0xE9, 0xAF, 0x37,
  0xE6, 0x8C, 0xA7, 0xBC, 0x62, 0x65, 0x9C, 0xC2,
  0x08, 0xC9, 0x88, 0xB3, 0xF3, 0x43, 0xAC, 0x74,
  0x2C, 0x0F, 0xD4, 0xAF, 0xA1, 0xC3, 0x01, 0x64,
  0x95, 0x4E, 0x48, 0x9F, 0xF4, 0x35, 0x78, 0x95,
  0x7A, 0x39, 0xD6, 0x6A, 0xA0, 0x6D, 0x40, 0xE8,
  0x4F, 0xA8, 0xEF, 0x11, 0x1D, 0xF3, 0x1B, 0x3F,
  0x3F, 0x07, 0xDD, 0x6F, 0x5B, 0x19, 0x30, 0x19,
  0xFB, 0xEF, 0x0E, 0x37, 0xF0, 0x0E, 0xCD, 0x16,
  0x49, 0xFE, 0x53, 0x47, 0x13, 0x1A, 0xBD, 0xA4,
  0xF1, 0x40, 0x19, 0x60, 0x0E, 0xED, 0x68, 0x09,
  0x06, 0x5F, 0x4D, 0xCF, 0x3D, 0x1A, 0xFE, 0x20,
  0x77, 0xE4, 0xD9, 0xDA, 0xF9, 0xA4, 0x2B, 0x76,
  0x1C, 0x71, 0xDB, 0x00, 0xBC, 0xFD, 0x0C, 0x6C,
  0xA5, 0x47, 0xF7, 0xF6, 0x00, 0x79, 0x4A, 0x11,
])

class QmcStaticCipher implements QmcStreamCipher {
  getMask(offset: number) {
    if (offset > 0x7fff) offset %= 0x7fff
    return QMC_STATIC_BOX[(offset * offset + 27) & 0xff]!
  }
  decrypt(buf: Uint8Array, offset: number) {
    for (let i = 0; i < buf.length; i++) buf[i] ^= this.getMask(offset + i)
  }
}

class QmcMapCipher implements QmcStreamCipher {
  key: Uint8Array; n: number
  constructor(key: Uint8Array) {
    if (key.length === 0) throw Error('qmc/cipher_map: invalid key size')
    this.key = key
    this.n = key.length
  }
  private static rotate(value: number, bits: number) {
    const rotate = (bits + 4) % 8
    const left = value << rotate
    const right = value >> rotate
    return (left | right) & 0xff
  }
  decrypt(buf: Uint8Array, offset: number): void {
    for (let i = 0; i < buf.length; i++) buf[i] ^= this.getMask(offset + i)
  }
  private getMask(offset: number) {
    if (offset > 0x7fff) offset %= 0x7fff
    const idx = (offset * offset + 71214) % this.n
    return QmcMapCipher.rotate(this.key[idx]!, idx & 0x7)
  }
}

class QmcRC4Cipher implements QmcStreamCipher {
  private static readonly FIRST_SEGMENT_SIZE = 0x80
  private static readonly SEGMENT_SIZE = 5120

  S: Uint8Array; N: number; key: Uint8Array; hash: number

  constructor(key: Uint8Array) {
    if (key.length === 0) throw Error('invalid key size')
    this.key = key
    this.N = key.length
    this.S = new Uint8Array(this.N)
    for (let i = 0; i < this.N; ++i) this.S[i] = i & 0xff
    let j = 0
    for (let i = 0; i < this.N; ++i) {
      j = (this.S[i]! + j + this.key[i % this.N]!) % this.N;
      [this.S[i], this.S[j]] = [this.S[j]!, this.S[i]!]
    }
    this.hash = 1
    for (let i = 0; i < this.N; i++) {
      const value = this.key[i]!
      if (!value) continue
      const next_hash = (this.hash * value) >>> 0
      if (next_hash === 0 || next_hash <= this.hash) break
      this.hash = next_hash
    }
  }

  decrypt(buf: Uint8Array, offset: number): void {
    let toProcess = buf.length
    let processed = 0
    const postProcess = (len: number): boolean => {
      toProcess -= len; processed += len; offset += len
      return toProcess === 0
    }
    if (offset < QmcRC4Cipher.FIRST_SEGMENT_SIZE) {
      const len = Math.min(buf.length, QmcRC4Cipher.FIRST_SEGMENT_SIZE - offset)
      this.encFirstSegment(buf.subarray(0, len), offset)
      if (postProcess(len)) return
    }
    if (offset % QmcRC4Cipher.SEGMENT_SIZE !== 0) {
      const len = Math.min(QmcRC4Cipher.SEGMENT_SIZE - (offset % QmcRC4Cipher.SEGMENT_SIZE), toProcess)
      this.encASegment(buf.subarray(processed, processed + len), offset)
      if (postProcess(len)) return
    }
    while (toProcess > QmcRC4Cipher.SEGMENT_SIZE) {
      this.encASegment(buf.subarray(processed, processed + QmcRC4Cipher.SEGMENT_SIZE), offset)
      postProcess(QmcRC4Cipher.SEGMENT_SIZE)
    }
    if (toProcess > 0) this.encASegment(buf.subarray(processed), offset)
  }

  private encFirstSegment(buf: Uint8Array, offset: number) {
    for (let i = 0; i < buf.length; i++) {
      buf[i] ^= this.key[this.getSegmentKey(offset + i)]!
    }
  }

  private encASegment(buf: Uint8Array, offset: number) {
    const S = this.S.slice(0)
    const skipLen = (offset % QmcRC4Cipher.SEGMENT_SIZE) + this.getSegmentKey(Math.floor(offset / QmcRC4Cipher.SEGMENT_SIZE))
    let j = 0, k = 0
    for (let i = -skipLen; i < buf.length; i++) {
      j = (j + 1) % this.N
      k = (S[j]! + k) % this.N;
      [S[k], S[j]] = [S[j]!, S[k]!]
      if (i >= 0) buf[i] ^= S[(S[j]! + S[k]!) % this.N]!
    }
  }

  private getSegmentKey(id: number): number {
    const seed = this.key[id % this.N]!
    const idx = Math.floor((this.hash / ((id + 1) * seed)) * 100.0)
    return idx % this.N
  }
}

// ==================== QMC 解密 (QQ音乐) ====================

const QMC_EXT_MAP: Record<string, { ext: string; version: number }> = {
  mgg: { ext: 'ogg', version: 2 },
  mgg0: { ext: 'ogg', version: 2 },
  mggl: { ext: 'ogg', version: 2 },
  mgg1: { ext: 'ogg', version: 2 },
  mflac: { ext: 'flac', version: 2 },
  mflac0: { ext: 'flac', version: 2 },
  mmp4: { ext: 'mmp4', version: 2 },
  qmcflac: { ext: 'flac', version: 2 },
  qmcogg: { ext: 'ogg', version: 2 },
  qmc0: { ext: 'mp3', version: 2 },
  qmc2: { ext: 'ogg', version: 2 },
  qmc3: { ext: 'mp3', version: 2 },
  qmc4: { ext: 'ogg', version: 2 },
  qmc6: { ext: 'ogg', version: 2 },
  qmc8: { ext: 'ogg', version: 2 },
  bkcmp3: { ext: 'mp3', version: 1 },
  bkcm4a: { ext: 'm4a', version: 1 },
  bkcflac: { ext: 'flac', version: 1 },
  bkcwav: { ext: 'wav', version: 1 },
  bkcape: { ext: 'ape', version: 1 },
  bkcogg: { ext: 'ogg', version: 1 },
  bkcwma: { ext: 'wma', version: 1 },
  tkm: { ext: 'm4a', version: 1 },
  '666c6163': { ext: 'flac', version: 1 },
  '6d7033': { ext: 'mp3', version: 1 },
  '6f6767': { ext: 'ogg', version: 1 },
  '6d3461': { ext: 'm4a', version: 1 },
  '776176': { ext: 'wav', version: 1 },
}

const BYTE_COMMA = ','.charCodeAt(0)

interface QmcDecodeResult {
  data: Uint8Array
  songId?: number
  ext: string
}

function decryptQmcJs(fileData: Uint8Array, rawExt: string): QmcDecodeResult {
  const handler = QMC_EXT_MAP[rawExt]
  if (!handler) throw Error(`QMC cannot handle type: ${rawExt}`)

  let audioSize: number
  let cipher: QmcStreamCipher
  let songId: number | undefined

  const last4Byte = fileData.slice(-4)
  const textEnc = new TextDecoder()

  if (textEnc.decode(last4Byte) === 'QTag') {
    // V2: 密钥在文件末尾 QTag 之前
    const sizeBuf = fileData.slice(-8, -4)
    const sizeView = new DataView(sizeBuf.buffer, sizeBuf.byteOffset, 4)
    const keySize = sizeView.getUint32(0, false)
    audioSize = fileData.length - keySize - 8
    const rawKey = fileData.subarray(audioSize, fileData.length - 8)
    const keyEnd = rawKey.findIndex((v) => v === BYTE_COMMA)
    if (keyEnd < 0) throw Error('invalid key: search raw key failed')
    const keyDec = qmcDeriveKey(rawKey.subarray(0, keyEnd))
    cipher = keyDec.length > 300 ? new QmcRC4Cipher(keyDec) : new QmcMapCipher(keyDec)
    const idBuf = rawKey.subarray(keyEnd + 1)
    const idEnd = idBuf.findIndex((v) => v === BYTE_COMMA)
    if (idEnd >= 0) songId = parseInt(textEnc.decode(idBuf.subarray(0, idEnd)), 10)
  } else if (textEnc.decode(last4Byte) === 'STag') {
    throw Error('文件中没有写入密钥，无法解锁，请降级App并重试')
  } else {
    // V1: 密钥在文件末尾
    const sizeView = new DataView(last4Byte.buffer, last4Byte.byteOffset, 4)
    const keySize = sizeView.getUint32(0, true)
    if (keySize < 0x400) {
      audioSize = fileData.length - keySize - 4
      const rawKey = fileData.subarray(audioSize, fileData.length - 4)
      const keyDec = qmcDeriveKey(rawKey)
      cipher = keyDec.length > 300 ? new QmcRC4Cipher(keyDec) : new QmcMapCipher(keyDec)
    } else {
      audioSize = fileData.length
      cipher = new QmcStaticCipher()
    }
  }

  const audioBuf = fileData.subarray(0, audioSize)
  cipher.decrypt(audioBuf, 0)
  return { data: audioBuf, songId, ext: handler.ext }
}

async function decryptQmc(fileBuffer: ArrayBuffer, fileName: string, rawExt: string): Promise<DecryptResult> {
  try {
    const fileData = new Uint8Array(fileBuffer)
    const result = decryptQmcJs(fileData, rawExt)

    const ext = sniffAudioExt(result.data, result.ext)
    const mimeType = audioMimeType[ext] || 'audio/mpeg'
    const outExt = `.${ext}`
    const outName = fileName.replace(/\.[^.]+$/, outExt)

    return {
      success: true,
      buffer: result.data.buffer as ArrayBuffer,
      fileName: outName,
      originalName: fileName,
      mimeType,
    }
  } catch (e) {
    return {
      success: false,
      buffer: null,
      fileName,
      originalName: fileName,
      mimeType: '',
      error: e instanceof Error ? e.message : 'QMC 解密失败',
    }
  }
}

// ==================== KGM/VPR 解密 (酷狗音乐) ====================

const KGM_HEADER = [0x7C, 0xD5, 0x32, 0xEB, 0x86, 0x02, 0x7F, 0x4B, 0xA8, 0xAF, 0xA6, 0x8E, 0x0F, 0xFF, 0x99, 0x14]
const VPR_HEADER = [0x05, 0x28, 0xBC, 0x96, 0xE9, 0xE4, 0x5A, 0x43, 0x91, 0xAA, 0xBD, 0xD0, 0x7A, 0xF5, 0x36, 0x31]

const VPR_MASK_DIFF = new Uint8Array([
  0x25, 0xDF, 0xE8, 0xA6, 0x75, 0x1E, 0x75, 0x0E,
  0x2F, 0x80, 0xF3, 0x2D, 0xB8, 0xB6, 0xE3, 0x11, 0x00,
])

const KGM_TABLE1 = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x01, 0x21, 0x01, 0x61, 0x01, 0x21, 0x01, 0xe1, 0x01, 0x21, 0x01, 0x61, 0x01, 0x21, 0x01,
  0xd2, 0x23, 0x02, 0x02, 0x42, 0x42, 0x02, 0x02, 0xc2, 0xc2, 0x02, 0x02, 0x42, 0x42, 0x02, 0x02,
  0xd3, 0xd3, 0x02, 0x03, 0x63, 0x43, 0x63, 0x03, 0xe3, 0xc3, 0xe3, 0x03, 0x63, 0x43, 0x63, 0x03,
  0x94, 0xb4, 0x94, 0x65, 0x04, 0x04, 0x04, 0x04, 0x84, 0x84, 0x84, 0x84, 0x04, 0x04, 0x04, 0x04,
  0x95, 0x95, 0x95, 0x95, 0x04, 0x05, 0x25, 0x05, 0xe5, 0x85, 0xa5, 0x85, 0xe5, 0x05, 0x25, 0x05,
  0xd6, 0xb6, 0x96, 0xb6, 0xd6, 0x27, 0x06, 0x06, 0xc6, 0xc6, 0x86, 0x86, 0xc6, 0xc6, 0x06, 0x06,
  0xd7, 0xd7, 0x97, 0x97, 0xd7, 0xd7, 0x06, 0x07, 0xe7, 0xc7, 0xe7, 0x87, 0xe7, 0xc7, 0xe7, 0x07,
  0x18, 0x38, 0x18, 0x78, 0x18, 0x38, 0x18, 0xe9, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x19, 0x08, 0x09, 0x29, 0x09, 0x69, 0x09, 0x29, 0x09,
  0xda, 0x3a, 0x1a, 0x3a, 0x5a, 0x3a, 0x1a, 0x3a, 0xda, 0x2b, 0x0a, 0x0a, 0x4a, 0x4a, 0x0a, 0x0a,
  0xdb, 0xdb, 0x1b, 0x1b, 0x5b, 0x5b, 0x1b, 0x1b, 0xdb, 0xdb, 0x0a, 0x0b, 0x6b, 0x4b, 0x6b, 0x0b,
  0x9c, 0xbc, 0x9c, 0x7c, 0x1c, 0x3c, 0x1c, 0x7c, 0x9c, 0xbc, 0x9c, 0x6d, 0x0c, 0x0c, 0x0c, 0x0c,
  0x9d, 0x9d, 0x9d, 0x9d, 0x1d, 0x1d, 0x1d, 0x1d, 0x9d, 0x9d, 0x9d, 0x9d, 0x0c, 0x0d, 0x2d, 0x0d,
  0xde, 0xbe, 0x9e, 0xbe, 0xde, 0x3e, 0x1e, 0x3e, 0xde, 0xbe, 0x9e, 0xbe, 0xde, 0x2f, 0x0e, 0x0e,
  0xdf, 0xdf, 0x9f, 0x9f, 0xdf, 0xdf, 0x1f, 0x1f, 0xdf, 0xdf, 0x9f, 0x9f, 0xdf, 0xdf, 0x0e, 0x0f,
  0x00, 0x20, 0x00, 0x60, 0x00, 0x20, 0x00, 0xe0, 0x00, 0x20, 0x00, 0x60, 0x00, 0x20, 0x00, 0xf1,
])

const KGM_TABLE2 = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x01, 0x23, 0x01, 0x67, 0x01, 0x23, 0x01, 0xef, 0x01, 0x23, 0x01, 0x67, 0x01, 0x23, 0x01,
  0xdf, 0x21, 0x02, 0x02, 0x46, 0x46, 0x02, 0x02, 0xce, 0xce, 0x02, 0x02, 0x46, 0x46, 0x02, 0x02,
  0xde, 0xde, 0x02, 0x03, 0x65, 0x47, 0x65, 0x03, 0xed, 0xcf, 0xed, 0x03, 0x65, 0x47, 0x65, 0x03,
  0x9d, 0xbf, 0x9d, 0x63, 0x04, 0x04, 0x04, 0x04, 0x8c, 0x8c, 0x8c, 0x8c, 0x04, 0x04, 0x04, 0x04,
  0x9c, 0x9c, 0x9c, 0x9c, 0x04, 0x05, 0x27, 0x05, 0xeb, 0x8d, 0xaf, 0x8d, 0xeb, 0x05, 0x27, 0x05,
  0xdb, 0xbd, 0x9f, 0xbd, 0xdb, 0x25, 0x06, 0x06, 0xca, 0xca, 0x8e, 0x8e, 0xca, 0xca, 0x06, 0x06,
  0xda, 0xda, 0x9e, 0x9e, 0xda, 0xda, 0x06, 0x07, 0xe9, 0xcb, 0xe9, 0x8f, 0xe9, 0xcb, 0xe9, 0x07,
  0x19, 0x3b, 0x19, 0x7f, 0x19, 0x3b, 0x19, 0xe7, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x08, 0x09, 0x2b, 0x09, 0x6f, 0x09, 0x2b, 0x09,
  0xd7, 0x39, 0x1b, 0x39, 0x5f, 0x39, 0x1b, 0x39, 0xd7, 0x29, 0x0a, 0x0a, 0x4e, 0x4e, 0x0a, 0x0a,
  0xd6, 0xd6, 0x1a, 0x1a, 0x5e, 0x5e, 0x1a, 0x1a, 0xd6, 0xd6, 0x0a, 0x0b, 0x6d, 0x4f, 0x6d, 0x0b,
  0x95, 0xb7, 0x95, 0x7b, 0x1d, 0x3f, 0x1d, 0x7b, 0x95, 0xb7, 0x95, 0x6b, 0x0c, 0x0c, 0x0c, 0x0c,
  0x94, 0x94, 0x94, 0x94, 0x1c, 0x1c, 0x1c, 0x1c, 0x94, 0x94, 0x94, 0x94, 0x0c, 0x0d, 0x2f, 0x0d,
  0xd3, 0xb5, 0x97, 0xb5, 0xd3, 0x3d, 0x1f, 0x3d, 0xd3, 0xb5, 0x97, 0xb5, 0xd3, 0x2d, 0x0e, 0x0e,
  0xd2, 0xd2, 0x96, 0x96, 0xd2, 0xd2, 0x1e, 0x1e, 0xd2, 0xd2, 0x96, 0x96, 0xd2, 0xd2, 0x0e, 0x0f,
  0x00, 0x22, 0x00, 0x66, 0x00, 0x22, 0x00, 0xee, 0x00, 0x22, 0x00, 0x66, 0x00, 0x22, 0x00, 0xfe,
])

const KGM_MASK_V2_PREDEF = new Uint8Array([
  0xB8, 0xD5, 0x3D, 0xB2, 0xE9, 0xAF, 0x78, 0x8C, 0x83, 0x33, 0x71, 0x51, 0x76, 0xA0, 0xCD, 0x37,
  0x2F, 0x3E, 0x35, 0x8D, 0xA9, 0xBE, 0x98, 0xB7, 0xE7, 0x8C, 0x22, 0xCE, 0x5A, 0x61, 0xDF, 0x68,
  0x69, 0x89, 0xFE, 0xA5, 0xB6, 0xDE, 0xA9, 0x77, 0xFC, 0xC8, 0xBD, 0xBD, 0xE5, 0x6D, 0x3E, 0x5A,
  0x36, 0xEF, 0x69, 0x4E, 0xBE, 0xE1, 0xE9, 0x66, 0x1C, 0xF3, 0xD9, 0x02, 0xB6, 0xF2, 0x12, 0x9B,
  0x44, 0xD0, 0x6F, 0xB9, 0x35, 0x89, 0xB6, 0x46, 0x6D, 0x73, 0x82, 0x06, 0x69, 0xC1, 0xED, 0xD7,
  0x85, 0xC2, 0x30, 0xDF, 0xA2, 0x62, 0xBE, 0x79, 0x2D, 0x62, 0x62, 0x3D, 0x0D, 0x7E, 0xBE, 0x48,
  0x89, 0x23, 0x02, 0xA0, 0xE4, 0xD5, 0x75, 0x51, 0x32, 0x02, 0x53, 0xFD, 0x16, 0x3A, 0x21, 0x3B,
  0x16, 0x0F, 0xC3, 0xB2, 0xBB, 0xB3, 0xE2, 0xBA, 0x3A, 0x3D, 0x13, 0xEC, 0xF6, 0x01, 0x45, 0x84,
  0xA5, 0x70, 0x0F, 0x93, 0x49, 0x0C, 0x64, 0xCD, 0x31, 0xD5, 0xCC, 0x4C, 0x07, 0x01, 0x9E, 0x00,
  0x1A, 0x23, 0x90, 0xBF, 0x88, 0x1E, 0x3B, 0xAB, 0xA6, 0x3E, 0xC4, 0x73, 0x47, 0x10, 0x7E, 0x3B,
  0x5E, 0xBC, 0xE3, 0x00, 0x84, 0xFF, 0x09, 0xD4, 0xE0, 0x89, 0x0F, 0x5B, 0x58, 0x70, 0x4F, 0xFB,
  0x65, 0xD8, 0x5C, 0x53, 0x1B, 0xD3, 0xC8, 0xC6, 0xBF, 0xEF, 0x98, 0xB0, 0x50, 0x4F, 0x0F, 0xEA,
  0xE5, 0x83, 0x58, 0x8C, 0x28, 0x2C, 0x84, 0x67, 0xCD, 0xD0, 0x9E, 0x47, 0xDB, 0x27, 0x50, 0xCA,
  0xF4, 0x63, 0x63, 0xE8, 0x97, 0x7F, 0x1B, 0x4B, 0x0C, 0xC2, 0xC1, 0x21, 0x4C, 0xCC, 0x58, 0xF5,
  0x94, 0x52, 0xA3, 0xF3, 0xD3, 0xE0, 0x68, 0xF4, 0x00, 0x23, 0xF3, 0x5E, 0x0A, 0x7B, 0x93, 0xDD,
  0xAB, 0x12, 0xB2, 0x13, 0xE8, 0x84, 0xD7, 0xA7, 0x9F, 0x0F, 0x32, 0x4C, 0x55, 0x1D, 0x04, 0x36,
  0x52, 0xDC, 0x03, 0xF3, 0xF9, 0x4E, 0x42, 0xE9, 0x3D, 0x61, 0xEF, 0x7C, 0xB6, 0xB3, 0x93, 0x50,
])

function kgmGetMask(pos: number): number {
  let offset = pos >> 4
  let value = 0
  while (offset >= 0x11) {
    value ^= KGM_TABLE1[offset % 272]!
    offset >>= 4
    value ^= KGM_TABLE2[offset % 272]!
    offset >>= 4
  }
  return KGM_MASK_V2_PREDEF[pos % 272]! ^ value
}

async function decryptKgm(fileBuffer: ArrayBuffer, fileName: string, rawExt: string): Promise<DecryptResult> {
  const fileData = new Uint8Array(fileBuffer)
  const isVpr = rawExt === 'vpr'

  // 验证头部
  if (isVpr) {
    if (!bytesHasPrefix(fileData, VPR_HEADER)) {
      return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: '不是有效的 VPR 文件' }
    }
  } else {
    if (!bytesHasPrefix(fileData, KGM_HEADER)) {
      return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: '不是有效的 KGM/KGMA 文件' }
    }
  }

  // 解析头部长度 (bytes 0x10-0x14, little-endian uint32)
  const headerLenView = new DataView(fileData.buffer, fileData.byteOffset + 0x10, 4)
  const headerLen = headerLenView.getUint32(0, true)

  // 提取密钥 (bytes 0x1C-0x2C, 16 bytes)
  const key = new Uint8Array(17)
  key.set(fileData.slice(0x1C, 0x2C), 0)
  // key[16] 已经是 0

  // 跳过头部，获取加密的音频数据
  const audioData = fileData.slice(headerLen)

  // 解密（与 WASM C++ 源码完全一致）
  for (let i = 0; i < audioData.length; i++) {
    let med8 = key[(i) % 17]! ^ audioData[i]!
    med8 ^= (med8 & 0xf) << 4

    let msk8 = kgmGetMask(i)
    msk8 ^= (msk8 & 0xf) << 4

    audioData[i] = med8 ^ msk8

    if (isVpr) {
      audioData[i] ^= VPR_MASK_DIFF[i % 17]!
    }
  }

  const ext = sniffAudioExt(audioData, isVpr ? 'mp3' : 'mp3')
  const mimeType = audioMimeType[ext] || 'audio/mpeg'
  const outExt = `.${ext}`
  const outName = fileName.replace(/\.[^.]+$/, outExt)

  return {
    success: true,
    buffer: audioData.buffer as ArrayBuffer,
    fileName: outName,
    originalName: fileName,
    mimeType,
  }
}

// ==================== KWM 解密 (酷我音乐) ====================

const KWM_MAGIC_HEADER = [0x79, 0x65, 0x65, 0x6C, 0x69, 0x6F, 0x6E, 0x2D, 0x6B, 0x75, 0x77, 0x6F, 0x2D, 0x74, 0x6D, 0x65]
const KWM_MAGIC_HEADER2 = [0x79, 0x65, 0x65, 0x6C, 0x69, 0x6F, 0x6E, 0x2D, 0x6B, 0x75, 0x77, 0x6F, 0x00, 0x00, 0x00, 0x00]
const KWM_PREDEFINED_KEY = 'MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk'

function createKwMaskFromKey(keyBytes: Uint8Array): Uint8Array {
  const keyView = new DataView(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength)
  let keyStr = keyView.getBigUint64(0, true).toString()
  // trim/pad to 32 chars
  if (keyStr.length > 32) {
    keyStr = keyStr.slice(0, 32)
  } else if (keyStr.length < 32) {
    keyStr = keyStr.padEnd(32, keyStr)
  }
  const key = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    key[i] = KWM_PREDEFINED_KEY.charCodeAt(i) ^ keyStr.charCodeAt(i)
  }
  return key
}

async function decryptKwm(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  const fileData = new Uint8Array(fileBuffer)

  if (!bytesHasPrefix(fileData, KWM_MAGIC_HEADER) && !bytesHasPrefix(fileData, KWM_MAGIC_HEADER2)) {
    return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: '不是有效的 KWM 文件' }
  }

  // 提取 8 字节文件密钥 (offset 0x18-0x20)
  const fileKey = fileData.slice(0x18, 0x20)
  const mask = createKwMaskFromKey(fileKey)

  // 音频数据从 0x400 开始
  const audioData = fileData.slice(0x400)
  for (let i = 0; i < audioData.length; i++) {
    audioData[i] ^= mask[i % 0x20]!
  }

  const ext = sniffAudioExt(audioData, 'mp3')
  const mimeType = audioMimeType[ext] || 'audio/mpeg'
  const outExt = `.${ext}`
  const outName = fileName.replace(/\.[^.]+$/, outExt)

  return {
    success: true,
    buffer: audioData.buffer as ArrayBuffer,
    fileName: outName,
    originalName: fileName,
    mimeType,
  }
}

// ==================== XM 解密 (虾米音乐) ====================

const XM_MAGIC_HEADER = [0x69, 0x66, 0x6d, 0x74]
const XM_MAGIC_HEADER2 = [0xfe, 0xfe, 0xfe, 0xfe]

const XM_FILE_TYPE_MAP: Record<string, string> = {
  ' WAV': '.wav',
  'FLAC': '.flac',
  ' MP3': '.mp3',
  ' A4M': '.m4a',
}

async function decryptXm(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  const fileData = new Uint8Array(fileBuffer)

  if (!bytesHasPrefix(fileData, XM_MAGIC_HEADER) || !bytesHasPrefix(fileData.slice(8, 12), XM_MAGIC_HEADER2)) {
    return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: '不是有效的 XM 文件' }
  }

  // 读取音频类型 (offset 4-8)
  const typeText = new TextDecoder().decode(fileData.slice(4, 8))
  if (!(typeText in XM_FILE_TYPE_MAP)) {
    return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: `未知的 XM 文件类型: ${typeText}` }
  }

  // 读取关键参数
  const key = fileData[0xf]!
  const dataOffset = fileData[0xc]! | (fileData[0xd]! << 8) | (fileData[0xe]! << 16)

  // 音频数据 (offset 0x10 开始)
  const audioData = fileData.slice(0x10)
  for (let cur = dataOffset; cur < audioData.length; cur++) {
    audioData[cur] = (audioData[cur]! - key) ^ 0xff
  }

  const ext = XM_FILE_TYPE_MAP[typeText]!.replace('.', '')
  const mimeType = audioMimeType[ext] || 'audio/mpeg'
  const outName = fileName.replace(/\.[^.]+$/, XM_FILE_TYPE_MAP[typeText]!)

  return {
    success: true,
    buffer: audioData.buffer as ArrayBuffer,
    fileName: outName,
    originalName: fileName,
    mimeType,
  }
}

// ==================== 主解密入口 ====================

export async function decryptFile(file: File): Promise<DecryptResult> {
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()

  try {
    // NCM (网易云音乐)
    if (name.endsWith('.ncm')) {
      return await decryptNcm(buffer, file.name)
    }

    // QMC (QQ音乐)
    const qmcMatch = name.match(/\.(qmc(?:0|2|3|4|6|8)|qmcflac|qmcogg|mflac|mflac0|mgg|mgg0|mgg1|mggl|mmp4|bkcmp3|bkcflac|bkcwav|bkcape|bkcogg|bkcwma|bkcm4a|tkm)$/)
    if (qmcMatch) {
      return await decryptQmc(buffer, file.name, qmcMatch[1]!)
    }

    // KGM/VPR (酷狗音乐)
    if (name.match(/\.(kgm|kgma|vpr)$/)) {
      const rawExt = name.match(/\.(kgm|kgma|vpr)$/)![1]!
      return await decryptKgm(buffer, file.name, rawExt)
    }

    // KWM (酷我音乐)
    if (name.endsWith('.kwm')) {
      return await decryptKwm(buffer, file.name)
    }

    // XM (虾米音乐)
    if (name.endsWith('.xm')) {
      return await decryptXm(buffer, file.name)
    }

    return {
      success: false,
      buffer: null,
      fileName: file.name,
      originalName: file.name,
      mimeType: '',
      error: `不支持的格式: ${file.name}`,
    }
  } catch (e) {
    console.error('解密失败:', file.name, e)
    return {
      success: false,
      buffer: null,
      fileName: file.name,
      originalName: file.name,
      mimeType: '',
      error: e instanceof Error ? e.message : '解密失败',
    }
  }
}

export function getSupportedFormats(): string {
  return [
    '.ncm',
    '.qmc0', '.qmc2', '.qmc3', '.qmc4', '.qmc6', '.qmc8',
    '.qmcflac', '.qmcogg', '.mflac', '.mflac0', '.mgg', '.mgg0', '.mgg1', '.mggl', '.mmp4',
    '.bkcmp3', '.bkcflac', '.bkcwav', '.bkcape', '.bkcogg', '.bkcwma', '.bkcm4a',
    '.tkm',
    '.kgm', '.kgma', '.vpr',
    '.kwm',
    '.xm',
  ].join(', ')
}