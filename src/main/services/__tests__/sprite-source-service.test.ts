import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectSpriteSource, readSpritesFromSource } from '../sprite-source-service'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pxg-sprx-'))
  tempDirs.push(dir)
  return dir
}

function makeSpriteFile(
  signature: number,
  count: number,
  sprites: Map<number, Uint8Array>,
  extended: boolean
): Buffer {
  const headerSize = extended ? 8 : 6
  let size = headerSize + count * 4
  const addresses = new Uint32Array(count)

  for (let id = 1; id <= count; id++) {
    const data = sprites.get(id)
    if (data) {
      addresses[id - 1] = size
      size += 5 + data.length
    }
  }

  const buffer = Buffer.alloc(size)
  buffer.writeUInt32LE(signature, 0)
  if (extended) buffer.writeUInt32LE(count, 4)
  else buffer.writeUInt16LE(count, 4)

  for (let i = 0; i < count; i++) {
    buffer.writeUInt32LE(addresses[i], headerSize + i * 4)
  }

  for (let id = 1; id <= count; id++) {
    const data = sprites.get(id)
    const address = addresses[id - 1]
    if (!data || address === 0) continue
    buffer[address] = 0xff
    buffer[address + 1] = 0
    buffer[address + 2] = 0xff
    buffer.writeUInt16LE(data.length, address + 3)
    Buffer.from(data).copy(buffer, address + 5)
  }

  return buffer
}

function makeSprx(baseCount: number, sprites: Map<number, Uint8Array>): Buffer {
  const extraCount = sprites.size
  let size = 16 + extraCount * 4
  const addresses = new Uint32Array(extraCount)

  for (let index = 0; index < extraCount; index++) {
    const data = sprites.get(index + 1)
    if (data) {
      addresses[index] = size
      size += 5 + data.length
    }
  }

  const buffer = Buffer.alloc(size)
  buffer.writeUInt32LE(0x58475850, 0)
  buffer.writeUInt32LE(1, 4)
  buffer.writeUInt32LE(baseCount, 8)
  buffer.writeUInt32LE(extraCount, 12)

  for (let index = 0; index < extraCount; index++) {
    buffer.writeUInt32LE(addresses[index], 16 + index * 4)
    const data = sprites.get(index + 1)
    const address = addresses[index]
    if (!data || address === 0) continue
    buffer[address] = 0xff
    buffer[address + 1] = 0
    buffer[address + 2] = 0xff
    buffer.writeUInt16LE(data.length, address + 3)
    Buffer.from(data).copy(buffer, address + 5)
  }

  return buffer
}

describe('sprite-source-service', () => {
  it('inspects a PXG SPR/SPRX pair and reads base and extra sprites', async () => {
    const dir = await makeTempDir()
    const sprPath = join(dir, 'pxg.standard.1310.spr')
    const sprxPath = join(dir, 'pxg.standard.1310.sprx')

    await writeFile(
      sprPath,
      makeSpriteFile(
        0x59e48e02,
        2,
        new Map([
          [1, new Uint8Array([1, 2, 3])],
          [2, new Uint8Array([4, 5])]
        ]),
        true
      )
    )
    await writeFile(sprxPath, makeSprx(2, new Map([[1, new Uint8Array([9, 8, 7, 6])]])))

    const source = await inspectSpriteSource({
      sprFilePath: sprPath,
      sprxFilePath: sprxPath,
      extended: true
    })

    expect(source).toMatchObject({
      kind: 'file-backed-pxg',
      signature: 0x59e48e02,
      baseSpriteCount: 2,
      extraSpriteCount: 1,
      baseAddressTableOffset: 8,
      extraAddressTableOffset: 16,
      spriteCount: 3
    })

    const sprites = await readSpritesFromSource(source, [1, 3])
    expect(sprites).toEqual([
      [1, new Uint8Array([1, 2, 3])],
      [3, new Uint8Array([9, 8, 7, 6])]
    ])
  })

  it('rejects SPRX files whose base count does not match the SPR count', async () => {
    const dir = await makeTempDir()
    const sprPath = join(dir, 'Tibia.spr')
    const sprxPath = join(dir, 'Tibia.sprx')

    await writeFile(sprPath, makeSpriteFile(0x12345678, 2, new Map(), true))
    await writeFile(sprxPath, makeSprx(99, new Map()))

    await expect(
      inspectSpriteSource({ sprFilePath: sprPath, sprxFilePath: sprxPath, extended: true })
    ).rejects.toThrow(/base count/i)
  })
})
