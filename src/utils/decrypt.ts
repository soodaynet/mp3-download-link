// ============================================================
// 音乐文件解密工具 - 支持 NCM / QMC / KGM 等加密格式
// 所有解密在浏览器本地完成，文件不会上传到服务器
// AES-ECB 使用 crypto-js（与 unlock-music 完全一致）
// ============================================================

import CryptoJS from 'crypto-js'

// ---------- NCM 密钥 ----------

const NCM_CORE_KEY = CryptoJS.enc.Utf8.parse('hzHRAmso5kInbaxW')
const NCM_META_KEY = CryptoJS.enc.Utf8.parse("#14ljk_!\\]&0U<'(")
const NCM_MAGIC = new Uint8Array([0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d]) // "CTENFDAM"

// ---------- AES-128-ECB 解密（使用 crypto-js）----------

function wordArrayToUint8Array(wa: CryptoJS.lib.WordArray): Uint8Array {
  const words = wa.words
  const sigBytes = wa.sigBytes
  const result = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) {
    result[i] = (words[Math.floor(i / 4)]! >>> (24 - (i % 4) * 8)) & 0xff
  }
  return result
}

function uint8ArrayToHex(data: Uint8Array, limit?: number): string {
  const end = limit ?? data.length
  return Array.from(data.slice(0, end))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
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

// ---------- NCM 解密 ----------

function ncmRc4Decrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  // 构建 S-box（标准 RC4 KSA）
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

  // 解密（非标准 RC4：S-box 静态不变，只用固定索引查表 XOR）
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const j = (i + 1) & 0xff
    result[i] = data[i]! ^ S[(S[j]! + S[(S[j]! + j) & 0xff]!) & 0xff]!
  }
  return result
}

// ---------- 类型定义 ----------

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
  coverData?: Uint8Array  // 原始封面图片数据，用于下载时嵌入
  error?: string
}

// ---------- 封面嵌入 ----------

/** 将封面图片嵌入到音频文件中（MP3: ID3v2.3 APIC, FLAC: PICTURE metadata block） */
export function embedCoverImage(audioBuf: ArrayBuffer, coverData: Uint8Array, format: string): ArrayBuffer {
  if (format === 'flac') {
    return embedFlacPicture(audioBuf, coverData)
  }
  return embedMp3Apic(audioBuf, coverData)
}

function detectCoverMime(data: Uint8Array): string {
  const isPng = data.length >= 8 &&
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47
  return isPng ? 'image/png' : 'image/jpeg'
}

/** 构建 ID3v2.3 标签 synchsafe 整数 */
function writeSynchsafeInt(value: number): Uint8Array {
  const result = new Uint8Array(4)
  result[0] = (value >> 21) & 0x7f
  result[1] = (value >> 14) & 0x7f
  result[2] = (value >> 7) & 0x7f
  result[3] = value & 0x7f
  return result
}

/** 构建 32-bit 大端整数 */
function writeBE32(value: number): Uint8Array {
  const result = new Uint8Array(4)
  result[0] = (value >> 24) & 0xff
  result[1] = (value >> 16) & 0xff
  result[2] = (value >> 8) & 0xff
  result[3] = value & 0xff
  return result
}

/** 拼接多个 Uint8Array */
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

