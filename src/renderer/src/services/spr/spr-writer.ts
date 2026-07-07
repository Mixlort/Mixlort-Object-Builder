/**
 * SPR file writer - writes OpenTibia sprite (SPR) binary files.
 * Ported from legacy AS3: otlib/sprites/SpriteStorage.as (compile method)
 *
 * See spr-reader.ts for file format documentation.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Header size without extended (signature u32 + count u16 = 6) */
const HEADER_U16 = 6

/** Header size with extended (signature u32 + count u32 = 8) */
const HEADER_U32 = 8

/** Size of each sprite address entry in bytes */
const ADDRESS_SIZE = 4

/** Magenta RGB header per sprite (3 bytes) */
const RGB_HEADER_SIZE = 3

/** Compressed data length field (2 bytes) */
const LENGTH_FIELD_SIZE = 2

const MAX_COMPRESSED_SPRITE_SIZE = 0xffff
const MAX_SPR_FILE_SIZE = 0xffffffff
const MAX_CLASSIC_SPRITE_COUNT = 0xfffe

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SprWriteData {
  signature: number
  spriteCount: number
  /** Compressed pixel data by sprite ID (1-based). Missing IDs are written as empty. */
  sprites: Map<number, Uint8Array>
}

export function validateCompressedSpriteData(id: number, compressed: Uint8Array): void {
  if (compressed.length > MAX_COMPRESSED_SPRITE_SIZE) {
    throw new Error(
      `SPR sprite ${id} is too large: ${compressed.length} bytes exceeds ${MAX_COMPRESSED_SPRITE_SIZE}.`
    )
  }
}

function validateSprFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size > MAX_SPR_FILE_SIZE) {
    throw new Error(`SPR file is too large: ${size} bytes exceeds uint32 offsets.`)
  }
}

function validateSpriteCountFitsFormat(spriteCount: number, extended: boolean): void {
  if (!Number.isSafeInteger(spriteCount) || spriteCount < 0) {
    throw new Error(`Invalid SPR sprite count: ${spriteCount}.`)
  }
  if (!extended && spriteCount > MAX_CLASSIC_SPRITE_COUNT) {
    throw new Error(
      `SPR has ${spriteCount} sprites, but the classic non-extended format supports at most ${MAX_CLASSIC_SPRITE_COUNT}. Enable extended sprites before saving.`
    )
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write sprite data to SPR binary format.
 *
 * @param data - Sprite data to write
 * @param extended - If true, count as u32 (8-byte header); otherwise u16 (6-byte header)
 * @returns ArrayBuffer containing the SPR binary file
 */
export function writeSpr(data: SprWriteData, extended: boolean): ArrayBuffer {
  validateSpriteCountFitsFormat(data.spriteCount, extended)
  const count = data.spriteCount
  const headerSize = extended ? HEADER_U32 : HEADER_U16

  // First pass: calculate addresses and total file size
  let totalSize = headerSize + count * ADDRESS_SIZE
  validateSprFileSize(totalSize)
  const addresses = new Uint32Array(count)

  for (let id = 1; id <= count; id++) {
    const compressed = data.sprites.get(id)
    if (compressed && compressed.length > 0) {
      validateCompressedSpriteData(id, compressed)
      addresses[id - 1] = totalSize
      totalSize += RGB_HEADER_SIZE + LENGTH_FIELD_SIZE + compressed.length
      validateSprFileSize(totalSize)
    }
    // else: address stays 0 (empty sprite)
  }

  // Second pass: write the file
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  let pos = 0

  // Write signature
  view.setUint32(pos, data.signature, true)
  pos += 4

  // Write sprite count
  if (extended) {
    view.setUint32(pos, count, true)
    pos += 4
  } else {
    view.setUint16(pos, count, true)
    pos += 2
  }

  // Write address table
  for (let i = 0; i < count; i++) {
    view.setUint32(pos, addresses[i], true)
    pos += 4
  }

  // Write sprite data blocks
  for (let id = 1; id <= count; id++) {
    const compressed = data.sprites.get(id)
    if (compressed && compressed.length > 0) {
      // RGB header (magenta: R=0xFF, G=0x00, B=0xFF)
      view.setUint8(pos++, 0xff)
      view.setUint8(pos++, 0x00)
      view.setUint8(pos++, 0xff)

      // Compressed data length
      view.setUint16(pos, compressed.length, true)
      pos += 2

      // Compressed pixel data
      new Uint8Array(buffer, pos, compressed.length).set(compressed)
      pos += compressed.length
    }
  }

  return buffer
}
