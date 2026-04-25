import { BinaryReader } from '../dat/binary-stream'

const METADATA_HEADER_SIZE = 16
const METADATA_RECORD_SIZE = 32
const FLAGS_HEADER_SIZE = 16
const FLAGS_RECORD_SIZE = 16
const FLAGS_MAGIC = 0x46475850 // PXGF
const FLAGS_VERSION = 1

export const PXG_MIN_ITEM_ID = 100

export const PXG_RUNTIME_FLAGS = {
  GROUND: 0,
  GROUND_BORDER: 1,
  ON_BOTTOM: 2,
  ON_TOP: 3,
  CONTAINER: 4,
  STACKABLE: 5,
  FORCE_USE: 6,
  MULTI_USE: 7,
  WRITABLE: 8,
  WRITABLE_ONCE: 9,
  FLUID_CONTAINER: 10,
  FLUID: 11,
  NO_MOVE_ANIMATION: 12,
  UNPASSABLE: 13,
  UNMOVEABLE: 14,
  BLOCK_MISSILE: 15,
  BLOCK_PATHFIND: 16,
  PICKUPABLE: 17,
  HANGABLE: 18,
  VERTICAL: 19,
  HORIZONTAL: 20,
  ROTATABLE: 21,
  DONT_HIDE: 22,
  TRANSLUCENT: 23,
  LYING_OBJECT: 24,
  ANIMATE_ALWAYS: 25,
  FULL_GROUND: 26,
  IGNORE_LOOK: 27,
  WRAPPABLE: 28,
  UNWRAPPABLE: 29,
  TOP_EFFECT: 30,
  USABLE: 31,
  MINI_MAP: 32,
  MARKETABLE: 33
} as const

export interface PxgRuntimeTexture {
  width: number
  height: number
  exactSize: number
  layers: number
  patternX: number
  patternY: number
  patternZ: number
  frames: number
}

export interface PxgRuntimeMetadata {
  maxItemId: number
  maxOutfitId: number
  maxEffectId: number
  maxMissileId: number
  textures: PxgRuntimeTexture[]
}

export interface PxgRuntimeItemFlags {
  flagsLo: number
  flagsHi: number
  groundSpeed: number
  miniMapColor: number
}

export interface PxgRuntimeFlags {
  maxItemId: number
  records: PxgRuntimeItemFlags[]
}

export interface PxgDatRuntime {
  metadata?: PxgRuntimeMetadata | null
  flags?: PxgRuntimeFlags | null
}

export function parsePxgRuntimeMetadata(buffer: ArrayBuffer): PxgRuntimeMetadata {
  if (buffer.byteLength < METADATA_HEADER_SIZE) {
    throw new Error('PXG runtime metadata is too small.')
  }

  const reader = new BinaryReader(buffer)
  const maxItemId = reader.readUint32()
  const maxOutfitId = reader.readUint32()
  const maxEffectId = reader.readUint32()
  const maxMissileId = reader.readUint32()
  const recordCount = Math.floor(reader.bytesAvailable / METADATA_RECORD_SIZE)
  const textures: PxgRuntimeTexture[] = []

  for (let i = 0; i < recordCount; i++) {
    textures.push({
      width: reader.readUint32(),
      height: reader.readUint32(),
      exactSize: reader.readUint32(),
      layers: reader.readUint32(),
      patternX: reader.readUint32(),
      patternY: reader.readUint32(),
      patternZ: reader.readUint32(),
      frames: reader.readUint32()
    })
  }

  return { maxItemId, maxOutfitId, maxEffectId, maxMissileId, textures }
}

export function parsePxgRuntimeFlags(buffer: ArrayBuffer): PxgRuntimeFlags {
  if (buffer.byteLength < FLAGS_HEADER_SIZE) {
    throw new Error('PXG runtime flags file is too small.')
  }

  const reader = new BinaryReader(buffer)
  const magic = reader.readUint32()
  const version = reader.readUint32()
  if (magic !== FLAGS_MAGIC) {
    throw new Error('Invalid PXG runtime flags magic. Expected PXGF.')
  }
  if (version !== FLAGS_VERSION) {
    throw new Error(`Unsupported PXG runtime flags version: ${version}.`)
  }

  const maxItemId = reader.readUint32()
  const recordCount = reader.readUint32()
  if (reader.bytesAvailable < recordCount * FLAGS_RECORD_SIZE) {
    throw new Error('PXG runtime flags file is truncated.')
  }

  const records: PxgRuntimeItemFlags[] = []
  for (let i = 0; i < recordCount; i++) {
    const flagsLo = reader.readUint32()
    const flagsHi = reader.readUint32()
    const groundSpeed = reader.readUint16()
    const miniMapColor = reader.readUint16()
    reader.readUint16()
    reader.readUint16()
    records.push({ flagsLo, flagsHi, groundSpeed, miniMapColor })
  }

  return { maxItemId, records }
}

export function hasPxgRuntimeFlag(record: PxgRuntimeItemFlags, bit: number): boolean {
  if (bit < 32) {
    return (record.flagsLo & (1 << bit)) !== 0
  }
  return (record.flagsHi & (1 << (bit - 32))) !== 0
}

export function getPxgRuntimeItemFlags(
  flags: PxgRuntimeFlags | null | undefined,
  itemId: number
): PxgRuntimeItemFlags | null {
  if (!flags || itemId < PXG_MIN_ITEM_ID || itemId > flags.maxItemId) return null
  return flags.records[itemId - PXG_MIN_ITEM_ID] ?? null
}