/** 将封面嵌入 MP3：构建 ID3v2.3 APIC 帧并前置 */
function embedMp3Apic(audioBuf: ArrayBuffer, coverData: Uint8Array): ArrayBuffer {
  const mime = detectCoverMime(coverData)
  const mimeBytes = new TextEncoder().encode(mime)
  const enc = new TextEncoder()

  // APIC frame body
  const apicBody = concatUint8(
    new Uint8Array([0x00]),                  // encoding: ISO-8859-1
    mimeBytes,                               // MIME type
    new Uint8Array([0x00]),                  // null terminator
    new Uint8Array([0x03]),                  // picture type: front cover
    enc.encode(''),                          // description (empty)
    new Uint8Array([0x00]),                  // null terminator
    coverData,                               // image data
  )

  // APIC frame: header + body
  const apicFrame = concatUint8(
    enc.encode('APIC'),                      // frame ID
    writeSynchsafeInt(apicBody.length),      // size (synchsafe)
    new Uint8Array([0x00, 0x00]),            // flags
    apicBody,
  )

  // ID3v2.3 header
  const tagSize = apicFrame.length
  const id3Header = concatUint8(
    enc.encode('ID3'),                       // identifier
    new Uint8Array([0x03, 0x00]),            // version 2.3.0
    new Uint8Array([0x00]),                  // flags
    writeSynchsafeInt(tagSize),              // size (synchsafe)
  )

  const audio = new Uint8Array(audioBuf)

  // 如果原音频已有 ID3v2 标签，跳过它
  let audioOffset = 0
  if (audio.length >= 10 &&
      audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
    // 计算现有 ID3v2 标签大小
    const existingSize = ((audio[6]! & 0x7f) << 21) |
                         ((audio[7]! & 0x7f) << 14) |
                         ((audio[8]! & 0x7f) << 7) |
                         (audio[9]! & 0x7f)
    audioOffset = 10 + existingSize
  }

  return concatUint8(id3Header, apicFrame, audio.slice(audioOffset)).buffer as ArrayBuffer
}

/** 将封面嵌入 FLAC：在 STREAMINFO 后插入 PICTURE metadata block */
function embedFlacPicture(audioBuf: ArrayBuffer, coverData: Uint8Array): ArrayBuffer {
  const audio = new Uint8Array(audioBuf)
  const mime = detectCoverMime(coverData)
  const enc = new TextEncoder()
  const mimeBytes = enc.encode(mime)

  // PICTURE block body
  const picBody = concatUint8(
    writeBE32(3),                             // picture type: front cover
    writeBE32(mimeBytes.length),              // MIME type length
    mimeBytes,                                // MIME type
    writeBE32(0),                             // description length (empty)
    writeBE32(0),                             // width
    writeBE32(0),                             // height
    writeBE32(0),                             // color depth
    writeBE32(0),                             // colors used
    writeBE32(coverData.length),              // picture data length
    coverData,                                // picture data
  )

  // 解析 FLAC 头部：fLaC (4 bytes) + metadata blocks
  if (audio.length < 4 ||
      audio[0] !== 0x66 || audio[1] !== 0x4C || audio[2] !== 0x61 || audio[3] !== 0x43) {
    return audioBuf // 不是有效 FLAC，直接返回
  }

  // 将新 PICTURE 块插入到第一个 metadata block 之后（STREAMINFO）
  let pos = 4
  let firstBlockDone = false
  const blocks: Uint8Array[] = []

  // 保留 fLaC 标记
  // 遍历现有 metadata blocks
  while (pos < audio.length) {
    const header = audio[pos]! // 最高位: 是否最后块, 低7位: 块类型
    const isLast = (header & 0x80) !== 0
    const blockLen = (audio[pos + 1]! << 16) | (audio[pos + 2]! << 8) | audio[pos + 3]!
    const blockEnd = pos + 4 + blockLen

    if (!firstBlockDone) {
      firstBlockDone = true
      // 保留第一个块（STREAMINFO），清除其 isLast 标志
      const newHeader = new Uint8Array([header & 0x7f])
      const blockData = audio.slice(pos + 1, blockEnd)
      blocks.push(concatUint8(newHeader, blockData))

      // 插入 PICTURE 块
      const picHeader = new Uint8Array([0x06]) // type=6, isLast=0 (will be fixed later)
      const picLen = new Uint8Array(3)
      picLen[0] = (picBody.length >> 16) & 0xff
      picLen[1] = (picBody.length >> 8) & 0xff
      picLen[2] = picBody.length & 0xff
      blocks.push(concatUint8(picHeader, picLen, picBody))
    } else {
      // 保留其余块
      blocks.push(audio.slice(pos, blockEnd))
    }

    if (isLast) {
      pos = blockEnd
      break
    }
    pos = blockEnd
  }

  // 修复最后一个块的 isLast 标志
  if (blocks.length > 0) {
    const lastBlock = new Uint8Array(blocks[blocks.length - 1]!)
    lastBlock[0] |= 0x80
    blocks[blocks.length - 1] = lastBlock
  }

  return concatUint8(...blocks).buffer as ArrayBuffer
}

// ---------- 命名格式化 ----------

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

// ---------- NCM 解密实现 ----------
// 基于 ncmdump C++ 源码重写

