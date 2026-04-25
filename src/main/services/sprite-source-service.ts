import { open, type FileHandle } from 'fs/promises'

const HEADER_U16 = 6
const HEADER_U32 = 8
const ADDRESS_SIZE = 4
const SPRITE_BLOCK_HEADER_SIZE = 5
const SPRX_HEADER_SIZE = 16
const SPRX_MAGIC = 0x58475850 // PXGX
const SPRX_VERSION = 1
const SPRITE_READ_CONCURRENCY = 24

export interface BufferSpriteSourceDescriptor {
  kind: 'buffer'
  signature: number
  spriteCount: number
  extended: boolean
}

export interface FileBackedPxgSpriteSourceDescriptor {
  kind: 'file-backed-pxg'
  signature: number
  spriteCount: number
  extended: boolean
  sprFilePath: string
  sprxFilePath: string
  baseSpriteCount: number
  extraSpriteCount: number
  baseAddressTableOffset: number
  extraAddressTableOffset: number
}

export type SpriteSourceDescriptor =
  | BufferSpriteSourceDescriptor
  | FileBackedPxgSpriteSourceDescriptor

export interface InspectSpriteSourceParams {
  sprFilePath: string
  sprxFilePath: string
  extended: boolean
}

async function readRange(filePath: string, position: number, length: number): Promise<Buffer> {
  const handle = await open(filePath, 'r')
  try {
    return readHandleRange(handle, filePath, position, length)
  } finally {
    await handle.close()
  }
}

async function readHandleRange(
  handle: FileHandle,
  filePath: string,
  position: number,
  length: number
): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  if (bytesRead !== length) {
    throw new Error(`Could not read ${length} bytes at ${position} from ${filePath}.`)
  }
  return buffer
}

function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
}

export async function inspectSpriteSource(
  params: InspectSpriteSourceParams
): Promise<FileBackedPxgSpriteSourceDescriptor> {
  const headerSize = params.extended ? HEADER_U32 : HEADER_U16
  const sprHeader = await readRange(params.sprFilePath, 0, headerSize)
  const signature = sprHeader.readUInt32LE(0)
  const baseSpriteCount = params.extended ? sprHeader.readUInt32LE(4) : sprHeader.readUInt16LE(4)

  const sprxHeader = await readRange(params.sprxFilePath, 0, SPRX_HEADER_SIZE)
  const magic = sprxHeader.readUInt32LE(0)
  const version = sprxHeader.readUInt32LE(4)
  const sidecarBaseCount = sprxHeader.readUInt32LE(8)
  const extraSpriteCount = sprxHeader.readUInt32LE(12)

  if (magic !== SPRX_MAGIC) {
    throw new Error('Invalid SPRX file: expected PXGX magic.')
  }
  if (version !== SPRX_VERSION) {
    throw new Error(`Unsupported SPRX version: ${version}.`)
  }
  if (sidecarBaseCount !== baseSpriteCount) {
    throw new Error(
      `Invalid SPRX base count: expected ${baseSpriteCount}, got ${sidecarBaseCount}.`
    )
  }

  return {
    kind: 'file-backed-pxg',
    signature,
    spriteCount: baseSpriteCount + extraSpriteCount,
    extended: params.extended,
    sprFilePath: params.sprFilePath,
    sprxFilePath: params.sprxFilePath,
    baseSpriteCount,
    extraSpriteCount,
    baseAddressTableOffset: headerSize,
    extraAddressTableOffset: SPRX_HEADER_SIZE
  }
}

async function readSpriteBlock(
  handle: FileHandle,
  filePath: string,
  address: number
): Promise<Uint8Array | null> {
  if (address === 0) return null

  const header = await readHandleRange(handle, filePath, address, SPRITE_BLOCK_HEADER_SIZE)
  const length = header.readUInt16LE(3)
  if (length === 0) return null

  return toUint8Array(
    await readHandleRange(handle, filePath, address + SPRITE_BLOCK_HEADER_SIZE, length)
  )
}

async function readBaseSprite(
  handle: FileHandle,
  source: FileBackedPxgSpriteSourceDescriptor,
  id: number
): Promise<Uint8Array | null> {
  if (id < 1 || id > source.baseSpriteCount) return null
  const addressBuffer = await readHandleRange(
    handle,
    source.sprFilePath,
    source.baseAddressTableOffset + (id - 1) * ADDRESS_SIZE,
    ADDRESS_SIZE
  )
  return readSpriteBlock(handle, source.sprFilePath, addressBuffer.readUInt32LE(0))
}

async function readSidecarSprite(
  handle: FileHandle,
  source: FileBackedPxgSpriteSourceDescriptor,
  id: number
): Promise<Uint8Array | null> {
  if (id <= source.baseSpriteCount || id > source.spriteCount) return null
  const index = id - source.baseSpriteCount - 1
  const addressBuffer = await readHandleRange(
    handle,
    source.sprxFilePath,
    source.extraAddressTableOffset + index * ADDRESS_SIZE,
    ADDRESS_SIZE
  )
  return readSpriteBlock(handle, source.sprxFilePath, addressBuffer.readUInt32LE(0))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function readSpritesFromSource(
  source: FileBackedPxgSpriteSourceDescriptor,
  ids: number[]
): Promise<Array<[number, Uint8Array]>> {
  const seen = new Set<number>()
  const uniqueIds: number[] = []

  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    uniqueIds.push(id)
  }

  const needsBaseHandle = uniqueIds.some((id) => id >= 1 && id <= source.baseSpriteCount)
  const needsSidecarHandle = uniqueIds.some(
    (id) => id > source.baseSpriteCount && id <= source.spriteCount
  )
  const baseHandle = needsBaseHandle ? await open(source.sprFilePath, 'r') : null
  const sidecarHandle = needsSidecarHandle ? await open(source.sprxFilePath, 'r') : null

  try {
    const results = await mapWithConcurrency(uniqueIds, SPRITE_READ_CONCURRENCY, async (id) => {
      const data =
        id <= source.baseSpriteCount
          ? baseHandle
            ? await readBaseSprite(baseHandle, source, id)
            : null
          : sidecarHandle
            ? await readSidecarSprite(sidecarHandle, source, id)
            : null

      return data ? ([id, data] as [number, Uint8Array]) : null
    })

    return results.filter((entry): entry is [number, Uint8Array] => entry !== null)
  } finally {
    await Promise.all([baseHandle?.close(), sidecarHandle?.close()])
  }
}