function readU32LE(view: Uint8Array, offset: number): number {
  return view[offset]! | (view[offset + 1]! << 8) | (view[offset + 2]! << 16) | (view[offset + 3]! << 24)
}

async function decryptNcm(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  const view = new Uint8Array(fileBuffer)

  // 验证 magic
  for (let i = 0; i < 8; i++) {
    if (view[i] !== NCM_MAGIC[i]) {
      return { success: false, buffer: null, fileName, originalName: fileName, mimeType: '', error: '不是有效的 NCM 文件' }
    }
  }

  let offset = 10 // 跳过 8 字节 magic + 2 字节 gap

  // 1. 读 key_len → key_data（紧跟在 key_len 后面）
  const keyLen = readU32LE(view, offset)
  offset += 4
  const keyDataEnc = new Uint8Array(view.slice(offset, offset + keyLen))
  offset += keyLen

  // XOR 0x64 → AES-ECB 解密 → 得 RC4 密钥
  for (let i = 0; i < keyDataEnc.length; i++) {
    keyDataEnc[i] ^= 0x64
  }
  const keyData = aesEcbDecrypt(keyDataEnc, NCM_CORE_KEY)
  const rc4Key = keyData.slice(17) // 跳过 "neteasecloudmusic"

  // 2. 读 meta_len → meta_data
  const metaLen = readU32LE(view, offset)
  offset += 4
  const metaEnc = new Uint8Array(view.slice(offset, offset + metaLen))
  offset += metaLen

  // XOR 0x63 → 跳过 22 字节 "163 key(Don't modify):" → Base64 解码 → AES-ECB 解密 → 跳过 "music:"
  for (let i = 0; i < metaEnc.length; i++) {
    metaEnc[i] ^= 0x63
  }

  // 用 TextDecoder 获取 base64 字符串（注意：跳过可能存在的 null 字节）
  const rawStr = new TextDecoder().decode(metaEnc.slice(22))
  const b64Encoded = rawStr.replace(/\0.*$/, '') // 去除 null 字节后的内容
  console.log('[NCM] b64 encoded length:', b64Encoded.length, 'first 40:', b64Encoded.slice(0, 40))

  let metaDec: Uint8Array
  try {
    const binaryStr = atob(b64Encoded)
    const b64Decoded = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      b64Decoded[i] = binaryStr.charCodeAt(i)
    }
    console.log('[NCM] b64 decoded length:', b64Decoded.length, 'hex:', uint8ArrayToHex(b64Decoded, 32))
    // 用 NoPadding 解密，手动剥离 PKCS7 填充（与 ncmdump 完全一致）
    metaDec = aesEcbDecrypt(b64Decoded, NCM_META_KEY, false)
    // 手动剥离 PKCS7 填充
    const padLen = metaDec[metaDec.length - 1]!
    if (padLen > 0 && padLen <= 16) {
      metaDec = metaDec.slice(0, metaDec.length - padLen)
    }
    console.log('[NCM] metaDec after padding strip, length:', metaDec.length, 'hex:', uint8ArrayToHex(metaDec, 32))
  } catch (e) {
    console.warn('[NCM] base64 decode failed, trying raw:', e)
    metaDec = aesEcbDecrypt(metaEnc.slice(22), NCM_META_KEY, false)
    const padLen = metaDec[metaDec.length - 1]!
    if (padLen > 0 && padLen <= 16) {
      metaDec = metaDec.slice(0, metaDec.length - padLen)
    }
  }

  const metaRaw = new TextDecoder().decode(metaDec)
  const metaJsonStr = metaRaw.replace(/^music:/, '')
  console.log('[NCM] meta JSON first 100:', metaJsonStr.slice(0, 100))

  let metaJson: Record<string, unknown> = {}
  try {
    metaJson = JSON.parse(metaJsonStr)
  } catch {
    console.warn('[NCM] 元数据 JSON 解析失败:', metaJsonStr.slice(0, 100))
  }

  // 3. 跳过 5 字节 CRC
  offset += 5

  // 4. 读 cover_frame_len → 跳过剩余封面数据
  const coverFrameLen = readU32LE(view, offset)
  offset += 4
  const imgDataSize = readU32LE(view, offset)
  offset += 4

  let coverUrl: string | undefined
  let coverData: Uint8Array | undefined
  if (imgDataSize > 0 && offset + imgDataSize <= view.length) {
    const imgData = view.slice(offset, offset + imgDataSize)
    coverData = new Uint8Array(imgData)
    // 检测 PNG 还是 JPEG（PNG 前8字节: 89 50 4E 47 0D 0A 1A 0A）
    const isPng = imgDataSize >= 8 &&
      imgData[0] === 0x89 && imgData[1] === 0x50 && imgData[2] === 0x4E && imgData[3] === 0x47
    const blob = new Blob([imgData], { type: isPng ? 'image/png' : 'image/jpeg' })
    coverUrl = URL.createObjectURL(blob)
  }
  offset += imgDataSize
  // 跳过封面帧剩余数据（与 ncmdump 一致: seekg(cover_frame_len - n)）
  offset += coverFrameLen - imgDataSize

  // 5. 解密音频数据
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

// ---------- QMC 解密 ----------

const QMC_KEY_MAP = new Uint8Array([
  0x77, 0x48, 0x32, 0x73, 0xDE, 0xF2, 0xC0, 0xC8, 0x95, 0xEC, 0x30, 0xB1, 0x2E, 0xF5, 0x76, 0xF0,
  0x14, 0x15, 0x49, 0xE1, 0x3A, 0x82, 0x3C, 0x53, 0xC1, 0x47, 0xC2, 0x24, 0xE6, 0x31, 0xB6, 0xAF,
  0xE9, 0xE4, 0xE8, 0xE5, 0xA1, 0xE7, 0xEA, 0xE0, 0xDF, 0xD4, 0xC7, 0xDB, 0xD2, 0x5A, 0x4F, 0xA5,
  0x4B, 0x44, 0x97, 0x40, 0x0F, 0x42, 0x92, 0x28, 0x67, 0xAA, 0xEE, 0x05, 0x64, 0x21, 0x86, 0xDA,
  0x1F, 0x4A, 0xDD, 0x4D, 0x8F, 0x36, 0x41, 0xB5, 0x1A, 0x6D, 0xB8, 0xE3, 0x68, 0xF9, 0xD0, 0xDC,
  0x0A, 0x5E, 0x3B, 0x39, 0xCF, 0xA9, 0x7A, 0x5B, 0x51, 0x1B, 0x22, 0xA2, 0x56, 0x60, 0x94, 0xB9,
  0x62, 0xBC, 0x17, 0x0D, 0x83, 0x8B, 0x66, 0xBE, 0xCD, 0x9A, 0x57, 0xB3, 0x2B, 0x61, 0xFA, 0xB0,
  0xCE, 0x7B, 0xFD, 0x6F, 0xAC, 0x45, 0x75, 0x80, 0xE2, 0x9F, 0xA6, 0x52, 0xFE, 0x2D, 0x85, 0x43,
  0x09, 0x54, 0x7D, 0xEB, 0x3F, 0xD5, 0xAE, 0x19, 0xD3, 0xCB, 0xF4, 0x59, 0xBB, 0xF8, 0x26, 0xB7,
  0x8E, 0x13, 0x02, 0x70, 0x06, 0x99, 0x34, 0x87, 0x6C, 0x9B, 0x63, 0xCA, 0x25, 0x7C, 0x88, 0x33,
  0x0C, 0x55, 0x1C, 0x58, 0x8D, 0x5C, 0x16, 0x0B, 0x03, 0x12, 0x3E, 0x0E, 0x11, 0x07, 0x3D, 0x27,
  0x2A, 0x4C, 0x6B, 0xB4, 0x69, 0x9E, 0x6E, 0xEF, 0x08, 0x9C, 0xD9, 0x96, 0x00, 0x7E, 0xD7, 0xFC,
  0x2C, 0x46, 0x90, 0x37, 0x2F, 0x72, 0xA4, 0x5F, 0x5D, 0xC6, 0x7F, 0xBD, 0x71, 0x1E, 0x8A, 0xF7,
  0x74, 0x8C, 0x78, 0xC5, 0x04, 0x65, 0x18, 0x84, 0xC3, 0xBA, 0xF1, 0xA3, 0x1D, 0x91, 0xAB, 0x4E,
  0xA7, 0xED, 0xD1, 0x79, 0x10, 0xC9, 0xAD, 0xBF, 0x6A, 0x89, 0xC4, 0x98, 0x29, 0x50, 0x9D, 0xB2,
  0xD6, 0xCC, 0xD8, 0x23, 0xA0, 0xFB, 0x81, 0xE8, 0x93, 0x35, 0x01, 0x38, 0xA8, 0xF6, 0xFB, 0xC0,
])

async function decryptQmc(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  let data = new Uint8Array(fileBuffer)
  const ext = fileName.toLowerCase()

  // QMC 文件可能有长度头
  if (data.length > 4) {
    const maybeLen = data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24)
    if (maybeLen > 0 && maybeLen + 4 < data.length) {
      data = data.slice(4)
    }
  }

  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]! ^ QMC_KEY_MAP[i % QMC_KEY_MAP.length]!
  }

  let mimeType = 'audio/mpeg'
  let outExt = '.mp3'
  if (ext.includes('flac')) { mimeType = 'audio/flac'; outExt = '.flac' }
  else if (ext.includes('ogg')) { mimeType = 'audio/ogg'; outExt = '.ogg' }

  return {
    success: true,
    buffer: result.buffer as ArrayBuffer,
    fileName: fileName.replace(/\.[^.]+$/, outExt),
    originalName: fileName,
    mimeType,
  }
}

// ---------- KGM 解密 ----------

async function decryptKgm(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  let data = new Uint8Array(fileBuffer)
  const ext = fileName.toLowerCase()

  // VPR 跳过头部
  if (ext.endsWith('.vpr') && data.length > 0x20) {
    data = data.slice(0x20)
  }
  // 可能有长度头
  if (data.length > 4) {
    const maybeLen = data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24)
    if (maybeLen > 0 && maybeLen + 4 < data.length) {
      data = data.slice(4)
    }
  }

  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]! ^ (((i + 1) * 0x1B) & 0xFF)
  }

  let mimeType = 'audio/mpeg'
  let outExt = '.mp3'
  if (ext.includes('flac')) { mimeType = 'audio/flac'; outExt = '.flac' }

  return {
    success: true,
    buffer: result.buffer as ArrayBuffer,
    fileName: fileName.replace(/\.[^.]+$/, outExt),
    originalName: fileName,
    mimeType,
  }
}

// ---------- KW 解密 ----------

async function decryptKw(fileBuffer: ArrayBuffer, fileName: string): Promise<DecryptResult> {
  const data = new Uint8Array(fileBuffer)
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]! ^ ((i * 7 + 0x3F) & 0xFF)
  }
  return {
    success: true,
    buffer: result.buffer as ArrayBuffer,
    fileName: fileName.replace(/\.[^.]+$/, '.mp3'),
    originalName: fileName,
    mimeType: 'audio/mpeg',
  }
}

// ---------- XM 解密 ----------

function decryptXm(fileBuffer: ArrayBuffer, fileName: string): DecryptResult {
  const data = new Uint8Array(fileBuffer)
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]! ^ ((i * 3 + 0x55) & 0xFF)
  }
  return {
    success: true,
    buffer: result.buffer as ArrayBuffer,
    fileName: fileName.replace(/\.[^.]+$/, '.mp3'),
    originalName: fileName,
    mimeType: 'audio/mpeg',
  }
}

// ---------- 主解密入口 ----------

export async function decryptFile(file: File): Promise<DecryptResult> {
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()

  try {
    if (name.endsWith('.ncm')) {
      return await decryptNcm(buffer, file.name)
    }
    if (name.match(/\.(qmc[0-3]?|qmcflac|qmcogg|mflac|mgg|tkm|tm[0-36])$/)) {
      return await decryptQmc(buffer, file.name)
    }
    if (name.match(/\.(kgm|kgma|vpr)$/)) {
      return await decryptKgm(buffer, file.name)
    }
    if (name.match(/\.(kwm)$/)) {
      return await decryptKw(buffer, file.name)
    }
    if (name.match(/\.(xm)$/)) {
      return decryptXm(buffer, file.name)
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
  return '.ncm, .qmc0, .qmc3, .qmcflac, .qmcogg, .mflac, .mgg, .tkm, .kgm, .kgma, .vpr, .kwm, .xm'
}